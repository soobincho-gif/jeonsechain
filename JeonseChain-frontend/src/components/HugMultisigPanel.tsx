'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { decodeEventLog, encodeFunctionData } from 'viem';
import { CONTRACT_ADDRESSES, MULTISIG_ABI, VAULT_ABI } from '@/lib/contracts';
import { explorerLink, formatAddress, formatDateTimeFromUnix } from '@/lib/format';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';

type HugMultisigPanelProps = {
  activeLease: LeaseDraft | null;
  autoRefreshEnabled: boolean;
  onActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
};

type GovernanceTemplate = {
  id: 'pause' | 'unpause' | 'emergency-return';
  title: string;
  description: string;
  helper: string;
  toneClass: string;
  disabled: boolean;
  disabledReason?: string;
  target: `0x${string}`;
  data: `0x${string}`;
  proposalDescription: string;
};

type MultisigTransactionView = {
  txId: bigint;
  target: string;
  description: string;
  proposedAt: bigint;
  executed: boolean;
  confirmCount: bigint;
  timelockPassed: boolean;
  canExecute: boolean;
  myConfirmed: boolean;
};

type PendingAction =
  | { kind: 'propose'; templateTitle: string }
  | { kind: 'confirm'; txId: bigint }
  | { kind: 'revoke'; txId: bigint }
  | { kind: 'execute'; txId: bigint };

const RECENT_TRANSACTION_LIMIT = 4;

export default function HugMultisigPanel({
  activeLease,
  autoRefreshEnabled,
  onActivity,
}: HugMultisigPanelProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [transactions, setTransactions] = useState<MultisigTransactionView[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const handledReceiptRef = useRef<string | null>(null);

  const multisigAddress = CONTRACT_ADDRESSES.HugMultisig as `0x${string}`;
  const vaultAddress = CONTRACT_ADDRESSES.JeonseVault as `0x${string}`;
  const activeLeaseId = activeLease?.leaseId?.startsWith('0x') ? (activeLease.leaseId as `0x${string}`) : undefined;

  const { data: owners } = useReadContract({
    address: multisigAddress,
    abi: MULTISIG_ABI,
    functionName: 'getOwners',
    query: {
      refetchInterval: autoRefreshEnabled ? 15000 : false,
    },
  });

  const { data: required } = useReadContract({
    address: multisigAddress,
    abi: MULTISIG_ABI,
    functionName: 'required',
    query: {
      refetchInterval: autoRefreshEnabled ? 15000 : false,
    },
  });

  const { data: timelockDelay } = useReadContract({
    address: multisigAddress,
    abi: MULTISIG_ABI,
    functionName: 'timelockDelay',
    query: {
      refetchInterval: autoRefreshEnabled ? 15000 : false,
    },
  });

  const { data: transactionCount } = useReadContract({
    address: multisigAddress,
    abi: MULTISIG_ABI,
    functionName: 'getTransactionCount',
    query: {
      refetchInterval: autoRefreshEnabled ? 8000 : false,
    },
  });

  const { data: paused } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: 'paused',
    query: {
      refetchInterval: autoRefreshEnabled ? 8000 : false,
    },
  });

  const ownerList = (owners as string[] | undefined) ?? [];
  const isOwner = ownerList.some((owner) => owner.toLowerCase() === address?.toLowerCase());
  const quorum = Number(required ?? BigInt(0));
  const ownerCount = ownerList.length;
  const totalTxCount = Number(transactionCount ?? BigInt(0));

  const governanceTemplates = useMemo<GovernanceTemplate[]>(() => {
    const base = [
      {
        id: 'pause' as const,
        title: '긴급 일시 정지 제안',
        description: '새 계약 등록과 사용자 진입을 잠시 멈춰 더 큰 피해 확산을 막습니다.',
        helper: '위험 신호가 커질 때 운영자가 가장 먼저 거는 안전장치입니다.',
        toneClass: 'border-amber-400/20 bg-amber-400/10 text-amber-50',
        disabled: !isOwner,
        disabledReason: '현재 연결 주소는 멀티시그 owner가 아닙니다.',
        target: vaultAddress,
        data: encodeFunctionData({
          abi: VAULT_ABI,
          functionName: 'pause',
        }),
        proposalDescription: 'JeonseVault pause() 호출 제안',
      },
      {
        id: 'unpause' as const,
        title: '운영 재개 제안',
        description: '점검이 끝난 뒤 등록, 입금, 정산 흐름을 다시 정상화합니다.',
        helper: 'pause 이후 상황을 점검하고 서비스 운영을 재개할 때 사용합니다.',
        toneClass: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-50',
        disabled: !isOwner,
        disabledReason: '현재 연결 주소는 멀티시그 owner가 아닙니다.',
        target: vaultAddress,
        data: encodeFunctionData({
          abi: VAULT_ABI,
          functionName: 'unpause',
        }),
        proposalDescription: 'JeonseVault unpause() 호출 제안',
      },
      {
        id: 'emergency-return' as const,
        title: '선택 계약 강제 반환 제안',
        description: '현재 선택된 계약에 대해 HUG 긴급 반환 절차를 태웁니다.',
        helper: activeLeaseId
          ? `선택 leaseId ${formatAddress(activeLeaseId, 10, 6)} 기준`
          : '실제 계약이 선택되면 활성화됩니다.',
        toneClass: 'border-rose-400/20 bg-rose-400/10 text-rose-50',
        disabled: !isOwner || !activeLeaseId,
        disabledReason: !activeLeaseId
          ? 'viewer 단계에서 실제 leaseId를 선택해야 합니다.'
          : '현재 연결 주소는 멀티시그 owner가 아닙니다.',
        target: vaultAddress,
        data: encodeFunctionData({
          abi: VAULT_ABI,
          functionName: 'emergencyReturn',
          args: activeLeaseId ? [activeLeaseId] : [`0x${'0'.repeat(64)}`],
        }),
        proposalDescription: activeLeaseId
          ? `JeonseVault emergencyReturn(${formatAddress(activeLeaseId, 8, 6)}) 호출 제안`
          : 'JeonseVault emergencyReturn() 호출 제안',
      },
    ];

    return base;
  }, [activeLeaseId, isOwner, vaultAddress]);

  useEffect(() => {
    setRefreshNonce((current) => current + 1);
  }, [address, transactionCount]);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const timer = window.setInterval(() => {
      setRefreshNonce((current) => current + 1);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function loadTransactions() {
      if (!publicClient) return;

      const count = Number(transactionCount ?? BigInt(0));
      if (count <= 0) {
        if (!cancelled) {
          setTransactions([]);
          setLoadingTransactions(false);
        }
        return;
      }

      setLoadingTransactions(true);
      const ids = Array.from({ length: Math.min(count, RECENT_TRANSACTION_LIMIT) }, (_, index) =>
        BigInt(count - 1 - index),
      );

      try {
        const nextTransactions = await Promise.all(
          ids.map(async (txId) => {
            const [target, description, proposedAt, executed, confirmCount, timelockPassed] =
              (await publicClient.readContract({
                address: multisigAddress,
                abi: MULTISIG_ABI,
                functionName: 'getTransaction',
                args: [txId],
              })) as [string, string, bigint, boolean, bigint, boolean];

            const canExecute = (await publicClient.readContract({
              address: multisigAddress,
              abi: MULTISIG_ABI,
              functionName: 'canExecute',
              args: [txId],
            })) as boolean;

            const myConfirmed = address
              ? ((await publicClient.readContract({
                  address: multisigAddress,
                  abi: MULTISIG_ABI,
                  functionName: 'confirmations',
                  args: [txId, address],
                })) as boolean)
              : false;

            return {
              txId,
              target,
              description,
              proposedAt,
              executed,
              confirmCount,
              timelockPassed,
              canExecute,
              myConfirmed,
            } satisfies MultisigTransactionView;
          }),
        );

        if (!cancelled) setTransactions(nextTransactions);
      } finally {
        if (!cancelled) setLoadingTransactions(false);
      }
    }

    void loadTransactions();
    return () => {
      cancelled = true;
    };
  }, [address, multisigAddress, publicClient, refreshNonce, transactionCount]);

  useEffect(() => {
    if (!receipt || handledReceiptRef.current === receipt.transactionHash || !pendingAction) return;
    handledReceiptRef.current = receipt.transactionHash;

    let txIdFromEvent: string | undefined;

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: MULTISIG_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'TransactionProposed') {
          txIdFromEvent = String(decoded.args.txId);
          break;
        }
      } catch {
        continue;
      }
    }

    if (pendingAction.kind === 'propose') {
      onActivity({
        title: '멀티시그 안건이 생성됐어요',
        description: txIdFromEvent
          ? `${pendingAction.templateTitle} 안건이 생성되어 ${txIdFromEvent}번으로 기록됐습니다.`
          : `${pendingAction.templateTitle} 안건이 생성됐습니다.`,
        tone: 'success',
        txHash: receipt.transactionHash,
      });
    }

    if (pendingAction.kind === 'confirm') {
      onActivity({
        title: '멀티시그 확인이 추가됐어요',
        description: `${pendingAction.txId.toString()}번 안건에 서명이 추가됐습니다.`,
        tone: 'success',
        txHash: receipt.transactionHash,
      });
    }

    if (pendingAction.kind === 'revoke') {
      onActivity({
        title: '멀티시그 확인을 철회했어요',
        description: `${pendingAction.txId.toString()}번 안건의 확인이 철회됐습니다.`,
        tone: 'warning',
        txHash: receipt.transactionHash,
      });
    }

    if (pendingAction.kind === 'execute') {
      onActivity({
        title: '멀티시그 안건이 실행됐어요',
        description: `${pendingAction.txId.toString()}번 안건이 실행되어 민감 권한 호출이 집행됐습니다.`,
        tone: 'success',
        txHash: receipt.transactionHash,
      });
    }

    setPendingAction(null);
    setRefreshNonce((current) => current + 1);
  }, [onActivity, pendingAction, receipt]);

  function proposeTemplate(template: GovernanceTemplate) {
    if (template.disabled) return;

    onActivity({
      title: '멀티시그 제안 요청',
      description: `${template.title} 안건을 생성하기 위해 지갑 승인을 요청합니다.`,
      tone: 'info',
      leaseId: activeLeaseId,
    });

    setPendingAction({
      kind: 'propose',
      templateTitle: template.title,
    });

    writeContract({
      address: multisigAddress,
      abi: MULTISIG_ABI,
      functionName: 'propose',
      args: [template.target, template.data, template.proposalDescription],
    });
  }

  function confirmTransaction(txId: bigint) {
    setPendingAction({ kind: 'confirm', txId });
    onActivity({
      title: '멀티시그 확인 요청',
      description: `${txId.toString()}번 안건에 확인을 추가합니다.`,
      tone: 'info',
    });
    writeContract({
      address: multisigAddress,
      abi: MULTISIG_ABI,
      functionName: 'confirm',
      args: [txId],
    });
  }

  function revokeTransaction(txId: bigint) {
    setPendingAction({ kind: 'revoke', txId });
    onActivity({
      title: '멀티시그 철회 요청',
      description: `${txId.toString()}번 안건의 확인을 철회합니다.`,
      tone: 'warning',
    });
    writeContract({
      address: multisigAddress,
      abi: MULTISIG_ABI,
      functionName: 'revoke',
      args: [txId],
    });
  }

  function executeTransaction(txId: bigint) {
    setPendingAction({ kind: 'execute', txId });
    onActivity({
      title: '멀티시그 실행 요청',
      description: `${txId.toString()}번 안건을 실제로 집행합니다.`,
      tone: 'info',
    });
    writeContract({
      address: multisigAddress,
      abi: MULTISIG_ABI,
      functionName: 'execute',
      args: [txId],
    });
  }

  const demoModeBanner =
    ownerCount === 1 && quorum === 1 && Number(timelockDelay ?? BigInt(0)) === 0
      ? '현재 Sepolia 배포본은 발표용 1-of-1 / timelock 0초 모드입니다. 프로덕션 목표는 2-of-3 + 48시간 timelock 입니다.'
      : '현재 배포본은 여러 서명자와 timelock을 포함한 거버넌스 모드입니다.';

  return (
    <section className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">HUG Multisig Governance</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">민감 권한을 단일 지갑이 아닌 멀티시그 뒤에 둡니다</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            pause, unpause, emergency return 같은 민감 함수는 HUG 멀티시그를 통해 제안되고 집행됩니다.
            발표에서는 아래 패널에서 실제로 안건을 생성하고 실행 흐름을 바로 보여줄 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshNonce((current) => current + 1)}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
        >
          안건 새로고침
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
        <a
          href={explorerLink('address', multisigAddress)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/10 px-3 py-2 transition hover:border-cyan-300/30 hover:text-slate-100"
        >
          멀티시그 주소 보기
        </a>
        <a
          href={explorerLink('address', vaultAddress)}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/10 px-3 py-2 transition hover:border-cyan-300/30 hover:text-slate-100"
        >
          보호함 주소 보기
        </a>
      </div>

      <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
        <p className="text-sm font-semibold text-white">현재 거버넌스 모드</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{demoModeBanner}</p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="서명자 수" value={`${ownerCount}명`} helper={ownerList.length ? ownerList.map((owner) => formatAddress(owner)).join(' · ') : '조회 중'} />
        <MetricCard label="실행 기준" value={`${quorum || 0}-of-${ownerCount || 0}`} helper="충족 시 execute 가능" />
        <MetricCard label="timelock" value={formatDelay(timelockDelay)} helper="제안 후 실행 대기 시간" />
        <MetricCard
          label="내 권한"
          value={address ? (isOwner ? '서명자' : '열람 전용') : '지갑 미연결'}
          helper={address ? formatAddress(address) : 'Connect Wallet 필요'}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">안건 빠르게 만들기</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  발표용으로 가장 설명이 쉬운 세 가지 안건을 템플릿으로 묶었습니다.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                최근 안건 {totalTxCount}건
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {governanceTemplates.map((template) => (
                <div key={template.id} className={`rounded-[22px] border p-4 ${template.toneClass}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-white">{template.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-100/90">{template.description}</p>
                      <p className="mt-2 text-xs text-slate-200/80">{template.helper}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => proposeTemplate(template)}
                      disabled={template.disabled || isPending || isConfirming}
                      className="rounded-full bg-slate-950/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {pendingAction?.kind === 'propose' && pendingAction.templateTitle === template.title
                        ? isConfirming
                          ? '블록 확인 중...'
                          : '지갑 승인 대기...'
                        : '안건 제안'}
                    </button>
                  </div>
                  {template.disabled && template.disabledReason ? (
                    <p className="mt-3 text-xs text-amber-100/90">{template.disabledReason}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">최근 안건</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              제안, 확인, 실행 흐름을 최근 안건 기준으로 바로 따라갈 수 있습니다.
            </p>

            <div className="mt-4 space-y-3">
              {loadingTransactions ? (
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  멀티시그 안건을 불러오는 중입니다.
                </div>
              ) : transactions.length === 0 ? (
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  아직 제안된 안건이 없습니다. 위 템플릿에서 첫 안건을 만들어보세요.
                </div>
              ) : (
                transactions.map((transaction) => {
                  const status = getTransactionStatus(transaction, quorum);
                  const actionDisabled = isPending || isConfirming;

                  return (
                    <div key={transaction.txId.toString()} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.className}`}>
                            {status.label}
                          </span>
                          <span className="text-xs text-slate-500">안건 #{transaction.txId.toString()}</span>
                        </div>
                        <span className="text-xs text-slate-500">{formatDateTimeFromUnix(transaction.proposedAt)}</span>
                      </div>

                      <p className="mt-3 text-sm font-medium text-white">{transaction.description}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <MetricCard
                          label="대상 컨트랙트"
                          value={resolveTargetName(transaction.target)}
                          helper={formatAddress(transaction.target, 10, 6)}
                        />
                        <MetricCard
                          label="확인 수"
                          value={`${transaction.confirmCount.toString()} / ${quorum || 0}`}
                          helper={transaction.myConfirmed ? '현재 지갑 확인 완료' : '현재 지갑 미확인'}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {!transaction.executed && isOwner && !transaction.myConfirmed ? (
                          <button
                            type="button"
                            onClick={() => confirmTransaction(transaction.txId)}
                            disabled={actionDisabled}
                            className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            확인 추가
                          </button>
                        ) : null}

                        {!transaction.executed && isOwner && transaction.myConfirmed && !transaction.canExecute ? (
                          <button
                            type="button"
                            onClick={() => revokeTransaction(transaction.txId)}
                            disabled={actionDisabled}
                            className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            확인 철회
                          </button>
                        ) : null}

                        {!transaction.executed && transaction.canExecute ? (
                          <button
                            type="button"
                            onClick={() => executeTransaction(transaction.txId)}
                            disabled={actionDisabled}
                            className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            실행
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">현재 서명자</p>
            <div className="mt-4 space-y-3">
              {ownerList.length ? (
                ownerList.map((owner, index) => (
                  <div key={owner} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Signer {index + 1}</p>
                    <p className="mt-2 break-words font-mono text-sm text-white">{owner}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {owner.toLowerCase() === address?.toLowerCase() ? '현재 연결 지갑과 일치합니다.' : '현재 연결 지갑과 다른 서명자입니다.'}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                  owner 목록을 불러오는 중입니다.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-slate-950/40 p-4">
            <p className="text-sm font-semibold text-white">현재 보호함 상태</p>
            <div className="mt-4 grid gap-3">
              <MetricCard
                label="Vault pause 상태"
                value={paused ? '일시 정지' : '운영 중'}
                helper={paused ? '새 등록과 사용자 진입이 잠긴 상태' : '정상적으로 계약 흐름을 받을 수 있는 상태'}
              />
              <MetricCard
                label="선택 계약"
                value={activeLeaseId ? formatAddress(activeLeaseId, 10, 6) : '미선택'}
                helper={activeLeaseId ? '긴급 반환 제안에 바로 사용할 수 있습니다.' : 'viewer 단계에서 실제 leaseId를 선택하면 emergency return이 활성화됩니다.'}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-white">{value}</p>
      {helper ? <p className="mt-2 text-xs leading-5 text-slate-400">{helper}</p> : null}
    </div>
  );
}

function formatDelay(value?: bigint) {
  if (value === undefined) return '조회 중';
  const seconds = Number(value);
  if (seconds === 0) return '즉시 실행';
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}분`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}시간`;
  return `${Math.round(seconds / 86400)}일`;
}

function resolveTargetName(target: string) {
  if (target.toLowerCase() === CONTRACT_ADDRESSES.JeonseVault.toLowerCase()) return 'JeonseVault';
  if (target.toLowerCase() === CONTRACT_ADDRESSES.JeonseOracle.toLowerCase()) return 'JeonseOracle';
  if (target.toLowerCase() === CONTRACT_ADDRESSES.HugMultisig.toLowerCase()) return 'HugMultisig';
  return '기타 컨트랙트';
}

function getTransactionStatus(transaction: MultisigTransactionView, quorum: number) {
  if (transaction.executed) {
    return {
      label: '실행 완료',
      className: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    };
  }

  if (transaction.canExecute) {
    return {
      label: '실행 가능',
      className: 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
    };
  }

  if (Number(transaction.confirmCount) < quorum) {
    return {
      label: '추가 확인 필요',
      className: 'border border-amber-500/30 bg-amber-500/10 text-amber-100',
    };
  }

  if (!transaction.timelockPassed) {
    return {
      label: 'timelock 대기',
      className: 'border border-white/10 bg-white/[0.04] text-slate-200',
    };
  }

  return {
    label: '대기 중',
    className: 'border border-white/10 bg-white/[0.04] text-slate-200',
  };
}
