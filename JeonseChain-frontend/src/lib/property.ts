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

export function buildOracleRiskPreview(
  property: OraclePropertyRead,
  signals: OracleSignalRead,
): OracleRiskPreview | null {
  if (!property) return null;

  const updatedAt = signals?.[6] && signals[6] > BigInt(0) ? signals[6] : property[4];
  if (!updatedAt || updatedAt <= BigInt(0)) return null;

  const score = Number(property[6]);
  return {
    score,
    label: riskLabelFromNumericScore(score),
    sourceLabel: '온체인 오라클 반영값',
    updatedAt,
  };
}
