# JeonseChain

JeonseChain은 전세보증금 보호 흐름을 온체인 계약, 설명 가능한 오라클, 역할별 UI로 묶은 MVP입니다.
이 저장소는 다음 세 가지를 한 번에 다룹니다.

- `JeonseChain/`: Hardhat 기반 스마트컨트랙트와 오라클 워커
- `JeonseChain-frontend/`: Next.js 기반 역할별 프론트엔드
- `oracle-live/latest.json`: 공개 오라클 스냅샷

## Public Links

- GitHub: https://github.com/soobincho-gif/jeonsechain
- Frontend: https://jeonsechain.vercel.app
- Oracle snapshot: https://raw.githubusercontent.com/soobincho-gif/jeonsechain/main/oracle-live/latest.json
- Oracle API: https://jeonsechain.vercel.app/api/oracle/latest

## What This Repo Implements

- 임대인이 주소 위험도를 보고 계약을 등록하는 흐름
- 임차인이 `leaseId`를 확인하고 승인·보증금 예치를 진행하는 흐름
- 오라클이 공공데이터와 ECOS 금리 지표를 바탕으로 위험 점수와 근거를 기록하는 흐름
- 만기 자동 반환
- 퇴실 정산 요청, 임차인 응답, HUG 최종 정산
- 계약 연장과 중도 해지 합의
- HUG 멀티시그 기반 pause / unpause / emergencyReturn 거버넌스
- 역할별 데모와 실제 작업 화면을 분리한 프론트 UX

## Current User Experience

프론트는 지금 세 가지 입구로 나뉩니다.

- `둘러보기`: 서비스 구조와 데모를 빠르게 이해하는 모드
- `임대인`: 주소 검색, 계약 등록, 문서 해시 첨부, 정산 요청
- `임차인`: `leaseId` 확인, 승인, 보증금 예치, 정산 응답

데모는 각 시나리오마다 아래를 함께 보여줍니다.

- 누구에게 유효한 시나리오인지
- 왜 이 데모가 필요한지
- 실제로 어떤 기능을 보여주는지
- 데모를 본 뒤 어느 작업 화면으로 이어서 봐야 하는지

## Repository Layout

```text
.
├── JeonseChain/
│   ├── contracts/         Solidity contracts
│   ├── scripts/           deploy / oracle / settlement / demo scripts
│   ├── test/              Hardhat tests
│   ├── deployments/       deployed addresses + ABI
│   └── config/            sample oracle watcher config
├── JeonseChain-frontend/
│   ├── src/app/           Next.js app router + API routes
│   ├── src/components/    role workspaces / demo / monitoring UI
│   ├── src/lib/           ABI / formatting / oracle helpers
│   └── tests/             Playwright smoke tests
└── oracle-live/
    └── latest.json        public oracle snapshot
```

## Quick Start

### 1. Contracts and oracle workspace

```bash
cd JeonseChain
npm ci
npm test
```

선택 실행:

```bash
npm run compile
npm run oracle:fetch -- --mock --dry-run
npm run demo:e2e
```

### 2. Frontend workspace

```bash
cd JeonseChain-frontend
npm ci
npm run dev
```

추가 검증:

```bash
npm run typecheck
npm run build
npm run test:ui
```

## Required Environment Variables

### `JeonseChain/.env`

```bash
PRIVATE_KEY=0x...
SEPOLIA_RPC_URL=https://...
ETHERSCAN_API_KEY=...
DATA_GO_KR_API_KEY=...
BOK_ECOS_API_KEY=...
DEMO_TENANT_PRIVATE_KEY=0x...
```

모든 값이 항상 필요한 것은 아닙니다.

- `npm test`: `.env` 없이 가능
- `oracle:fetch` 실데이터 모드: `DATA_GO_KR_API_KEY`, `BOK_ECOS_API_KEY`
- `deploy:sepolia`: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`
- `demo:e2e:sepolia`: 위 값들 + `DEMO_TENANT_PRIVATE_KEY`

## Main Scripts

### `JeonseChain/package.json`

- `npm test`: Hardhat 전체 테스트
- `npm run compile`: 컨트랙트 컴파일
- `npm run deploy:sepolia`: Sepolia 배포
- `npm run oracle:fetch`: 오라클 1회 실행
- `npm run oracle:watch`: 샘플 설정 기반 오라클 주기 실행
- `npm run keeper:settlement`: 기한 경과 정산 처리 watcher
- `npm run demo:e2e`: 로컬 hardhat 데모 시나리오
- `npm run demo:e2e:sepolia`: Sepolia seeded demo

### `JeonseChain-frontend/package.json`

- `npm run dev`: 개발 서버
- `npm run typecheck`: 타입 체크
- `npm run build`: 프로덕션 빌드
- `npm run start`: 프로덕션 서버 실행
- `npm run test:ui`: Playwright UI 테스트
- `npm run clean`: `.next`, `test-results`, `playwright-report` 정리

## Deployments

### Contracts

배포 주소는 [sepolia.json](./JeonseChain/deployments/sepolia.json)에 정리되어 있습니다.

- `MockKRW`
- `JeonseOracle`
- `JeonseVault`
- `HugMultisig`

ABI는 [JeonseChain/deployments](./JeonseChain/deployments)에 함께 저장됩니다.

### Frontend

프론트엔드는 [JeonseChain-frontend/vercel.json](./JeonseChain-frontend/vercel.json) 기준으로 Vercel에 배포합니다.
Vercel 프로젝트 루트는 `JeonseChain-frontend/`를 사용합니다.

## Validation Status

2026-03-31 로컬 검증 기준:

- Hardhat tests: `23 passing`
- Frontend production build: success
- Playwright smoke/current flow: `4 passing`

검증에 사용한 대표 흐름:

- 랜딩 → 역할별 진입 카드
- 데모 → 실제 작업 화면 연결
- 임대인 / 임차인 / 조회 화면 이동
- 모바일 뷰포트 overflow 확인

## GitHub And Oracle Sync

[oracle-sync.yml](./.github/workflows/oracle-sync.yml)은 아래를 자동화합니다.

- 30분 주기 실행
- 수동 실행 지원
- 공공데이터 + ECOS benchmark 집계
- 온체인 오라클 반영
- `oracle-live/latest.json` 갱신

필요한 GitHub Actions secret:

- `SEPOLIA_PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `DATA_GO_KR_API_KEY`
- `BOK_ECOS_API_KEY`

## Notes

- 현재 MVP는 EVM 기반 보호 흐름과 설명 가능한 오라클에 집중합니다.
- MMF/국채 실제 운용 연동은 future work입니다.
- Hardhat은 Node `v20` 계열이 가장 안전하며, `v25`에서는 경고가 표시될 수 있습니다.
