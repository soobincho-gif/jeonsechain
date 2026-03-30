'use client';

import { TrustBadge, TrustBundle } from '@/lib/trust';

type TrustProfilePanelProps = {
  bundle: TrustBundle;
  detailMode?: boolean;
};

export default function TrustProfilePanel({
  bundle,
  detailMode = false,
}: TrustProfilePanelProps) {
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

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileCard profile={bundle.landlord} detailMode={detailMode} />
        <ProfileCard profile={bundle.tenant} detailMode={detailMode} />
      </div>

      <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              {detailMode ? 'Trust Profile Scope' : '이 프로필이 보여주는 것'}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {detailMode
                ? 'advanced attestation schema나 HUG verified 배지는 다음 단계로 두고, 현재는 발표용으로 이해하기 쉬운 계약 이력만 보여줍니다.'
                : '감정적 후기 대신 정상 종료 횟수, 제때 반환 이력, 최근 분쟁 여부처럼 이해하기 쉬운 사실만 먼저 요약합니다.'}
            </p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
            simple trust view
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ScopeCard
            title="정상 종료 횟수"
            description="계약이 무리 없이 종료된 누적 횟수를 먼저 보여줍니다."
          />
          <ScopeCard
            title="제때 반환 이력"
            description="임대인 쪽은 반환 지연이 잦은지, 임차인 쪽은 정산 대응이 늦지 않았는지를 봅니다."
          />
          <ScopeCard
            title="분쟁 여부"
            description="최근 formal dispute가 많았는지, 원만한 종료가 많았는지를 간단히 읽게 합니다."
          />
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
      <span className="ml-2 font-normal opacity-80">{badge.helper}</span>
    </span>
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
