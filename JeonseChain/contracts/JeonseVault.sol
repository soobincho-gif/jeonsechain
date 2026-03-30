// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./JeonseOracle.sol";

/**
 * @title JeonseVault
 * @notice 전세안심체인 핵심 컨트랙트.
 *
 * ─── 설계 전제 (제안서 2.2절) ────────────────────────────────────────
 * 본 컨트랙트는 스마트 컨트랙트 자체를 법적 독립 주체(SPV)로 간주하지 않는다.
 * 법적으로 인정된 별도 예치 구조(신탁·에스크로 연계 또는 주택임대차보호법 개정)를
 * 전제로, 블록체인 기반 자동 집행 레이어를 결합하여 다음을 구현한다:
 *  ① 보증금 원금을 임대인 일반재산과 분리 관리
 *  ② ERC-4626 볼트 인터페이스를 참조한 수익청구권 토큰 발행 (임대인 레버리지 유지)
 *  ③ 오라클 위험 이벤트 감지 시 토큰 동결 + HUG 중재 요청
 *  ④ 만기 조건 충족 시 임차인에게 원금 자동 반환 (집행 임의성 최소화)
 *  ⑤ 역전세 시 마진콜 로직 자동 실행
 *
 * ─── ERC-4626 참조 방식 ──────────────────────────────────────────────
 * ERC-4626은 수익형 볼트의 예치·인출·지분 계산을 표준화하는 인터페이스다.
 * 본 컨트랙트는 이 볼트 개념을 참조하되, 보증금 원금 반환권과 운용수익 청구권을
 * 별도로 설계하는 맞춤형 구조로 확장한다.
 * (Hyperledger Fabric 배포 시에는 동일 로직을 Fabric 체인코드로 재구현)
 */
contract JeonseVault is ERC4626, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant HUG_ROLE    = keccak256("HUG_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    enum ContractState {
        REGISTERED,
        ACTIVE,
        DANGER,
        EXPIRED,
        RETURNED,
        DISPUTED
    }

    enum SettlementStatus {
        NONE,
        MOVE_OUT_REQUESTED,
        CLAIM_SUBMITTED,
        TENANT_DISPUTED,
        RESOLVED
    }

    enum SettlementCategory {
        CLEANING,
        CONSUMABLE_REPAIR,
        FACILITY_DAMAGE,
        UTILITIES
    }

    enum TenantResponse {
        ACCEPT_FULL,
        ACCEPT_PARTIAL,
        DISPUTE
    }

    enum LeaseChangeType {
        NONE,
        EARLY_TERMINATION,
        EXTENSION
    }

    struct LeaseContract {
        address tenant;
        address landlord;
        uint256 depositAmount;
        uint256 startTime;
        uint256 endTime;
        bytes32 propertyId;
        ContractState state;
        uint256 sharesIssued;
        bool    marginCallDue;
    }

    struct SettlementRecord {
        SettlementStatus status;
        SettlementCategory category;
        uint256 moveOutRequestedAt;
        uint256 claimDeadline;
        uint256 responseDeadline;
        uint256 claimedAmount;
        uint256 heldAmount;
        uint256 immediateReturnAmount;
        uint256 finalLandlordAmount;
        bytes32 evidenceHash;
        bytes32 tenantResponseHash;
        bytes32 resolutionHash;
    }

    struct LeaseChangeRequest {
        LeaseChangeType changeType;
        address proposer;
        uint256 requestedAt;
        uint256 responseDeadline;
        uint256 additionalDays;
        bytes32 requestHash;
    }

    mapping(bytes32 => LeaseContract) public leases;
    mapping(bytes32 => SettlementRecord) public settlements;
    mapping(bytes32 => LeaseChangeRequest) public leaseChangeRequests;
    mapping(address => bool)          public frozenTokens;
    JeonseOracle public immutable oracle;

    uint256 public constant MARGIN_CALL_THRESHOLD_BPS = 11000;
    uint256 public constant MAX_SETTLEMENT_HOLD_BPS = 300; // 3%
    uint256 public constant MAX_SETTLEMENT_HOLD_AMOUNT = 3_000_000 ether;
    uint256 public constant CLEANING_CAP = 300_000 ether;
    uint256 public constant CONSUMABLE_REPAIR_CAP = 500_000 ether;
    uint256 public constant FACILITY_DAMAGE_CAP = 2_000_000 ether;
    uint256 public constant UTILITIES_CAP = 500_000 ether;
    uint256 public constant MOVE_OUT_INSPECTION_WINDOW = 72 hours;
    uint256 public constant TENANT_RESPONSE_WINDOW = 72 hours;
    uint256 public constant LEASE_CHANGE_RESPONSE_WINDOW = 72 hours;
    uint256 public constant MIN_EXTENSION_DAYS = 30;
    uint256 public constant MAX_EXTENSION_DAYS = 730;

    event LeaseRegistered(bytes32 indexed leaseId, address tenant, address landlord, uint256 amount);
    event DepositReceived(bytes32 indexed leaseId, uint256 amount, uint256 sharesIssued);
    event DangerStateActivated(bytes32 indexed leaseId, string reason);
    event TokensFrozen(address indexed landlord, bytes32 leaseId);
    event TokensUnfrozen(address indexed landlord, bytes32 leaseId);
    event DepositReturned(bytes32 indexed leaseId, address tenant, uint256 amount);
    event MarginCallIssued(bytes32 indexed leaseId, uint256 shortfallAmount);
    event DisputeRaised(bytes32 indexed leaseId);
    event HugBridgeActivated(bytes32 indexed leaseId, uint256 bridgeAmount);
    event MoveOutRequested(bytes32 indexed leaseId, address indexed requester, uint256 claimDeadline);
    event SettlementClaimSubmitted(
        bytes32 indexed leaseId,
        SettlementCategory indexed category,
        uint256 claimedAmount,
        uint256 heldAmount,
        bytes32 evidenceHash
    );
    event UndisputedAmountReleased(bytes32 indexed leaseId, address indexed tenant, uint256 amount);
    event SettlementResponded(
        bytes32 indexed leaseId,
        TenantResponse response,
        uint256 acceptedAmount,
        bytes32 responseHash
    );
    event SettlementTimedOut(bytes32 indexed leaseId, uint256 landlordAmount);
    event SettlementResolved(
        bytes32 indexed leaseId,
        uint256 landlordAmount,
        uint256 tenantAmount,
        bytes32 resolutionHash
    );
    event LeaseChangeRequested(
        bytes32 indexed leaseId,
        LeaseChangeType indexed changeType,
        address indexed proposer,
        uint256 additionalDays,
        uint256 responseDeadline,
        bytes32 requestHash
    );
    event LeaseChangeResponded(
        bytes32 indexed leaseId,
        LeaseChangeType indexed changeType,
        address indexed responder,
        bool accepted,
        uint256 newEndTime
    );
    event LeaseChangeCancelled(
        bytes32 indexed leaseId,
        LeaseChangeType indexed changeType,
        address indexed canceller
    );

    constructor(
        IERC20 _underlyingAsset,
        address _oracle,
        address _hugAdmin
    )
        ERC4626(_underlyingAsset)
        ERC20("JeonseChain Yield Token", "JCYT")
    {
        oracle = JeonseOracle(_oracle);
        _grantRole(DEFAULT_ADMIN_ROLE, _hugAdmin);
        _grantRole(HUG_ROLE, _hugAdmin);
    }

    // ── STEP 1: 계약 등록 ─────────────────────────────────────────────
    /**
     * @notice 임대인이 전세 계약 사전 등록.
     * @dev HUG 브릿지는 시점 불일치 해소 장치이며 신용위험 제거 장치가 아님.
     *      역전세·계약해제 시 손실배분(waterfall)은 별도 거버넌스 규정 필요.
     */
    function registerLease(
        address tenant,
        uint256 depositAmount,
        uint256 durationDays,
        bytes32 propertyId
    ) external returns (bytes32 leaseId) {
        require(tenant != address(0),  "Vault: invalid tenant");
        require(depositAmount > 0,     "Vault: deposit must be > 0");
        require(durationDays >= 365,   "Vault: minimum 1 year");

        require(!oracle.isPropertyDangerous(propertyId),
            "Vault: property failed LTV pre-screening");

        leaseId = keccak256(abi.encodePacked(
            msg.sender, tenant, depositAmount, block.timestamp
        ));
        require(leases[leaseId].tenant == address(0), "Vault: lease exists");

        leases[leaseId] = LeaseContract({
            tenant:        tenant,
            landlord:      msg.sender,
            depositAmount: depositAmount,
            startTime:     0,
            endTime:       block.timestamp + (durationDays * 1 days),
            propertyId:    propertyId,
            state:         ContractState.REGISTERED,
            sharesIssued:  0,
            marginCallDue: false
        });

        emit LeaseRegistered(leaseId, tenant, msg.sender, depositAmount);
        emit HugBridgeActivated(leaseId, depositAmount);
    }

    // ── STEP 2: 보증금 납입 ───────────────────────────────────────────
    /**
     * @notice 임차인이 보증금 납입 → 볼트 예치 + 수익권 토큰 임대인 발행.
     * @dev 수익권 토큰(JCYT)은 임차인이 아닌 임대인에게 발행됨.
     *      임대인은 이 토큰을 협약 금융기관에 담보로 제출하여 유동성 조달 가능.
     */
    function depositJeonse(bytes32 leaseId) external nonReentrant {
        LeaseContract storage lease = leases[leaseId];
        require(msg.sender == lease.tenant, "Vault: not tenant");
        require(lease.state == ContractState.REGISTERED, "Vault: invalid state");

        uint256 amount = lease.depositAmount;
        uint256 shares = previewDeposit(amount);

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        _mint(lease.landlord, shares); // 수익권 토큰 → 임대인

        lease.sharesIssued = shares;
        lease.startTime    = block.timestamp;
        lease.state        = ContractState.ACTIVE;

        emit DepositReceived(leaseId, amount, shares);
    }

    // ── STEP 3: 위험 이벤트 → 토큰 동결 ─────────────────────────────
    function triggerDanger(bytes32 leaseId, string calldata reason)
        external onlyRole(ORACLE_ROLE)
    {
        LeaseContract storage lease = leases[leaseId];
        require(lease.state == ContractState.ACTIVE, "Vault: not active");

        lease.state = ContractState.DANGER;
        frozenTokens[lease.landlord] = true;

        emit DangerStateActivated(leaseId, reason);
        emit TokensFrozen(lease.landlord, leaseId);

        _checkMarginCall(leaseId);
    }

    /// @dev 역전세 마진콜. waterfall 설계는 거버넌스 규정으로 별도 명문화 필요.
    function _checkMarginCall(bytes32 leaseId) internal {
        LeaseContract storage lease = leases[leaseId];
        uint256 vaultAssets = totalAssets();
        uint256 tokenValue  = convertToAssets(lease.sharesIssued);

        if (vaultAssets > 0 &&
            (tokenValue * 10000) / vaultAssets > MARGIN_CALL_THRESHOLD_BPS)
        {
            lease.marginCallDue = true;
            emit MarginCallIssued(leaseId, tokenValue - vaultAssets);
        }
    }

    // ── STEP 4: 만기 자동 반환 ───────────────────────────────────────
    /**
     * @notice 만기 후 누구나 호출 가능 → 집행 임의성 최소화.
     * @dev 오라클 위험 상태(경매·LTV 초과)에서는 HUG 중재 우선.
     */
    function executeReturn(bytes32 leaseId) external nonReentrant {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        _clearExpiredLeaseChangeIfNeeded(leaseId);
        require(
            lease.state == ContractState.ACTIVE ||
            lease.state == ContractState.EXPIRED,
            "Vault: not returnable"
        );
        require(
            leaseChangeRequests[leaseId].changeType == LeaseChangeType.NONE,
            "Vault: lease change pending"
        );
        require(block.timestamp >= lease.endTime, "Vault: not expired");
        require(!oracle.isPropertyDangerous(lease.propertyId),
            unicode"Vault: danger state \u2014 HUG required");
        require(
            settlement.status == SettlementStatus.NONE ||
            (
                settlement.status == SettlementStatus.MOVE_OUT_REQUESTED &&
                block.timestamp > settlement.claimDeadline
            ),
            "Vault: settlement in progress"
        );

        if (settlement.status == SettlementStatus.MOVE_OUT_REQUESTED) {
            settlement.status = SettlementStatus.RESOLVED;
            settlement.immediateReturnAmount = _currentLeaseAssets(lease);
        }

        _returnEntireDeposit(leaseId, lease);
    }

    // ── STEP 4A: 퇴실 요청 / 제한적 정산 보류 ───────────────────────
    function requestMoveOut(bytes32 leaseId) external {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        _clearExpiredLeaseChangeIfNeeded(leaseId);

        require(
            msg.sender == lease.tenant || msg.sender == lease.landlord,
            "Vault: only tenant or landlord"
        );
        require(
            leaseChangeRequests[leaseId].changeType == LeaseChangeType.NONE,
            "Vault: lease change pending"
        );
        require(
            lease.state == ContractState.ACTIVE ||
            lease.state == ContractState.EXPIRED,
            "Vault: invalid state"
        );
        require(block.timestamp >= lease.endTime, "Vault: not expired");
        require(settlement.status == SettlementStatus.NONE, "Vault: move-out already requested");

        lease.state = ContractState.EXPIRED;
        settlement.status = SettlementStatus.MOVE_OUT_REQUESTED;
        settlement.moveOutRequestedAt = block.timestamp;
        settlement.claimDeadline = block.timestamp + MOVE_OUT_INSPECTION_WINDOW;

        emit MoveOutRequested(leaseId, msg.sender, settlement.claimDeadline);
    }

    function requestEarlyTermination(bytes32 leaseId, bytes32 requestHash) external {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        _clearExpiredLeaseChangeIfNeeded(leaseId);

        require(
            msg.sender == lease.tenant || msg.sender == lease.landlord,
            "Vault: only tenant or landlord"
        );
        require(lease.state == ContractState.ACTIVE, "Vault: not terminable");
        require(settlement.status == SettlementStatus.NONE, "Vault: settlement in progress");
        require(
            leaseChangeRequests[leaseId].changeType == LeaseChangeType.NONE,
            "Vault: change already requested"
        );
        require(requestHash != bytes32(0), "Vault: request proof required");

        leaseChangeRequests[leaseId] = LeaseChangeRequest({
            changeType: LeaseChangeType.EARLY_TERMINATION,
            proposer: msg.sender,
            requestedAt: block.timestamp,
            responseDeadline: block.timestamp + LEASE_CHANGE_RESPONSE_WINDOW,
            additionalDays: 0,
            requestHash: requestHash
        });

        emit LeaseChangeRequested(
            leaseId,
            LeaseChangeType.EARLY_TERMINATION,
            msg.sender,
            0,
            block.timestamp + LEASE_CHANGE_RESPONSE_WINDOW,
            requestHash
        );
    }

    function requestLeaseExtension(
        bytes32 leaseId,
        uint256 additionalDays,
        bytes32 requestHash
    ) external {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        _clearExpiredLeaseChangeIfNeeded(leaseId);

        require(
            msg.sender == lease.tenant || msg.sender == lease.landlord,
            "Vault: only tenant or landlord"
        );
        require(
            lease.state == ContractState.ACTIVE || lease.state == ContractState.EXPIRED,
            "Vault: not extendable"
        );
        require(settlement.status == SettlementStatus.NONE, "Vault: settlement in progress");
        require(
            leaseChangeRequests[leaseId].changeType == LeaseChangeType.NONE,
            "Vault: change already requested"
        );
        require(additionalDays >= MIN_EXTENSION_DAYS, "Vault: extension too short");
        require(additionalDays <= MAX_EXTENSION_DAYS, "Vault: extension too long");
        require(requestHash != bytes32(0), "Vault: request proof required");

        leaseChangeRequests[leaseId] = LeaseChangeRequest({
            changeType: LeaseChangeType.EXTENSION,
            proposer: msg.sender,
            requestedAt: block.timestamp,
            responseDeadline: block.timestamp + LEASE_CHANGE_RESPONSE_WINDOW,
            additionalDays: additionalDays,
            requestHash: requestHash
        });

        emit LeaseChangeRequested(
            leaseId,
            LeaseChangeType.EXTENSION,
            msg.sender,
            additionalDays,
            block.timestamp + LEASE_CHANGE_RESPONSE_WINDOW,
            requestHash
        );
    }

    function respondToLeaseChange(bytes32 leaseId, bool accept) external {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        LeaseChangeRequest memory request = leaseChangeRequests[leaseId];

        require(request.changeType != LeaseChangeType.NONE, "Vault: no pending change");
        require(block.timestamp <= request.responseDeadline, "Vault: change window closed");
        require(
            msg.sender == lease.tenant || msg.sender == lease.landlord,
            "Vault: only tenant or landlord"
        );
        require(msg.sender != request.proposer, "Vault: proposer cannot approve");

        delete leaseChangeRequests[leaseId];

        if (!accept) {
            emit LeaseChangeResponded(leaseId, request.changeType, msg.sender, false, lease.endTime);
            return;
        }

        if (request.changeType == LeaseChangeType.EXTENSION) {
            require(
                lease.state == ContractState.ACTIVE || lease.state == ContractState.EXPIRED,
                "Vault: not extendable"
            );
            require(settlement.status == SettlementStatus.NONE, "Vault: settlement in progress");

            uint256 baseEndTime = lease.endTime > block.timestamp ? lease.endTime : block.timestamp;
            lease.endTime = baseEndTime + (request.additionalDays * 1 days);
            if (lease.state == ContractState.EXPIRED) {
                lease.state = ContractState.ACTIVE;
            }

            emit LeaseChangeResponded(leaseId, request.changeType, msg.sender, true, lease.endTime);
            return;
        }

        require(lease.state == ContractState.ACTIVE, "Vault: not terminable");
        require(settlement.status == SettlementStatus.NONE, "Vault: settlement in progress");

        lease.endTime = block.timestamp;
        lease.state = ContractState.EXPIRED;
        settlement.status = SettlementStatus.MOVE_OUT_REQUESTED;
        settlement.moveOutRequestedAt = block.timestamp;
        settlement.claimDeadline = block.timestamp + MOVE_OUT_INSPECTION_WINDOW;

        emit LeaseChangeResponded(leaseId, request.changeType, msg.sender, true, lease.endTime);
        emit MoveOutRequested(leaseId, msg.sender, settlement.claimDeadline);
    }

    function cancelLeaseChangeRequest(bytes32 leaseId) external {
        LeaseChangeRequest memory request = leaseChangeRequests[leaseId];
        require(request.changeType != LeaseChangeType.NONE, "Vault: no pending change");
        require(
            msg.sender == request.proposer || block.timestamp > request.responseDeadline,
            "Vault: cannot cancel yet"
        );

        delete leaseChangeRequests[leaseId];
        emit LeaseChangeCancelled(leaseId, request.changeType, msg.sender);
    }

    function submitSettlementClaim(
        bytes32 leaseId,
        SettlementCategory category,
        uint256 claimAmount,
        bytes32 evidenceHash
    ) external nonReentrant {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        _clearExpiredLeaseChangeIfNeeded(leaseId);

        require(msg.sender == lease.landlord, "Vault: not landlord");
        require(lease.state == ContractState.EXPIRED, "Vault: move-out not ready");
        require(settlement.status == SettlementStatus.MOVE_OUT_REQUESTED, "Vault: no move-out request");
        require(block.timestamp <= settlement.claimDeadline, "Vault: claim window closed");
        require(claimAmount > 0, "Vault: invalid claim amount");
        require(evidenceHash != bytes32(0), "Vault: evidence required");

        uint256 holdCap = getSettlementHoldCap(leaseId);
        require(claimAmount <= holdCap, "Vault: claim exceeds hold cap");
        require(claimAmount <= getSettlementCategoryCap(category), "Vault: claim exceeds category cap");

        uint256 assets = _currentLeaseAssets(lease);
        require(assets >= claimAmount, "Vault: insufficient assets");

        settlement.status = SettlementStatus.CLAIM_SUBMITTED;
        settlement.category = category;
        settlement.claimedAmount = claimAmount;
        settlement.heldAmount = claimAmount;
        settlement.immediateReturnAmount = assets - claimAmount;
        settlement.responseDeadline = block.timestamp + TENANT_RESPONSE_WINDOW;
        settlement.evidenceHash = evidenceHash;
        lease.state = ContractState.DISPUTED;

        _burnLeaseShares(lease);

        if (settlement.immediateReturnAmount > 0) {
            IERC20(asset()).safeTransfer(lease.tenant, settlement.immediateReturnAmount);
            emit UndisputedAmountReleased(leaseId, lease.tenant, settlement.immediateReturnAmount);
        }

        emit SettlementClaimSubmitted(
            leaseId,
            category,
            claimAmount,
            settlement.heldAmount,
            evidenceHash
        );
    }

    function respondToSettlementClaim(
        bytes32 leaseId,
        TenantResponse response,
        uint256 acceptedAmount,
        bytes32 responseHash
    ) external nonReentrant {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];

        require(msg.sender == lease.tenant, "Vault: not tenant");
        require(settlement.status == SettlementStatus.CLAIM_SUBMITTED, "Vault: no pending claim");
        require(block.timestamp <= settlement.responseDeadline, "Vault: response window closed");
        require(responseHash != bytes32(0), "Vault: response proof required");

        settlement.tenantResponseHash = responseHash;

        if (response == TenantResponse.ACCEPT_FULL) {
            require(acceptedAmount == settlement.claimedAmount, "Vault: full amount required");
            emit SettlementResponded(leaseId, response, acceptedAmount, responseHash);
            _finalizeSettlement(leaseId, acceptedAmount, responseHash);
            return;
        }

        if (response == TenantResponse.ACCEPT_PARTIAL) {
            require(
                acceptedAmount > 0 && acceptedAmount < settlement.claimedAmount,
                "Vault: invalid partial amount"
            );
            emit SettlementResponded(leaseId, response, acceptedAmount, responseHash);
            _finalizeSettlement(leaseId, acceptedAmount, responseHash);
            return;
        }

        require(acceptedAmount == 0, "Vault: disputed amount must be 0");
        settlement.status = SettlementStatus.TENANT_DISPUTED;

        emit SettlementResponded(leaseId, response, acceptedAmount, responseHash);
    }

    function finalizeSettlementAfterDeadline(bytes32 leaseId) external nonReentrant {
        SettlementRecord storage settlement = settlements[leaseId];

        require(settlement.status == SettlementStatus.CLAIM_SUBMITTED, "Vault: no pending claim");
        require(block.timestamp > settlement.responseDeadline, "Vault: response window active");

        emit SettlementTimedOut(leaseId, settlement.claimedAmount);
        _finalizeSettlement(leaseId, settlement.claimedAmount, bytes32(0));
    }

    function resolveSettlementByHug(
        bytes32 leaseId,
        uint256 landlordAmount,
        bytes32 resolutionHash
    ) external onlyRole(HUG_ROLE) nonReentrant {
        SettlementRecord storage settlement = settlements[leaseId];

        require(settlement.status == SettlementStatus.TENANT_DISPUTED, "Vault: settlement not disputed");
        require(resolutionHash != bytes32(0), "Vault: resolution required");

        _finalizeSettlement(leaseId, landlordAmount, resolutionHash);
    }

    // ── HUG 관리자 ───────────────────────────────────────────────────
    function resolveDispute(bytes32 leaseId, bool returnToTenant)
        external onlyRole(HUG_ROLE) nonReentrant
    {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];
        require(
            lease.state == ContractState.DANGER ||
            lease.state == ContractState.DISPUTED,
            "Vault: not disputable"
        );
        require(
            settlement.status == SettlementStatus.NONE ||
            settlement.status == SettlementStatus.MOVE_OUT_REQUESTED,
            "Vault: use settlement resolver"
        );

        if (frozenTokens[lease.landlord]) {
            frozenTokens[lease.landlord] = false;
            emit TokensUnfrozen(lease.landlord, leaseId);
        }

        if (returnToTenant) {
            _returnEntireDeposit(leaseId, lease);
        } else {
            lease.state = ContractState.ACTIVE;
        }
    }

    function raiseDispute(bytes32 leaseId) external onlyRole(HUG_ROLE) {
        leases[leaseId].state = ContractState.DISPUTED;
        emit DisputeRaised(leaseId);
    }

    // ── ERC-20 오버라이드: 동결 토큰 이전 차단 ──────────────────────
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            require(!frozenTokens[from], "Vault: tokens frozen");
        }
        super._update(from, to, value);
    }

    // ── 조회 ─────────────────────────────────────────────────────────
    function getLeaseState(bytes32 leaseId) external view returns (ContractState) {
        return leases[leaseId].state;
    }

    function getLeaseChangeRequest(bytes32 leaseId)
        external
        view
        returns (
            LeaseChangeType changeType,
            address proposer,
            uint256 requestedAt,
            uint256 responseDeadline,
            uint256 additionalDays,
            bytes32 requestHash
        )
    {
        LeaseChangeRequest memory request = leaseChangeRequests[leaseId];
        return (
            request.changeType,
            request.proposer,
            request.requestedAt,
            request.responseDeadline,
            request.additionalDays,
            request.requestHash
        );
    }

    function getRemainingDays(bytes32 leaseId) external view returns (int256) {
        LeaseContract memory l = leases[leaseId];
        if (l.endTime == 0) return -1;
        return (int256(l.endTime) - int256(block.timestamp)) / 1 days;
    }

    function getDepositInfo(bytes32 leaseId)
        external view
        returns (address tenant, address landlord, uint256 depositAmount,
                 uint256 currentValue, ContractState state)
    {
        LeaseContract memory l = leases[leaseId];
        SettlementRecord memory s = settlements[leaseId];
        uint256 activeValue =
            l.sharesIssued > 0 ? convertToAssets(l.sharesIssued) : s.heldAmount;

        return (l.tenant, l.landlord, l.depositAmount, activeValue, l.state);
    }

    function getSettlementInfo(bytes32 leaseId)
        external
        view
        returns (
            SettlementStatus status,
            SettlementCategory category,
            uint256 claimDeadline,
            uint256 responseDeadline,
            uint256 claimedAmount,
            uint256 heldAmount,
            uint256 immediateReturnAmount,
            uint256 finalLandlordAmount,
            bytes32 evidenceHash,
            bytes32 tenantResponseHash,
            bytes32 resolutionHash
        )
    {
        SettlementRecord memory s = settlements[leaseId];
        return (
            s.status,
            s.category,
            s.claimDeadline,
            s.responseDeadline,
            s.claimedAmount,
            s.heldAmount,
            s.immediateReturnAmount,
            s.finalLandlordAmount,
            s.evidenceHash,
            s.tenantResponseHash,
            s.resolutionHash
        );
    }

    function getSettlementHoldCap(bytes32 leaseId) public view returns (uint256) {
        LeaseContract memory lease = leases[leaseId];
        uint256 percentageCap = (lease.depositAmount * MAX_SETTLEMENT_HOLD_BPS) / 10000;

        return percentageCap < MAX_SETTLEMENT_HOLD_AMOUNT
            ? percentageCap
            : MAX_SETTLEMENT_HOLD_AMOUNT;
    }

    function getSettlementCategoryCap(SettlementCategory category) public pure returns (uint256) {
        if (category == SettlementCategory.CLEANING) return CLEANING_CAP;
        if (category == SettlementCategory.CONSUMABLE_REPAIR) return CONSUMABLE_REPAIR_CAP;
        if (category == SettlementCategory.FACILITY_DAMAGE) return FACILITY_DAMAGE_CAP;
        return UTILITIES_CAP;
    }

    function _currentLeaseAssets(LeaseContract storage lease) internal view returns (uint256) {
        return convertToAssets(lease.sharesIssued);
    }

    function _burnLeaseShares(LeaseContract storage lease) internal {
        uint256 shares = lease.sharesIssued;
        if (shares == 0) return;

        _burn(lease.landlord, shares);
        lease.sharesIssued = 0;
    }

    function _returnEntireDeposit(bytes32 leaseId, LeaseContract storage lease) internal {
        uint256 assets = _currentLeaseAssets(lease);

        lease.state = ContractState.RETURNED;
        if (frozenTokens[lease.landlord]) {
            frozenTokens[lease.landlord] = false;
            emit TokensUnfrozen(lease.landlord, leaseId);
        }

        _burnLeaseShares(lease);
        IERC20(asset()).safeTransfer(lease.tenant, assets);

        emit DepositReturned(leaseId, lease.tenant, assets);
    }

    function _finalizeSettlement(
        bytes32 leaseId,
        uint256 landlordAmount,
        bytes32 resolutionHash
    ) internal {
        LeaseContract storage lease = leases[leaseId];
        SettlementRecord storage settlement = settlements[leaseId];

        require(landlordAmount <= settlement.heldAmount, "Vault: invalid landlord amount");

        uint256 tenantAmount = settlement.heldAmount - landlordAmount;

        settlement.status = SettlementStatus.RESOLVED;
        settlement.finalLandlordAmount = landlordAmount;
        settlement.resolutionHash = resolutionHash;
        settlement.heldAmount = 0;

        lease.state = ContractState.RETURNED;
        if (frozenTokens[lease.landlord]) {
            frozenTokens[lease.landlord] = false;
            emit TokensUnfrozen(lease.landlord, leaseId);
        }

        if (landlordAmount > 0) {
            IERC20(asset()).safeTransfer(lease.landlord, landlordAmount);
        }
        if (tenantAmount > 0) {
            IERC20(asset()).safeTransfer(lease.tenant, tenantAmount);
        }

        emit SettlementResolved(leaseId, landlordAmount, tenantAmount, resolutionHash);
    }

    function _clearExpiredLeaseChangeIfNeeded(bytes32 leaseId) internal {
        LeaseChangeRequest memory request = leaseChangeRequests[leaseId];
        if (
            request.changeType != LeaseChangeType.NONE &&
            block.timestamp > request.responseDeadline
        ) {
            delete leaseChangeRequests[leaseId];
        }
    }

    // ── ERC-4626 public entrypoints 차단 ─────────────────────────────
    function deposit(uint256, address) public pure override returns (uint256) {
        revert("Vault: direct deposit disabled");
    }

    function mint(uint256, address) public pure override returns (uint256) {
        revert("Vault: direct mint disabled");
    }

    function withdraw(uint256, address, address) public pure override returns (uint256) {
        revert("Vault: direct withdraw disabled");
    }

    function redeem(uint256, address, address) public pure override returns (uint256) {
        revert("Vault: direct redeem disabled");
    }
}
