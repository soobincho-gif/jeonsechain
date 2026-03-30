# JeonseChain

전세보증금을 스마트컨트랙트 규칙으로 보호하고, 위험 감지, 자동 반환, 제한적 퇴실 정산까지 연결한 서비스형 MVP입니다.

## Links

- Live demo: https://jeonsechain-frontend.vercel.app
- GitHub: https://github.com/soobincho-gif/jeonsechain
- Sepolia Vault: https://sepolia.etherscan.io/address/0xe8173cA15259A26d7dAB069CDa2002E142e36225

## What It Does

- 전세 계약 등록
- 임차인 보증금 예치
- 오라클 기반 위험 감지
- 만기 후 자동 반환
- 퇴실 정산 요청, 임차인 응답, HUG 최종 배분
- 계약 연장 / 중도 해지 시나리오

핵심 원칙은 "전체 보증금 동결"이 아니라 "분쟁 금액만 제한적으로 보류"입니다.

## Repo Structure

```text
JeonseChain/
  contracts/              Solidity contracts
  scripts/                deploy / settlement keeper
  test/                   Hardhat tests

JeonseChain-frontend/
  src/app/                Next.js app router
  src/components/         dashboard / workflow / onchain panels
  src/lib/                contract ABI, demo data, formatting utils
  tests/                  Playwright smoke tests
```

## Public Deployment

현재 외부에서 바로 볼 수 있는 주소는 아래입니다.

- https://jeonsechain-frontend.vercel.app

커스텀 도메인을 쓰려면 DNS를 별도로 연결하면 됩니다. 현재는 Vercel 기본 도메인 기준으로 운영합니다.

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

오프체인 오라클 워커:

- `oracle-fetcher.js`
- 공공데이터 API + 수동 attestation 병합
- 한국은행 ECOS 기준금리/국고채 3년 benchmark 병합
- GitHub 공개 snapshot 동기화 지원
- batch config 지원
- watch mode 지원
- bundle hash / report JSON 생성

현재 공개 Sepolia 오라클은 `updatePropertyData()`와 `updateRiskScore()`를 모두 지원하는 최신 배포본 기준입니다.

오라클 자동 동기화는 루트 [oracle-sync.yml](/Users/sarahc/Downloads/JeonseChain-full/.github/workflows/oracle-sync.yml) 기준으로 GitHub Actions에서 30분마다 돌도록 설정할 수 있습니다. 이 워크플로는 공공데이터 집계, ECOS benchmark, Sepolia 업데이트, GitHub 공개 snapshot 갱신을 함께 처리합니다.

## Frontend Highlights

- 서비스형 온보딩 대시보드
- guided demo 시나리오
- 주소 검색 + 미니 지도
- 내 계약 요약 카드
- 계약 진행 단계 타임라인
- 퇴실 정산 시각화
- 알림 센터 / 토스트 / 실시간 모니터
- 모바일 반응형 대응

## Evidence Upload Note

로컬 개발 환경에서는 증빙 파일 원본을 저장할 수 있고,
Vercel 배포 환경에서는 서버리스 제약 때문에 원본 파일 대신 해시 번들과 manifest 중심으로 동작합니다.

즉, 외부 데모에서는:

- 파일 해시 생성
- bundle hash 생성
- 정산 청구에 증빙 해시 연결

까지는 그대로 가능하고, 실서비스 단계에서는 S3 또는 Supabase Storage 같은 외부 저장소를 붙이는 것이 적절합니다.

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

- Hardhat tests: `17 passing`
- Playwright smoke tests: `2 passed`
- Vercel production deploy: success

## Portfolio Summary

JeonseChain은 "전세보증금 보호"를 단순한 설명 수준이 아니라, 실제 계약 등록, 예치, 위험 감지, 만기 반환, 퇴실 정산, 계약 연장/중도 해지까지 이어지는 흐름으로 구현한 MVP입니다.

실제 MMF/국채 운용 연동은 아직 붙이지 않았고, 현재는 ERC-4626 원금 보관 구조 + 모의 수익 accrual + 공공데이터 기반 위험 오라클까지를 구현 범위로 둡니다.
