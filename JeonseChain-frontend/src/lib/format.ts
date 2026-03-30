import { formatEther } from 'viem';
import { EXPLORER_BASE_URL } from '@/lib/contracts';

const ZERO_ADDRESS = /^0x0{40}$/i;

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function isMeaningfulAddress(value?: string | null) {
  if (!value) return false;
  return !ZERO_ADDRESS.test(value);
}

export function formatAddress(value?: string, start = 6, end = 4) {
  if (!value) return '연결 안 됨';
  if (!isMeaningfulAddress(value)) return '미설정';
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function formatFullAddress(value?: string | null) {
  if (!value) return '조회 전';
  if (!isMeaningfulAddress(value)) return '미설정';
  return value;
}

export function formatKRW(value?: bigint | null) {
  if (value === undefined || value === null) return '데이터 없음';
  return `${Number(formatEther(value)).toLocaleString('ko-KR')} KRW`;
}

export function formatInputKRW(value?: string) {
  if (!value) return '0 KRW';
  const numeric = Number(digitsOnly(value) || '0');
  return `${numeric.toLocaleString('ko-KR')} KRW`;
}

export function formatDateTimeFromUnix(value?: bigint | null) {
  if (!value || value <= BigInt(0)) return '아직 시작 전';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(Number(value) * 1000));
}

export function formatClock(value: number) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function explorerLink(type: 'address' | 'tx', value: string) {
  return `${EXPLORER_BASE_URL}/${type}/${value}`;
}
