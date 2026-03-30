# JeonseChain — 온체인 SPV 기반 전세보증금 구조화 보호 플랫폼

## 개요

전세보증금을 스마트 컨트랙트 기반 온체인 SPV에 예치하여,
임대인 자산과 법적으로 분리(도산격리)하고 임차인 원금을 구조적으로 보호하는 시스템.

## 컨트랙트 구조

```
contracts/
├── JeonseOracle.sol   # 오라클 + Z-score 이상치 탐지 + Circuit Breaker
├── JeonseVault.sol    # ERC-4626 볼트 (핵심 SPV 로직)
└── JeonseFactory.sol  # 계약별 독립 볼트 생성
```

## 핵심 플로우

```
[임차인] ──보증금 납입──▶ [JeonseVault (온체인 SPV)]
                              │
                              ├─ 원금 볼트 (ERC-4626) — 국채/MMF 예치
                              └─ 수익권 토큰 (JCYT) ──▶ [임대인]
                                                              │
                                                         은행 담보 대출 가능
[오라클] ──등기부/경매──▶ Z-score 검증 ──▶ 이상치 시 Circuit Breaker
                                          ──▶ 정상 시 트리거 이벤트 실행
만기 도달 시 ──▶ executeReturn() ──▶ 원금 임차인 자동 반환
```

## 주요 기능

| 기능 | 컨트랙트 | 설명 |
|------|----------|------|
| 보증금 예치 | JeonseVault.depositJeonse() | 임차인 → 볼트, 수익권 토큰 임대인 발행 |
| 자동 반환 | JeonseVault.executeReturn() | 만기 시 누구나 호출 가능 (trustless) |
| 위험 감지 | JeonseOracle.updatePropertyData() | 경매·근저당·LTV 초과 자동 감지 |
| 이상치 탐지 | JeonseOracle (Z-score/IQR) | 오염 데이터 사전 차단 |
| 토큰 동결 | JeonseVault.triggerDanger() | 위험 이벤트 시 수익권 토큰 즉시 동결 |
| HUG 중재 | JeonseVault.resolveDispute() | 분쟁 시 HUG 최종 결정 |
| 마진콜 | JeonseVault._checkMarginCall() | 역전세 시 추가 담보 요구 |
| 퇴실 요청 | JeonseVault.requestMoveOut() | 만기 후 정산 검사 기간 시작 |
| 제한적 정산 보류 | JeonseVault.submitSettlementClaim() | 무분쟁 금액 즉시 반환, 분쟁 금액만 hold |
| 임차인 응답 | JeonseVault.respondToSettlementClaim() | 전액 수락 / 일부 수락 / 이의 제기 |
| 기한 경과 처리 | JeonseVault.finalizeSettlementAfterDeadline() | 응답 없으면 보류 금액만 preset rule로 해제 |
| HUG 최종 정산 | JeonseVault.resolveSettlementByHug() | 보류 금액만 최종 배분 |
| 증빙 해시 제출 | 프론트 evidence upload + JeonseVault.submitSettlementClaim() | 파일 업로드 후 bundle hash를 온체인 저장 |
| 자동 마감 실행 | settlement-keeper.js | 기한 지난 퇴실 요청/정산 청구를 자동 집행 |

## 설치 및 실행

```bash
npm install
npx hardhat compile
npx hardhat test
npm run keeper:settlement -- --dry-run
```

## 테스트 시나리오

1. **정상 흐름**: 보증금 예치 → 만기 자동 반환 (임대인 서명 불필요)
2. **경매 감지**: 오라클 이벤트 → 토큰 동결 → HUG 중재 → 임차인 반환
3. **LTV 스크리닝**: 선순위채권 > 공시가 80% 부동산 계약 등록 차단
4. **Circuit Breaker**: Z-score 이상치 데이터 → 반영 거부 → HUG 재확인
5. **권한 검사**: 무단 오라클 업데이트 / HUG 기능 접근 차단
6. **퇴실 정산**: 무분쟁 금액 즉시 반환 + 분쟁 금액만 소액 hold

## 퇴실 정산 모듈

새 정산 로직은 "전체 보증금 동결"이 아니라 "분쟁 금액만 제한적으로 보류"를 원칙으로 한다.

- 만기 후 `requestMoveOut()`으로 검수 기간 시작
- 임대인은 72시간 안에 `submitSettlementClaim()`으로 청구 가능
- 청구 금액은 `min(보증금의 3%, 300만 원)` 상한 적용
- 카테고리 상한 적용
- 청소비 30만 원
- 소모성 수리비 50만 원
- 시설 파손 200만 원
- 공과금/관리비 50만 원
- 청구 즉시 무분쟁 금액은 tenant에게 반환
- tenant는 전액 수락 / 일부 수락 / 이의 제기 가능
- 미응답 시 보류 금액만 landlord에게 release
- 이의 제기 시 HUG가 `resolveSettlementByHug()`로 최종 배분

즉, 핵심 원금 보호는 유지하면서 퇴실 직후의 현실적 정산 분쟁만 소액으로 다룰 수 있게 설계했다.

## 증빙 업로드와 오라클의 역할 분리

정산 청구에 필요한 사진/PDF 원본은 오프체인 저장소에 보관하고, 온체인에는 그 번들 해시(`bytes32`)만 기록한다.

- 프론트 업로드 API
- 파일 원본 저장: `JeonseChain-frontend/public/evidence/...`
- manifest 저장: `JeonseChain-frontend/data/evidence/...`
- 온체인 기록: `submitSettlementClaim(..., evidenceHash)`

오라클은 사진 원본을 저장하는 역할이 아니라, 필요할 때 외부 사실을 확인해 체인에 전달하는 역할이다.

- 예: 공과금 확정값, 외부 점검 결과, HUG/조정기관 판정 결과

즉 "증빙 업로드"와 "자동 실행"은 오라클 하나에 몰지 않고 아래처럼 나눈다.

- 파일 원본 보관: 오프체인 저장소
- 증빙 무결성: 온체인 bundle hash
- 외부 사실 반영: 오라클
- 기한 경과 자동 실행: keeper/automation

## settlement keeper

`scripts/settlement-keeper.js` 는 새 정산 모듈을 자동 집행하기 위한 watcher다.

- `MOVE_OUT_REQUESTED` 상태에서 청구 기한이 지나면 `executeReturn()` 호출
- `CLAIM_SUBMITTED` 상태에서 임차인 응답 기한이 지나면 `finalizeSettlementAfterDeadline()` 호출
- `--watch`, `--interval`, `--from-block`, `--lease-id`, `--dry-run` 지원

예시:

```bash
npm run keeper:settlement -- --dry-run
npm run keeper:settlement -- --watch --interval 30000
npm run keeper:settlement -- --lease-id 0xabc... --lease-id 0xdef...
```

## 기술 스택

- **Solidity 0.8.24** — 스마트 컨트랙트
- **OpenZeppelin** — ERC-4626, ERC-20, AccessControl, ReentrancyGuard
- **Hardhat** — 개발·테스트 환경
- **Hyperledger Fabric** — 실제 배포 시 허가형 블록체인 (권장)

## 보안 고려사항

- ReentrancyGuard: 재진입 공격 방어
- AccessControl: 역할 기반 접근 제어 (HUG_ROLE, ORACLE_ROLE)
- Z-score Circuit Breaker: 오라클 데이터 오염 방어
- 토큰 동결: 위험 상태에서 수익권 토큰 이전 차단
- ERC-4626 직접 입출금 차단: landlord가 임의로 redeem/withdraw 하지 못하도록 제한

## 한계 및 향후 과제

- 수익권 토큰의 자본시장법상 법적 지위 확립 필요
- 실제 안전자산(국채·MMF) 연동: ERC-4626 yield 전략 구현 필요
- 물리적 명도 분쟁은 기존 법원 절차와 병행
