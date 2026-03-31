export type AddressRecord = {
  id: string;
  postalCode: string;
  roadAddress: string;
  building: string;
  district: string;
  lat: number;
  lng: number;
  riskScore: number;
  riskLabel: 'Safe' | 'Monitor' | 'Warning';
};

export type DemoLeaseRecord = {
  id: string;
  title: string;
  shortLabel: string;
  scenario: 'safe' | 'risk' | 'settlement' | 'extension' | 'termination';
  addressId: string;
  depositText: string;
  depositKRW: string;
  protectionRatio: string;
  remainingDays: number;
  riskLabel: '정상' | '주의' | '위험';
  riskScore: number;
  state: number;
  stage: number;
  maturityText: string;
  storyTitle: string;
  storyDescription: string;
  currentSituation: string;
  nextActionLabel: string;
  settlementStatus: SettlementStatus;
};

export type SettlementStatus =
  | '정산 없음'
  | '정산 요청 접수'
  | '임차인 응답 대기'
  | '조정 진행'
  | '최종 정산 완료';

export const SETTLEMENT_STAGE_ORDER: SettlementStatus[] = [
  '정산 요청 접수',
  '임차인 응답 대기',
  '조정 진행',
  '최종 정산 완료',
];

export const SETTLEMENT_STAGE_META: Record<
  SettlementStatus,
  {
    headline: string;
    description: string;
    nextActionLabel: string;
    holdShare: number;
    deductedShare: number;
  }
> = {
  '정산 없음': {
    headline: '아직 퇴실 정산 단계에 들어가기 전입니다.',
    description: '만기 또는 퇴실 요청 전이라 자동 반환 준비 상태만 유지되고 있습니다.',
    nextActionLabel: '퇴실 요청 전',
    holdShare: 0,
    deductedShare: 0,
  },
  '정산 요청 접수': {
    headline: '임대인이 정산 요청과 증빙을 접수한 상태예요.',
    description: '청소비나 파손 항목이 접수되었지만, 아직 임차인 확인 전이라 보류 금액은 제한적으로만 잡힙니다.',
    nextActionLabel: '증빙 확인하기',
    holdShare: 0.4,
    deductedShare: 0,
  },
  '임차인 응답 대기': {
    headline: '무분쟁 금액은 정리됐고, 임차인 응답을 기다리는 상태예요.',
    description: '즉시 반환 금액은 확정되고, 분쟁 가능 금액만 소액으로 보류된 채 응답을 기다립니다.',
    nextActionLabel: '임차인 응답 기다리기',
    holdShare: 0.72,
    deductedShare: 0,
  },
  '조정 진행': {
    headline: '합의가 안 되어 외부 조정 결과를 기다리는 상태예요.',
    description: '플랫폼은 전체 보증금을 막지 않고, 분쟁 금액 상한까지만 보류한 뒤 조정 결과를 반영합니다.',
    nextActionLabel: '조정 결과 대기',
    holdShare: 1,
    deductedShare: 0,
  },
  '최종 정산 완료': {
    headline: '최종 정산이 완료되고 남은 금액이 반환됐어요.',
    description: '조정 또는 합의 결과에 따라 차감 금액만 반영하고, 나머지는 반환 완료된 상태입니다.',
    nextActionLabel: '최종 정산 확인',
    holdShare: 0,
    deductedShare: 0.48,
  },
};

export const ADDRESS_BOOK: AddressRecord[] = [
  {
    id: 'mapo-dmc',
    postalCode: '03925',
    roadAddress: '서울 마포구 월드컵북로 402',
    building: '상암 누리꿈스퀘어 레지던스',
    district: '마포구',
    lat: 37.5798,
    lng: 126.8904,
    riskScore: 18,
    riskLabel: 'Safe',
  },
  {
    id: 'seongsu',
    postalCode: '04797',
    roadAddress: '서울 성동구 성수일로 77',
    building: '성수 리버파크 오피스텔',
    district: '성동구',
    lat: 37.5442,
    lng: 127.0557,
    riskScore: 52,
    riskLabel: 'Monitor',
  },
  {
    id: 'songpa',
    postalCode: '05542',
    roadAddress: '서울 송파구 위례성대로 12',
    building: '잠실 한강뷰 아파트',
    district: '송파구',
    lat: 37.5129,
    lng: 127.1055,
    riskScore: 61,
    riskLabel: 'Monitor',
  },
  {
    id: 'guro',
    postalCode: '08393',
    roadAddress: '서울 구로구 디지털로 300',
    building: '구로 스마트밸리 주상복합',
    district: '구로구',
    lat: 37.4837,
    lng: 126.8964,
    riskScore: 78,
    riskLabel: 'Warning',
  },
];

export const DEMO_LEASES: DemoLeaseRecord[] = [
  {
    id: 'safe-contract',
    title: '정상 계약',
    shortLabel: '정상 계약 보기',
    scenario: 'safe',
    addressId: 'mapo-dmc',
    depositText: '1억 2,000만 원',
    depositKRW: '120000000',
    protectionRatio: '100%',
    remainingDays: 214,
    riskLabel: '정상',
    riskScore: 18,
    state: 1,
    stage: 3,
    maturityText: '2026.10.30',
    storyTitle: '보증금 보호가 정상적으로 진행 중인 계약',
    storyDescription: '보증금이 보호함에 예치되어 있고, 위험 신호 없이 만기 자동 반환을 기다리는 기본 시나리오입니다.',
    currentSituation: '이 계약은 현재 안전하게 보호되고 있어요.',
    nextActionLabel: '만기까지 자동 반환 대기',
    settlementStatus: '정산 없음',
  },
  {
    id: 'risk-contract',
    title: '위험 계약',
    shortLabel: '위험 계약 보기',
    scenario: 'risk',
    addressId: 'guro',
    depositText: '9,000만 원',
    depositKRW: '90000000',
    protectionRatio: '84%',
    remainingDays: 74,
    riskLabel: '위험',
    riskScore: 78,
    state: 2,
    stage: 3,
    maturityText: '2026.06.12',
    storyTitle: '등기·담보 변동 같은 위험 신호가 감지된 계약',
    storyDescription: '자동 반환만 믿기 어려운 상황을 가정한 시나리오로, 위험 신호 감지와 보호 조치가 왜 필요한지 보여줍니다.',
    currentSituation: '위험 신호가 감지되어 보호 조치가 필요해요.',
    nextActionLabel: '위험 이벤트 보기',
    settlementStatus: '정산 없음',
  },
  {
    id: 'settlement-contract',
    title: '퇴실 정산 계약',
    shortLabel: '퇴실 정산 보기',
    scenario: 'settlement',
    addressId: 'songpa',
    depositText: '2억 5,000만 원',
    depositKRW: '250000000',
    protectionRatio: '96%',
    remainingDays: 3,
    riskLabel: '주의',
    riskScore: 61,
    state: 3,
    stage: 5,
    maturityText: '2026.04.18',
    storyTitle: '무분쟁 금액은 반환되고 일부만 보류되는 퇴실 정산 시나리오',
    storyDescription: '파손·청소비·미납금처럼 분쟁이 생길 수 있는 항목만 제한적으로 hold 하고, 나머지는 자동 반환하는 구조를 보여줍니다.',
    currentSituation: '퇴실 정산 요청이 접수되어 일부 금액이 보류 중이에요.',
    nextActionLabel: '퇴실 정산 보기',
    settlementStatus: '임차인 응답 대기',
  },
  {
    id: 'extension-contract',
    title: '계약 연장 시나리오',
    shortLabel: '계약 연장 보기',
    scenario: 'extension',
    addressId: 'seongsu',
    depositText: '1억 8,000만 원',
    depositKRW: '180000000',
    protectionRatio: '99%',
    remainingDays: 12,
    riskLabel: '주의',
    riskScore: 54,
    state: 1,
    stage: 4,
    maturityText: '2026.04.11',
    storyTitle: '만기 직전 연장 합의가 필요한 계약',
    storyDescription: '임차인 또는 임대인이 연장 제안을 보내고, 상대방이 승인하면 만기일이 늘어나는 시나리오입니다.',
    currentSituation: '곧 만기라 계약 연장 합의가 필요한 상태예요.',
    nextActionLabel: '연장 제안 보내기',
    settlementStatus: '정산 없음',
  },
  {
    id: 'termination-contract',
    title: '중도 해지 시나리오',
    shortLabel: '중도 해지 보기',
    scenario: 'termination',
    addressId: 'songpa',
    depositText: '1억 6,000만 원',
    depositKRW: '160000000',
    protectionRatio: '95%',
    remainingDays: 148,
    riskLabel: '주의',
    riskScore: 58,
    state: 1,
    stage: 5,
    maturityText: '2026.08.25',
    storyTitle: '중도 해지 합의 후 퇴실 정산으로 이어지는 계약',
    storyDescription: '계약 기간 중간이라도 양 당사자가 합의하면 조기 종료를 요청하고, 승인 직후 퇴실 정산 단계로 넘어가는 흐름입니다.',
    currentSituation: '조기 종료를 협의 중인 상태예요.',
    nextActionLabel: '중도 해지 제안 보내기',
    settlementStatus: '정산 요청 접수',
  },
];
