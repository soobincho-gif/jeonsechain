#!/usr/bin/env node
/**
 * JeonseChain Oracle Fetcher
 * 공공데이터 기반 부동산 위험 점수 계산 → 온체인 오라클 업데이트
 *
 * 아키텍처:
 *   [공공데이터포털 API / 수동 attestation] → [위험 점수 계산]
 *   → [report manifest + bundleHash 생성] → [JeonseOracle.updatePropertyData()]
 *   → [JeonseOracle.updateRiskScore()]
 *
 * 이번 구현 범위:
 *   - 주소만으로 propertyId 유도 가능
 *   - 최근 N개월 실거래가/전월세 데이터 집계
 *   - 수동 신호(선순위 채권, 경매, 신규 근저당) 병합
 *   - 여러 부동산 batch 처리
 *   - 주기 실행(watch mode)
 *   - 보고서 JSON + bundle hash 생성
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BEOPJEONG_CODE = '11440';
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_REPORT_DIR = path.join(__dirname, '../data/oracle-reports');
const DEFAULT_STATUS_DIR = path.join(__dirname, '../data/oracle-status');
const DEFAULT_GITHUB_OWNER = 'soobincho-gif';
const DEFAULT_GITHUB_REPO = 'jeonsechain';
const DEFAULT_GITHUB_BRANCH = 'main';
const DEFAULT_GITHUB_SNAPSHOT_PATH = 'oracle-live/latest.json';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    propertyId: null,
    address: null,
    beopjeongCode: DEFAULT_BEOPJEONG_CODE,
    month: null,
    monthsBack: 2,
    seniorDebtKRW: null,
    auctionStarted: false,
    newMortgageSet: false,
    useMock: false,
    dryRun: false,
    watch: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    configPath: null,
    saveReport: false,
    reportDir: DEFAULT_REPORT_DIR,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--property-id':
        opts.propertyId = args[++i];
        break;
      case '--address':
        opts.address = args[++i];
        break;
      case '--beopjeong-code':
        opts.beopjeongCode = args[++i];
        break;
      case '--month':
        opts.month = args[++i];
        break;
      case '--months-back':
        opts.monthsBack = Number.parseInt(args[++i], 10);
        break;
      case '--senior-debt-krw':
        opts.seniorDebtKRW = parseKrwValue(args[++i]);
        break;
      case '--auction-started':
        opts.auctionStarted = true;
        break;
      case '--new-mortgage-set':
        opts.newMortgageSet = true;
        break;
      case '--mock':
        opts.useMock = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--watch':
        opts.watch = true;
        break;
      case '--interval-ms':
        opts.intervalMs = Number.parseInt(args[++i], 10);
        break;
      case '--config':
        opts.configPath = args[++i];
        break;
      case '--save-report':
        opts.saveReport = true;
        break;
      case '--report-dir':
        opts.reportDir = args[++i];
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  if (!opts.month) {
    const d = new Date();
    opts.month = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  if (!Number.isInteger(opts.monthsBack) || opts.monthsBack < 0) {
    opts.monthsBack = 2;
  }
  if (!Number.isInteger(opts.intervalMs) || opts.intervalMs <= 0) {
    opts.intervalMs = DEFAULT_INTERVAL_MS;
  }

  return opts;
}

export function normalizeAddressText(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function derivePropertyIdFromAddress(address) {
  const normalized = normalizeAddressText(address);
  if (!normalized) {
    throw new Error('address required to derive propertyId');
  }
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

export function parseKrwValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Math.trunc(value);
  const normalized = String(value).replace(/[,_\s]/g, '');
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shiftMonth(yyyymm, offsetMonths) {
  const year = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  const date = new Date(Date.UTC(year, month - 1 + offsetMonths, 1));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildMonthSequence(baseMonth, monthsBack = 0) {
  return Array.from({ length: monthsBack + 1 }, (_, index) =>
    shiftMonth(baseMonth, -index)
  );
}

function summarizeAverage(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildMonthDateRange(yyyymm) {
  const year = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  const toDayString = (date) =>
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;

  return {
    startTime: toDayString(startDate),
    endTime: toDayString(endDate),
  };
}

function parseXmlItems(xml, numericTags) {
  const tagList = Array.isArray(numericTags) ? numericTags : [numericTags];
  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag) =>
      (match[1].match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1]?.trim();
    const rawNumeric = (
      tagList.map((tag) => get(tag)).find((value) => value && value.trim()) || '0'
    ).replace(/,/g, '');
    const numericValue = Number.parseInt(rawNumeric, 10);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      items.push(numericValue * 10000);
    }
  }
  return items;
}

async function fetchMolitXml(endpoint, beopjeongCode, month, apiKey) {
  const url = new URL(`https://apis.data.go.kr/1613000/${endpoint}/get${endpoint}`);
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('LAWD_CD', beopjeongCode);
  url.searchParams.set('DEAL_YMD', month);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '100');

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'JeonseChainOracle/1.0 (+https://jeonsechain.vercel.app)',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();
  if (xml.includes('Request Blocked')) {
    throw new Error('request blocked by upstream gateway');
  }

  const resultCode = (xml.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1]?.trim();
  if (resultCode && resultCode !== '000') {
    const resultMsg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1]?.trim() || 'unknown';
    throw new Error(`API ${resultCode}: ${resultMsg}`);
  }

  return xml;
}

async function fetchRentData(beopjeongCode, month, apiKey) {
  console.log(`  📡 전월세 API: 법정동 ${beopjeongCode}, 기준월 ${month}`);
  const xml = await fetchMolitXml('RTMSDataSvcAptRent', beopjeongCode, month, apiKey);
  const deposits = parseXmlItems(xml, ['deposit', '보증금액']);
  return deposits.map((deposit) => ({ deposit, month }));
}

async function fetchSaleData(beopjeongCode, month, apiKey) {
  console.log(`  📡 매매가 API: 법정동 ${beopjeongCode}, 기준월 ${month}`);
  const xml = await fetchMolitXml('RTMSDataSvcAptTrade', beopjeongCode, month, apiKey);
  const prices = parseXmlItems(xml, ['dealAmount', '거래금액']);
  return prices.map((price) => ({ price, month }));
}

export function pickLatestEcosPoint(rows, itemCode1) {
  const filtered = (rows || [])
    .filter((row) => !itemCode1 || row.ITEM_CODE1 === itemCode1)
    .filter((row) => Number.isFinite(Number.parseFloat(row.DATA_VALUE)))
    .sort((a, b) => String(a.TIME).localeCompare(String(b.TIME)));

  const latest = filtered.at(-1);
  if (!latest) return null;

  return {
    statCode: latest.STAT_CODE,
    statName: latest.STAT_NAME,
    itemCode1: latest.ITEM_CODE1,
    itemName1: latest.ITEM_NAME1,
    time: latest.TIME,
    valuePct: Number.parseFloat(latest.DATA_VALUE),
    unitName: latest.UNIT_NAME ?? '연%',
  };
}

async function fetchEcosSeries({
  apiKey,
  statCode,
  cycle,
  startTime,
  endTime,
  itemCode1,
  label,
}) {
  const url = new URL(
    `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/100/${statCode}/${cycle}/${startTime}/${endTime}/${itemCode1}`
  );

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'JeonseChainOracle/1.0 (+https://jeonsechain.vercel.app)',
    },
  });
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}`);
  }

  const payload = await response.json();
  const stats = payload?.StatisticSearch;
  if (!stats) {
    throw new Error(`${label} 응답 형식 오류`);
  }

  const errorCode = payload?.RESULT?.CODE;
  if (errorCode && errorCode !== 'INFO-000') {
    const message = payload?.RESULT?.MESSAGE ?? 'unknown';
    throw new Error(`${label} ${errorCode}: ${message}`);
  }

  return pickLatestEcosPoint(stats.row ?? [], itemCode1);
}

async function collectBenchmarkData(job) {
  const apiKey = process.env.BOK_ECOS_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const monthlyStart = shiftMonth(job.month, -2);
    const { startTime, endTime } = buildMonthDateRange(job.month);

    const [baseRate, treasury3y] = await Promise.all([
      fetchEcosSeries({
        apiKey,
        statCode: '722Y001',
        cycle: 'M',
        startTime: monthlyStart,
        endTime: job.month,
        itemCode1: '0101000',
        label: '한국은행 기준금리',
      }),
      fetchEcosSeries({
        apiKey,
        statCode: '817Y002',
        cycle: 'D',
        startTime,
        endTime,
        itemCode1: '010200000',
        label: '국고채(3년)',
      }),
    ]);

    if (!baseRate && !treasury3y) {
      return null;
    }

    return {
      source: 'BOK_ECOS',
      baseRate,
      treasury3y,
      protectedYieldReferencePct: treasury3y?.valuePct ?? baseRate?.valuePct ?? null,
    };
  } catch (error) {
    console.warn(`  ⚠ ECOS benchmark 실패: ${error.message} → benchmark 생략`);
    return null;
  }
}

function generateMockData(job) {
  console.log('  🎲 모의 데이터 (DATA_GO_KR_API_KEY 없음 또는 --mock 플래그)');
  const seedSource = job.address || job.propertyId || job.beopjeongCode || 'jeonsechain';
  const seed = [...seedSource].reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;

  return {
    officialPriceKRW: 300000000 + seed * 1000000,
    seniorDebtKRW: job.seniorDebtKRW ?? 50000000 + seed * 200000,
    seniorDebtVerified: job.seniorDebtKRW != null,
    auctionStarted: Boolean(job.auctionStarted || seed > 92),
    newMortgageSet: Boolean(job.newMortgageSet || seed > 83),
    avgRentDeposit: 250000000 + seed * 800000,
    avgSalePrice: 400000000 + seed * 1500000,
    rentSamples: 10 + Math.floor(seed / 10),
    saleSamples: 8 + Math.floor(seed / 12),
    months: buildMonthSequence(job.month, job.monthsBack),
    source: 'MOCK_DATA',
    benchmark: null,
  };
}

async function collectData(job) {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey || job.useMock) {
    return generateMockData(job);
  }

  const months = buildMonthSequence(job.month, job.monthsBack);
  try {
    const rentSeries = [];
    const saleSeries = [];

    for (const month of months) {
      const [rentItems, saleItems] = await Promise.all([
        fetchRentData(job.beopjeongCode, month, apiKey),
        fetchSaleData(job.beopjeongCode, month, apiKey),
      ]);
      rentSeries.push(...rentItems);
      saleSeries.push(...saleItems);
    }

    const rentDeposits = rentSeries.map((item) => item.deposit);
    const salePrices = saleSeries.map((item) => item.price);
    const avgRentDeposit = summarizeAverage(rentDeposits);
    const avgSalePrice = summarizeAverage(salePrices);
    const officialPriceKRW = Math.round(avgSalePrice * 0.7);

    console.log(`  ✓ 최근 ${months.length}개월 전월세 ${rentDeposits.length}건, 매매 ${salePrices.length}건 수집`);

    return {
      officialPriceKRW,
      seniorDebtKRW: job.seniorDebtKRW ?? 0,
      seniorDebtVerified: job.seniorDebtKRW != null,
      auctionStarted: Boolean(job.auctionStarted),
      newMortgageSet: Boolean(job.newMortgageSet),
      avgRentDeposit,
      avgSalePrice,
      rentSamples: rentDeposits.length,
      saleSamples: salePrices.length,
      months,
      source: 'DATA_GO_KR',
      benchmark: await collectBenchmarkData(job),
    };
  } catch (error) {
    console.warn(`  ⚠ API 실패: ${error.message} → mock으로 폴백`);
    return generateMockData(job);
  }
}

export function calculateRiskScore(data) {
  let score = 0;
  const log = [];

  if (data.officialPriceKRW > 0) {
    if (data.seniorDebtVerified === false) {
      log.push('LTV 미확인 (선순위채권 데이터 없음, 위험 가점 없음) +0');
    } else {
      const ltvPct = (data.seniorDebtKRW / data.officialPriceKRW) * 100;
      if (ltvPct >= 80) {
        score += 40;
        log.push(`LTV ${ltvPct.toFixed(1)}% (위험) +40`);
      } else if (ltvPct >= 60) {
        const points = Math.round(((ltvPct - 60) / 20) * 30);
        score += points;
        log.push(`LTV ${ltvPct.toFixed(1)}% (주의) +${points}`);
      } else {
        log.push(`LTV ${ltvPct.toFixed(1)}% (안전) +0`);
      }
    }
  }

  if (data.auctionStarted) {
    score += 30;
    log.push('경매 개시 +30');
  }

  if (data.newMortgageSet) {
    score += 20;
    log.push('신규 근저당 +20');
  }

  if (data.avgSalePrice > 0 && data.avgRentDeposit > 0) {
    const ratio = (data.avgRentDeposit / data.avgSalePrice) * 100;
    if (ratio >= 80) {
      score += 10;
      log.push(`전세가율 ${ratio.toFixed(1)}% (역전세 위험) +10`);
    } else if (ratio >= 70) {
      score += 5;
      log.push(`전세가율 ${ratio.toFixed(1)}% (주의) +5`);
    } else {
      log.push(`전세가율 ${ratio.toFixed(1)}% (안전) +0`);
    }
  }

  if ((data.rentSamples ?? 0) + (data.saleSamples ?? 0) < 4) {
    log.push('표본 부족: 참고용 결과');
  }

  return { score: Math.min(score, 100), log };
}

export function deriveRiskSignals(data) {
  const depositToPriceRatioBps =
    data.avgSalePrice > 0 && data.avgRentDeposit > 0
      ? Math.round((data.avgRentDeposit * 10000) / data.avgSalePrice)
      : 0;
  const repaymentGapKRW = Math.max(
    (data.seniorDebtKRW ?? 0) + (data.avgRentDeposit ?? 0) - (data.avgSalePrice ?? 0),
    0
  );

  return {
    seniorDebtRisk: (data.seniorDebtKRW ?? 0) > 0,
    auctionRisk: Boolean(data.auctionStarted),
    recentRightsChange: Boolean(data.newMortgageSet),
    depositToPriceRatioBps,
    repaymentStress: repaymentGapKRW > 0,
    repaymentGapKRW,
  };
}

function deepSort(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepSort(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = deepSort(value[key]);
        return accumulator;
      }, {});
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(deepSort(value));
}

export function computeBundleHash(bundle) {
  return ethers.keccak256(ethers.toUtf8Bytes(stableStringify(bundle)));
}

function formatEok(amount) {
  return `${(amount / 1e8).toFixed(2)}억 원`;
}

function buildOracleBundle(job, data, riskResult) {
  const fetchedAt = new Date().toISOString();
  const signals = deriveRiskSignals(data);
  const bundle = {
    schemaVersion: 2,
    fetchedAt,
    propertyId: job.propertyId,
    address: job.address ?? null,
    beopjeongCode: job.beopjeongCode,
    months: data.months,
    source: data.source,
    metrics: {
      officialPriceKRW: data.officialPriceKRW,
      seniorDebtKRW: data.seniorDebtKRW,
      avgRentDeposit: data.avgRentDeposit,
      avgSalePrice: data.avgSalePrice,
      auctionStarted: data.auctionStarted,
      newMortgageSet: data.newMortgageSet,
      rentSamples: data.rentSamples,
      saleSamples: data.saleSamples,
    },
    risk: {
      score: riskResult.score,
      log: riskResult.log,
    },
    signals,
    benchmark: data.benchmark ?? null,
    attestation: {
      seniorDebtSource: job.seniorDebtKRW != null ? 'MANUAL_OVERRIDE' : 'DEFAULT_ZERO',
      auctionSource: job.auctionStarted ? 'MANUAL_OVERRIDE' : 'API_OR_DEFAULT_FALSE',
      mortgageSource: job.newMortgageSet ? 'MANUAL_OVERRIDE' : 'API_OR_DEFAULT_FALSE',
    },
  };

  return {
    ...bundle,
    bundleHash: computeBundleHash(bundle),
  };
}

function saveOracleReport(bundle, reportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  const safeDate = bundle.fetchedAt.replace(/[:.]/g, '-');
  const fileName = `${safeDate}_${bundle.propertyId.slice(2, 10)}_${bundle.bundleHash.slice(2, 10)}.json`;
  const reportPath = path.resolve(reportDir, fileName);
  fs.writeFileSync(reportPath, `${JSON.stringify(bundle, null, 2)}\n`);
  return reportPath;
}

async function updateOnChain(bundle, opts) {
  const deployPath = path.join(__dirname, '../deployments/sepolia.json');
  if (!fs.existsSync(deployPath)) {
    console.warn('  ⚠ deployments/sepolia.json 없음 → 온체인 스킵');
    return null;
  }

  if (!process.env.PRIVATE_KEY || !process.env.SEPOLIA_RPC_URL) {
    console.warn('  ⚠ PRIVATE_KEY / SEPOLIA_RPC_URL 없음 → 온체인 스킵');
    return null;
  }

  const deployment = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const oracleAbi = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../deployments/JeonseOracle.abi.json'), 'utf8')
  );
  const oracleInterface = new ethers.Interface(oracleAbi);
  const oracle = new ethers.Contract(deployment.contracts.JeonseOracle, oracleAbi, signer);

  console.log(`\n  ⛓ Oracle: ${deployment.contracts.JeonseOracle}`);

  if (opts.dryRun) {
    console.log('  [DRY RUN] 트랜잭션 전송 없음');
    return {
      oracleAddress: deployment.contracts.JeonseOracle,
      updatePropertyDataTx: null,
      updateRiskScoreTx: null,
      updatedAt: null,
    };
  }

  const tx1 = await oracle.updatePropertyData(
    bundle.propertyId,
    ethers.parseEther(String(Math.trunc(bundle.metrics.officialPriceKRW))),
    ethers.parseEther(String(Math.trunc(bundle.metrics.seniorDebtKRW))),
    bundle.metrics.auctionStarted,
    bundle.metrics.newMortgageSet
  );
  await tx1.wait();
  console.log(`  ✓ updatePropertyData tx: ${tx1.hash}`);

  let updateRiskSignalsTx = null;

  if (typeof oracle.updateRiskScore !== 'function') {
    console.warn('  ⚠ updateRiskScore ABI/배포 미활성화 → 기본 부동산 데이터만 업데이트했습니다.');
    return {
      oracleAddress: deployment.contracts.JeonseOracle,
      updatePropertyDataTx: tx1.hash,
      updateRiskScoreTx: null,
      updateRiskSignalsTx: null,
    };
  }

  try {
    const tx2Data = oracleInterface.encodeFunctionData('updateRiskScore', [
      bundle.propertyId,
      BigInt(bundle.risk.score),
      bundle.bundleHash,
    ]);
    const tx2 = await signer.sendTransaction({
      to: deployment.contracts.JeonseOracle,
      data: tx2Data,
      gasLimit: 150000n,
    });
    await tx2.wait();
    console.log(`  ✓ updateRiskScore tx: ${tx2.hash}`);

    if (typeof oracle.updateRiskSignals === 'function') {
      const tx3Data = oracleInterface.encodeFunctionData('updateRiskSignals', [
        bundle.propertyId,
        bundle.signals.seniorDebtRisk,
        bundle.signals.auctionRisk,
        bundle.signals.recentRightsChange,
        BigInt(bundle.signals.depositToPriceRatioBps),
        bundle.signals.repaymentStress,
        ethers.parseEther(String(Math.trunc(bundle.signals.repaymentGapKRW))),
        bundle.bundleHash,
      ]);
      const tx3 = await signer.sendTransaction({
        to: deployment.contracts.JeonseOracle,
        data: tx3Data,
        gasLimit: 180000n,
      });
      await tx3.wait();
      updateRiskSignalsTx = tx3.hash;
      console.log(`  ✓ updateRiskSignals tx: ${tx3.hash}`);
    }

    return {
      oracleAddress: deployment.contracts.JeonseOracle,
      updatePropertyDataTx: tx1.hash,
      updateRiskScoreTx: tx2.hash,
      updateRiskSignalsTx,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`  ⚠ updateRiskScore 실패: ${error.message}`);
    console.warn('  → 현재 Sepolia 오라클이 구버전이거나 ABI가 최신이 아닐 수 있습니다.');
    return {
      oracleAddress: deployment.contracts.JeonseOracle,
      updatePropertyDataTx: tx1.hash,
      updateRiskScoreTx: null,
      updateRiskSignalsTx: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

function buildOracleTimeline(bundle, onchainResult, reportPath) {
  const timeline = [
    {
      kind: 'market-data',
      title: '최근 실거래 집계 완료',
      description: `전월세 ${bundle.metrics.rentSamples}건, 매매 ${bundle.metrics.saleSamples}건을 반영했습니다.`,
      timestamp: bundle.fetchedAt,
      tone: 'success',
    },
    {
      kind: 'benchmark',
      title: '금리 benchmark 반영',
      description:
        bundle.benchmark
          ? `기준금리 ${bundle.benchmark.baseRate?.valuePct ?? '-'}%, 국고채 3Y ${bundle.benchmark.treasury3y?.valuePct ?? '-'}%를 참고했습니다.`
          : '추가 benchmark 없이 기본 집계 데이터만 사용했습니다.',
      timestamp: bundle.fetchedAt,
      tone: bundle.benchmark ? 'success' : 'info',
    },
    {
      kind: 'report',
      title: '오라클 보고서 저장',
      description: reportPath
        ? path.basename(reportPath)
        : '보고서 저장 없이 bundleHash만 계산했습니다.',
      timestamp: new Date().toISOString(),
      tone: 'info',
    },
  ];

  if (onchainResult?.updatePropertyDataTx) {
    timeline.push({
      kind: 'onchain-property',
      title: 'updatePropertyData 반영',
      description: '공시가, 선순위채권, 위험 플래그를 온체인에 기록했습니다.',
      timestamp: onchainResult.updatedAt ?? new Date().toISOString(),
      txHash: onchainResult.updatePropertyDataTx,
      tone: 'success',
    });
  }

  if (onchainResult?.updateRiskScoreTx) {
    timeline.push({
      kind: 'onchain-risk',
      title: 'updateRiskScore 반영',
      description: '리스크 점수와 bundleHash를 온체인에 기록했습니다.',
      timestamp: onchainResult.updatedAt ?? new Date().toISOString(),
      txHash: onchainResult.updateRiskScoreTx,
      tone: 'success',
    });
  }

  if (onchainResult?.updateRiskSignalsTx) {
    timeline.push({
      kind: 'risk-signals',
      title: '구조화된 위험 신호 반영',
      description:
        `선순위채권=${bundle.signals.seniorDebtRisk ? '있음' : '없음'}, ` +
        `권리변동=${bundle.signals.recentRightsChange ? '있음' : '없음'}, ` +
        `전세가율=${(bundle.signals.depositToPriceRatioBps / 100).toFixed(1)}%를 기록했습니다.`,
      timestamp: onchainResult.updatedAt ?? bundle.fetchedAt,
      txHash: onchainResult.updateRiskSignalsTx,
      tone: bundle.signals.repaymentStress || bundle.signals.auctionRisk ? 'warning' : 'success',
    });
  }

  return timeline.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function saveOracleSnapshot(bundle, reportPath, onchainResult, job) {
  fs.mkdirSync(DEFAULT_STATUS_DIR, { recursive: true });
  const latestPath = path.join(DEFAULT_STATUS_DIR, 'latest.json');

  let previous = null;
  if (fs.existsSync(latestPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    } catch {
      previous = null;
    }
  }

  const latestHistoryEntry = {
    fetchedAt: bundle.fetchedAt,
    riskScore: bundle.risk.score,
    label:
      bundle.risk.score >= 70 ? '위험' : bundle.risk.score >= 40 ? '주의' : '안전',
    eventTags: [
      bundle.metrics.auctionStarted ? '경매' : null,
      bundle.metrics.newMortgageSet ? '근저당' : null,
      bundle.attestation.seniorDebtSource === 'MANUAL_OVERRIDE' ? '수동 검토' : null,
      bundle.benchmark ? '금리 반영' : null,
    ].filter(Boolean),
    baseRatePct: bundle.benchmark?.baseRate?.valuePct ?? null,
    treasury3yPct: bundle.benchmark?.treasury3y?.valuePct ?? null,
    bundleHash: bundle.bundleHash,
    source: bundle.source,
  };

  const previousHistory = Array.isArray(previous?.history) ? previous.history : [];
  const history = [latestHistoryEntry, ...previousHistory.filter((item) => item.bundleHash !== bundle.bundleHash)].slice(0, 12);

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    health: {
      status: 'healthy',
      watchMode: Boolean(job.watch),
      latestRunSource: bundle.source,
      lastSuccessAt: new Date().toISOString(),
      failureCount: 0,
    },
    latest: {
      fetchedAt: bundle.fetchedAt,
      propertyId: bundle.propertyId,
      address: bundle.address,
      beopjeongCode: bundle.beopjeongCode,
      months: bundle.months,
      source: bundle.source,
      metrics: bundle.metrics,
      risk: bundle.risk,
      benchmark: bundle.benchmark,
      attestation: bundle.attestation,
      bundleHash: bundle.bundleHash,
      reportFileName: reportPath ? path.basename(reportPath) : null,
      reportPath: reportPath ?? null,
      onchain: onchainResult ?? null,
      freshness: {
        marketDataFetchedAt: bundle.fetchedAt,
        oracleUpdatedAt: onchainResult?.updatedAt ?? null,
      },
      timeline: buildOracleTimeline(bundle, onchainResult, reportPath),
    },
    history,
  };

  fs.writeFileSync(latestPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return latestPath;
}

async function publishOracleSnapshot(snapshotPath) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }

  const owner = process.env.GITHUB_REPO_OWNER || DEFAULT_GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO_NAME || DEFAULT_GITHUB_REPO;
  const branch = process.env.GITHUB_REPO_BRANCH || DEFAULT_GITHUB_BRANCH;
  const filePath = process.env.GITHUB_REPO_SNAPSHOT_PATH || DEFAULT_GITHUB_SNAPSHOT_PATH;

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const publicSnapshot = {
    ...snapshot,
    latest: {
      ...snapshot.latest,
      reportPath: null,
    },
    publishedAt: new Date().toISOString(),
  };

  const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'JeonseChainOracle/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let sha = null;
  const currentResponse = await fetch(`${contentsUrl}?ref=${branch}`, { headers });
  if (currentResponse.ok) {
    const currentPayload = await currentResponse.json();
    sha = currentPayload.sha ?? null;
  } else if (currentResponse.status !== 404) {
    throw new Error(`GitHub 현재 snapshot 조회 실패: HTTP ${currentResponse.status}`);
  }

  const payload = {
    message: `chore: update oracle snapshot (${publicSnapshot.latest.fetchedAt})`,
    content: Buffer.from(`${JSON.stringify(publicSnapshot, null, 2)}\n`, 'utf8').toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  };

  const updateResponse = await fetch(contentsUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`GitHub snapshot 업로드 실패: HTTP ${updateResponse.status} ${errorText}`);
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
}

function loadJobs(opts) {
  if (!opts.configPath) {
    return [opts];
  }

  const configPath = path.resolve(process.cwd(), opts.configPath);
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.properties;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('config file must contain a non-empty array or { properties: [] }');
  }

  return list.map((item) => ({
    ...opts,
    ...item,
    configPath: opts.configPath,
    beopjeongCode: item.beopjeongCode ?? opts.beopjeongCode,
    month: item.month ?? opts.month,
    monthsBack: item.monthsBack ?? opts.monthsBack,
    useMock: item.useMock ?? opts.useMock,
    dryRun: item.dryRun ?? opts.dryRun,
    seniorDebtKRW: item.seniorDebtKRW ?? opts.seniorDebtKRW,
    auctionStarted: item.auctionStarted ?? opts.auctionStarted,
    newMortgageSet: item.newMortgageSet ?? opts.newMortgageSet,
    saveReport: item.saveReport ?? opts.saveReport,
    reportDir: item.reportDir ?? opts.reportDir,
  }));
}

function resolvePropertyId(job) {
  if (job.propertyId) {
    if (!ethers.isHexString(job.propertyId, 32)) {
      throw new Error(`invalid propertyId: ${job.propertyId}`);
    }
    return job.propertyId;
  }

  if (!job.address) {
    throw new Error('either --property-id or --address is required');
  }

  return derivePropertyIdFromAddress(job.address);
}

async function processJob(rawJob, index, total) {
  const job = {
    ...rawJob,
    propertyId: resolvePropertyId(rawJob),
    beopjeongCode: String(rawJob.beopjeongCode ?? DEFAULT_BEOPJEONG_CODE),
    month: rawJob.month,
    monthsBack: rawJob.monthsBack,
    seniorDebtKRW: parseKrwValue(rawJob.seniorDebtKRW),
    reportDir: path.resolve(process.cwd(), rawJob.reportDir),
  };

  const useApi = Boolean(process.env.DATA_GO_KR_API_KEY) && !job.useMock;

  console.log(`\n🔍 [${index + 1}/${total}] JeonseChain Oracle Sync`);
  console.log('────────────────────────────────────────');
  console.log(`부동산    : ${job.address || '(주소 미입력)'}`);
  console.log(`PropertyId: ${job.propertyId}`);
  console.log(`법정동    : ${job.beopjeongCode}`);
  console.log(`조회월    : ${job.month} (최근 ${job.monthsBack + 1}개월)`);
  console.log(`데이터    : ${useApi ? '공공데이터 API' : '모의 데이터'}`);
  if (job.seniorDebtKRW != null) {
    console.log(`선순위채권: ${job.seniorDebtKRW.toLocaleString('ko-KR')}원 (수동 보정)`);
  }
  if (job.auctionStarted) console.log('경매신호  : true (수동 보정)');
  if (job.newMortgageSet) console.log('근저당신호: true (수동 보정)');
  if (job.dryRun) console.log('모드      : DRY RUN');

  console.log('\n[1/3] 데이터 수집');
  const data = await collectData(job);
  console.log(`  공시가  : ${formatEok(data.officialPriceKRW)}`);
  console.log(`  선순위  : ${formatEok(data.seniorDebtKRW)}`);
  console.log(`  전세평균: ${formatEok(data.avgRentDeposit)}`);
  console.log(`  매매평균: ${formatEok(data.avgSalePrice)}`);
  console.log(`  소스    : ${data.source} (전월세 ${data.rentSamples}건 / 매매 ${data.saleSamples}건)`);
  if (data.benchmark) {
    console.log(`  기준금리: ${data.benchmark.baseRate?.valuePct?.toFixed(3) ?? '-'}% (${data.benchmark.baseRate?.time ?? '-'})`);
    console.log(`  국고채3Y: ${data.benchmark.treasury3y?.valuePct?.toFixed(3) ?? '-'}% (${data.benchmark.treasury3y?.time ?? '-'})`);
    if (data.benchmark.protectedYieldReferencePct != null) {
      console.log(`  수익률참조: ${data.benchmark.protectedYieldReferencePct.toFixed(3)}%`);
    }
  }

  console.log('\n[2/3] 위험 점수 계산');
  const riskResult = calculateRiskScore(data);
  riskResult.log.forEach((line) => console.log(`  · ${line}`));
  const label = riskResult.score >= 70 ? '🔴 위험' : riskResult.score >= 40 ? '🟡 주의' : '🟢 안전';
  console.log(`\n  최종: ${riskResult.score}/100 ${label}`);

  const bundle = buildOracleBundle(job, data, riskResult);
  let reportPath = null;
  if (job.saveReport) {
    reportPath = saveOracleReport(bundle, job.reportDir);
    console.log(`  ✓ report 저장: ${reportPath}`);
  } else {
    console.log(`  bundleHash: ${bundle.bundleHash}`);
  }

  console.log('\n[3/3] 온체인 업데이트');
  const onchainResult = await updateOnChain(bundle, job);
  const snapshotPath = saveOracleSnapshot(bundle, reportPath, onchainResult, job);
  console.log(`  ✓ snapshot 저장: ${snapshotPath}`);
  try {
    const publicUrl = await publishOracleSnapshot(snapshotPath);
    if (publicUrl) {
      console.log(`  ✓ GitHub 공개 snapshot 동기화: ${publicUrl}`);
    }
  } catch (error) {
    console.warn(`  ⚠ GitHub 공개 snapshot 동기화 실패: ${error.message}`);
  }
  console.log('\n✅ 완료');

  return bundle;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJobsOnce(opts) {
  const jobs = loadJobs(opts);
  const results = [];
  for (let index = 0; index < jobs.length; index += 1) {
    results.push(await processJob(jobs[index], index, jobs.length));
  }
  return results;
}

async function runWatchMode(opts) {
  let iteration = 0;
  while (true) {
    iteration += 1;
    console.log(`\n🕒 Oracle watch iteration #${iteration}`);
    try {
      await runJobsOnce(opts);
    } catch (error) {
      console.error(`❌ watch iteration 실패: ${error.message}`);
    }
    console.log(`\n다음 실행까지 ${Math.round(opts.intervalMs / 1000)}초 대기`);
    await sleep(opts.intervalMs);
  }
}

function printHelp() {
  console.log(`
JeonseChain Oracle Fetcher — 공공데이터 기반 부동산 위험 점수 온체인 업데이트

사용법:
  node scripts/oracle-fetcher.js --address "<도로명주소>" [옵션]
  node scripts/oracle-fetcher.js --config ./config/oracle-properties.sample.json [옵션]

핵심 옵션:
  --property-id <0xbytes32>     온체인 propertyId. 없으면 주소에서 자동 생성
  --address <string>            부동산 주소. propertyId 생성과 로그 표시에 사용
  --beopjeong-code <code>       5자리 법정동 코드 (기본: 11440 마포구)
  --month <YYYYMM>              기준월 (기본: 이번달)
  --months-back <n>             최근 n개월 전까지 함께 조회 (기본: 2)
  --config <path>               여러 부동산 batch 설정 JSON
  --watch                       interval마다 반복 실행
  --interval-ms <ms>            watch 간격 (기본: 900000 = 15분)

관리자 보정 신호:
  --senior-debt-krw <won>       선순위 채권 수동 입력
  --auction-started             경매 개시 여부 수동 표시
  --new-mortgage-set            신규 근저당 여부 수동 표시

기타:
  --mock                        모의 데이터 사용
  --dry-run                     온체인 트랜잭션 없이 계산만 수행
  --save-report                 data/oracle-reports에 JSON 보고서 저장
  --report-dir <path>           보고서 저장 위치 변경
  --help                        도움말

환경변수:
  DATA_GO_KR_API_KEY            공공데이터포털 API 키
  BOK_ECOS_API_KEY              한국은행 ECOS 키 (선택, 기준금리/국고채 benchmark)
  GITHUB_TOKEN                  공개 snapshot GitHub 동기화 토큰 (선택)
  GITHUB_REPO_OWNER             공개 snapshot 저장소 owner (기본: soobincho-gif)
  GITHUB_REPO_NAME              공개 snapshot 저장소 repo (기본: jeonsechain)
  GITHUB_REPO_BRANCH            공개 snapshot 브랜치 (기본: main)
  GITHUB_REPO_SNAPSHOT_PATH     공개 snapshot 경로 (기본: oracle-live/latest.json)
  PRIVATE_KEY                   오라클 노드 서명 키
  SEPOLIA_RPC_URL               Sepolia RPC URL

예시:
  # 단건 dry run
  npm run oracle:fetch -- --address "서울특별시 마포구 월드컵북로 396" --beopjeong-code 11440 --dry-run

  # 선순위 채권 수동 입력 포함
  npm run oracle:fetch -- --address "서울특별시 마포구 월드컵북로 396" --beopjeong-code 11440 --senior-debt-krw 120000000 --save-report

  # batch + watch
  npm run oracle:watch -- --config ./config/oracle-properties.sample.json --save-report
  `);
}

export async function main(cliOptions = parseArgs()) {
  if (cliOptions.help) {
    printHelp();
    return;
  }

  if (!cliOptions.configPath && !cliOptions.propertyId && !cliOptions.address) {
    throw new Error('either --property-id, --address, or --config is required');
  }

  if (cliOptions.watch) {
    await runWatchMode(cliOptions);
    return;
  }

  await runJobsOnce(cliOptions);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
