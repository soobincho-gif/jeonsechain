'use client';

type HeroProtectionSceneProps = {
  tone: 'safe' | 'monitor' | 'warning';
  statusLabel: string;
};

export default function HeroProtectionScene({
  tone,
  statusLabel,
}: HeroProtectionSceneProps) {
  const toneClass =
    tone === 'safe'
      ? 'hero-scene-safe'
      : tone === 'monitor'
        ? 'hero-scene-monitor'
        : 'hero-scene-warning';

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div className={`hero-scene subtle-grid ${toneClass}`}>
        <div className="hero-scene__ambient hero-scene__ambient--left" />
        <div className="hero-scene__ambient hero-scene__ambient--right" />
        <div className="hero-scene__status">
          <span className="hero-scene__status-dot" />
          {statusLabel}
        </div>
        <div className="hero-scene__tag hero-scene__tag--house">계약 등록</div>
        <div className="hero-scene__tag hero-scene__tag--vault">보호 시작</div>
        <div className="hero-scene__tag hero-scene__tag--return">자동 반환</div>
        <div className="hero-scene__ground" />
        <div className="hero-scene__people" aria-hidden="true">
          <div className="hero-scene__person">
            <span className="hero-scene__person-head" />
            <span className="hero-scene__person-body" />
          </div>
          <div className="hero-scene__trust-check">
            <span className="hero-scene__trust-check-dot" />
            <span>양측 확인</span>
          </div>
          <div className="hero-scene__person hero-scene__person--secondary">
            <span className="hero-scene__person-head" />
            <span className="hero-scene__person-body" />
          </div>
        </div>
        <div className="hero-scene__contract-card">
          <div className="hero-scene__contract-line" />
          <div className="hero-scene__contract-line hero-scene__contract-line--short" />
          <div className="hero-scene__contract-sign" />
        </div>

        <div className="hero-scene__house">
          <div className="hero-scene__roof" />
          <div className="hero-scene__body">
            <div className="hero-scene__window" />
            <div className="hero-scene__door" />
            <div className="hero-scene__window" />
          </div>
          <div className="hero-scene__shield" />
          <div className="hero-scene__shield-ring" />
        </div>

        <div className="hero-scene__flow hero-scene__flow--main">
          <span className="hero-scene__dot" />
          <span className="hero-scene__dot hero-scene__dot--delay-1" />
          <span className="hero-scene__dot hero-scene__dot--delay-2" />
        </div>

        <div className="hero-scene__vault">
          <div className="hero-scene__vault-lock" />
          <p className="hero-scene__label">보증금 보호함</p>
        </div>

        <div className="hero-scene__flow hero-scene__flow--return">
          <span className="hero-scene__dot hero-scene__dot--return" />
        </div>

        <div className="hero-scene__return-lane">
          <div className="hero-scene__return-box hero-scene__return-box--safe">
            <span>자동 반환</span>
          </div>
          <div className="hero-scene__return-box hero-scene__return-box--hold">
            <span>분쟁 보류</span>
          </div>
        </div>
      </div>
    </div>
  );
}
