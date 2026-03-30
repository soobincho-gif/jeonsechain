# JeonseChain — 온체인 SPV 기반 전세보증금 구조화 보호 플랫폼

전세보증금을 스마트 컨트랙트 기반 온체인 SPV에 예치하여,
임대인 자산과 법적으로 분리(도산격리)하고 임차인 원금을 구조적으로 보호하는 시스템.

---

## 배포 현황 (Sepolia 테스트넷)

| 컨트랙트 | 주소 |
|----------|------|
| MockKRW | [`0x74Fb8bAd2ACB4D0e7170861C6268A70e88F92ab7`](https://sepolia.etherscan.io/address/0x74Fb8bAd2ACB4D0e7170861C6268A70e88F92ab7) |
| JeonseOracle | [`0x3005dBF4668a4E7680215F8aAB00F69C2E8EFC79`](https://sepolia.etherscan.io/address/0x3005dBF4668a4E7680215F8aAB00F69C2E8EFC79) |
| JeonseVault | [`0xe8173cA15259A26d7dAB069CDa2002E142e36225`](https://sepolia.etherscan.io/address/0xe8173cA15259A26d7dAB069CDa2002E142e36225) |
| HugMultisig | [`0xd39081E16054160A42bD8C4Bb39daA9a99560fC9`](https://sepolia.etherscan.io/address/0xd39081E16054160A42bD8C4Bb39daA9a99560fC9) |

배포 지갑: `0x7111C45861f8F96833CddB3c32F069cB0416060B`
배포 정보 전문: [`deployments/sepolia.json`](./deployments/sepolia.json)

현재 체크인된 `sepolia.json`은 2026-03-30 11:39(KST 전후) 재배포 기준이며,
`MockKRW / JeonseOracle / JeonseVault / HugMultisig` 네 주소를 모두 포함합니다.

---

## 프로젝트 구조

```
JeonseChain-full/
├── JeonseChain/                  # 스마트 컨트랙트 (Hardhat)
│   ├── contracts/
│   │   ├── JeonseVault.sol       # 핵심 SPV 볼트 (ERC-4626)
│   │   ├── JeonseOracle.sol      # 오라클 + Z-score 이상치 탐지
│   │   ├── JeonseFactory.sol     # MockKRW + 볼트 팩토리
│   │   └── HugMultisig.sol       # HUG 다중 서명 거버넌스
│   ├── scripts/
│   │   ├── deploy.js             # Sepolia 배포 스크립트
│   │   ├── settlement-keeper.js  # 기한 경과 자동 집행 봇
│   │   └── oracle-fetcher.js     # 공공데이터 위험 점수 반영 스크립트
│   ├── test/
│   │   ├── JeonseVault.test.js   # 핵심 정산/연장 테스트
│   │   └── V2Features.test.js    # pause / multisig / yield / riskScore 테스트
│   └── deployments/              # 배포 결과 + ABI (자동 생성)
└── JeonseChain-frontend/         # Next.js 14 프론트엔드
    └── src/
        ├── app/                  # App Router 페이지
        ├── components/           # React 컴포넌트 (14개)
        └── lib/                  # ABI, 타입, 유틸리티
```

---

## 핵심 플로우

```
[임차인] ──보증금 납입──▶ [JeonseVault (온체인 SPV)]
                              │
                              ├─ 원금 볼트 (ERC-4626) — 국채/MMF 예치 (예정)
                              └─ 수익권 토큰 (JCYT) ──▶ [임대인]
                                                              │
                                                         은행 담보 대출 가능

[오라클] ──등기부/경매──▶ Z-score 검증 ──▶ 이상치 시 Circuit Breaker
                                          ──▶ 정상 시 트리거 이벤트 실행

만기 도달 시 ──▶ executeReturn() ──▶ 원금 임차인 자동 반환 (trustless)
```

---

## 주요 기능

| 기능 | 컨트랙트 함수 | 설명 |
|------|-------------|------|
| 보증금 예치 | `depositJeonse()` | 임차인 → 볼트, 수익권 토큰 임대인 발행 |
| 자동 반환 | `executeReturn()` | 만기 시 누구나 호출 가능 (trustless) |
| 위험 감지 | `updatePropertyData()` | 경매·근저당·LTV 초과 자동 감지 |
| 이상치 탐지 | Z-score / IQR | 오염 데이터 사전 차단, Circuit Breaker |
| 토큰 동결 | `triggerDanger()` | 위험 이벤트 시 수익권 토큰 즉시 동결 |
| 퇴실 요청 | `requestMoveOut()` | 만기 후 72시간 검수 기간 시작 |
| 정산 청구 | `submitSettlementClaim()` | 청구 즉시 무분쟁 금액 임차인 반환 |
| 임차인 응답 | `respondToSettlementClaim()` | 전액 수락 / 일부 수락 / 이의 제기 |
| 기한 경과 처리 | `finalizeSettlementAfterDeadline()` | 미응답 시 preset rule로 자동 해제 |
| HUG 최종 정산 | `resolveSettlementByHug()` | 이의 제기 건 HUG 최종 배분 |
| HUG 중재 | `resolveDispute()` | 위험 상태 분쟁 HUG 결정 |
| 마진콜 | `_checkMarginCall()` | 역전세 시 추가 담보 요구 |
| 임대 변경 | `requestLeaseExtension()` / `requestEarlyTermination()` | 연장 / 조기 종료 상호 합의 |

---

## v2 업그레이드 — 코드 반영 완료, 배포/연동 상태 분리 확인 필요

| 기능 | 코드 상태 | 현재 체크인 상태 | 설명 |
|------|------|------------------|------|
| **HugMultisig** | ✅ 구현 | ✅ Sepolia 배포 반영 | 다중 서명 거버넌스 주소가 `sepolia.json`과 프론트에 반영됨 |
| **Mock Yield Accrual** | ✅ 구현 | ✅ 프론트 조회 포함 | `getMockYield()` / `getProtectedAssets()`로 원금·모의수익·합계 분리 표시 |
| **긴급 일시 정지** | ✅ 구현 | ✅ ABI 포함 | `pause()` / `unpause()`로 사용자 진입 함수 일시 정지 |
| **긴급 강제 반환** | ✅ 구현 | ✅ ABI 포함 | `emergencyReturn()`으로 HUG_ROLE이 강제 반환 가능 |
| **Oracle 위험 점수** | ✅ 구현 | ✅ Sepolia 배포 반영 | `riskScore` / `dataSourceHash` / `updateRiskScore()`가 최신 오라클 배포본에 반영됨 |
| **공공데이터 오라클 파이프라인** | ✅ 구현 | ✅ updatePropertyData/updateRiskScore 경로 확인 | `oracle-fetcher.js`가 공공데이터 fetch, 수동 attestation, batch sync, watch mode, ECOS benchmark, bundle hash, GitHub 공개 snapshot 동기화를 지원 |
| **Hyperledger Fabric** | 🔜 future work | 검토 단계 | EVM MVP 안정화 후 분리 PoC로 진행 예정 |

### 새 기능 재배포

```bash
cd JeonseChain
npm run deploy:sepolia
# → deploy.js 기준 4개 컨트랙트(MockKRW / Oracle / Vault / HugMultisig) 배포 시도
# → 새 deployments/sepolia.json + HugMultisig.abi.json 생성
```

### GitHub Actions 오라클 자동 동기화

루트의 [oracle-sync.yml](/Users/sarahc/Downloads/JeonseChain-full/.github/workflows/oracle-sync.yml) 워크플로가

- 30분마다 실행
- 수동 실행(workflow_dispatch) 지원
- 공공데이터 + ECOS benchmark 집계
- Sepolia `updatePropertyData` / `updateRiskScore`
- GitHub 공개 snapshot 갱신

까지 한 번에 처리합니다.

필요한 GitHub Actions secret 이름:

- `SEPOLIA_PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `DATA_GO_KR_API_KEY`
- `BOK_ECOS_API_KEY`

배포 후에는 새 `deployments/sepolia.json`을 커밋하고, 필요 시
`JeonseChain-frontend/src/lib/contracts.ts`의 선택 주소 목록도 함께 갱신하세요.

### HugMultisig 사용 예시

```javascript
// JeonseVault.resolveDispute()를 멀티시그를 통해 실행하는 예
const data = vault.interface.encodeFunctionData('resolveDispute', [leaseId, true]);
await multisig.propose(vaultAddress, data, "임차인 반환 결의 #001");
// 2번째 서명자 확인 후 execute()
await multisig.confirm(txId);    // signer2
await multisig.execute(txId);    // anyone (timelockDelay 후)
```

### Oracle Fetcher 사용 예시

```bash
# 모의 데이터 드라이런 (API 키 없이 동작 확인)
npm run oracle:fetch -- --property-id 0xabc... --mock --dry-run

# 공공데이터포털 실데이터 조회 (API 키 필요)
DATA_GO_KR_API_KEY=xxx npm run oracle:fetch -- \
  --property-id 0xabc... --beopjeong-code 11440 --month 202403

# 여러 부동산을 15분마다 주기 동기화
npm run oracle:watch -- --config ./config/oracle-properties.sample.json --save-report
```

공공데이터포털 API 키 발급: https://www.data.go.kr (무료, 가입 후 즉시 발급)
보고서 저장 경로: `JeonseChain/data/oracle-reports/` (`--save-report` 사용 시)

---

## 설치 및 실행

### 요구 사항

- Node.js 20+ (v25도 동작, Hardhat 공식 지원은 v20 권장)
- MetaMask — Sepolia 테스트넷 설정
- Sepolia ETH — [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)

### 스마트 컨트랙트

```bash
cd JeonseChain
npm install

# .env 파일 생성
cp .env.example .env
# PRIVATE_KEY=0x...  (앞에 0x 포함)
# SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...

# 컴파일
npx hardhat compile

# 테스트
npm test

# Sepolia 배포
npm run deploy:sepolia
```

### 프론트엔드

```bash
cd JeonseChain-frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## 테스트 시나리오 (13개)

| # | 시나리오 | 검증 내용 |
|---|---------|---------|
| 1 | **정상 흐름** | 보증금 예치 → 만기 자동 반환 (임대인 서명 불필요) |
| 2 | **경매 감지** | 오라클 이벤트 → 토큰 동결 → HUG 중재 → 임차인 반환 |
| 3 | **LTV 스크리닝** | 선순위채권 > 공시가 80% 부동산 등록 차단 |
| 4 | **Circuit Breaker** | Z-score 이상치 데이터 → 반영 거부 → HUG 재확인 |
| 5 | **권한 검사** | 무단 오라클 업데이트 / HUG 기능 접근 차단 |
| 6 | **퇴실 정산** | 무분쟁 금액 즉시 반환 + 분쟁 금액만 소액 hold |
| 7 | **카테고리 상한** | 청소비·수리비·파손·공과금 상한 초과 청구 차단 |
| 8 | **임대 변경** | 연장 / 조기 종료 상호 합의 흐름 |
| 9 | **일시 정지** | `pause()` 시 계약 등록/진행 차단, `unpause()` 후 재개 |
| 10 | **긴급 강제 반환** | `emergencyReturn()`으로 활성 계약 원금 반환 |
| 11 | **모의 수익 조회** | `getMockYield()` / `getProtectedAssets()` 값 검증 |
| 12 | **Oracle 위험 점수** | `updateRiskScore()`로 점수와 bundle hash 기록 |
| 13 | **멀티시그 실행** | `HugMultisig` 제안/확인/실행으로 `pause()` 호출 |
| 14 | **Oracle helper** | 주소→propertyId, 월 범위 집계, 해시 안정성 검증 |

---

## 프론트엔드 컴포넌트

| 컴포넌트 | 역할 |
|---------|------|
| `LandlordPanel` | 임대인: 계약 등록, 테스트 KRW 수령 |
| `TenantPanel` | 임차인: KRW 승인 → 보증금 납입 |
| `LeaseViewer` | 계약 조회 + 만기 자동 반환 실행 |
| `OnchainSettlementPanel` | 퇴실 정산 전체 흐름 (요청→청구→응답→HUG) |
| `OnchainLeaseChangePanel` | 임대 연장 / 조기 종료 합의 |
| `LiveMonitor` | 실시간 계약 모니터링 (5초 자동 갱신) |
| `LifecycleTimeline` | 계약 생명주기 시각화 |
| `GuidedStoryMode` | 데모 시나리오 (안전/위험/정산/연장) |
| `HeroProtectionScene` | 랜딩 보호 시각화 |
| `MyContractSummary` | 내 계약 요약 카드 |
| `SettlementPreview` | 정산 금액 미리보기 |
| `AddressSearchPanel` | 주소 기반 계약 검색 |
| `NotificationCenter` | 온체인 이벤트 알림 |
| `ToastStack` | 트랜잭션 상태 토스트 |

---

## 퇴실 정산 모듈

"전체 보증금 동결"이 아니라 **"분쟁 금액만 제한적으로 보류"** 원칙.

1. 만기 후 `requestMoveOut()` → 72시간 검수 기간 시작
2. 임대인 72시간 안에 `submitSettlementClaim()` 청구
   - 청구 즉시 **무분쟁 금액은 임차인에게 즉시 반환**
   - 청구 상한: `min(보증금의 3%, 300만 원)`
3. 카테고리별 상한:

   | 카테고리 | 상한 |
   |---------|------|
   | 청소비 | 30만 원 |
   | 소모성 수리비 | 50만 원 |
   | 시설 파손 | 200만 원 |
   | 공과금·관리비 | 50만 원 |

4. 임차인 72시간 내 응답: 전액 수락 / 일부 수락 / 이의 제기
5. 미응답 → 보류 금액 임대인 release
6. 이의 제기 → HUG `resolveSettlementByHug()` 최종 배분

---

## 증빙 업로드 구조

사진·PDF 원본은 오프체인, **bundle hash만 온체인 기록**.

```
파일 업로드 ──▶ /api/evidence/ (Next.js API Route)
                │
                ├─ 파일 원본: public/evidence/
                ├─ manifest: data/evidence/
                └─ bundle hash (bytes32) ──▶ submitSettlementClaim() 온체인
```

오라클은 파일 보관이 아니라 **외부 사실 확인 → 체인 전달** 역할만 담당.
(공과금 확정값, 외부 점검 결과, HUG 판정 등)

---

## Settlement Keeper

기한 경과 정산 자동 집행 봇.

```bash
# 드라이런 (트랜잭션 없이 확인만)
npm run keeper:settlement -- --dry-run

# 연속 감시 모드 (30초 간격)
npm run keeper:settlement -- --watch --interval 30000

# 특정 lease만 처리
npm run keeper:settlement -- --lease-id 0xabc... --lease-id 0xdef...
```

| 조건 | 자동 실행 함수 |
|------|-------------|
| MOVE_OUT_REQUESTED 상태에서 청구 기한 경과 | `executeReturn()` |
| CLAIM_SUBMITTED 상태에서 임차인 응답 기한 경과 | `finalizeSettlementAfterDeadline()` |

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 스마트 컨트랙트 | Solidity 0.8.24 (EVM: cancun) |
| 라이브러리 | OpenZeppelin — ERC-4626, ERC-20, AccessControl, ReentrancyGuard |
| 개발 환경 | Hardhat 2.28 |
| 프론트엔드 | Next.js 14, React 18, TypeScript |
| Web3 연동 | Wagmi v2, Viem v2, RainbowKit |
| 스타일 | Tailwind CSS |
| 테스트 | Hardhat (단위 17개), Playwright (E2E 2개) |

---

## 보안 고려사항

- **ReentrancyGuard**: 재진입 공격 방어 (모든 state-change 함수)
- **AccessControl**: 역할 기반 접근 제어 (HUG_ROLE, ORACLE_ROLE)
- **Z-score Circuit Breaker**: 오라클 데이터 오염 방어
- **토큰 동결**: 위험 상태에서 수익권 토큰 이전 차단
- **ERC-4626 직접 입출금 차단**: landlord가 임의로 redeem/withdraw 불가
- **LTV 사전 스크리닝**: 선순위채권 과다 부동산 계약 등록 차단

---

## 한계 및 향후 과제

- [ ] 등기부/경매/근저당 실시간 원천 데이터 연동
- [ ] ERC-4626 수익 전략 구현 (국채·MMF 실제 운용)
- [ ] 실배포 멀티시그 주소 커밋 + 프론트 관리 패널 연동
- [ ] 업그레이드 가능한 컨트랙트 (Proxy 패턴)
- [ ] 오라클 노드 스테이킹 인센티브
- [ ] 물리적 명도 분쟁: 기존 법원 절차 병행
- [ ] 수익권 토큰의 자본시장법상 법적 지위 확립
- [ ] Hyperledger Fabric 허가형 블록체인 버전
