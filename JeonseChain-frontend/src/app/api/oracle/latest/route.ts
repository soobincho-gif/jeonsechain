import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ORACLE_FALLBACK_SNAPSHOT } from '@/lib/oracle-fallback';
import type { OracleReport, OracleSnapshot } from '@/lib/oracle';
import { riskLabelFromScore } from '@/lib/oracle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_REMOTE_STATUS_URL =
  'https://raw.githubusercontent.com/soobincho-gif/jeonsechain/main/oracle-live/latest.json';
const LEGACY_UNVERIFIED_DEBT_LOG = 'LTV 미확인 (선순위채권 데이터 없음) +40';
const NORMALIZED_UNVERIFIED_DEBT_LOG =
  'LTV 미확인 (선순위채권 데이터 없음, 위험 가점 없음) +0';

function firstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function readJsonFile<T>(filePath: string | null): T | null {
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function getStatusFilePath() {
  return firstExistingPath([
    path.resolve(process.cwd(), '../JeonseChain/data/oracle-status/latest.json'),
    path.resolve(process.cwd(), 'JeonseChain/data/oracle-status/latest.json'),
    path.resolve(process.cwd(), 'data/oracle-status/latest.json'),
  ]);
}

function getReportDirectory() {
  return firstExistingPath([
    path.resolve(process.cwd(), '../JeonseChain/data/oracle-reports'),
    path.resolve(process.cwd(), 'JeonseChain/data/oracle-reports'),
    path.resolve(process.cwd(), 'data/oracle-reports'),
  ]);
}

function hasLegacyMissingDebtPenalty(input: {
  attestation?: { seniorDebtSource?: string } | null;
  metrics?: {
    seniorDebtKRW?: number;
    auctionStarted?: boolean;
    newMortgageSet?: boolean;
  } | null;
  risk?: { score?: number; log?: string[] } | null;
}) {
  return (
    input.attestation?.seniorDebtSource === 'DEFAULT_ZERO' &&
    input.metrics?.seniorDebtKRW === 0 &&
    input.metrics?.auctionStarted === false &&
    input.metrics?.newMortgageSet === false &&
    input.risk?.score === 40 &&
    Array.isArray(input.risk?.log) &&
    input.risk.log.some((line) => line.includes('LTV 미확인 (선순위채권 데이터 없음)'))
  );
}

function normalizeRiskLog(log: string[]) {
  return log.map((line) =>
    line === LEGACY_UNVERIFIED_DEBT_LOG ? NORMALIZED_UNVERIFIED_DEBT_LOG : line,
  );
}

function normalizeReport(report: OracleReport | null) {
  if (!report || !hasLegacyMissingDebtPenalty(report)) return report;

  return {
    ...report,
    risk: {
      ...report.risk,
      score: 0,
      log: normalizeRiskLog(report.risk.log),
    },
  } satisfies OracleReport;
}

function normalizeSnapshot(snapshot: OracleSnapshot | null) {
  if (!snapshot || !hasLegacyMissingDebtPenalty(snapshot.latest)) return snapshot;

  const latest = {
    ...snapshot.latest,
    risk: {
      ...snapshot.latest.risk,
      score: 0,
      log: normalizeRiskLog(snapshot.latest.risk.log),
    },
  };

  const history = snapshot.history.map((entry) =>
    entry.fetchedAt === snapshot.latest.fetchedAt && entry.riskScore === 40
      ? {
          ...entry,
          riskScore: 0,
          label: riskLabelFromScore(0),
        }
      : entry,
  );

  return {
    ...snapshot,
    latest,
    history,
  } satisfies OracleSnapshot;
}

function loadRecentHistory(reportDir: string | null) {
  if (!reportDir) return [];

  try {
    const files = fs
      .readdirSync(reportDir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .slice(-7);

    return files
      .map((file) => normalizeReport(readJsonFile<OracleReport>(path.join(reportDir, file))))
      .filter((report): report is OracleReport => Boolean(report))
      .map((report) => ({
        fetchedAt: report.fetchedAt,
        riskScore: report.risk.score,
        label: riskLabelFromScore(report.risk.score),
        eventTags: [
          report.metrics.auctionStarted ? '경매' : null,
          report.metrics.newMortgageSet ? '근저당' : null,
          report.attestation.seniorDebtSource === 'MANUAL_OVERRIDE' ? '수동 검토' : null,
          report.benchmark ? '금리 반영' : null,
        ].filter((item): item is string => Boolean(item)),
        baseRatePct: report.benchmark?.baseRate?.valuePct ?? null,
        treasury3yPct: report.benchmark?.treasury3y?.valuePct ?? null,
        bundleHash: report.bundleHash,
        source: report.source,
      }));
  } catch {
    return [];
  }
}

function loadRawReport(snapshot: OracleSnapshot, reportDir: string | null) {
  const explicitPath = snapshot.latest.reportPath;
  const byExplicitPath = normalizeReport(readJsonFile<OracleReport>(explicitPath));
  if (byExplicitPath) return byExplicitPath;

  if (!reportDir || !snapshot.latest.reportFileName) return null;
  return normalizeReport(readJsonFile<OracleReport>(path.join(reportDir, snapshot.latest.reportFileName)));
}

async function fetchRemoteSnapshot() {
  const remoteUrl = process.env.ORACLE_STATUS_REMOTE_URL || DEFAULT_REMOTE_STATUS_URL;

  try {
    const response = await fetch(remoteUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    return normalizeSnapshot((await response.json()) as OracleSnapshot);
  } catch {
    return null;
  }
}

async function buildResponsePayload() {
  const statusPath = getStatusFilePath();
  const reportDir = getReportDirectory();
  const liveSnapshot = normalizeSnapshot(readJsonFile<OracleSnapshot>(statusPath));
  const preferRemoteFirst = Boolean(process.env.VERCEL);

  if (preferRemoteFirst) {
    const remoteSnapshot = await fetchRemoteSnapshot();
    if (remoteSnapshot) {
      return {
        ...remoteSnapshot,
        fallback: false,
      } satisfies OracleSnapshot;
    }
  }

  if (!liveSnapshot) {
    const remoteSnapshot = await fetchRemoteSnapshot();
    if (remoteSnapshot) {
      return {
        ...remoteSnapshot,
        fallback: false,
      } satisfies OracleSnapshot;
    }

    return ORACLE_FALLBACK_SNAPSHOT;
  }

  const history = loadRecentHistory(reportDir);
  const rawReport = loadRawReport(liveSnapshot, reportDir);

  return {
    ...liveSnapshot,
    history: history.length ? history : liveSnapshot.history,
    rawReport: rawReport ?? liveSnapshot.rawReport ?? null,
    fallback: false,
  } satisfies OracleSnapshot;
}

export async function GET(request: NextRequest) {
  const payload = await buildResponsePayload();
  const view = request.nextUrl.searchParams.get('view');

  if (view === 'raw') {
    const rawReport = payload.rawReport ?? payload.latest;
    return new NextResponse(`${JSON.stringify(rawReport, null, 2)}\n`, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `inline; filename="${payload.latest.reportFileName ?? 'oracle-report.json'}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
