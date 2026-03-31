import { keccak256, toBytes } from 'viem';

export type OraclePropertyRead =
  | readonly [bigint, bigint, boolean, boolean, bigint, boolean, bigint, `0x${string}`]
  | undefined;

export type OracleSignalRead =
  | readonly [boolean, boolean, boolean, bigint, boolean, bigint, bigint, `0x${string}`]
  | undefined;

export type OracleRiskPreview = {
  score: number;
  label: 'Safe' | 'Monitor' | 'Warning';
  sourceLabel: string;
  updatedAt: bigint;
};

export function normalizePropertyAddress(input: string) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function derivePropertyIdFromAddress(input: string) {
  return keccak256(toBytes(normalizePropertyAddress(input))) as `0x${string}`;
}

export function riskLabelFromNumericScore(score: number): OracleRiskPreview['label'] {
  if (score >= 70) return 'Warning';
  if (score >= 40) return 'Monitor';
  return 'Safe';
}

function normalizeLegacyOracleScore(
  property: Exclude<OraclePropertyRead, undefined>,
  signals: OracleSignalRead,
) {
  const rawScore = Number(property[6]);
  const looksLikeLegacyMissingDebtPenalty =
    rawScore === 40 &&
    property[1] === BigInt(0) &&
    property[2] === false &&
    property[3] === false &&
    (!signals ||
      (
        signals[0] === false &&
        signals[1] === false &&
        signals[2] === false &&
        Number(signals[3]) < 7000 &&
        signals[4] === false &&
        signals[5] === BigInt(0)
      ));

  return looksLikeLegacyMissingDebtPenalty ? 0 : rawScore;
}

export function buildOracleRiskPreview(
  property: OraclePropertyRead,
  signals: OracleSignalRead,
): OracleRiskPreview | null {
  if (!property) return null;

  const updatedAt = signals?.[6] && signals[6] > BigInt(0) ? signals[6] : property[4];
  if (!updatedAt || updatedAt <= BigInt(0)) return null;

  const score = normalizeLegacyOracleScore(property, signals);
  return {
    score,
    label: riskLabelFromNumericScore(score),
    sourceLabel: score === Number(property[6]) ? '온체인 오라클 반영값' : '온체인 오라클 반영값 (구버전 점수 보정)',
    updatedAt,
  };
}
