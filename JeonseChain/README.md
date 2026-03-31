# JeonseChain Contracts Workspace

이 디렉터리는 JeonseChain의 스마트컨트랙트, 오라클 워커, 배포 스크립트를 담고 있습니다.
프로젝트 전체 설명은 루트 [README.md](../README.md)를 기준으로 보고, 여기서는 계약 워크스페이스만 빠르게 실행하면 됩니다.

## Includes

- `contracts/`: `JeonseVault`, `JeonseOracle`, `HugMultisig`, `JeonseFactory`
- `scripts/`: 배포, 오라클 집계, 정산 keeper, 데모 seed
- `test/`: Hardhat 테스트
- `deployments/`: Sepolia 주소와 ABI
- `config/oracle-properties.sample.json`: 오라클 watch 샘플 설정

## Install

```bash
npm ci
```

## Main Commands

```bash
npm test
npm run compile
npm run deploy:sepolia
npm run oracle:fetch -- --mock --dry-run
npm run oracle:watch
npm run keeper:settlement -- --dry-run
npm run demo:e2e
```

## Environment Variables

`.env.example`를 복사해 `.env`를 만든 뒤 필요한 값만 채우면 됩니다.

```bash
cp .env.example .env
```

주요 변수:

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL`
- `ETHERSCAN_API_KEY`
- `DATA_GO_KR_API_KEY`
- `BOK_ECOS_API_KEY`
- `DEMO_TENANT_PRIVATE_KEY`

## Current Validation

최신 로컬 검증 기준:

- `npm test`: `23 passing`
- `npm run compile`: success

배포 주소와 ABI는 [deployments/sepolia.json](./deployments/sepolia.json) 및 같은 폴더의 ABI 파일을 확인하면 됩니다.
