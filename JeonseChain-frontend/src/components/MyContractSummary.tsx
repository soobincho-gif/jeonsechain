'use client';

import { useEffect, useMemo, useState } from 'react';
import LifecycleTimeline from '@/components/LifecycleTimeline';
import TrustProfilePanel from '@/components/TrustProfilePanel';
import { formatClock } from '@/lib/format';
import { TrustBundle } from '@/lib/trust';
import { ActivityItem } from '@/lib/workflow';

export type SummaryTone = 'safe' | 'monitor' | 'warning';
type SummaryTab = 'contract' | 'risk' | 'trust' | 'settlement' | 'activity';

type MyContractSummaryProps = {
  title: string;
  addressLine: string;
  buildingLabel: string;
  depositLabel: string;
  protectionPercent: number;
  remainingLabel: string;
  maturityLabel: string;
  statusLabel: string;
  riskScore: number;
  tone: SummaryTone;
  stage: number;
  note: string;
  liveLabel: string;
  nextActionLabel: string;
  situationTitle: string;
  situationDescription: string;
  settlementStatus: string;
  trustBundle: TrustBundle;
  detailMode: boolean;
  activities: ActivityItem[];
  availableTabs?: SummaryTab[];
  defaultTrustPerspective?: 'landlord' | 'tenant';
};

const TAB_LABELS: Record<SummaryTab, { basic: string; detail: string }> = {
  contract: { basic: '계약 정보', detail: '계약 정보 / Contract' },
  risk: { basic: '위험 감지', detail: '위험 감지 / Oracle' },
  trust: { basic: '신뢰 프로필', detail: '신뢰 프로필 / Attestation' },
  settlement: { basic: '퇴실 정산', detail: '퇴실 정산 / Settlement' },
  activity: { basic: '활동 로그', detail: '활동 로그 / Event Log' },
};

export default function MyContractSummary({
  title,
  addressLine,
  buildingLabel,
  depositLabel,
  protectionPercent,
  remainingLabel,
  maturityLabel,
  statusLabel,
  riskScore,
  tone,
  stage,
  note,
  liveLabel,
  nextActionLabel,
  situationTitle,
  situationDescription,
  settlementStatus,
  trustBundle,
  detailMode,
  activities,
  availableTabs = ['contract', 'risk', 'trust', 'settlement', 'activity'],
  defaultTrustPerspective = 'landlord',
}: MyContractSummaryProps) {
  const [tab, setTab] = useState<SummaryTab>(availableTabs[0] ?? 'contract');
  const recentActivities = useMemo(() => activities.slice(0, 5), [activities]);

  useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0] ?? 'contract');
    }
  }, [availableTabs, tab]);

  return (
    <div className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {detailMode ? '계약 스냅샷 / 규칙 보기' : '내 계약 요약'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{note}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(tone)}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
        {detailMode
          ? '상세 용어 모드에서는 Vault, Oracle Monitoring, Settlement Hold 같은 기술 용어를 함께 표시합니다.'
          : '쉬운 설명 모드에서는 보증금 보호함, 위험 신호 감지, 퇴실 정산처럼 사용자 중심 용어로 보여줍니다.'}
      </div>

      <div className="mt-5 rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-sm font-semibold text-white">{situationTitle}</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{situationDescription}</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QuickCard label="계약 주소" value={addressLine} helper={buildingLabel} />
        <QuickCard
          label={detailMode ? '보증금 / Protected Deposit' : '보증금'}
          value={depositLabel}
          helper={detailMode ? '보증금 보호함에 연결된 금액' : '현재 계약 기준'}
        />
        <QuickCard label="만기일" value={maturityLabel} helper={`남은 기간 ${remainingLabel}`} />
        <QuickCard
          label={detailMode ? '다음 액션 / Next Rule' : '다음 액션'}
          value={nextActionLabel}
          helper={liveLabel}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 rounded-[22px] border border-white/10 bg-slate-950/45 p-2">
        {availableTabs.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === key
                ? 'bg-cyan-300 text-slate-950'
                : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {detailMode ? TAB_LABELS[key].detail : TAB_LABELS[key].basic}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'contract' ? (
          <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {detailMode ? '보호 비율 (Coverage)' : '보호 비율'}
              </p>
              <div className="mt-5 flex justify-center">
                <div
                  className="flex h-36 w-36 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(from 180deg, rgba(34,211,238,0.9) 0 ${protectionPercent}%, rgba(15,23,42,0.7) ${protectionPercent}% 100%)`,
                  }}
                >
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border border-white/10 bg-slate-950 text-white">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {detailMode ? 'coverage' : '보호율'}
                    </span>
                    <span className="mt-1 text-2xl font-semibold">{protectionPercent}%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <InfoCard label="현재 상태" value={statusLabel} helper="정상 / 주의 / 위험처럼 한눈에 읽히는 상태 표현" />
                <InfoCard label="리스크 점수" value={`${riskScore} / 100`} helper="높을수록 위험 신호가 많이 겹친 상태" />
              </div>
              <LifecycleTimeline
                stage={stage}
                detailMode={detailMode}
                statusLabel={statusLabel}
                remainingLabel={remainingLabel}
                liveLabel={liveLabel}
              />
            </div>
          </div>
        ) : null}

        {tab === 'risk' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label={detailMode ? '위험 신호 감지 (Oracle Monitoring)' : '위험 신호 감지'}
              value={statusLabel}
              helper="등기·담보·만기 이벤트처럼 계약에 영향을 주는 신호를 추적합니다."
            />
            <InfoCard
              label="현재 판단"
              value={situationTitle}
              helper={situationDescription}
            />
            <InfoCard
              label="리스크 점수"
              value={`${riskScore} / 100`}
              helper={tone === 'warning' ? '즉시 확인이 필요한 상태' : tone === 'monitor' ? '주의 깊게 모니터링할 상태' : '안정적인 상태'}
            />
            <InfoCard
              label="다음 단계"
              value={nextActionLabel}
              helper="위험 상태에 따라 자동 반환, 중재, 보류 같은 경로가 달라집니다."
            />
          </div>
        ) : null}

        {tab === 'trust' ? (
          <TrustProfilePanel
            bundle={trustBundle}
            detailMode={detailMode}
            defaultPerspective={defaultTrustPerspective}
          />
        ) : null}

        {tab === 'settlement' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard
              label={detailMode ? '퇴실 정산 요청 (Settlement Hold)' : '퇴실 정산 상태'}
              value={settlementStatus}
              helper="무분쟁 금액은 즉시 반환하고, 분쟁 금액만 제한적으로 보류합니다."
            />
            <InfoCard
              label="핵심 원칙"
              value="전체 보증금 동결 불가"
              helper="청소비, 수리비, 미납금 등 분쟁 항목에 해당하는 금액만 보류합니다."
            />
            <InfoCard
              label="즉시 반환"
              value="무분쟁 금액 자동 반환"
              helper="임대인의 재량이 아니라 규칙에 따라 자동으로 처리됩니다."
            />
            <InfoCard
              label="증빙 및 기한"
              value="사진·문서 첨부 + 제한된 응답 기간"
              helper="합의 실패 시 외부 조정 결과만 반영하는 구조를 전제로 합니다."
            />
          </div>
        ) : null}

        {tab === 'activity' ? (
          <div className="rounded-[26px] border border-white/10 bg-slate-950/55 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">최근 활동 5개</p>
                <p className="mt-1 text-sm text-slate-400">고정 높이 패널 안에서 최신 이벤트만 빠르게 봅니다.</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                스크롤 가능
              </span>
            </div>
            <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
              {recentActivities.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
                  아직 기록된 활동이 없습니다.
                </div>
              ) : (
                recentActivities.map((activity) => (
                  <div key={activity.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${toneDot(activity.tone)}`} />
                        <p className="text-sm font-medium text-white">{activity.title}</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatClock(activity.timestamp)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{activity.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function badgeClass(tone: SummaryTone) {
  if (tone === 'safe') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (tone === 'monitor') return 'border-amber-500/30 bg-amber-500/10 text-amber-50';
  return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
}

function QuickCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="min-w-0 rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 break-words text-sm font-semibold leading-6 text-white [overflow-wrap:anywhere]">{value}</p>
      <p className="mt-2 break-words text-sm leading-6 text-slate-400 [overflow-wrap:anywhere]">{helper}</p>
    </div>
  );
}

function InfoCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="min-w-0 rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 break-words text-sm font-semibold leading-6 text-white [overflow-wrap:anywhere]">{value}</p>
      <p className="mt-2 break-words text-sm leading-6 text-slate-400 [overflow-wrap:anywhere]">{helper}</p>
    </div>
  );
}

function toneDot(tone: ActivityItem['tone']) {
  if (tone === 'success') return 'bg-emerald-400';
  if (tone === 'warning') return 'bg-amber-400';
  return 'bg-cyan-300';
}
