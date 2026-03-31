export type TrustBundleKind =
  | 'register'
  | 'safe'
  | 'risk'
  | 'settlement'
  | 'extension'
  | 'termination'
  | 'returned';

export type TrustIssuerLevel =
  | 'self-claimed'
  | 'counterparty-attested'
  | 'mutual-attested'
  | 'hug-verified';

export type TrustBadgeTone = 'safe' | 'monitor' | 'warning';

export type TrustBadge = {
  label: string;
  helper: string;
  tone: TrustBadgeTone;
};

export type TrustMetric = {
  label: string;
  value: string;
  helper: string;
};

export type TrustAttestation = {
  id: string;
  subjectRole: '임대인' | '임차인';
  schema: string;
  fact: string;
  issuerLevel: TrustIssuerLevel;
  issuerLabel: string;
  issuedAt: string;
  hash: string;
};

export type TrustProfile = {
  roleLabel: '임대인' | '임차인';
  displayName: string;
  headline: string;
  summary: string;
  badges: TrustBadge[];
  metrics: TrustMetric[];
};

export type TrustBundle = {
  kind?: TrustBundleKind;
  title: string;
  subtitle: string;
  note: string;
  landlord: TrustProfile;
  tenant: TrustProfile;
  attestations: TrustAttestation[];
};

const TRUST_TEMPLATES: Record<TrustBundleKind, TrustBundle> = {
  register: {
    title: '신뢰 프로필',
    subtitle: '사람 점수 대신 검증된 계약 이력과 사건 증명만 요약합니다.',
    note: '계약 등록 전 단계라 누적 attestation은 없습니다. 계약 종료 후 정상 반환, 응답 시간, 분쟁 여부 같은 사실만 구조화해 남깁니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '신규 임대인 프로필',
      headline: '아직 누적 계약 이력이 쌓이기 전 상태',
      summary: '첫 계약을 등록하면 정상 종료, 제때 반환, 정산 합의 같은 사건이 구조화된 기록으로 남습니다.',
      badges: [
        { label: '프로필 생성 전', helper: '첫 계약 완료 후 배지 시작', tone: 'monitor' },
      ],
      metrics: [
        { label: '완료 계약', value: '0건', helper: '정상 종료 후 집계' },
        { label: '제때 반환', value: '기록 전', helper: '온체인 종료 이후 증명' },
        { label: '분쟁 없는 종료', value: '기록 전', helper: 'settlement 결과 기준' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '신규 임차인 프로필',
      headline: '협조도와 응답 이력도 계약 종료 후 검증됩니다',
      summary: '점검 협조, 응답 시간, 증빙 제출처럼 계약과 직접 관련된 사실만 남기고, 자유 후기나 감정적 평가는 남기지 않습니다.',
      badges: [
        { label: '프로필 생성 전', helper: '첫 계약 완료 후 배지 시작', tone: 'monitor' },
      ],
      metrics: [
        { label: '완료 계약', value: '0건', helper: '정상 종료 후 집계' },
        { label: '72시간 내 응답', value: '기록 전', helper: '정산 응답 기준' },
        { label: '증빙 제출', value: '기록 전', helper: '정산 프로세스 기준' },
      ],
    },
    attestations: [],
  },
  safe: {
    title: '신뢰 프로필',
    subtitle: '검증 가능한 계약 이력으로만 신뢰를 표현합니다.',
    note: '단일 점수로 사람을 평가하지 않고, 정상 종료와 제때 반환 같은 사실 기반 attestation만 요약합니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '반환 이력이 안정적인 임대인',
      headline: '정상 종료와 제때 반환 이력이 꾸준한 프로필',
      summary: '이전 계약에서 반환 지연 없이 종료한 이력이 있어, 현재 계약도 설명 가능한 신뢰를 갖고 진행 중입니다.',
      badges: [
        { label: '제때 반환', helper: '반환 지연 이력 없음', tone: 'safe' },
        { label: '분쟁 낮음', helper: '최근 12개월 formal dispute 0건', tone: 'safe' },
        { label: '문서 성실', helper: '증빙/계약 문서 제출 완료', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '6건', helper: '최근 검증된 종료 이력' },
        { label: '제때 반환', value: '5 / 6', helper: '온체인 종료 + 합의 기준' },
        { label: '평균 응답', value: '11시간', helper: '상호 확인 기준' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '정산 협조 이력이 좋은 임차인',
      headline: '점검 협조와 응답 속도가 안정적인 프로필',
      summary: '퇴실 점검과 증빙 응답을 제때 마친 이력이 있어, 계약 운영 리스크를 낮추는 유형으로 볼 수 있습니다.',
      badges: [
        { label: '응답 빠름', helper: '72시간 내 응답 반복 확인', tone: 'safe' },
        { label: '점검 협조', helper: '퇴실 일정 협조 이력', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '4건', helper: '최근 검증된 종료 이력' },
        { label: '72시간 내 응답', value: '4 / 4', helper: '정산 응답 기준' },
        { label: '증빙 제출', value: '4건', helper: '필요 시 문서 제출 완료' },
      ],
    },
    attestations: [
      {
        id: 'safe-1',
        subjectRole: '임대인',
        schema: 'DepositReturnedOnTime',
        fact: '보증금 반환이 약정 기한 내 완료됨',
        issuerLevel: 'mutual-attested',
        issuerLabel: '상호 확인',
        issuedAt: '2026-02-12T09:30:00.000Z',
        hash: '0x6f1ab9d55fb6681d4c710eb808f0a6d2d0dbf7a6ee55399fd63fc1f8a9f55701',
      },
      {
        id: 'safe-2',
        subjectRole: '임차인',
        schema: 'ResponseWithin72h',
        fact: '정산 응답이 72시간 이내에 완료됨',
        issuerLevel: 'counterparty-attested',
        issuerLabel: '상대방 확인',
        issuedAt: '2026-02-14T11:40:00.000Z',
        hash: '0x3bf2f6ac45366393d89ec8f17ddf1e25727e55b920d09ef3d08db5788c26b94a',
      },
      {
        id: 'safe-3',
        subjectRole: '임대인',
        schema: 'LeaseCompleted',
        fact: '분쟁 없는 정상 종료 계약 1건 추가',
        issuerLevel: 'hug-verified',
        issuerLabel: 'HUG 검증',
        issuedAt: '2026-02-18T08:00:00.000Z',
        hash: '0x4f9873d4ca9b3fb7e3a1dba5ce9f24f751a6b07088f3219c7ea7c61e0b4ca31f',
      },
    ],
  },
  risk: {
    title: '신뢰 프로필',
    subtitle: '객관적 위험과 사람 프로필은 분리해서 봅니다.',
    note: '현재 계약은 부동산 위험 신호가 강하지만, 사람 프로필은 별도 레이어로 유지됩니다. 집 자체 위험과 당사자 이력을 섞어 하나의 점수로 만들지 않습니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '권리 재확인이 필요한 임대인',
      headline: '반환 이력은 있으나 권리관계 재확인이 필요한 프로필',
      summary: '과거 반환 이력은 존재하지만 최근 권리변동 신호가 감지된 주소를 사용하고 있어, 이번 계약은 사람 프로필보다 부동산 위험이 더 중요합니다.',
      badges: [
        { label: '권리 재확인 필요', helper: '사람 평판이 아닌 객체 위험 이슈', tone: 'warning' },
        { label: '반환 이력 있음', helper: '기존 종료 계약은 존재', tone: 'monitor' },
      ],
      metrics: [
        { label: '완료 계약', value: '3건', helper: '검증된 종료 이력' },
        { label: '제때 반환', value: '2 / 3', helper: '최근 12개월 기준' },
        { label: 'formal dispute', value: '1건', helper: '과거 조정 이력' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '응답 이력은 양호한 임차인',
      headline: '사람 쪽 신뢰는 나쁘지 않지만 부동산 위험이 큼',
      summary: '이번 계약의 핵심 경고는 사람보다 주소 리스크에 있습니다. 신뢰 프로필은 보조 지표로만 사용해야 합니다.',
      badges: [
        { label: '응답 양호', helper: '72시간 내 응답 확인', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '2건', helper: '검증된 종료 이력' },
        { label: '72시간 내 응답', value: '2 / 2', helper: '정산 응답 기준' },
        { label: '증빙 제출', value: '1건', helper: '필요 시 제출' },
      ],
    },
    attestations: [
      {
        id: 'risk-1',
        subjectRole: '임대인',
        schema: 'LeaseCompleted',
        fact: '이전 계약 정상 종료 1건',
        issuerLevel: 'mutual-attested',
        issuerLabel: '상호 확인',
        issuedAt: '2026-01-18T07:10:00.000Z',
        hash: '0x5fa4c8b0f5bd0e37fd3a4460f0d834f081deeeaf4d351eab729f6908dc1d6c8b',
      },
      {
        id: 'risk-2',
        subjectRole: '임대인',
        schema: 'MoveOutSettledWithoutDispute',
        fact: '이전 계약에서는 분쟁 없는 정산이 완료됨',
        issuerLevel: 'counterparty-attested',
        issuerLabel: '상대방 확인',
        issuedAt: '2026-01-22T11:00:00.000Z',
        hash: '0x198dc4c645d52dc852d5f353e47c551e64e8f46314a9d605ad0a5d86ad83a1ac',
      },
    ],
  },
  settlement: {
    title: '신뢰 프로필',
    subtitle: '정산은 사람 점수가 아니라 사건 증명과 응답 이력으로 봅니다.',
    note: '퇴실 정산 단계에서는 누가 더 높은 점수인지보다, 누가 언제 응답했고 어떤 증빙을 제출했는지가 중요합니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '정산 요청을 제출한 임대인',
      headline: '증빙 제출과 응답 기한 준수가 핵심인 프로필',
      summary: '이번 시나리오에서는 파손/청소비 관련 정산 요청을 제기했고, 증빙 제출 여부와 상한 준수가 신뢰 근거가 됩니다.',
      badges: [
        { label: '증빙 제출 완료', helper: '정산 요청에 파일/manifest 포함', tone: 'safe' },
        { label: '상한 준수', helper: '분쟁 금액만 제한적으로 보류', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '5건', helper: '검증된 종료 이력' },
        { label: '분쟁 없는 종료', value: '4 / 5', helper: 'settlement 결과 기준' },
        { label: '평균 응답', value: '18시간', helper: '정산 단계 기준' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '응답 대기 중인 임차인',
      headline: '응답 시간과 점검 협조가 중요한 프로필',
      summary: '아직 최종 평가는 아니며, 응답 기한 안에 부분 수락/이의 제기를 어떻게 남기는지가 핵심 신뢰 근거가 됩니다.',
      badges: [
        { label: '응답 예정', helper: '아직 최종 attestation 전', tone: 'monitor' },
        { label: '점검 협조', helper: '현장 확인 일정 수락', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '4건', helper: '검증된 종료 이력' },
        { label: '72시간 내 응답', value: '3 / 4', helper: '정산 응답 기준' },
        { label: '증빙 제출', value: '4건', helper: '필요 시 대응 자료 제출' },
      ],
    },
    attestations: [
      {
        id: 'settlement-1',
        subjectRole: '임대인',
        schema: 'EvidenceSubmitted',
        fact: '정산 요청 증빙 번들 해시가 제출됨',
        issuerLevel: 'hug-verified',
        issuerLabel: '프로토콜 확인',
        issuedAt: '2026-03-28T10:10:00.000Z',
        hash: '0x0a0f6d5cb8f95d3ff4790816e8b2fbfe1a49d0a0f9ebc48bc4ec8d13042efb9a',
      },
      {
        id: 'settlement-2',
        subjectRole: '임차인',
        schema: 'ResponseWithin72h',
        fact: '응답 기한이 열려 있고 아직 회신 전',
        issuerLevel: 'self-claimed',
        issuerLabel: '진행 중',
        issuedAt: '2026-03-28T10:12:00.000Z',
        hash: '0xa3dc60f41d0d96611a478071085d10c5f8b3bf4e0f5518468f4cae4ee0f2a514',
      },
    ],
  },
  extension: {
    title: '신뢰 프로필',
    subtitle: '연장 단계에서는 응답 속도와 합의 이력이 더 중요합니다.',
    note: '연장 제안은 사람 평가보다 상호 합의 이력에 가깝게 봐야 합니다. 이전 계약에서 제안/응답이 원활했는지만 요약합니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '연장 제안 경험이 있는 임대인',
      headline: '재계약 협상 경험이 있는 프로필',
      summary: '이전에도 연장 제안을 기한 안에 처리한 이력이 있어, 만기 직전 협상 리스크를 낮춰줍니다.',
      badges: [
        { label: '연장 협의 원활', helper: '기한 내 응답 이력', tone: 'safe' },
      ],
      metrics: [
        { label: '연장 합의', value: '2건', helper: '상호 확인된 연장 종료' },
        { label: '평균 응답', value: '9시간', helper: '연장 제안 기준' },
        { label: '완료 계약', value: '4건', helper: '검증된 종료 이력' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '재계약 응답이 빠른 임차인',
      headline: '연장/변경 제안에 기한 내 응답하는 프로필',
      summary: '임차인 쪽도 제안 수락/거절을 제때 남긴 이력이 있어, 만기 직전 불확실성을 줄여줍니다.',
      badges: [
        { label: '응답 빠름', helper: '연장 요청 회신 이력', tone: 'safe' },
      ],
      metrics: [
        { label: '연장 회신', value: '2 / 2', helper: '72시간 내 회신' },
        { label: '완료 계약', value: '3건', helper: '검증된 종료 이력' },
        { label: '분쟁 없는 종료', value: '3 / 3', helper: '조정 없이 종료' },
      ],
    },
    attestations: [
      {
        id: 'extension-1',
        subjectRole: '임차인',
        schema: 'ResponseWithin72h',
        fact: '연장 제안에 24시간 내 회신',
        issuerLevel: 'counterparty-attested',
        issuerLabel: '상대방 확인',
        issuedAt: '2026-03-21T13:45:00.000Z',
        hash: '0x18340f5a941d9551f6c839dc869ee5f0d9fb102da7ae74b248b943b5db1272d2',
      },
    ],
  },
  termination: {
    title: '신뢰 프로필',
    subtitle: '중도 해지는 감정적 평가보다 합의 기록과 정산 대응으로 봅니다.',
    note: '조기 종료 시나리오에서는 누가 옳고 그른지보다, 제안/응답/정산 증빙이 어떻게 남았는지가 신뢰 근거가 됩니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '조기 종료 협의 중인 임대인',
      headline: '중도 해지 합의 경험은 있으나 이번 건은 정산 관찰 필요',
      summary: '과거 조기 종료 자체는 원만했지만, 이번 계약은 정산 요청이 따라와 추가 확인이 필요한 상태입니다.',
      badges: [
        { label: '조기 종료 협의 경험', helper: '이전 합의 이력 존재', tone: 'monitor' },
        { label: '정산 관찰 필요', helper: '현재는 정산 요청 접수 상태', tone: 'warning' },
      ],
      metrics: [
        { label: '조기 종료 합의', value: '1건', helper: '상호 확인 기준' },
        { label: '완료 계약', value: '4건', helper: '검증된 종료 이력' },
        { label: 'formal dispute', value: '1건', helper: '최근 12개월 기준' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '중도 해지 응답 이력이 있는 임차인',
      headline: '합의 응답은 남겼지만 정산 결과는 아직 관찰 중',
      summary: '조기 종료 제안 자체에는 응답 이력이 있으나, 최종 정산이 완료되어야 더 강한 배지가 쌓입니다.',
      badges: [
        { label: '제안 응답 완료', helper: '조기 종료 회신 기록', tone: 'safe' },
        { label: '정산 결과 대기', helper: '아직 최종 확정 전', tone: 'monitor' },
      ],
      metrics: [
        { label: '완료 계약', value: '2건', helper: '검증된 종료 이력' },
        { label: '72시간 내 응답', value: '2 / 3', helper: '정산/변경 응답 기준' },
        { label: '증빙 제출', value: '2건', helper: '필요 시 자료 제출' },
      ],
    },
    attestations: [
      {
        id: 'termination-1',
        subjectRole: '임차인',
        schema: 'LeaseCompleted',
        fact: '중도 해지 제안 응답이 기록됨',
        issuerLevel: 'mutual-attested',
        issuerLabel: '상호 확인',
        issuedAt: '2026-03-16T15:10:00.000Z',
        hash: '0x4883d0ec0e0df29e218c6f48d8a14a73777ae3e1fc55ef6d8b4afadf3d72b9d1',
      },
      {
        id: 'termination-2',
        subjectRole: '임대인',
        schema: 'EvidenceSubmitted',
        fact: '중도 해지 후 정산 증빙 제출',
        issuerLevel: 'hug-verified',
        issuerLabel: 'HUG 검증',
        issuedAt: '2026-03-17T10:20:00.000Z',
        hash: '0x2d4d39ad3b102173f21b3902dcdf3743891fb5ea0958db72090f53723b4f42b8',
      },
    ],
  },
  returned: {
    title: '신뢰 프로필',
    subtitle: '종료된 계약은 사실 기반 배지와 attestation으로만 요약합니다.',
    note: '반환이 완료된 뒤에는 사람 점수보다, 정상 종료·제때 반환·분쟁 여부 같은 검증 가능한 사건만 남깁니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: '반환 완료 이력이 검증된 임대인',
      headline: '정상 종료와 반환 완료가 확인된 프로필',
      summary: '현재 계약도 반환 완료 상태라, 이 계약의 종료 사실을 새로운 attestation으로 추가할 수 있는 상태입니다.',
      badges: [
        { label: '반환 완료', helper: '이번 계약 종료 반영 가능', tone: 'safe' },
        { label: '분쟁 없음', helper: '현재 계약 기준', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '7건', helper: '이번 종료 반영 전 기준' },
        { label: '제때 반환', value: '6 / 7', helper: '최근 검증된 종료' },
        { label: '조정 개입', value: '0건', helper: '최근 12개월 기준' },
      ],
    },
    tenant: {
      roleLabel: '임차인',
      displayName: '정상 종료 이력이 누적된 임차인',
      headline: '퇴실/응답/협조 이력이 안정적인 프로필',
      summary: '이번 계약 종료가 추가되면 정상 종료 이력과 응답 이력이 함께 누적됩니다.',
      badges: [
        { label: '정상 종료', helper: '이번 계약 종료 반영 가능', tone: 'safe' },
        { label: '협조 이력', helper: '점검/응답 완료', tone: 'safe' },
      ],
      metrics: [
        { label: '완료 계약', value: '5건', helper: '이번 종료 반영 전 기준' },
        { label: '72시간 내 응답', value: '5 / 5', helper: '정산/변경 응답 기준' },
        { label: 'formal dispute', value: '0건', helper: '최근 12개월 기준' },
      ],
    },
    attestations: [
      {
        id: 'returned-1',
        subjectRole: '임대인',
        schema: 'DepositReturnedOnTime',
        fact: '이번 계약 반환 완료',
        issuerLevel: 'hug-verified',
        issuerLabel: '프로토콜 확인',
        issuedAt: '2026-03-30T14:12:00.000Z',
        hash: '0x8fd3f4aceed5166ea742cb88dfb99f0cb91b43d9115d750646ecb0dff8cb70cd',
      },
      {
        id: 'returned-2',
        subjectRole: '임차인',
        schema: 'MoveOutSettledWithoutDispute',
        fact: '이번 계약 정산 분쟁 없이 종료',
        issuerLevel: 'mutual-attested',
        issuerLabel: '상호 확인',
        issuedAt: '2026-03-30T14:15:00.000Z',
        hash: '0x95b8d7e58f673862323eb7e5f2bbde8a883fe3c5f4e06af74ba3b0f5977ac8b3',
      },
    ],
  },
};

function cloneBundle(bundle: TrustBundle): TrustBundle {
  return JSON.parse(JSON.stringify(bundle)) as TrustBundle;
}

export function getTrustBundle(
  kind: TrustBundleKind,
  overrides?: {
    landlordName?: string;
    tenantName?: string;
  },
) {
  const bundle = cloneBundle(TRUST_TEMPLATES[kind]);
  bundle.kind = kind;
  if (overrides?.landlordName) bundle.landlord.displayName = overrides.landlordName;
  if (overrides?.tenantName) bundle.tenant.displayName = overrides.tenantName;
  return bundle;
}
