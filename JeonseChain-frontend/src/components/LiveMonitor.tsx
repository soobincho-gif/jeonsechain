'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useReadContract } from 'wagmi';
import {
  CHAIN_ID,
  CONTRACT_ADDRESSES,
  CONTRACT_STATE,
  DEPLOYMENT_META,
  ERC20_ABI,
  NETWORK_LABEL,
  STATE_COLOR,
  STATE_DESCRIPTION,
  VAULT_ABI,
} from '@/lib/contracts';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';
import {
  explorerLink,
  formatAddress,
  formatClock,
  formatDateTimeFromUnix,
  formatFullAddress,
  formatKRW,
  isMeaningfulAddress,
} from '@/lib/format';

type LiveMonitorProps = {
  activeLease: LeaseDraft | null;
  activities: ActivityItem[];
  connectedAddress?: string;
  currentTabLabel: string;
  isConnected: boolean;
  autoRefreshEnabled: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => Promise<void>;
};

export default function LiveMonitor({
  activeLease,
  activities,
  connectedAddress,
  currentTabLabel,
  isConnected,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  onManualRefresh,
}: LiveMonitorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeLeaseId = activeLease?.leaseId;

  const { data: vaultAssets, refetch: refetchVaultAssets } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
    query: { refetchInterval: autoRefreshEnabled ? 5000 : false },
  });

  const { data: vaultSupply, refetch: refetchVaultSupply } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'totalSupply',
    query: { refetchInterval: autoRefreshEnabled ? 5000 : false },
  });

  const { data: mockOwner, refetch: refetchMockOwner } = useReadContract({
    address: CONTRACT_ADDRESSES.MockKRW,
    abi: ERC20_ABI,
    functionName: 'owner',
    query: { refetchInterval: autoRefreshEnabled ? 10000 : false },
  });

  const { data: depositInfo, refetch: refetchDepositInfo } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getDepositInfo',
    args: activeLeaseId ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: !!activeLeaseId,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  const { data: remainingDays, refetch: refetchRemainingDays } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getRemainingDays',
    args: activeLeaseId ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: !!activeLeaseId,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  const { data: leaseData, refetch: refetchLeaseData } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'leases',
    args: activeLeaseId ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: !!activeLeaseId,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  const landlordAddress = leaseData?.[1];

  const { data: frozenTokens, refetch: refetchFrozenTokens } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'frozenTokens',
    args: landlordAddress ? [landlordAddress] : undefined,
    query: {
      enabled: !!landlordAddress,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  const contractState = depositInfo ? Number(depositInfo[4]) : -1;
  const recentActivities = activities.slice(0, 5);

  async function handleManualRefresh() {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchVaultAssets(),
        refetchVaultSupply(),
        refetchMockOwner(),
        refetchDepositInfo(),
        refetchRemainingDays(),
        refetchLeaseData(),
        refetchFrozenTokens(),
        onManualRefresh(),
      ]);
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 280);
    }
  }

  return (
    <aside className="glass-card subtle-grid h-full overflow-hidden p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-teal-200/70">실시간 관제</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">실시간 모니터</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            현재 선택한 계약과 최근 트랜잭션을 5초 간격으로 확인합니다.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              autoRefreshEnabled
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20'
            }`}
          >
            자동 새로고침 {autoRefreshEnabled ? '켜짐' : '꺼짐'}
          </button>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
          >
            {isRefreshing ? '새로고침 중...' : '지금 새로고침'}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <MiniMetric
          label="연결 상태"
          value={isConnected ? '지갑 연결됨' : '지갑 연결 필요'}
          helper={isConnected ? formatAddress(connectedAddress) : 'ConnectButton으로 연결'}
        />
        <MiniMetric label="현재 단계" value={currentTabLabel} helper="워크스페이스 기준" />
        <MiniMetric label="네트워크" value={NETWORK_LABEL} helper={`chainId ${CHAIN_ID}`} />
        <MiniMetric
          label="보증금 보호함 총 자산"
          value={formatKRW(vaultAssets)}
          helper={vaultSupply ? `총 발행 ${Number(vaultSupply).toLocaleString('ko-KR')} JCYT` : '총 발행 0 JCYT'}
        />
      </div>

      <MonitorSection title="배포 상태">
        <div className="space-y-3">
          <AddressRow label="MockKRW" value={CONTRACT_ADDRESSES.MockKRW} />
          <AddressRow label="Oracle" value={CONTRACT_ADDRESSES.JeonseOracle} />
          <AddressRow label="Vault" value={CONTRACT_ADDRESSES.JeonseVault} />
          <AddressRow label="HUG 멀티시그" value={CONTRACT_ADDRESSES.HugMultisig} />
          <AddressRow label="배포 지갑" value={DEPLOYMENT_META.deployer} />
          <p className="text-xs text-slate-400">
            배포 시각: {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(DEPLOYMENT_META.deployedAt))}
          </p>
          <p className="text-xs text-slate-500">
            MockKRW 관리자: {mockOwner ? formatAddress(mockOwner) : '확인 중'}
          </p>
        </div>
      </MonitorSection>

      <MonitorSection title="선택 계약">
        {!activeLeaseId ? (
          <EmptyState
            title="아직 선택된 leaseId가 없어요"
            description="계약 등록이 완료되면 leaseId를 자동 저장하고 다음 단계에 바로 연결합니다."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
                {formatAddress(activeLeaseId, 10, 6)}
              </span>
              <a
                href={explorerLink('tx', activeLease?.txHash || '')}
                target="_blank"
                rel="noreferrer"
                className={`text-xs text-teal-200 underline-offset-4 hover:underline ${activeLease?.txHash ? '' : 'pointer-events-none opacity-40'}`}
              >
                등록 tx 보기
              </a>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_COLOR[contractState] || 'border border-white/10 bg-white/5 text-slate-200'}`}>
                  {CONTRACT_STATE[contractState] || '조회 전'}
                </span>
                <span className="text-xs text-slate-400">
                  {remainingDays === undefined
                    ? '잔여 일수 확인 중'
                    : remainingDays > BigInt(0)
                      ? `만기까지 ${remainingDays.toString()}일`
                      : '만기 도래'}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {STATE_DESCRIPTION[contractState] || '계약 조회를 시작하면 상태 설명이 표시됩니다.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="임차인" value={formatAddress(depositInfo?.[0])} helper={formatFullAddress(depositInfo?.[0] ? String(depositInfo[0]) : undefined)} />
              <MiniMetric label="임대인" value={formatAddress(depositInfo?.[1])} helper={formatFullAddress(depositInfo?.[1] ? String(depositInfo[1]) : undefined)} />
              <MiniMetric label="예치 보증금" value={formatKRW(depositInfo?.[2])} helper={activeLease?.depositKRW ? `${Number(activeLease.depositKRW).toLocaleString('ko-KR')} 입력값` : '컨트랙트 기준'} />
              <MiniMetric label="현재 가치" value={formatKRW(depositInfo?.[3])} helper="수익권 가치 환산" />
              <MiniMetric label="계약 시작" value={formatDateTimeFromUnix(leaseData?.[3])} helper="입금 시점 기록" />
              <MiniMetric label="만기 예정" value={formatDateTimeFromUnix(leaseData?.[4])} helper={leaseData?.[8] ? '추가 대응 필요' : '정상'} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">리스크 플래그</p>
                  <p className="mt-1 text-xs text-slate-400">위험 상태 시 임대인 토큰 이전이 차단됩니다.</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    frozenTokens
                      ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200'
                      : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  }`}
                >
                  {frozenTokens ? '토큰 동결' : '정상'}
                </span>
              </div>
            </div>
          </div>
        )}
      </MonitorSection>

      <MonitorSection title="최근 활동">
        {recentActivities.length === 0 ? (
          <EmptyState
            title="아직 활동 로그가 없어요"
            description="계약 등록, 승인, 입금, 반환 같은 액션이 발생하면 여기에 자동으로 쌓입니다."
          />
        ) : (
          <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
            {recentActivities.map((activity) => (
              <div key={activity.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${toneDot(activity.tone)}`} />
                      <p className="text-sm font-semibold text-white">{activity.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{activity.description}</p>
                  </div>
                  <span className="text-xs text-slate-500">{formatClock(activity.timestamp)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                  {activity.leaseId ? <span>lease {formatAddress(activity.leaseId, 8, 6)}</span> : null}
                  {activity.txHash ? (
                    <a
                      href={explorerLink('tx', activity.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal-200 underline-offset-4 hover:underline"
                    >
                      tx 확인
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </MonitorSection>
    </aside>
  );
}

function MonitorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-[26px] border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
      <p className="mt-1 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">{helper}</p>
    </div>
  );
}

function AddressRow({ label, value }: { label: string; value: string }) {
  const hasAddress = isMeaningfulAddress(value);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 break-words font-mono text-xs text-slate-400 [overflow-wrap:anywhere]">{formatAddress(value, 10, 6)}</p>
      </div>
      {hasAddress ? (
        <a
          href={explorerLink('address', value)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-teal-200 transition hover:border-teal-400/40"
        >
          열기
        </a>
      ) : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function toneDot(tone: ActivityItem['tone']) {
  switch (tone) {
    case 'success':
      return 'bg-emerald-400';
    case 'warning':
      return 'bg-amber-400';
    default:
      return 'bg-cyan-300';
  }
}
