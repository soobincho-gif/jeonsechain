'use client';

import {
  DemoLeaseRecord,
  SETTLEMENT_STAGE_META,
  SETTLEMENT_STAGE_ORDER,
  SettlementStatus,
} from '@/lib/demo-data';
import { digitsOnly, formatInputKRW } from '@/lib/format';

type SettlementPreviewProps = {
  depositKRW: string;
  statusLabel: string;
  settlementStatus: SettlementStatus;
  detailMode: boolean;
  isDemoMode: boolean;
  scenario: DemoLeaseRecord['scenario'] | 'live';
  onSelectSettlementStatus?: (status: SettlementStatus) => void;
  onOpenSettlementDemo?: () => void;
};

export default function SettlementPreview({
  depositKRW,
  statusLabel,
  settlementStatus,
  detailMode,
  isDemoMode,
  scenario,
  onSelectSettlementStatus,
  onOpenSettlementDemo,
}: SettlementPreviewProps) {
  const deposit = Number(digitsOnly(depositKRW) || '0');
  const holdCap = Math.min(Math.round(deposit * 0.03), 3000000);
  const stageMeta = SETTLEMENT_STAGE_META[settlementStatus];
  const heldAmount = Math.round(holdCap * stageMeta.holdShare);
  const deductedAmount = Math.round(holdCap * stageMeta.deductedShare);
  const instantReturn = Math.max(deposit - heldAmount - deductedAmount, 0);
  const instantPercent = deposit > 0 ? Math.round((instantReturn / deposit) * 100) : 0;
  const holdPercent = deposit > 0 ? Math.round((heldAmount / deposit) * 100) : 0;
  const deductedPercent = deposit > 0 ? Math.max(0, 100 - instantPercent - holdPercent) : 0;
  const isSettlementDemo = isDemoMode && scenario === 'settlement';
  const sceneMeta = settlementSceneMeta(settlementStatus);

  return (
    <section className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">퇴실 정산 레이어</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">퇴실 정산 / 분쟁 금액 보류</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            전세보증금 전액을 임대인 재량으로 막지 않고, 무분쟁 금액은 자동 반환하고 분쟁 가능 금액만 제한적으로 보류하는 구조를 UI로 반영했습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            {statusLabel}
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200">
            {settlementStatus}
          </span>
        </div>
      </div>

      {isSettlementDemo ? (
        <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">퇴실 정산 데모 단계</p>
              <p className="mt-1 text-sm text-slate-400">
                정산 요청부터 최종 정산 완료까지 단계를 눌러보면 금액 바와 설명이 함께 바뀝니다.
              </p>
            </div>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-100">
              단계 체험
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {SETTLEMENT_STAGE_ORDER.map((stage) => {
              const active = stage === settlementStatus;
              return (
                <button
                  key={stage}
                  onClick={() => onSelectSettlementStatus?.(stage)}
                  className={`rounded-full border px-3 py-2 text-sm transition ${
                    active
                      ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  {stage}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {isDemoMode && scenario !== 'settlement' ? (
        <div className="mt-5 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">퇴실 정산은 별도 시나리오로 데모하는 게 더 자연스러워요.</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                지금 선택된 계약은 정산 메인 시나리오가 아니라서, 정산 단계 버튼은 숨기고 요약 구조만 보여주고 있습니다.
              </p>
            </div>
            <button
              onClick={onOpenSettlementDemo}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-white transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
            >
              퇴실 정산 데모로 보기
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">분쟁 금액 바</p>
              <p className="mt-1 text-sm text-slate-400">미분쟁 금액은 즉시 반환, 분쟁 금액만 한시적으로 보류</p>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
              {detailMode ? '정산 보류 상한 3% / 최대 300만 원' : '보류 상한 3% / 최대 300만 원'}
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
            <div className="flex h-5">
              <div
                className="origin-left bg-gradient-to-r from-emerald-400 to-cyan-300 motion-safe:animate-[barReveal_1s_ease-out]"
                style={{ width: `${instantPercent}%` }}
              />
              {deductedPercent > 0 ? (
                <div
                  className="origin-left bg-gradient-to-r from-rose-400 to-rose-300 motion-safe:animate-[barReveal_1s_ease-out_120ms_both]"
                  style={{ width: `${deductedPercent}%` }}
                />
              ) : null}
              <div
                className="origin-left bg-gradient-to-r from-amber-300 to-rose-300 motion-safe:animate-[barReveal_1s_ease-out_180ms_both]"
                style={{ width: `${holdPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-100">
              즉시 반환 {instantPercent}%
            </span>
            {deductedPercent > 0 ? (
              <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-medium text-rose-100">
                최종 차감 {deductedPercent}%
              </span>
            ) : null}
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-50">
              분쟁 보류 {holdPercent}%
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <BreakdownCard label="총 보증금" value={formatInputKRW(String(deposit))} />
            <BreakdownCard label="즉시 반환 금액" value={formatInputKRW(String(instantReturn))} tone="safe" />
            <BreakdownCard
              label={deductedAmount > 0 ? '최종 차감 금액' : '분쟁 보류 금액'}
              value={formatInputKRW(String(deductedAmount > 0 ? deductedAmount : heldAmount))}
              tone={deductedAmount > 0 ? 'danger' : 'warning'}
            />
          </div>

        <div className="mt-5 rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 p-4">
          <p className="text-sm font-semibold text-white">{stageMeta.headline}</p>
          <p className="mt-2 text-sm leading-6 text-slate-200">{stageMeta.description}</p>
          <div className={`settlement-people settlement-people--${sceneMeta.tone} mt-4`} aria-hidden="true">
            <div className="settlement-people__party">
              <span className="settlement-people__head" />
              <span className="settlement-people__body" />
              <span className="settlement-people__label">임대인</span>
            </div>
            <div className={`settlement-people__status settlement-people__status--${sceneMeta.tone}`}>
              <span className="settlement-people__status-label">{sceneMeta.label}</span>
              <span className="settlement-people__status-copy">{sceneMeta.helper}</span>
            </div>
            <div className="settlement-people__party settlement-people__party--tenant">
              <span className="settlement-people__head" />
                <span className="settlement-people__body" />
                <span className="settlement-people__label">임차인</span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm font-semibold text-white">정산 규칙</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Rule label="자동 반환 원칙" value={detailMode ? '무분쟁 금액은 즉시 반환(release)' : '무분쟁 금액은 즉시 반환'} />
              <Rule label="분쟁 제한" value="전체 보증금 동결 불가" />
              <Rule label="제출 기한" value={detailMode ? '퇴실 후 72시간 내 정산 청구(settlement claim)' : '퇴실 후 72시간 내 정산 요청'} />
              <Rule label="증빙 필수" value={detailMode ? '사진/문서 해시 첨부' : '사진 또는 문서 첨부 필수'} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
            <p className="text-sm font-semibold text-white">클레임 카테고리 상한</p>
            <div className="mt-4 space-y-3">
              <CategoryRow label="청소비" limit="최대 30만 원" />
              <CategoryRow label="소모성 수리비" limit="최대 50만 원" />
              <CategoryRow label="명백한 시설 파손" limit="최대 200만 원" />
              <CategoryRow label="공과금/관리비 미납" limit="정산표 기준 별도 반영" />
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
            <p className="text-sm font-semibold text-white">퇴실 정산 타임라인</p>
            <div className="mt-4 space-y-4">
              {[
                '퇴실 신청 및 검수 기간 시작',
                detailMode ? '임대인 정산 청구(settlement claim) 제출 + 증빙 업로드' : '임대인 정산 요청 + 증빙 업로드',
                '임차인 수락 / 일부 수락 / 이의 제기',
                '무분쟁 금액 자동 반환',
                '분쟁 금액만 외부 조정 결과로 최종 배분',
              ].map((item, index) => (
                <div key={item} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                  <div className="flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-xs text-slate-300">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BreakdownCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'safe' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'safe'
      ? 'border-emerald-500/20 bg-emerald-500/10'
      : tone === 'danger'
        ? 'border-rose-500/20 bg-rose-500/10'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10'
        : 'border-white/10 bg-slate-950/45';

  return (
    <div className={`rounded-[22px] border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  );
}

function CategoryRow({ label, limit }: { label: string; limit: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-slate-200">{label}</span>
      <span className="text-xs text-slate-400">{limit}</span>
    </div>
  );
}

function settlementSceneMeta(status: SettlementStatus) {
  if (status === '정산 요청 접수') {
    return {
      label: '증빙 검토 중',
      helper: '임대인이 사진과 문서를 올리고 보류 금액 초안을 만드는 단계',
      tone: 'active',
    } as const;
  }

  if (status === '임차인 응답 대기') {
    return {
      label: '임차인 응답 대기',
      helper: '무분쟁 금액은 정리되고, 분쟁 가능 금액만 소액 보류된 상태',
      tone: 'monitor',
    } as const;
  }

  if (status === '조정 진행') {
    return {
      label: 'HUG 조정 진행',
      helper: '자동 확정 대신 외부 검토 결과를 기다리는 단계',
      tone: 'warning',
    } as const;
  }

  return {
    label: '정산 완료',
    helper: '차감 금액만 반영되고 나머지는 반환이 끝난 상태',
    tone: 'done',
  } as const;
}
