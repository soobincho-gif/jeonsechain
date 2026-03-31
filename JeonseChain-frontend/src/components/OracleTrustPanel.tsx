'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES, ORACLE_ABI } from '@/lib/contracts';
import { explorerLink, formatAddress, formatDateTimeFromUnix } from '@/lib/format';
import type { OracleSnapshot } from '@/lib/oracle';

type OracleTrustPanelProps = {
  detailMode: boolean;
  autoRefreshEnabled: boolean;
};

export default function OracleTrustPanel({
  detailMode,
  autoRefreshEnabled,
}: OracleTrustPanelProps) {
  const [snapshot, setSnapshot] = useState<OracleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function fetchSnapshot(signal?: AbortSignal) {
    try {
      const response = await fetch('/api/oracle/latest', { cache: 'no-store', signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as OracleSnapshot;
      setSnapshot(payload);
      setError(null);
    } catch (nextError) {
      if ((nextError as Error).name === 'AbortError') return;
      setError((nextError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchSnapshot(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = window.setInterval(() => {
      fetchSnapshot();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled]);

  const summary = snapshot?.latest;

  const propertyIdReady = Boolean(
    summary?.propertyId?.startsWith('0x') && summary.propertyId.length === 66,
  );
  const { data: onchainSignals } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseOracle,
    abi: ORACLE_ABI,
    functionName: 'getRiskSignalSummary',
    args: propertyIdReady ? [summary!.propertyId as `0x${string}`] : undefined,
    query: { enabled: propertyIdReady, refetchInterval: 30000 },
  });

  const attestationCount = useMemo(() => {
    if (!summary) return 0;
    return Object.values(summary.attestation).filter((value) => value === 'MANUAL_OVERRIDE').length;
  }, [summary]);

  const history = useMemo(
    () => [...(snapshot?.history ?? [])].sort((a, b) => String(a.fetchedAt).localeCompare(String(b.fetchedAt))),
    [snapshot?.history],
  );
  const riskSignals = useMemo(
    () => (summary ? buildRiskSignals(summary) : []),
    [summary],
  );
  const easySummary = useMemo(
    () => (summary ? easyRiskSummary(summary.risk.score, riskSignals) : null),
    [summary, riskSignals],
  );
  const displayedRiskLog = useMemo(
    () => (summary ? normalizeRiskLog(summary) : []),
    [summary],
  );

  return (
    <>
      <section className="glass-card overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              {detailMode ? 'Oracle Trust Layer / Explainability' : '점수 산출 근거'}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {detailMode ? 'Why this risk score was derived' : '왜 이런 보호 상태가 나왔는지 보여줍니다'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {detailMode
                ? 'Market transactions, benchmark rates, manual attestations, and on-chain updates are collected in one explainable layer.'
                : '최근 공공데이터, 금리 benchmark, 수동 검토 결과를 함께 반영해 점수를 다시 계산했고, 그 결과를 보고서와 온체인 기록으로 검증할 수 있습니다.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fetchSnapshot()}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
            >
              최신 데이터 다시 보기
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              disabled={!snapshot}
              className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              검증 정보 열기
            </button>
          </div>
        </div>

        {loading && !snapshot ? (
          <PanelSkeleton />
        ) : error && !snapshot ? (
          <ErrorState message={error} onRetry={() => fetchSnapshot()} />
        ) : summary ? (
          <>
            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
              <div className="rounded-[28px] border border-cyan-300/20 bg-cyan-300/10 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {detailMode ? 'Risk Score Explanation' : '왜 이 점수인가요?'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {summary.address || '현재 선택된 주소 없음'}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(summary.risk.score)}`}>
                    {summary.risk.score} / 100 · {riskLabel(summary.risk.score)}
                  </span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricChip label="전월세 실거래 반영" value={`${summary.metrics.rentSamples.toLocaleString('ko-KR')}건`} helper="최근 집계 표본" />
                  <MetricChip label="매매 실거래 반영" value={`${summary.metrics.saleSamples.toLocaleString('ko-KR')}건`} helper="최근 집계 표본" />
                  <MetricChip label="기준금리" value={formatPercent(summary.benchmark?.baseRate?.valuePct)} helper={summary.benchmark?.baseRate?.time || 'ECOS'} />
                  <MetricChip label="국고채 3Y" value={formatPercent(summary.benchmark?.treasury3y?.valuePct)} helper={summary.benchmark?.treasury3y?.time || 'ECOS'} />
                  <MetricChip label="수익률 참고치" value={formatPercent(summary.benchmark?.protectedYieldReferencePct)} helper="보호 판단 참고" />
                  <MetricChip label="수동 검토" value={`${attestationCount}건`} helper="attestation 포함 수" />
                </div>

                {easySummary ? (
                  <div className="mt-5 rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {detailMode ? 'Easy-language risk summary' : '왜 주의 / 위험으로 보나요?'}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-200">{easySummary.summary}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${signalBadgeClass(easySummary.tone)}`}>
                        {easySummary.label}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-400">{easySummary.helper}</p>
                  </div>
                ) : null}

                <div className="mt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">
                      {detailMode ? 'Five explainable risk signals' : '핵심 위험 신호 5개'}
                    </p>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300">
                      {detailMode ? 'signal-first view' : '쉬운 설명 우선'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {riskSignals.map((signal) => (
                      <RiskSignalCard key={signal.label} signal={signal} />
                    ))}
                  </div>
                </div>

                <div className="mt-5 rounded-[22px] border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-sm font-medium text-white">
                    {detailMode ? 'Score Reasoning Log' : '세부 판단 로그'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {displayedRiskLog.map((line) => (
                      <span
                        key={line}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-200"
                      >
                        {line}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <PanelCard
                  title={detailMode ? 'Data Freshness / Sources' : '데이터 출처 및 신선도'}
                  description="어떤 데이터를 언제 반영했는지 한눈에 확인합니다."
                >
                  <div className="flex flex-wrap gap-2">
                    <SourceBadge label="국토부 공공데이터" />
                    <SourceBadge label="한국은행 ECOS" />
                    <SourceBadge label="수동 attestation" muted={attestationCount === 0} />
                    <SourceBadge label="온체인 기록 완료" accent />
                  </div>
                  <div className="mt-4 space-y-3">
                    <FreshnessRow
                      label="마지막 공공데이터 반영"
                      value={formatDateTime(summary.freshness.marketDataFetchedAt)}
                      helper={formatRelative(summary.freshness.marketDataFetchedAt)}
                    />
                    <FreshnessRow
                      label="마지막 온체인 반영"
                      value={formatDateTime(summary.freshness.oracleUpdatedAt)}
                      helper={formatRelative(summary.freshness.oracleUpdatedAt)}
                    />
                    <FreshnessRow
                      label="워커 상태"
                      value={snapshot.health.status === 'healthy' ? '정상' : snapshot.health.status}
                      helper={snapshot.health.watchMode ? 'watch mode 활성' : '수동 실행 기준'}
                    />
                  </div>
                </PanelCard>

                <PanelCard
                  title={detailMode ? 'Oracle Health / Verifiability' : '검증 정보'}
                  description="보고서 해시와 온체인 식별값을 통해 결과를 다시 확인할 수 있습니다."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricChip label="bundleHash" value={formatAddress(summary.bundleHash, 10, 8)} helper="보고서 해시" />
                    <MetricChip label="propertyId" value={formatAddress(summary.propertyId, 10, 8)} helper="주소 기반 유도값" />
                  </div>

                  <div className="mt-4 rounded-[20px] border border-white/10 bg-slate-950/55 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        {detailMode ? 'On-chain risk signals (getRiskSignalSummary)' : '온체인 신호 직접 확인'}
                      </p>
                      {onchainSignals && onchainSignals[6] > BigInt(0) ? (
                        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                          체인에서 직접 읽음
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400">
                          {propertyIdReady ? '체인 조회 중' : '조회 대기'}
                        </span>
                      )}
                    </div>

                    {onchainSignals && onchainSignals[6] > BigInt(0) ? (
                      <>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <OnchainSignalRow label="선순위채권 위험" active={onchainSignals[0]} />
                          <OnchainSignalRow label="경매 위험 신호" active={onchainSignals[1]} />
                          <OnchainSignalRow label="최근 권리변동" active={onchainSignals[2]} />
                          <OnchainSignalRow label="반환 재원 스트레스" active={onchainSignals[4]} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <MetricChip
                            label="전세가율 (BPS)"
                            value={`${Number(onchainSignals[3])} bps · ${(Number(onchainSignals[3]) / 100).toFixed(1)}%`}
                            helper="보증금 ÷ 공시가격"
                          />
                          <MetricChip
                            label="최종 기록 시각"
                            value={formatDateTimeFromUnix(onchainSignals[6])}
                            helper="updateRiskSignals 기준"
                          />
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        {propertyIdReady
                          ? 'oracle-fetcher가 updateRiskSignals()를 실행하면 이곳에 온체인 신호가 표시됩니다.'
                          : '스냅샷이 로드되면 propertyId로 체인에서 신호를 직접 조회합니다.'}
                      </p>
                    )}
                  </div>
                </PanelCard>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <PanelCard
                title={detailMode ? 'Risk Score Trend' : '리스크 변화 추이'}
                description={
                  history.length > 1
                    ? '최근 리포트 기준 score 변화를 보여줍니다.'
                    : '최근 변동이 크지 않으면 평평한 추이로 표시됩니다.'
                }
              >
                <RiskTrendChart history={history} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {(history.at(-1)?.eventTags ?? ['최근 변동 없음']).map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                      {tag}
                    </span>
                  ))}
                </div>
              </PanelCard>

              <PanelCard
                title={detailMode ? 'Oracle Update Timeline' : '오라클 반영 내역'}
                description="activity log와 분리된 데이터 반영 타임라인입니다."
              >
                <div className="space-y-3">
                  {summary.timeline.map((item) => (
                    <div key={`${item.kind}-${item.timestamp}`} className="rounded-[20px] border border-white/10 bg-slate-950/40 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${toneDot(item.tone)}`} />
                          <p className="text-sm font-medium text-white">{item.title}</p>
                        </div>
                        <span className="text-xs text-slate-500">{formatDateTime(item.timestamp)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                      {item.txHash ? (
                        <a
                          href={explorerLink('tx', item.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-xs text-cyan-200 underline-offset-4 hover:underline"
                        >
                          트랜잭션 보기
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </PanelCard>
            </div>
          </>
        ) : null}
      </section>

      {drawerOpen && snapshot ? (
        <DetailDrawer snapshot={snapshot} onClose={() => setDrawerOpen(false)} />
      ) : null}
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-44 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-6 rounded-[24px] border border-rose-400/20 bg-rose-400/10 p-5">
      <p className="text-sm font-semibold text-white">오라클 스냅샷을 불러오지 못했어요</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
      >
        다시 시도
      </button>
    </div>
  );
}

function PanelCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MetricChip({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="min-w-0 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-base font-semibold text-white [overflow-wrap:anywhere]">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{helper}</p>
    </div>
  );
}

function SourceBadge({ label, accent, muted }: { label: string; accent?: boolean; muted?: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-2 text-xs ${
        accent
          ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
          : muted
            ? 'border-white/10 bg-white/[0.03] text-slate-500'
            : 'border-white/10 bg-white/[0.03] text-slate-200'
      }`}
    >
      {label}
    </span>
  );
}

function FreshnessRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-xs text-slate-500">{helper}</p>
      </div>
      <span className="text-sm text-slate-200">{value}</span>
    </div>
  );
}

function RiskSignalCard({
  signal,
}: {
  signal: DerivedRiskSignal;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">{signal.label}</p>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${signalBadgeClass(signal.tone)}`}>
          {signal.statusLabel}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{signal.description}</p>
    </div>
  );
}

function RiskTrendChart({
  history,
}: {
  history: OracleSnapshot['history'];
}) {
  const points = history.map((point, index) => ({
    ...point,
    x: history.length === 1 ? 160 : 20 + (index / Math.max(history.length - 1, 1)) * 300,
    y: 110 - Math.min(100, point.riskScore),
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
      <svg viewBox="0 0 340 130" className="h-36 w-full">
        <path d="M20 110 H320" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
        <path d="M20 20 V110" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
        {points.length > 1 ? (
          <polyline
            fill="none"
            stroke="rgb(34 211 238)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polyline}
          />
        ) : null}
        {points.map((point) => (
          <g key={point.bundleHash}>
            <circle cx={point.x} cy={point.y} r="4.5" fill="rgb(34 211 238)" />
            <text x={point.x} y={124} textAnchor="middle" fontSize="10" fill="rgba(226,232,240,0.7)">
              {formatMiniDate(point.fetchedAt)}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>이전</span>
        <span>{history.length > 1 ? '최근 변화 추이' : '최근 변동 없음'}</span>
        <span>현재</span>
      </div>
    </div>
  );
}

function DetailDrawer({
  snapshot,
  onClose,
}: {
  snapshot: OracleSnapshot;
  onClose: () => void;
}) {
  const summary = snapshot.latest;

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/72 backdrop-blur-sm">
      <button type="button" aria-label="닫기" className="flex-1 cursor-default" onClick={onClose} />
      <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-[#08111f] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Oracle Detail Drawer</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">검증용 상세 정보</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              일반 화면에서는 쉬운 설명을 보여주고, 이 영역에서는 propertyId, bundleHash, tx, raw report를 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/oracle/latest?view=raw"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
            >
              보고서 보기
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <MetricChip label="propertyId" value={summary.propertyId} helper="주소 기반 keccak 파생값" />
          <MetricChip label="bundleHash" value={summary.bundleHash} helper="보고서 전체를 고정하는 해시" />
          <MetricChip label="updatePropertyData tx" value={formatAddress(summary.onchain?.updatePropertyDataTx ?? undefined, 10, 8)} helper="부동산 데이터 갱신 tx" />
          <MetricChip label="updateRiskScore tx" value={formatAddress(summary.onchain?.updateRiskScoreTx ?? undefined, 10, 8)} helper="리스크 점수 기록 tx" />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {summary.onchain?.updatePropertyDataTx ? (
            <a
              href={explorerLink('tx', summary.onchain.updatePropertyDataTx)}
              target="_blank"
              rel="noreferrer"
              className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-cyan-200 transition hover:border-cyan-300/30"
            >
              updatePropertyData 트랜잭션 보기
            </a>
          ) : null}
          {summary.onchain?.updateRiskScoreTx ? (
            <a
              href={explorerLink('tx', summary.onchain.updateRiskScoreTx)}
              target="_blank"
              rel="noreferrer"
              className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-cyan-200 transition hover:border-cyan-300/30"
            >
              updateRiskScore 트랜잭션 보기
            </a>
          ) : null}
        </div>

        <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
          <p className="text-base font-semibold text-white">보고서 JSON 미리보기</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            화면에는 요약만 보여주고, raw report는 아래에서 바로 확인할 수 있습니다.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-[20px] border border-white/10 bg-[#020817] p-4 text-xs leading-6 text-slate-200">
            {JSON.stringify(snapshot.rawReport ?? summary, null, 2)}
          </pre>
        </div>
      </aside>
    </div>
  );
}

function badgeClass(score: number) {
  if (score >= 70) return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  if (score >= 40) return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
}

function toneDot(tone: 'info' | 'success' | 'warning') {
  if (tone === 'warning') return 'bg-amber-300';
  if (tone === 'success') return 'bg-emerald-300';
  return 'bg-cyan-300';
}

function riskLabel(score: number) {
  if (score >= 70) return '위험';
  if (score >= 40) return '주의';
  return '안전';
}

type RiskSignalTone = 'safe' | 'monitor' | 'warning';

type DerivedRiskSignal = {
  label: string;
  statusLabel: string;
  description: string;
  tone: RiskSignalTone;
};

function signalBadgeClass(tone: RiskSignalTone) {
  if (tone === 'warning') return 'border-rose-500/30 bg-rose-500/10 text-rose-100';
  if (tone === 'monitor') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
}

function buildRiskSignals(summary: OracleSnapshot['latest']): DerivedRiskSignal[] {
  const { metrics } = summary;
  const seniorDebtUnverified = summary.attestation.seniorDebtSource === 'DEFAULT_ZERO';
  const salePrice = metrics.avgSalePrice || 0;
  const depositRatio = salePrice > 0 ? metrics.avgRentDeposit / salePrice : 0;
  const repaymentGap = Math.max(metrics.avgRentDeposit + metrics.seniorDebtKRW - salePrice, 0);

  return [
    seniorDebtUnverified
      ? {
          label: '선순위채권 / 근저당',
          statusLabel: '미확인',
          description: '등기 기반 선순위채권 데이터가 아직 입력되지 않아 LTV를 확정적으로 판단할 수 없는 상태입니다.',
          tone: 'monitor',
        }
      : metrics.seniorDebtKRW > 0
      ? {
          label: '선순위채권 / 근저당',
          statusLabel: '주의',
          description: `선순위채권이 ${formatCurrency(metrics.seniorDebtKRW)} 잡혀 있어 보증금보다 먼저 나가는 권리가 존재합니다.`,
          tone: 'monitor',
        }
      : {
          label: '선순위채권 / 근저당',
          statusLabel: '안전',
          description: '현재 반영된 데이터 기준으로 선순위채권이나 큰 근저당 신호는 보이지 않습니다.',
          tone: 'safe',
        },
    metrics.auctionStarted
      ? {
          label: '압류 · 경매 강한 플래그',
          statusLabel: '위험',
          description: '경매 또는 강한 법적 절차 신호가 감지돼 즉시 재확인이 필요한 상태입니다.',
          tone: 'warning',
        }
      : {
          label: '압류 · 경매 강한 플래그',
          statusLabel: '안전',
          description: '현재 반영된 데이터에서는 강한 경매·압류 신호가 확인되지 않았습니다.',
          tone: 'safe',
        },
    metrics.newMortgageSet
      ? {
          label: '최근 권리변동',
          statusLabel: '주의',
          description: '최근 근저당 또는 권리관계 변화 신호가 있어 등기부 재확인이 권장됩니다.',
          tone: 'monitor',
        }
      : {
          label: '최근 권리변동',
          statusLabel: '안전',
          description: '최근 권리관계가 급하게 변한 흔적은 크지 않아 보입니다.',
          tone: 'safe',
        },
    depositRatio >= 0.8
      ? {
          label: '보증금 대비 매매가 비율',
          statusLabel: '위험',
          description: `전세보증금이 매매가의 약 ${Math.round(depositRatio * 100)}% 수준이라 반환 여력이 빠듯할 수 있습니다.`,
          tone: 'warning',
        }
      : depositRatio >= 0.6
        ? {
            label: '보증금 대비 매매가 비율',
            statusLabel: '주의',
            description: `전세보증금이 매매가의 약 ${Math.round(depositRatio * 100)}% 수준으로, 추가 확인이 필요한 구간입니다.`,
            tone: 'monitor',
          }
        : {
            label: '보증금 대비 매매가 비율',
            statusLabel: '안전',
            description: `전세보증금이 매매가의 약 ${Math.round(depositRatio * 100)}% 수준으로 상대적으로 완만한 편입니다.`,
            tone: 'safe',
          },
    repaymentGap > 0
      ? {
          label: '반환 재원 여력',
          statusLabel: '위험',
          description: `매매가 대비 선순위채권과 보증금을 합치면 약 ${formatCurrency(repaymentGap)} 정도 부족 신호가 보입니다.`,
          tone: 'warning',
        }
      : {
          label: '반환 재원 여력',
          statusLabel: '안전',
          description: '현재 평균 매매가 대비 선순위채권과 보증금을 감안해도 반환 재원 여력은 남아 있는 편입니다.',
          tone: 'safe',
        },
  ];
}

function easyRiskSummary(score: number, signals: DerivedRiskSignal[]) {
  const warningCount = signals.filter((signal) => signal.tone === 'warning').length;
  const monitorCount = signals.filter((signal) => signal.tone === 'monitor').length;
  const hasUnverifiedDebtSignal = signals.some(
    (signal) => signal.label === '선순위채권 / 근저당' && signal.statusLabel === '미확인',
  );

  if (score >= 70 || warningCount >= 2) {
    return {
      label: '재확인 권장',
      tone: 'warning' as const,
      summary:
        '강한 위험 신호가 함께 보여 계약을 바로 진행하기보다 등기·채권·반환 재원을 먼저 다시 확인하는 편이 안전합니다.',
      helper: '특히 경매·압류 플래그, 과도한 전세가율, 반환 재원 부족 신호는 우선적으로 점검해야 합니다.',
    };
  }

  if (score >= 40 || monitorCount >= 2) {
    return {
      label: '추가 확인 필요',
      tone: 'monitor' as const,
      summary:
        '지금은 바로 위험하다고 단정하긴 어렵지만, 몇 가지 주의 신호가 겹쳐 보여 계약 전 추가 확인이 필요한 상태입니다.',
      helper: '권리변동, 선순위채권, 전세가율처럼 누적되면 위험해지는 신호를 중심으로 다시 보면 좋습니다.',
    };
  }

  if (hasUnverifiedDebtSignal) {
    return {
      label: '담보 정보 재확인',
      tone: 'monitor' as const,
      summary:
        '현재 점수는 낮더라도 선순위채권 데이터가 아직 비어 있어 LTV를 확정적으로 안전하다고 보긴 어렵습니다.',
      helper: '이 경우 0%는 실제 담보가 없다는 뜻이 아니라, 담보 정보가 아직 입력되지 않았다는 뜻에 가깝습니다.',
    };
  }

  return {
    label: '현재는 안정 구간',
    tone: 'safe' as const,
    summary:
      '현재 공개 데이터 기준으로 큰 위험 신호는 많지 않습니다. 다만 실제 계약 전에는 최신 등기와 특약 조건까지 함께 보는 것이 좋습니다.',
    helper: '안전 표시는 위험 신호가 적다는 뜻이지, 법률 검토를 완전히 대신한다는 의미는 아닙니다.',
  };
}

function normalizeRiskLog(summary: OracleSnapshot['latest']) {
  if (summary.attestation.seniorDebtSource !== 'DEFAULT_ZERO') {
    return summary.risk.log;
  }

  return summary.risk.log.map((line) =>
    line.startsWith('LTV ')
      ? 'LTV 미확인 (선순위채권 데이터 없음)'
      : line,
  );
}

function formatPercent(value?: number | null) {
  if (value == null) return '데이터 없음';
  return `${value.toFixed(3)}%`;
}

function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '기록 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMiniDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value));
}

function formatRelative(value?: string | null) {
  if (!value) return '기록 없음';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin <= 1) return '방금 반영';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.round(diffHour / 24)}일 전`;
}

function OnchainSignalRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-[16px] border px-3 py-2.5 ${
      active ? 'border-rose-500/25 bg-rose-500/8' : 'border-white/10 bg-white/[0.03]'
    }`}>
      <span className="text-xs text-slate-200">{label}</span>
      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        active
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
          : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200'
      }`}>
        {active ? '감지됨' : '없음'}
      </span>
    </div>
  );
}
