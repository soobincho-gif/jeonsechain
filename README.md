# JeonseChain

전세보증금을 단순 보관이 아니라 `설명 가능한 규칙`으로 보호하는 온체인 전세보증금 보호 MVP입니다.  
계약 등록, 보증금 예치, 위험 감지, 자동 반환, 제한적 퇴실 정산, 계약 연장·중도 해지까지 한 흐름으로 구현했습니다.

## Links

- Live demo: https://jeonsechain-frontend.vercel.app
- GitHub: https://github.com/soobincho-gif/jeonsechain
- Sepolia Vault: https://sepolia.etherscan.io/address/0xe8173cA15259A26d7dAB069CDa2002E142e36225

## Project At A Glance

JeonseChain은 전세보증금 반환 불확실성을 줄이기 위해 다음 세 가지를 한 프로젝트 안에 묶었습니다.

- 스마트컨트랙트 기반 보증금 보호함
- 공공데이터와 금리 benchmark를 반영하는 위험 오라클
- 무분쟁 금액 우선 반환, 분쟁 금액만 제한적으로 보류하는 퇴실 정산 레이어

핵심 원칙은 단순합니다.

- 임대인이 전체 보증금을 임의로 막을 수 없습니다.
- 만기와 조건이 충족되면 자동 반환이 가능합니다.
- 분쟁이 생겨도 전체 동결이 아니라 분쟁 금액만 제한적으로 보류합니다.

## Demo Flow

교수님 시연이나 포트폴리오 설명에서는 아래 흐름으로 보면 가장 자연스럽습니다.

1. 주소를 고르고 계약을 등록합니다.
2. 임차인이 보증금을 예치합니다.
3. 오라클이 공공데이터와 금리 지표를 반영해 위험 점수를 계산합니다.
4. 만기 시 자동 반환 또는 퇴실 정산 흐름으로 넘어갑니다.
5. 필요하면 연장, 중도 해지, HUG 최종 정산까지 이어집니다.

## What Is Actually Implemented

- 전세 계약 등록
- 임차인 보증금 예치
- 오라클 기반 위험 감지
- 만기 후 자동 반환
- 퇴실 정산 요청, 임차인 응답, HUG 최종 배분
- 계약 연장 / 중도 해지 시나리오
- GitHub Actions 기반 오라클 자동 동기화
- 공공데이터 + 한국은행 ECOS benchmark + 온체인 기록 + 공개 snapshot 연동

## Smart Contracts

Sepolia 최신 배포 주소:

- `MockKRW`: `0x74Fb8bAd2ACB4D0e7170861C6268A70e88F92ab7`
- `JeonseOracle`: `0x3005dBF4668a4E7680215F8aAB00F69C2E8EFC79`
- `JeonseVault`: `0xe8173cA15259A26d7dAB069CDa2002E142e36225`
- `HugMultisig`: `0xd39081E16054160A42bD8C4Bb39daA9a99560fC9`

주요 온체인 기능:

- `registerLease`
- `depositJeonse`
- `executeReturn`
- `requestMoveOut`
- `submitSettlementClaim`
- `respondToSettlementClaim`
- `finalizeSettlementAfterDeadline`
- `resolveSettlementByHug`
- `requestLeaseExtension`
- `requestEarlyTermination`
- `respondToLeaseChange`

## Oracle And Trust Layer

오프체인 오라클 워커는 [oracle-fetcher.js](/Users/sarahc/Downloads/JeonseChain-full/JeonseChain/scripts/oracle-fetcher.js) 기준으로 동작합니다.

- 국토부 전월세 / 매매 실거래가 집계
- 한국은행 ECOS 기준금리 / 국고채 3년 benchmark 반영
- 수동 attestation 병합
- `updatePropertyData()` / `updateRiskScore()` 온체인 반영
- report JSON, bundle hash, 공개 snapshot 생성
- GitHub Actions로 30분마다 자동 동기화

지금 공개 화면에서는 이 근거를 그대로 보여줍니다.

- 왜 이 점수가 나왔는지
- 언제 갱신되었는지
- 어떤 데이터 출처를 반영했는지
- 어떤 tx hash로 온체인에 기록됐는지

## Frontend Highlights

- 서비스형 온보딩 대시보드
- guided demo 시나리오
- 주소 검색 + 미니 지도
- 내 계약 요약 카드
- 계약 진행 단계 타임라인
- 퇴실 정산 시각화
- 오라클 신뢰 근거 패널
- 알림 센터 / 토스트 / 실시간 모니터
- 모바일 반응형 대응

## Public Deployment

현재 외부에서 바로 볼 수 있는 주소:

- https://jeonsechain-frontend.vercel.app

오라클 공개 snapshot:

- https://raw.githubusercontent.com/soobincho-gif/jeonsechain/main/oracle-live/latest.json

오라클 공개 API:

- https://jeonsechain-frontend.vercel.app/api/oracle/latest

## Repo Structure

```text
JeonseChain/
  contracts/              Solidity contracts
  scripts/                deploy / oracle worker / settlement keeper
  test/                   Hardhat tests
  deployments/            Sepolia addresses + ABI

JeonseChain-frontend/
  src/app/                Next.js app router
  src/components/         dashboard / workflow / oracle trust panel
  src/lib/                contract ABI, types, formatting utils
  tests/                  Playwright smoke tests
```

## Local Run

### Contracts

```bash
cd JeonseChain
npm install
npm test
```

### Frontend

```bash
cd JeonseChain-frontend
npm install
npm run dev
```

## Verified Checks

이번 정리 기준으로 확인한 항목:

- Hardhat tests: `18 passing`
- Frontend type check: `npx tsc --noEmit`
- Frontend production build: success
- GitHub Actions oracle sync: success
- Vercel production deploy: success

## Portfolio Summary

JeonseChain은 전세보증금 보호를 추상적인 아이디어로 설명하는 데서 멈추지 않고,
실제 계약 등록, 예치, 위험 감지, 만기 반환, 퇴실 정산, 연장·중도 해지까지 이어지는 흐름을 구현한 프로젝트입니다.

특히 이번 MVP는 다음 점에서 차별화됩니다.

- 공공데이터와 금리 benchmark를 반영하는 설명 가능한 위험 점수
- 무분쟁 금액 우선 반환이라는 현실적인 퇴실 정산 정책
- 멀티시그 기반 HUG 권한 구조
- 공개 snapshot과 온체인 tx까지 이어지는 검증 가능성

실제 MMF/국채 운용 연동은 아직 future work로 남겨두었고,
현재는 ERC-4626 원금 보관 구조 + 모의 수익 accrual + 공공데이터 기반 위험 오라클까지를 구현 범위로 둡니다.
