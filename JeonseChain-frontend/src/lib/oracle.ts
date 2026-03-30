export type OracleBenchmarkPoint = {
  statCode: string;
  statName?: string;
  itemCode1: string;
  itemName1: string;
  time: string;
  valuePct: number;
  unitName: string;
};

export type OracleReport = {
  schemaVersion: number;
  fetchedAt: string;
  propertyId: string;
  address: string | null;
  beopjeongCode: string;
  months: string[];
  source: string;
  metrics: {
    officialPriceKRW: number;
    seniorDebtKRW: number;
    avgRentDeposit: number;
    avgSalePrice: number;
    auctionStarted: boolean;
    newMortgageSet: boolean;
    rentSamples: number;
    saleSamples: number;
  };
  risk: {
    score: number;
    log: string[];
  };
  benchmark: {
    source: string;
    baseRate: OracleBenchmarkPoint | null;
    treasury3y: OracleBenchmarkPoint | null;
    protectedYieldReferencePct: number | null;
  } | null;
  attestation: {
    seniorDebtSource: string;
    auctionSource: string;
    mortgageSource: string;
  };
  bundleHash: string;
};

export type OracleTimelineEvent = {
  kind: string;
  title: string;
  description: string;
  timestamp: string;
  txHash?: string;
  tone: 'info' | 'success' | 'warning';
};

export type OracleSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  health: {
    status: string;
    watchMode: boolean;
    latestRunSource: string;
    lastSuccessAt: string | null;
    failureCount: number;
  };
  latest: {
    fetchedAt: string;
    propertyId: string;
    address: string | null;
    beopjeongCode: string;
    months: string[];
    source: string;
    metrics: OracleReport['metrics'];
    risk: OracleReport['risk'];
    benchmark: OracleReport['benchmark'];
    attestation: OracleReport['attestation'];
    bundleHash: string;
    reportFileName: string | null;
    reportPath: string | null;
    onchain: {
      oracleAddress: string | null;
      updatePropertyDataTx: string | null;
      updateRiskScoreTx: string | null;
      updatedAt: string | null;
    } | null;
    freshness: {
      marketDataFetchedAt: string;
      oracleUpdatedAt: string | null;
    };
    timeline: OracleTimelineEvent[];
  };
  history: Array<{
    fetchedAt: string;
    riskScore: number;
    label: string;
    eventTags: string[];
    baseRatePct: number | null;
    treasury3yPct: number | null;
    bundleHash: string;
    source: string;
  }>;
  rawReport?: OracleReport | null;
  fallback?: boolean;
};

export function riskLabelFromScore(score: number) {
  if (score >= 70) return '위험';
  if (score >= 40) return '주의';
  return '안전';
}

