'use client';

const STEPS = [
  {
    simpleTitle: '계약 등록',
    simpleDescription: '임대인과 임차인이 계약 정보를 올리는 단계',
    technicalTitle: 'Lease Init',
    technicalDescription: '임대인 등록 + Oracle pre-screen',
  },
  {
    simpleTitle: '보증금 보호 시작',
    simpleDescription: '임차인 승인 후 보증금 보호함으로 예치',
    technicalTitle: 'Vault Funding',
    technicalDescription: '임차인 승인 후 Vault 예치',
  },
  {
    simpleTitle: '위험 신호 감지',
    simpleDescription: '리스크 이벤트를 감지하고 보호 조치를 준비',
    technicalTitle: 'Oracle Monitoring',
    technicalDescription: '리스크 감지 시 토큰 동결',
  },
  {
    simpleTitle: '만기 도래',
    simpleDescription: '반환 조건과 만기 일정을 확인',
    technicalTitle: 'Expiry Check',
    technicalDescription: '반환 가능 조건 확인',
  },
  {
    simpleTitle: '자동 반환 / 정산',
    simpleDescription: '자동 반환 또는 퇴실 정산으로 마무리',
    technicalTitle: 'Return Execution',
    technicalDescription: '누구나 실행 가능한 반환',
  },
];

type LifecycleTimelineProps = {
  stage: number;
  detailMode?: boolean;
};

export default function LifecycleTimeline({ stage, detailMode = false }: LifecycleTimelineProps) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            {detailMode ? 'Lifecycle / Rule Flow' : '계약 진행 단계'}
          </p>
          <p className="mt-2 text-sm font-semibold text-white">
            {detailMode ? '온체인 규칙 실행 흐름' : '계약이 어디까지 진행됐는지 보여줍니다'}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {detailMode ? `stage ${stage}/5` : `${stage} / 5 단계`}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {STEPS.map((stepItem, index) => {
          const currentStep = index + 1;
          const isComplete = stage > currentStep;
          const isCurrent = stage === currentStep;

          return (
            <div
              key={detailMode ? stepItem.technicalTitle : stepItem.simpleTitle}
              className="grid grid-cols-[40px_minmax(0,1fr)] gap-3"
            >
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
                    isComplete
                      ? 'border-emerald-400/30 bg-emerald-400/12 text-emerald-200'
                      : isCurrent
                        ? 'border-cyan-300/40 bg-cyan-300/12 text-cyan-100 guided-step-current'
                        : 'border-white/10 bg-white/[0.03] text-slate-400'
                  }`}
                >
                  {currentStep}
                </div>
                {index !== STEPS.length - 1 ? (
                  <div
                    className={`mt-2 h-full w-px ${
                      stage > currentStep ? 'bg-emerald-300/40' : 'bg-white/10'
                    }`}
                  />
                ) : null}
              </div>
              <div className="pb-4">
                <p className="text-sm font-semibold text-white">
                  {detailMode ? stepItem.technicalTitle : stepItem.simpleTitle}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  {detailMode ? stepItem.technicalDescription : stepItem.simpleDescription}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
