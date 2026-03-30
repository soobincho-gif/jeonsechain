'use client';

import { DemoLeaseRecord } from '@/lib/demo-data';

type GuidedStoryModeProps = {
  demos: DemoLeaseRecord[];
  selectedId: string;
  currentStage: number;
  situation: string;
  storyTitle: string;
  storyDescription: string;
  nextActionLabel: string;
  detailMode: boolean;
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
  currentStage,
  situation,
  storyTitle,
  storyDescription,
  nextActionLabel,
  detailMode,
  onSelect,
}: GuidedStoryModeProps) {
  return (
    <section className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">계약 시나리오 가이드</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">한 단계씩 따라가는 계약 스토리 모드</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            처음 보는 사람도 흐름을 따라가기 쉽도록 계약의 현재 상황, 다음 액션, 진행 단계를 한 줄 스토리로 묶었습니다.
          </p>
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
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {demos.map((demo) => {
          const selected = demo.id === selectedId;
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
              <p className="mt-2 text-sm leading-6 text-slate-300">{demo.storyDescription}</p>
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
                          current
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{stepCopy(stepNumber, detailMode)}</p>
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

function stepCopy(stepNumber: number, detailMode: boolean) {
  if (detailMode) {
    return [
      'Lease registration and pre-screen',
      'Deposit protection vault activation',
      'Oracle-based risk monitoring',
      'Expiry check and return eligibility',
      'Auto return or settlement hold',
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
