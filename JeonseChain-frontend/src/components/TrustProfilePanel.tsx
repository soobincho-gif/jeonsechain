'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrustAttestation, TrustBadge, TrustBundle, TrustBundleKind } from '@/lib/trust';

type TrustProfilePanelProps = {
  bundle: TrustBundle;
  detailMode?: boolean;
  defaultPerspective?: PerspectiveRole;
};

type PerspectiveRole = 'landlord' | 'tenant';

export default function TrustProfilePanel({
  bundle,
  detailMode = false,
  defaultPerspective = 'landlord',
}: TrustProfilePanelProps) {
  const [perspective, setPerspective] = useState<PerspectiveRole>(defaultPerspective);
  const activeProfile = perspective === 'landlord' ? bundle.landlord : bundle.tenant;
  const counterpartProfile = perspective === 'landlord' ? bundle.tenant : bundle.landlord;
  const activeRoleLabel = perspective === 'landlord' ? '임대인' : '임차인';
  const relevantAttestations = useMemo(
    () => bundle.attestations.filter((item) => item.subjectRole === activeRoleLabel),
    [activeRoleLabel, bundle.attestations],
  );
  const roleJourney = buildRoleJourney(bundle.kind, perspective);

  useEffect(() => {
    setPerspective(defaultPerspective);
  }, [bundle.kind, bundle.landlord.displayName, bundle.tenant.displayName, defaultPerspective]);

  return (
    <div className="space-y-4">
      <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">{bundle.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{bundle.subtitle}</p>
          </div>
          <div className="trust-people" aria-hidden="true">
            <div className="trust-avatar">
              <span className="trust-avatar__head" />
              <span className="trust-avatar__body" />
            </div>
            <div className="trust-link" />
            <div className="trust-avatar trust-avatar--secondary">
              <span className="trust-avatar__head" />
              <span className="trust-avatar__body" />
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
          {detailMode
            ? '지금은 사람 자체를 점수화하지 않고, 정상 종료 횟수·제때 반환·분쟁 여부 같은 계약 이력만 요약합니다.'
            : bundle.note}
        </div>
      </div>

      <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white">역할별로 보면 더 이해가 쉬워요</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {detailMode
                ? 'landlord / tenant role split view'
                : '체험하기에서는 임대인과 임차인이 같은 계약을 어떻게 다른 순서로 보게 되는지 나눠서 보여줍니다.'}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              현재 열어둔 계약 문맥에 맞춰 {defaultPerspective === 'tenant' ? '임차인' : '임대인'} 관점부터 먼저 보여줍니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
            <PerspectiveButton
              active={perspective === 'landlord'}
              label="임대인 관점"
              onClick={() => setPerspective('landlord')}
            />
            <PerspectiveButton
              active={perspective === 'tenant'}
              label="임차인 관점"
              onClick={() => setPerspective('tenant')}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <ProfileCard profile={activeProfile} detailMode={detailMode} emphasis />
          <CompactCounterpartCard
            profile={counterpartProfile}
            detailMode={detailMode}
            label={perspective === 'landlord' ? '상대방 임차인' : '상대방 임대인'}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                {detailMode ? 'Scenario Role Journey' : `${activeRoleLabel} 기준 프로세스`}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{roleJourney.summary}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
              {roleJourney.badge}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {roleJourney.steps.map((step, index) => (
              <div key={`${roleJourney.badge}-${step}`} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-xs font-semibold text-cyan-100">
                  {index + 1}
                </div>
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <p className="text-sm text-white">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
            <p className="text-sm font-semibold text-white">
              {detailMode ? 'Attestation / Evidence' : '이 역할에 바로 연결되는 근거'}
            </p>
            <div className="mt-4 space-y-3">
              {relevantAttestations.length > 0 ? (
                relevantAttestations.map((item) => <AttestationCard key={item.id} item={item} />)
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-slate-400">
                  아직 이 역할 기준으로 확정된 attestation이 없습니다. 계약 진행이나 종료 후에 정상 종료, 제때 반환, 정산 응답 같은 사실이 쌓입니다.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
            <p className="text-sm font-semibold text-white">
              {detailMode ? 'Why this is not a social score' : '왜 단일 점수로 묶지 않나요?'}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              <ScopeCard
                title="정상 종료 횟수"
                description="계약이 문제 없이 끝난 횟수를 보여줘서, 감정 평가보다 실제 종료 이력을 먼저 읽게 합니다."
              />
              <ScopeCard
                title="제때 반환 / 응답"
                description="임대인은 반환, 임차인은 응답처럼 각자 역할에 맞는 행동 기록으로 신뢰를 설명합니다."
              />
              <ScopeCard
                title="분쟁 여부"
                description="분쟁이 있었다면 숨기지 않고 보여주되, 사람 자체를 낙인찍는 단일 점수로 합치지 않습니다."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PerspectiveButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm transition ${
        active ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function ProfileCard({
  profile,
  detailMode,
  emphasis,
}: {
  profile: TrustBundle['landlord'];
  detailMode: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className={`rounded-[26px] border p-4 ${emphasis ? 'border-cyan-300/20 bg-cyan-300/10' : 'border-white/10 bg-slate-950/55'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{profile.roleLabel}</p>
          <p className="mt-2 text-lg font-semibold text-white">{profile.displayName}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{profile.headline}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
          {detailMode ? 'fact-based trust' : '사실 기반'}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-400">{profile.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {profile.badges.map((badge) => (
          <Badge key={`${profile.roleLabel}-${badge.label}`} badge={badge} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {profile.metrics.map((metric) => (
          <div
            key={`${profile.roleLabel}-${metric.label}`}
            className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
            <p className="mt-2 text-sm font-semibold text-white">{metric.value}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{metric.helper}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactCounterpartCard({
  profile,
  detailMode,
  label,
}: {
  profile: TrustBundle['landlord'];
  detailMode: boolean;
  label: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{profile.displayName}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{profile.summary}</p>
      <div className="mt-4 space-y-2">
        {profile.metrics.slice(0, 3).map((metric) => (
          <div key={`${profile.roleLabel}-${metric.label}`} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-3 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
            <p className="mt-2 text-sm font-semibold text-white">{metric.value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{detailMode ? metric.helper : metric.helper}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ badge }: { badge: TrustBadge }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone(badge.tone)}`}>
      {badge.label}
      <span className="ml-2 font-normal opacity-80">{badge.helper}</span>
    </span>
  );
}

function AttestationCard({ item }: { item: TrustAttestation }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{item.fact}</p>
        <span className="rounded-full border border-white/10 bg-slate-950/45 px-3 py-1 text-xs text-slate-300">
          {item.issuerLabel}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-400">
        <p>schema: {item.schema}</p>
        <p>issued at: {new Date(item.issuedAt).toLocaleString('ko-KR')}</p>
        <p className="break-all font-mono">{item.hash}</p>
      </div>
    </div>
  );
}

function ScopeCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function badgeTone(tone: TrustBadge['tone']) {
  if (tone === 'safe') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  if (tone === 'monitor') return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
  return 'border-rose-400/20 bg-rose-400/10 text-rose-100';
}

function buildRoleJourney(kind: TrustBundleKind | undefined, perspective: PerspectiveRole) {
  const roleLabel = perspective === 'landlord' ? '임대인' : '임차인';

  if (kind === 'register') {
    return {
      badge: '신규 계약 시작',
      summary:
        perspective === 'landlord'
          ? '임대인이 먼저 주소와 조건을 등록해야 임차인이 같은 leaseId를 확인하고 예치 단계로 넘어갈 수 있습니다.'
          : '임차인은 임대인이 먼저 만든 leaseId를 확인하고 승인·예치를 마쳐야 계약이 활성 상태가 됩니다.',
      steps:
        perspective === 'landlord'
          ? [
              '주소와 보증금, 기간을 입력해 leaseId를 생성합니다.',
              '계약서·특약·체크리스트 해시를 함께 남길 수 있습니다.',
              '생성된 leaseId를 임차인에게 전달해 확인 단계로 넘깁니다.',
            ]
          : [
              '임대인이 만든 leaseId와 주소를 먼저 확인합니다.',
              '계약 내용 확인 후 Vault 사용 승인과 보증금 예치를 진행합니다.',
              '예치가 끝나면 활성 계약과 실시간 모니터링이 시작됩니다.',
            ],
    };
  }

  if (kind === 'safe') {
    return {
      badge: '정상 계약 흐름',
      summary:
        perspective === 'landlord'
          ? '정상 계약에서는 임대인은 문서 정합성과 만기 일정을 관리하고, 임차인은 예치 이후 자동 반환만 기다리면 됩니다.'
          : '정상 계약에서는 임차인이 이미 예치를 마쳤고, 만기까지 위험 신호 없이 자동 반환을 기다리는 흐름입니다.',
      steps:
        perspective === 'landlord'
          ? [
              '등록된 계약 정보와 문서 해시를 유지합니다.',
              '위험 신호가 없는 동안 자동 반환 규칙이 유지됩니다.',
              '만기 도래 시 자동 반환 실행을 확인합니다.',
            ]
          : [
              '보증금 예치와 계약 활성화를 이미 마친 상태입니다.',
              '위험 신호가 없는 동안 내 계약 요약과 오라클 근거만 확인합니다.',
              '만기 도래 후 자동 반환이 실행되면 종료 기록이 남습니다.',
            ],
    };
  }

  if (kind === 'risk') {
    return {
      badge: '위험 계약 대응',
      summary:
        perspective === 'landlord'
          ? '위험 계약에서는 임대인이 권리관계와 담보 상태를 다시 설명하고 추가 근거를 내는 것이 중요합니다.'
          : '임차인은 위험 신호를 보고 계속 진행할지, 추가 확인을 받을지 판단하는 흐름이 중요합니다.',
      steps:
        perspective === 'landlord'
          ? [
              '권리변동·담보 관련 추가 근거를 제시합니다.',
              '중재 또는 관리자 확인이 필요한 경우 증빙을 보강합니다.',
              '만기 전 위험 상태가 해소되는지 계속 모니터링합니다.',
            ]
          : [
              '위험 점수와 주요 신호를 먼저 확인합니다.',
              '권리 재확인 또는 추가 문서를 요청할 수 있습니다.',
              '해소되지 않으면 자동 반환보다 보호 조치가 우선됩니다.',
            ],
    };
  }

  if (kind === 'settlement') {
    return {
      badge: '퇴실 정산 진행',
      summary:
        perspective === 'landlord'
          ? '임대인은 증빙 업로드와 제한적 정산 청구를 하고, 임차인은 무분쟁 금액이 먼저 반환된 뒤 응답합니다.'
          : '임차인은 청구 전체를 수락하는 게 아니라, 일부 수락 또는 이의 제기로 분쟁 금액만 따로 다룰 수 있습니다.',
      steps:
        perspective === 'landlord'
          ? [
              '퇴실 점검 사진과 문서 번들을 먼저 올립니다.',
              '분쟁 가능 금액만 상한 안에서 정산 청구합니다.',
              '임차인 응답 또는 HUG 조정 결과를 기다립니다.',
            ]
          : [
              '무분쟁 금액은 먼저 반환되는 구조를 확인합니다.',
              '보류 금액에 대해 전액 수락, 일부 수락, 이의 제기를 선택합니다.',
              '합의 실패 시 HUG 배분 결과만 최종 반영됩니다.',
            ],
    };
  }

  if (kind === 'extension') {
    return {
      badge: '연장 합의 단계',
      summary:
        perspective === 'landlord'
          ? '임대인은 새 기간과 조건을 제안하고, 임차인 승인이 끝나야 실제 만기일이 바뀝니다.'
          : '임차인은 연장 제안을 검토해 승인하거나 거절해야 하며, 확인만으로는 계약이 바뀌지 않습니다.',
      steps:
        perspective === 'landlord'
          ? [
              '새 만기일과 조건으로 연장을 제안합니다.',
              '임차인이 응답하기 전까지는 기존 만기일이 유지됩니다.',
              '양측 승인이 끝나면 새 일정이 계약에 반영됩니다.',
            ]
          : [
              '현재 만기와 제안된 새 일정을 비교합니다.',
              '연장 제안에 승인 또는 거절로 응답합니다.',
              '승인 시 새 만기일이 반영되고 위험 점수가 다시 계산됩니다.',
            ],
    };
  }

  if (kind === 'termination') {
    return {
      badge: '중도 해지 협의',
      summary:
        perspective === 'landlord'
          ? '중도 해지는 한쪽 요청만으로 끝나지 않고, 양측 합의가 끝난 뒤 퇴실 정산으로 넘어갑니다.'
          : '임차인은 해지 제안의 종료 시점과 정산 조건을 확인하고, 승인 후에만 정산 단계로 이동합니다.',
      steps:
        perspective === 'landlord'
          ? [
              '조기 종료 사유와 종료 시점을 제안합니다.',
              '상대방 승인이 끝나기 전까지는 기존 계약이 유지됩니다.',
              '합의가 끝나면 퇴실 정산 단계와 반환 절차로 전환됩니다.',
            ]
          : [
              '중도 해지 제안의 종료 시점과 조건을 확인합니다.',
              '승인하거나 거절해야 다음 상태가 결정됩니다.',
              '승인 시 퇴실 정산과 보증금 반환 흐름으로 넘어갑니다.',
            ],
    };
  }

  return {
    badge: '종료 기록',
    summary:
      perspective === 'landlord'
        ? '반환 완료 뒤에는 임대인의 제때 반환 이력과 분쟁 여부가 종료 기록으로 남습니다.'
        : '반환 완료 뒤에는 임차인의 정상 종료와 응답 이력이 종료 기록으로 남습니다.',
    steps:
      perspective === 'landlord'
        ? [
            '최종 반환과 정산 결과가 계약 종료로 기록됩니다.',
            '제때 반환 여부가 다음 계약의 근거 배지가 됩니다.',
            '분쟁 없는 종료라면 상호 확인 attestation이 누적됩니다.',
          ]
        : [
            '정상 종료와 응답 기한 준수 이력이 남습니다.',
            '분쟁 없이 끝나면 협조 배지가 추가됩니다.',
            '다음 계약에서는 종료 이력이 신뢰 근거로 보입니다.',
          ],
  };
}
