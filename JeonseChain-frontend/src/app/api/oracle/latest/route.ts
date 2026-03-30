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

function loadRecentHistory(reportDir: string | null) {
  if (!reportDir) return [];

  try {
    const files = fs
      .readdirSync(reportDir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .slice(-7);

    return files
      .map((file) => readJsonFile<OracleReport>(path.join(reportDir, file)))
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
  const byExplicitPath = readJsonFile<OracleReport>(explicitPath);
  if (byExplicitPath) return byExplicitPath;

  if (!reportDir || !snapshot.latest.reportFileName) return null;
  return readJsonFile<OracleReport>(path.join(reportDir, snapshot.latest.reportFileName));
}

async function fetchRemoteSnapshot() {
  const remoteUrl = process.env.ORACLE_STATUS_REMOTE_URL || DEFAULT_REMOTE_STATUS_URL;

  try {
    const response = await fetch(remoteUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as OracleSnapshot;
  } catch {
    return null;
  }
}

async function buildResponsePayload() {
  const statusPath = getStatusFilePath();
  const reportDir = getReportDirectory();
  const liveSnapshot = readJsonFile<OracleSnapshot>(statusPath);

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
