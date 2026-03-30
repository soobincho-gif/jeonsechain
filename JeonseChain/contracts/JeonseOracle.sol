// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title JeonseOracle
 * @notice 국토부·HUG 공인 오라클 노드가 부동산 데이터를 온체인에 공급.
 *         Z-score 기반 이상치 탐지로 오염 데이터를 사전 필터링.
 *
 * 설계 원칙 (제안서 2.4절):
 *  - 공인 오라클 노드만 데이터 기록 가능 (ORACLE_ROLE)
 *  - Z-score 임계값 초과 시 Circuit Breaker 발동 → HUG 재확인 요청
 *  - 위험 이벤트(근저당·경매·LTV 초과) 자동 감지 후 연결된 볼트에 통보
 */
contract JeonseOracle is AccessControl {

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant HUG_ROLE    = keccak256("HUG_ROLE");

    // ── 부동산 데이터 스냅샷 ──────────────────────────────────────────
    struct PropertyData {
        uint256 officialPrice;      // 공시가격 (원, 18 decimals)
        uint256 seniorDebtTotal;    // 선순위채권 합계 (근저당 등)
        bool    auctionStarted;     // 경매 개시 여부
        bool    newMortgageSet;     // 근저당 신규 설정 여부
        uint256 updatedAt;          // 마지막 업데이트 블록타임스탬프
        bool    circuitBreakerOn;   // 이상치 탐지로 인한 일시 동결
        // ── 공공데이터 파이프라인 필드 ───────────────────────────────
        uint256 riskScore;          // 0-100 종합 위험 점수 (oracle-fetcher 계산)
        bytes32 dataSourceHash;     // off-chain 데이터 번들 해시 (감사용)
    }

    struct PropertyRiskSignals {
        bool    seniorDebtRisk;         // 선순위채권 / 근저당 존재 여부
        bool    auctionRisk;            // 압류·경매 관련 강한 플래그
        bool    recentRightsChange;     // 최근 권리변동 여부
        uint256 depositToPriceRatioBps; // 전세보증금 / 매매가 비율 (bps)
        bool    repaymentStress;        // 반환 재원 부족 여부
        uint256 repaymentGap;           // 반환 재원 부족 금액 (원, 18 decimals)
        uint256 updatedAt;              // 마지막 신호 반영 시각
        bytes32 dataSourceHash;         // 동일 bundle hash
    }

    // ── 이상치 탐지용 이동 통계 (Welford's online algorithm) ─────────
    struct OracleStat {
        uint256 count;
        int256  mean;       // 평균 (scaled by 1e6)
        int256  M2;         // 분산 누적합 (scaled by 1e12)
    }

    // propertyId => 데이터
    mapping(bytes32 => PropertyData) public properties;
    // propertyId => 구조화된 위험 신호
    mapping(bytes32 => PropertyRiskSignals) public propertyRiskSignals;
    // propertyId => 공시가격 이동통계
    mapping(bytes32 => OracleStat)   private priceStats;

    // Z-score 임계값: 3.0 (scaled 1e6 → 3_000_000)
    int256  public constant ZSCORE_THRESHOLD          = 3_000_000;
    // LTV 위험 임계: 80% (선순위채권 / 공시가격)
    uint256 public constant LTV_DANGER_BPS            = 8000;
    // 전세가율 위험 임계: 85%
    uint256 public constant DEPOSIT_TO_PRICE_DANGER_BPS = 8500;
    // 위험 점수 임계: 70점 이상 → HUG 개입 요청
    uint256 public constant RISK_SCORE_DANGER_THRESHOLD = 70;

    // ── 이벤트 ───────────────────────────────────────────────────────
    event DataUpdated(bytes32 indexed propertyId, uint256 officialPrice, uint256 seniorDebt);
    event CircuitBreakerTripped(bytes32 indexed propertyId, int256 zScore, string reason);
    event CircuitBreakerReset(bytes32 indexed propertyId);
    event AuctionDetected(bytes32 indexed propertyId);
    event MortgageDetected(bytes32 indexed propertyId);
    event LtvDangerDetected(bytes32 indexed propertyId, uint256 ltvBps);
    event HugInterventionRequested(bytes32 indexed propertyId, string reason);
    event RiskScoreUpdated(
        bytes32 indexed propertyId,
        uint256 riskScore,
        bytes32 dataSourceHash
    );
    event RiskSignalsUpdated(
        bytes32 indexed propertyId,
        bool seniorDebtRisk,
        bool auctionRisk,
        bool recentRightsChange,
        uint256 depositToPriceRatioBps,
        bool repaymentStress,
        uint256 repaymentGap,
        bytes32 dataSourceHash
    );

    // ── 생성자 ───────────────────────────────────────────────────────
    constructor(address admin, address hugNode) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(HUG_ROLE, hugNode);
    }

    // ── 오라클 노드 추가 (국토부·HUG 등) ────────────────────────────
    function addOracleNode(address node) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ORACLE_ROLE, node);
    }

    /**
     * @notice 공인 오라클이 부동산 데이터를 업데이트.
     *         Z-score 이상치 탐지 후 이상 시 Circuit Breaker 발동.
     */
    function updatePropertyData(
        bytes32 propertyId,
        uint256 officialPrice,
        uint256 seniorDebtTotal,
        bool    auctionStarted,
        bool    newMortgageSet
    ) external onlyRole(ORACLE_ROLE) {
        require(officialPrice > 0, "Oracle: invalid price");

        // ── Z-score 이상치 탐지 (공시가격 기준) ──────────────────────
        OracleStat storage stat = priceStats[propertyId];
        bool anomaly = false;
        int256 zScore = 0;

        if (stat.count >= 3) {
            // Welford: 현재 편차 계산
            int256 price  = int256(officialPrice);
            int256 diff   = price - stat.mean;
            // 표준편차 근사: sqrt(M2 / count), scaled
            int256 stdDev = _sqrt(stat.M2 / int256(stat.count));
            if (stdDev > 0) {
                zScore = (diff * 1_000_000) / stdDev;
                if (zScore < 0) zScore = -zScore;
                if (zScore > ZSCORE_THRESHOLD) {
                    anomaly = true;
                }
            }
        }

        // Welford 온라인 평균·분산 업데이트
        stat.count++;
        int256 delta  = int256(officialPrice) - stat.mean;
        stat.mean    += delta / int256(stat.count);
        int256 delta2 = int256(officialPrice) - stat.mean;
        stat.M2      += delta * delta2;

        // ── 이상치 → Circuit Breaker ──────────────────────────────────
        if (anomaly) {
            properties[propertyId].circuitBreakerOn = true;
            emit CircuitBreakerTripped(propertyId, zScore, "Z-score exceeded threshold");
            emit HugInterventionRequested(propertyId, "Oracle anomaly detected - manual review required");
            return; // 이상 데이터는 반영하지 않고 종료
        }

        // ── 정상 데이터 반영 ─────────────────────────────────────────
        PropertyData storage prop = properties[propertyId];
        prop.officialPrice   = officialPrice;
        prop.seniorDebtTotal = seniorDebtTotal;
        prop.auctionStarted  = auctionStarted;
        prop.newMortgageSet  = newMortgageSet;
        prop.updatedAt       = block.timestamp;

        emit DataUpdated(propertyId, officialPrice, seniorDebtTotal);

        // ── 위험 이벤트 자동 감지 ────────────────────────────────────
        if (auctionStarted) {
            emit AuctionDetected(propertyId);
            emit HugInterventionRequested(propertyId, "Auction started");
        }
        if (newMortgageSet) {
            emit MortgageDetected(propertyId);
        }
        // LTV 위험: 선순위채권 / 공시가 > 80%
        if (officialPrice > 0) {
            uint256 ltvBps = (seniorDebtTotal * 10000) / officialPrice;
            if (ltvBps > LTV_DANGER_BPS) {
                emit LtvDangerDetected(propertyId, ltvBps);
                emit HugInterventionRequested(propertyId, "LTV danger threshold exceeded");
            }
        }
    }

    /**
     * @notice HUG가 수동 검토 후 Circuit Breaker 해제.
     */
    function resetCircuitBreaker(bytes32 propertyId) external onlyRole(HUG_ROLE) {
        properties[propertyId].circuitBreakerOn = false;
        emit CircuitBreakerReset(propertyId);
    }

    /**
     * @notice off-chain oracle-fetcher가 계산한 종합 위험 점수를 온체인에 기록.
     *
     * 점수 기준 (oracle-fetcher.js 참조):
     *  - LTV 80% 초과           +40점
     *  - 경매 개시 감지          +30점
     *  - 신규 근저당 설정        +20점
     *  - 전세가율 80% 이상       +10점
     *  70점 이상 → HUG 개입 요청 이벤트 발행
     *
     * @param propertyId     부동산 식별자
     * @param riskScore      0–100 위험 점수
     * @param dataSourceHash off-chain 데이터 소스 bundle hash (keccak256)
     */
    function updateRiskScore(
        bytes32 propertyId,
        uint256 riskScore,
        bytes32 dataSourceHash
    ) external onlyRole(ORACLE_ROLE) {
        require(riskScore <= 100,             "Oracle: score out of range");
        require(dataSourceHash != bytes32(0), "Oracle: data hash required");

        properties[propertyId].riskScore      = riskScore;
        properties[propertyId].dataSourceHash = dataSourceHash;
        properties[propertyId].updatedAt      = block.timestamp;

        emit RiskScoreUpdated(propertyId, riskScore, dataSourceHash);

        if (riskScore >= RISK_SCORE_DANGER_THRESHOLD) {
            emit HugInterventionRequested(
                propertyId,
                "High risk score from oracle fetcher"
            );
        }
    }

    /**
     * @notice 위험 점수를 구성하는 핵심 신호들을 구조화해 저장.
     * @dev 프론트엔드의 explainable UI, 감사 리포트, 추후 정책 엔진에서 재사용.
     */
    function updateRiskSignals(
        bytes32 propertyId,
        bool seniorDebtRisk,
        bool auctionRisk,
        bool recentRightsChange,
        uint256 depositToPriceRatioBps,
        bool repaymentStress,
        uint256 repaymentGap,
        bytes32 dataSourceHash
    ) external onlyRole(ORACLE_ROLE) {
        require(dataSourceHash != bytes32(0), "Oracle: data hash required");

        PropertyRiskSignals storage signals = propertyRiskSignals[propertyId];
        signals.seniorDebtRisk = seniorDebtRisk;
        signals.auctionRisk = auctionRisk;
        signals.recentRightsChange = recentRightsChange;
        signals.depositToPriceRatioBps = depositToPriceRatioBps;
        signals.repaymentStress = repaymentStress;
        signals.repaymentGap = repaymentGap;
        signals.updatedAt = block.timestamp;
        signals.dataSourceHash = dataSourceHash;

        properties[propertyId].dataSourceHash = dataSourceHash;
        properties[propertyId].updatedAt = block.timestamp;

        emit RiskSignalsUpdated(
            propertyId,
            seniorDebtRisk,
            auctionRisk,
            recentRightsChange,
            depositToPriceRatioBps,
            repaymentStress,
            repaymentGap,
            dataSourceHash
        );

        if (auctionRisk || repaymentStress || depositToPriceRatioBps >= DEPOSIT_TO_PRICE_DANGER_BPS) {
            emit HugInterventionRequested(
                propertyId,
                "Structured risk signals indicate elevated jeonse return stress"
            );
        }
    }

    function removeOracleNode(address node) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ORACLE_ROLE, node);
    }

    // ── 조회 헬퍼 ────────────────────────────────────────────────────
    function isPropertyDangerous(bytes32 propertyId) external view returns (bool) {
        PropertyData memory prop = properties[propertyId];
        PropertyRiskSignals memory signals = propertyRiskSignals[propertyId];
        if (prop.circuitBreakerOn) return true;
        if (prop.auctionStarted)   return true;
        if (signals.auctionRisk)   return true;
        if (signals.repaymentStress) return true;
        if (signals.depositToPriceRatioBps >= DEPOSIT_TO_PRICE_DANGER_BPS) return true;
        if (prop.officialPrice > 0) {
            uint256 ltvBps = (prop.seniorDebtTotal * 10000) / prop.officialPrice;
            if (ltvBps > LTV_DANGER_BPS) return true;
        }
        return false;
    }

    function getRiskSignalSummary(bytes32 propertyId)
        external
        view
        returns (
            bool seniorDebtRisk,
            bool auctionRisk,
            bool recentRightsChange,
            uint256 depositToPriceRatioBps,
            bool repaymentStress,
            uint256 repaymentGap,
            uint256 updatedAt,
            bytes32 dataSourceHash
        )
    {
        PropertyRiskSignals memory signals = propertyRiskSignals[propertyId];
        return (
            signals.seniorDebtRisk,
            signals.auctionRisk,
            signals.recentRightsChange,
            signals.depositToPriceRatioBps,
            signals.repaymentStress,
            signals.repaymentGap,
            signals.updatedAt,
            signals.dataSourceHash
        );
    }

    // ── 정수 제곱근 (Babylonian method) ──────────────────────────────
    function _sqrt(int256 x) internal pure returns (int256) {
        if (x <= 0) return 0;
        int256 z = (x + 1) / 2;
        int256 y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
        return y;
    }
}
