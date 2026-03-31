'use client';

import { DEMO_AUDIENCE_LABEL, DemoAudience, DemoLeaseRecord } from '@/lib/demo-data';

type GuidedStoryModeProps = {
  demos: DemoLeaseRecord[];
  selectedId: string;
  scenario: DemoLeaseRecord['scenario'];
  audienceFilter: DemoAudience | 'all';
  currentStage: number;
  situation: string;
  storyTitle: string;
  storyDescription: string;
  nextActionLabel: string;
  detailMode: boolean;
  onAudienceFilterChange: (audience: DemoAudience | 'all') => void;
  onSelect: (demoId: string) => void;
};

const STORY_STEPS = [
  '계약 등록',
  '보증금 보호 시작',
  '위험 신호 감지',
  '만기 도래',
  '자동 반환 · 퇴실 정산',
];

export default function GuidedStoryMode({
  demos,
  selectedId,
  scenario,
  audienceFilter,
  currentStage,
  situation,
  storyTitle,
  storyDescription,
  nextActionLabel,
  detailMode,
  onAudienceFilterChange,
  onSelect,
}: GuidedStoryModeProps) {
  const sceneMeta = guidedSceneMeta(scenario, currentStage, nextActionLabel);
  const orderedDemos = [...demos].sort((left, right) => {
    if (audienceFilter === 'all') return 0;
    const leftMatch = left.audiences.includes(audienceFilter) ? 1 : 0;
    const rightMatch = right.audiences.includes(audienceFilter) ? 1 : 0;
    return rightMatch - leftMatch;
  });

  return (
    <section className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">계약 시나리오 가이드</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">한 단계씩 따라가는 계약 스토리 모드</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            처음 보는 사람도 흐름을 따라가기 쉽도록 계약의 현재 상황, 다음 액션, 진행 단계를 한 줄 스토리로 묶었습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', 'browser', 'landlord', 'tenant'] as const).map((audience) => {
              const active = audienceFilter === audience;
              const label = audience === 'all' ? '전체 시나리오' : `${DEMO_AUDIENCE_LABEL[audience]} 추천`;
              return (
                <button
                  key={audience}
                  type="button"
                  onClick={() => onAudienceFilterChange(audience)}
                  className={`rounded-full border px-3 py-2 text-xs transition ${
                    active
                      ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
          {detailMode ? '상세 용어 모드' : '쉬운 설명 모드'}
        </div>
      </div>

      <div className="mt-5 rounded-[26px] border border-cyan-300/20 bg-cyan-300/10 p-4">
        <p className="text-sm font-semibold text-white">{situation}</p>
        <p className="mt-2 text-sm leading-6 text-slate-200">{storyDescription}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-100">
          <span className="rounded-full border border-white/15 px-3 py-1">{storyTitle}</span>
          <span className="rounded-full border border-white/15 px-3 py-1">다음 액션: {nextActionLabel}</span>
        </div>
        <div className="guided-confirm mt-4" aria-hidden="true">
          <div className={`guided-confirm__party ${currentStage >= 1 ? 'guided-confirm__party--active' : ''}`}>
            <span className="guided-confirm__head" />
            <span className="guided-confirm__body" />
            <span className="guided-confirm__party-label">임대인</span>
          </div>
          <div className={`guided-confirm__contract ${currentStage >= 2 ? 'guided-confirm__contract--active' : ''}`}>
            <span className="guided-confirm__line" />
            <span className="guided-confirm__line guided-confirm__line--short" />
          </div>
          <div
            className={`guided-confirm__check ${
              currentStage >= 2 ? `guided-confirm__check--${sceneMeta.tone}` : ''
            }`}
          >
            {sceneMeta.label}
          </div>
          <div className={`guided-confirm__party ${currentStage >= 2 ? 'guided-confirm__party--active' : ''}`}>
            <span className="guided-confirm__head" />
            <span className="guided-confirm__body" />
            <span className="guided-confirm__party-label">임차인</span>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-200">{sceneMeta.helper}</p>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {orderedDemos.map((demo) => {
          const selected = demo.id === selectedId;
          const recommended =
            audienceFilter !== 'all' && demo.audiences.includes(audienceFilter);
          return (
            <button
              key={demo.id}
              onClick={() => onSelect(demo.id)}
              className={`rounded-[24px] border p-4 text-left transition ${
                selected
                  ? 'border-cyan-300/30 bg-cyan-300/10'
                  : 'border-white/10 bg-slate-950/40 hover:border-white/20 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-white">{demo.title}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(demo.scenario)}`}>
                  {demo.riskLabel}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {demo.audiences.map((audience) => (
                  <span
                    key={`${demo.id}-${audience}`}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${
                      recommended && audienceFilter === audience
                        ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300'
                    }`}
                  >
                    {DEMO_AUDIENCE_LABEL[audience]}
                  </span>
                ))}
                {recommended ? (
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100">
                    현재 추천
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-medium text-cyan-100">{demo.focusLabel}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{demo.storyDescription}</p>
              <p className="mt-3 text-xs leading-5 text-slate-400">{demo.validitySummary}</p>
              <p className="mt-3 text-xs text-slate-500">{demo.shortLabel}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">계약 진행 단계</p>
            <p className="mt-1 text-sm text-slate-400">
              {detailMode ? 'Lifecycle / Rule Execution View' : '지금 계약이 어디까지 왔는지 보여줍니다.'}
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
            step {currentStage}/5
          </span>
        </div>

        <div className="relative mt-5">
          <div className="absolute left-5 right-5 top-5 hidden h-px bg-white/10 md:block" />
          <div
            className="absolute left-5 top-5 hidden h-px bg-cyan-300/45 md:block motion-safe:origin-left motion-safe:animate-[guidedProgress_1s_ease-out]"
            style={{
              width: `calc((100% - 2.5rem) * ${Math.max(currentStage - 1, 0) / (STORY_STEPS.length - 1)})`,
            }}
          />

          <div className="grid gap-4 md:grid-cols-5">
          {STORY_STEPS.map((step, index) => {
            const stepNumber = index + 1;
            const active = currentStage === stepNumber;
            const complete = currentStage > stepNumber;

            return (
              <div key={step} className="relative">
                <div className="relative flex flex-col items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold ${
                      complete
                        ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
                        : active
                          ? 'border-emerald-400/30 bg-emerald-400/12 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.35)] guided-step-current'
                          : 'border-white/10 bg-white/[0.03] text-slate-400'
                    }`}
                  >
                    {stepNumber}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-white">{step}</p>
                      {active ? (
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                          현재 단계
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{stepCopy(stepNumber, detailMode, scenario)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </section>
  );
}

function badgeTone(scenario: DemoLeaseRecord['scenario']) {
  if (scenario === 'safe') return 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
  if (scenario === 'risk') return 'border border-rose-500/30 bg-rose-500/10 text-rose-100';
  if (scenario === 'extension') return 'border border-cyan-300/30 bg-cyan-300/10 text-cyan-100';
  if (scenario === 'termination') return 'border border-amber-500/30 bg-amber-500/10 text-amber-50';
  return 'border border-amber-500/30 bg-amber-500/10 text-amber-50';
}

function stepCopy(stepNumber: number, detailMode: boolean, scenario: DemoLeaseRecord['scenario']) {
  if (detailMode) {
    if (scenario === 'extension') {
      return [
        'Extension request seeded on-chain',
        'Counterparty reviews new end date',
        'Risk checks rerun for the extended term',
        'Current maturity and new schedule compared',
        'Both parties confirm and end date updates',
      ][stepNumber - 1];
    }

    if (scenario === 'termination') {
      return [
        'Early termination request proposed',
        'Counterparty reviews exit conditions',
        'Settlement and risk checks are prepared',
        'Exit timing is fixed before maturity',
        'Move-out settlement takes over',
      ][stepNumber - 1];
    }

    return [
      'Lease registration and pre-screen',
      'Deposit protection vault activation',
      'Oracle-based risk monitoring',
      'Expiry check and return eligibility',
      'Auto return or settlement hold',
    ][stepNumber - 1];
  }

  if (scenario === 'extension') {
    return [
      '임대인이 연장 조건과 새 기간을 제안하는 단계',
      '임차인이 연장 조건과 금액을 확인하는 단계',
      '연장 기간 기준으로 위험 신호를 다시 보는 단계',
      '현재 만기와 새 일정이 어떻게 달라지는지 비교하는 단계',
      '양측 승인 후 만기일이 실제로 갱신되는 단계',
    ][stepNumber - 1];
  }

  if (scenario === 'termination') {
    return [
      '조기 종료 사유와 종료 시점을 제안하는 단계',
      '상대방이 해지 조건을 확인하는 단계',
      '퇴실 정산과 반환 리스크를 미리 점검하는 단계',
      '언제 계약을 끝낼지 확정하는 단계',
      '퇴실 정산과 반환 단계로 이어지는 단계',
    ][stepNumber - 1];
  }

  return [
    '집 주소와 계약 정보를 등록하는 단계',
    '보증금을 보호 구조로 옮기는 단계',
    '위험 신호를 확인하는 단계',
    '만기와 반환 조건을 확인하는 단계',
    '자동 반환 또는 퇴실 정산으로 마무리하는 단계',
  ][stepNumber - 1];
}

function guidedSceneMeta(
  scenario: DemoLeaseRecord['scenario'],
  currentStage: number,
  nextActionLabel: string,
) {
  if (scenario === 'extension') {
    return {
      label: currentStage >= 5 ? '연장 승인 완료' : '연장 합의 대기',
      helper:
        currentStage >= 5
          ? '임대인과 임차인 모두 승인해 새 만기일이 반영된 상태를 보여줍니다.'
          : `한쪽이 연장을 제안하면 상대방 확인이 끝나야 다음 만기일이 반영됩니다. 다음 액션은 ${nextActionLabel}입니다.`,
      tone: currentStage >= 5 ? 'done' : 'monitor',
    } as const;
  }

  if (scenario === 'termination') {
    return {
      label: currentStage >= 5 ? '해지 후 정산 이동' : '해지 합의 대기',
      helper:
        currentStage >= 5
          ? '양측 합의가 끝나 퇴실 정산 단계로 넘어간 상태를 보여줍니다.'
          : '중도 해지는 한쪽 요청만으로 확정되지 않고, 반대 당사자 승인 뒤에만 정산 단계로 전환됩니다.',
      tone: currentStage >= 5 ? 'warning' : 'warning',
    } as const;
  }

  if (scenario === 'settlement') {
    return {
      label: currentStage >= 5 ? '정산 응답 대기' : '퇴실 점검 진행',
      helper: '퇴실 사진·체크리스트를 확인한 뒤, 무분쟁 금액은 반환하고 분쟁 가능 금액만 소액 보류하는 흐름입니다.',
      tone: 'warning',
    } as const;
  }

  if (scenario === 'risk') {
    return {
      label: '위험 신호 감지',
      helper: '권리변동이나 담보 위험이 감지되면 보호 구조를 유지한 채 중재 또는 추가 확인 단계로 넘어갑니다.',
      tone: 'warning',
    } as const;
  }

  return {
    label: currentStage >= 5 ? '자동 반환 준비' : '보호 진행 중',
    helper: '임대인이 등록하고 임차인이 확인·예치하면 계약이 활성화되고, 만기 시 자동 반환 단계로 이어집니다.',
    tone: currentStage >= 5 ? 'done' : 'active',
  } as const;
}
