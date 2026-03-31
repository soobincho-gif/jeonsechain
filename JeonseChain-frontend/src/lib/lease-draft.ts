import { formatAddress, formatInputKRW } from '@/lib/format';

type TemporaryLeaseDraftInput = {
  landlordAddress?: string;
  tenantAddress?: string;
  propertyLabel?: string;
  roadAddress?: string;
  detailAddress?: string;
  buildingName?: string;
  depositKRW?: string;
  durationDays?: string;
};

function formatDateOnly(value: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function resolveParty(value?: string) {
  if (!value) return '미입력';
  return value.startsWith('0x') ? value : formatAddress(value, 10, 8);
}

function resolveProperty(input: TemporaryLeaseDraftInput) {
  const composed = [input.roadAddress, input.buildingName, input.detailAddress]
    .filter(Boolean)
    .join(' / ');

  if (composed) return composed;
  if (input.propertyLabel?.trim()) return input.propertyLabel.trim();
  return '주소 미입력';
}

export function appendDraftNote(base: string, note?: string) {
  const trimmed = note?.trim();
  if (!trimmed) return base;

  return `${base}\n\n[추가 메모]\n${trimmed}`;
}

export function buildTemporaryJeonseContractDraft(input: TemporaryLeaseDraftInput) {
  const today = formatDateOnly(new Date());
  const propertyLabel = input.propertyLabel?.trim() || '미입력';
  const durationDays = input.durationDays?.trim() || '0';

  return [
    '[JeonseChain 임시 전세계약서 초안]',
    `작성 기준일: ${today}`,
    '',
    '1. 당사자',
    `- 임대인 지갑 주소: ${resolveParty(input.landlordAddress)}`,
    `- 임차인 지갑 주소: ${resolveParty(input.tenantAddress)}`,
    '',
    '2. 목적물 표시',
    `- 계약 라벨: ${propertyLabel}`,
    `- 확인 주소: ${resolveProperty(input)}`,
    '',
    '3. 전세보증금 및 보호 구조',
    `- 전세보증금: ${formatInputKRW(input.depositKRW)}`,
    `- 보증금은 임차인이 JeonseVault에 예치하는 시점부터 보호가 시작됩니다.`,
    `- 계약 기간: 현재 배포된 컨트랙트 기준 등록 트랜잭션 시점부터 ${durationDays}일`,
    '',
    '4. 반환 및 정산',
    '- 만기 후에는 자동 반환 조건을 우선 확인하고, 필요하면 퇴실 정산 절차로 이어집니다.',
    '- 위험 신호나 분쟁이 감지되면 HUG 또는 지정 관리자 검토가 우선됩니다.',
    '',
    '5. 문서 성격',
    '- 본 문서는 시연 및 해시 기록용 임시 초안입니다.',
    '- 최종 서명본, 확정일자, 등기 검토 자료를 대체하지 않습니다.',
    '',
    '서명 예정란',
    '- 임대인: ______________________________',
    '- 임차인: ______________________________',
  ].join('\n');
}

export function buildTemporarySpecialTermsDraft(input: TemporaryLeaseDraftInput) {
  return [
    '[기본 특약 초안]',
    '- 임차인은 계약 내용과 지갑 주소를 확인한 뒤에만 보증금을 예치합니다.',
    '- 임대인은 만기 또는 합의된 종료 시 JeonseVault 반환 규칙을 따릅니다.',
    '- 입주 전 사진, 비품, 하자 상태는 별도 체크리스트와 증빙으로 함께 보관합니다.',
    `- 목적물 표시 라벨은 "${input.propertyLabel?.trim() || '미입력'}" 기준으로 확인합니다.`,
    '- 본 특약 초안은 시연용 문안이며, 실제 계약 시 공인중개사 및 당사자 검토가 필요합니다.',
  ].join('\n');
}

export function buildTemporaryChecklistDraft(input: TemporaryLeaseDraftInput) {
  return [
    '[입주 체크리스트 초안]',
    `- 목적물 주소 확인: ${resolveProperty(input)}`,
    `- 전세보증금 확인: ${formatInputKRW(input.depositKRW)}`,
    `- 예정 계약 기간 확인: ${input.durationDays?.trim() || '0'}일`,
    '- 임차인 실사용 지갑 주소와 계약서 기재 주소가 일치하는지 확인',
    '- 입주 전 사진, 비품, 하자, 계량기 수치를 별도 기록',
    '- 최종 서명본과 신분 확인 자료는 오프체인 원본으로 별도 보관',
  ].join('\n');
}
