# JeonseChain

전세보증금을 스마트컨트랙트 규칙으로 보호하고, 위험 감지, 자동 반환, 제한적 퇴실 정산까지 연결한 서비스형 MVP입니다.

## Links

- Live demo: https://jeonsechain-frontend.vercel.app
- GitHub: https://github.com/soobincho-gif/jeonsechain
- Sepolia Vault: https://sepolia.etherscan.io/address/0xbeB80EE3E3e770C322C40137AbeFc89452367B90

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

- `MockKRW`: `0x0D2706dcaAA13CbC2020a38567Ba71EFE69db800`
- `JeonseOracle`: `0x4E5EdBbd191B66B6e6ccd19B03efeC1684C5CFaF`
- `JeonseVault`: `0xbeB80EE3E3e770C322C40137AbeFc89452367B90`

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

- Hardhat tests: `8 passing`
- Playwright smoke tests: `2 passed`
- Vercel production deploy: success

## Portfolio Summary

JeonseChain은 "전세보증금 보호"를 단순한 설명 수준이 아니라, 실제 계약 등록, 예치, 위험 감지, 만기 반환, 퇴실 정산, 계약 연장/중도 해지까지 이어지는 흐름으로 구현한 MVP입니다.
