export type ShowcaseLeasePreset = {
  id: 'fresh-active' | 'return-ready' | 'expiry-note';
  title: string;
  description: string;
  leaseId?: string;
  buttonLabel?: string;
  helper: string;
  tone: 'active' | 'return' | 'note';
  disabled?: boolean;
};

// 만기 후 자동 반환 시연용 leaseId를 확보하면 여기에 넣어 두면 됩니다.
// 예: export const SHOWCASE_RETURN_READY_LEASE_ID = '0xabc...';
export const SHOWCASE_RETURN_READY_LEASE_ID = '';

export function buildSepoliaShowcaseLeasePresets(activeLeaseId?: string): ShowcaseLeasePreset[] {
  return [
    {
      id: 'fresh-active',
      title: '방금 만든 새 계약 보기',
      description: activeLeaseId
        ? '직접 등록하고 임차인 예치까지 마친 계약을 다시 불러와 ACTIVE 상태와 남은 일수를 바로 시연합니다.'
        : '임대인 등록과 임차인 예치까지 마치면, 그 leaseId를 여기에서 ACTIVE 시연용으로 바로 다시 불러올 수 있습니다.',
      leaseId: activeLeaseId,
      buttonLabel: activeLeaseId ? '현재 ACTIVE 계약 불러오기' : undefined,
      helper: activeLeaseId
        ? '새 계약은 Sepolia에서도 바로 ACTIVE 상태까지 확인할 수 있습니다.'
        : '먼저 임대인 등록과 임차인 예치를 완료해야 이 카드가 활성화됩니다.',
      tone: 'active',
      disabled: !activeLeaseId,
    },
    {
      id: 'return-ready',
      title: '반환 시연용 준비 계약',
      description: SHOWCASE_RETURN_READY_LEASE_ID
        ? '이미 만기와 정산 조건이 정리된 leaseId를 바로 불러와 자동 반환 버튼이 열리는 상태를 바로 보여줍니다.'
        : 'Sepolia 새 계약은 체인 시간을 건너뛸 수 없어 즉시 반환 단계까지는 못 갑니다. 대신 미리 준비된 반환 가능 leaseId를 이 화면에 연결해 바로 시연하는 구조를 권장합니다.',
      leaseId: SHOWCASE_RETURN_READY_LEASE_ID || undefined,
      buttonLabel: SHOWCASE_RETURN_READY_LEASE_ID ? '반환 가능 계약 불러오기' : undefined,
      helper: SHOWCASE_RETURN_READY_LEASE_ID
        ? '이 카드의 leaseId는 실제 반환 실행 시연 전용으로 유지하세요.'
        : '준비된 leaseId가 생기면 `src/lib/showcase-leases.ts`의 `SHOWCASE_RETURN_READY_LEASE_ID`에 넣으면 됩니다.',
      tone: 'return',
      disabled: !SHOWCASE_RETURN_READY_LEASE_ID,
    },
    {
      id: 'expiry-note',
      title: '중도 해지로 만기 상태까지는 빠르게 가능',
      description: '양측이 중도 해지에 합의하면 fresh lease도 즉시 EXPIRED 상태로 바꿀 수 있습니다. 다만 컨트랙트가 72시간 정산 점검 창을 두기 때문에, 그 직후 곧바로 자동 반환까지 이어지지는 않습니다.',
      helper: '즉시 시연: ACTIVE 확인. 별도 준비 계약: 반환 실행. 이 두 단계를 분리하면 Sepolia 데모가 가장 자연스럽습니다.',
      tone: 'note',
    },
  ];
}
