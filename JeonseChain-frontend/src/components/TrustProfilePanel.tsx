'use client';

import { TrustAttestation, TrustBadge, TrustBundle, TrustIssuerLevel } from '@/lib/trust';

type TrustProfilePanelProps = {
  bundle: TrustBundle;
  detailMode?: boolean;
};

export default function TrustProfilePanel({
  bundle,
  detailMode = false,
}: TrustProfilePanelProps) {
  const sortedAttestations = [...bundle.attestations].sort((a, b) =>
    String(b.issuedAt).localeCompare(String(a.issuedAt)),
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
        <p className="text-sm font-semibold text-white">{bundle.title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{bundle.subtitle}</p>
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
          {detailMode
            ? 'Trust Layer는 social score가 아니라 attestation schema와 verified event를 요약합니다.'
            : bundle.note}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileCard profile={bundle.landlord} detailMode={detailMode} />
        <ProfileCard profile={bundle.tenant} detailMode={detailMode} />
      </div>

      <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              {detailMode ? 'Attestation Ledger' : '검증 가능한 계약 이력'}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {detailMode
                ? 'Self / counterparty / mutual / HUG verified 레벨로 나눠 보여줍니다.'
                : '감정적 후기 대신, 누가 어떤 사실을 확인했는지를 사건 단위로 남깁니다.'}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
            attestation {sortedAttestations.length}건
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {sortedAttestations.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
              아직 누적된 attestation이 없습니다.
            </div>
          ) : (
            sortedAttestations.map((item) => (
              <AttestationRow key={item.id} item={item} detailMode={detailMode} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileCard({
  profile,
  detailMode,
}: {
  profile: TrustBundle['landlord'];
  detailMode: boolean;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
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

function Badge({ badge }: { badge: TrustBadge }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeTone(badge.tone)}`}>
      {badge.label}
      <span className="ml-2 font-normal text-current/80">{badge.helper}</span>
    </span>
  );
}

function AttestationRow({
  item,
  detailMode,
}: {
  item: TrustAttestation;
  detailMode: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${issuerTone(item.issuerLevel)}`}>
            {issuerLabel(item.issuerLevel)}
          </span>
          <span className="text-xs text-slate-500">{item.subjectRole}</span>
        </div>
        <span className="text-xs text-slate-500">{formatIssuedAt(item.issuedAt)}</span>
      </div>

      <p className="mt-3 text-sm font-semibold text-white">
        {detailMode ? item.schema : schemaToHuman(item.schema)}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{item.fact}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>발급 주체 {item.issuerLabel}</span>
        <span className="break-all font-mono">hash {shortHash(item.hash)}</span>
      </div>
    </div>
  );
}

function badgeTone(tone: TrustBadge['tone']) {
  if (tone === 'safe') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  if (tone === 'monitor') return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
  return 'border-rose-400/20 bg-rose-400/10 text-rose-100';
}

function issuerTone(level: TrustIssuerLevel) {
  if (level === 'hug-verified') return 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100';
  if (level === 'mutual-attested') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  if (level === 'counterparty-attested') return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
  return 'border-white/10 bg-white/[0.03] text-slate-200';
}

function issuerLabel(level: TrustIssuerLevel) {
  if (level === 'hug-verified') return 'HUG verified';
  if (level === 'mutual-attested') return 'Mutual';
  if (level === 'counterparty-attested') return 'Counterparty';
  return 'Self';
}

function schemaToHuman(schema: string) {
  if (schema === 'LeaseCompleted') return '정상 종료 이력';
  if (schema === 'DepositReturnedOnTime') return '제때 반환 이력';
  if (schema === 'MoveOutSettledWithoutDispute') return '분쟁 없는 정산';
  if (schema === 'EvidenceSubmitted') return '증빙 제출 완료';
  if (schema === 'ResponseWithin72h') return '72시간 내 응답';
  return schema;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatIssuedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

