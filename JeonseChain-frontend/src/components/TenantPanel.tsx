'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { decodeEventLog, parseEther } from 'viem';
import { CONTRACT_ADDRESSES, CONTRACT_STATE, ERC20_ABI, STATE_COLOR, VAULT_ABI } from '@/lib/contracts';
import { explorerLink, formatAddress, formatFullAddress, formatKRW } from '@/lib/format';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';

type TenantPanelProps = {
  activeLease: LeaseDraft | null;
  onLeaseSelected: (leaseId: string) => void;
  onDepositComplete: (lease: LeaseDraft) => void;
  onActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
};

type TenantAction = 'mint' | 'approve' | 'deposit' | null;

export default function TenantPanel({
  activeLease,
  onLeaseSelected,
  onDepositComplete,
  onActivity,
}: TenantPanelProps) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });

  const [leaseId, setLeaseId] = useState(activeLease?.leaseId ?? '');
  const actionRef = useRef<TenantAction>(null);
  const handledReceiptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeLease?.leaseId) return;
    setLeaseId(activeLease.leaseId);
  }, [activeLease?.leaseId]);

  const normalizedLeaseId = leaseId.trim();
  const isLeaseIdReady = normalizedLeaseId.startsWith('0x') && normalizedLeaseId.length === 66;

  const { data: leaseInfo } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getDepositInfo',
    args: isLeaseIdReady ? [normalizedLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: isLeaseIdReady,
      refetchInterval: 5000,
    },
  });

  const { data: leaseData } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'leases',
    args: isLeaseIdReady ? [normalizedLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: isLeaseIdReady,
      refetchInterval: 5000,
    },
  });

  const { data: krwBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.MockKRW,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  const { data: allowance } = useReadContract({
    address: CONTRACT_ADDRESSES.MockKRW,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACT_ADDRESSES.JeonseVault] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  const { data: mockOwner } = useReadContract({
    address: CONTRACT_ADDRESSES.MockKRW,
    abi: ERC20_ABI,
    functionName: 'owner',
    query: {
      refetchInterval: 10000,
    },
  });

  const expectedDeposit = leaseInfo?.[2];
  const stateNum = leaseInfo ? Number(leaseInfo[4]) : -1;
  const approvalReady = expectedDeposit !== undefined && (allowance ?? BigInt(0)) >= expectedDeposit;
  const balanceReady = expectedDeposit !== undefined && (krwBalance ?? BigInt(0)) >= expectedDeposit;
  const connectedIsTenant =
    address && leaseInfo ? address.toLowerCase() === String(leaseInfo[0]).toLowerCase() : false;
  const isMintOwner =
    address && mockOwner ? address.toLowerCase() === String(mockOwner).toLowerCase() : false;

  useEffect(() => {
    if (!receipt || handledReceiptRef.current === receipt.transactionHash) return;
    handledReceiptRef.current = receipt.transactionHash;

    const action = actionRef.current;
    actionRef.current = null;

    if (action === 'mint') {
      onActivity({
        title: 'KRW 지급 완료 (테스트넷)',
        description: '현재 연결 지갑으로 10억 KRW를 민팅했습니다.',
        tone: 'success',
        txHash: receipt.transactionHash,
      });
      return;
    }

    if (action === 'approve') {
      onActivity({
        title: 'Vault 사용 승인 완료',
        description: '선택한 계약 금액만큼 Vault가 보증금을 가져갈 수 있도록 승인했습니다.',
        tone: 'success',
        txHash: receipt.transactionHash,
        leaseId: normalizedLeaseId,
      });
      return;
    }

    if (action === 'deposit') {
      let detectedLeaseId = normalizedLeaseId;

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: VAULT_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === 'DepositReceived') {
            detectedLeaseId = String(decoded.args.leaseId);
            break;
          }
        } catch {
          continue;
        }
      }

      onDepositComplete({
        leaseId: detectedLeaseId,
        tenant: leaseInfo ? String(leaseInfo[0]) : activeLease?.tenant,
        landlord: leaseInfo ? String(leaseInfo[1]) : activeLease?.landlord,
        depositKRW: activeLease?.depositKRW,
        propertyLabel: activeLease?.propertyLabel,
        propertyId: activeLease?.propertyId,
        durationDays: activeLease?.durationDays,
        txHash: receipt.transactionHash,
      });
      onActivity({
        title: '보증금 입금이 완료됐어요',
        description: 'Vault 예치와 수익권 토큰 발행이 완료되어 계약 모니터링 단계로 이어집니다.',
        tone: 'success',
        txHash: receipt.transactionHash,
        leaseId: detectedLeaseId,
      });
    }
  }, [
    activeLease?.depositKRW,
    activeLease?.durationDays,
    activeLease?.landlord,
    activeLease?.propertyId,
    activeLease?.propertyLabel,
    activeLease?.tenant,
    leaseInfo,
    normalizedLeaseId,
    onActivity,
    onDepositComplete,
    receipt,
  ]);

  function pinLease() {
    if (!isLeaseIdReady) return;
    onLeaseSelected(normalizedLeaseId);
    onActivity({
      title: '계약을 임차인 워크스페이스에 연결했어요',
      description: '이제 승인과 입금이 선택한 leaseId 기준으로 동작합니다.',
      tone: 'info',
      leaseId: normalizedLeaseId,
    });
  }

  function handleMint() {
    if (!address) return;
    actionRef.current = 'mint';
    onActivity({
      title: 'KRW 지급 요청 (테스트넷)',
      description: 'MockKRW owner 권한으로 현재 지갑에 10억 KRW를 민팅합니다.',
      tone: 'info',
    });
    writeContract({
      address: CONTRACT_ADDRESSES.MockKRW,
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [address, parseEther('1000000000')],
    });
  }

  function handleApprove() {
    if (!expectedDeposit) return;
    actionRef.current = 'approve';
    onLeaseSelected(normalizedLeaseId);
    onActivity({
      title: 'Vault 승인 요청',
      description: '현재 선택한 계약의 보증금 금액만큼 Vault 사용 승인을 진행합니다.',
      tone: 'info',
      leaseId: normalizedLeaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.MockKRW,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.JeonseVault, expectedDeposit],
    });
  }

  function handleDeposit() {
    actionRef.current = 'deposit';
    onLeaseSelected(normalizedLeaseId);
    onActivity({
      title: '보증금 입금 요청',
      description: '선택한 leaseId 기준으로 Vault 예치 트랜잭션을 보냈습니다.',
      tone: 'info',
      leaseId: normalizedLeaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'depositJeonse',
      args: [normalizedLeaseId as `0x${string}`],
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
        <div className="rounded-[26px] border border-white/10 bg-slate-950/35 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-teal-200/80">Tenant Workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">임차인 승인 및 보증금 납입</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                임대인 단계에서 생성된 leaseId를 자동으로 받아오고, 현재 연결 지갑이 실제 임차인인지 먼저 확인한 뒤 승인과 입금을 진행합니다.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              leaseId 자동 연동
            </span>
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-900/60 p-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">선택 계약 leaseId</span>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input
                  value={leaseId}
                  onChange={(event) => setLeaseId(event.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
                />
                <button
                  onClick={pinLease}
                  disabled={!isLeaseIdReady}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-200 transition hover:border-teal-300/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  이 계약 사용
                </button>
              </div>
            </label>
            <p className="mt-3 text-xs text-slate-500">
              등록 단계에서 생성된 leaseId가 자동 입력되며, 다른 계약도 수동으로 조회할 수 있습니다.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <StatusCard label="내 KRW 잔액" value={formatKRW(krwBalance)} helper="현재 연결 지갑 기준" />
            <StatusCard
              label="Vault 승인 상태"
              value={approvalReady ? '승인 완료' : '승인 필요'}
              helper={expectedDeposit ? `필요 금액 ${formatKRW(expectedDeposit)}` : '계약 선택 후 계산'}
              tone={approvalReady ? 'success' : 'warning'}
            />
            <StatusCard
              label="임차인 지갑 일치"
              value={connectedIsTenant ? '지갑 일치' : '주소 확인 필요'}
              helper={leaseInfo ? formatAddress(String(leaseInfo[0])) : '계약 조회 전'}
              tone={connectedIsTenant ? 'success' : 'warning'}
            />
          </div>

          {leaseInfo ? (
            <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_COLOR[stateNum] || 'border border-white/10 bg-white/[0.04] text-slate-200'}`}>
                  {CONTRACT_STATE[stateNum] || '상태 미확인'}
                </span>
                <span className="text-xs text-slate-400">현재 계약 상태를 확인한 뒤 진행하세요.</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <ContractRow label="임차인" value={formatFullAddress(String(leaseInfo[0]))} mono />
                <ContractRow label="임대인" value={formatFullAddress(String(leaseInfo[1]))} mono />
                <ContractRow label="보증금" value={formatKRW(leaseInfo[2])} />
                <ContractRow label="현재 가치" value={formatKRW(leaseInfo[3])} />
                <ContractRow label="shares 발행량" value={leaseData ? Number(leaseData[7]).toLocaleString('ko-KR') : '조회 중'} />
                <ContractRow label="margin call" value={leaseData?.[8] ? '발생' : '정상'} />
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-slate-950/35 px-5 py-10 text-center">
              <p className="text-sm font-medium text-white">계약을 선택하면 보증금과 임차인 주소를 바로 보여드립니다.</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                등록 단계에서 생성된 leaseId가 있다면 그대로 사용하고, 없다면 수동으로 입력해서 연결할 수 있습니다.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {isMintOwner ? (
              <button
                onClick={handleMint}
                disabled={isPending || isConfirming}
                className="rounded-full border border-white/10 px-4 py-3 text-sm text-slate-100 transition hover:border-teal-300/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                KRW 10억 지급 (테스트넷)
              </button>
            ) : (
              <div className="rounded-full border border-white/10 px-4 py-3 text-xs text-slate-400">
                MockKRW owner 지갑에서만 추가 민팅 가능: {mockOwner ? formatAddress(String(mockOwner)) : '조회 중'}
              </div>
            )}

            <button
              onClick={handleApprove}
              disabled={!expectedDeposit || !connectedIsTenant || isPending || isConfirming}
              className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isPending && actionRef.current === 'approve'
                ? '지갑 승인 대기...'
                : isConfirming && actionRef.current === 'approve'
                  ? '승인 확인 중...'
                  : 'Vault 사용 승인'}
            </button>

            <button
              onClick={handleDeposit}
              disabled={
                !expectedDeposit ||
                !approvalReady ||
                !balanceReady ||
                !connectedIsTenant ||
                stateNum !== 0 ||
                isPending ||
                isConfirming
              }
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isPending && actionRef.current === 'deposit'
                ? '지갑 승인 대기...'
                : isConfirming && actionRef.current === 'deposit'
                  ? '입금 확인 중...'
                  : '보증금 입금'}
            </button>

            {hash ? (
              <a
                href={explorerLink('tx', hash)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:border-teal-300/30"
              >
                마지막 tx 보기
              </a>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <GuideCard
            title="권장 순서"
            lines={[
              '1. leaseId를 확인하고 현재 지갑이 임차인 주소와 일치하는지 봅니다.',
              '2. 필요하면 KRW (테스트넷)를 준비하고 Vault 사용 승인을 진행합니다.',
              '3. 승인 완료 후 보증금 입금을 실행하면 모니터링 단계로 넘어갑니다.',
            ]}
          />
          <GuideCard
            title="실패 줄이기"
            lines={[
              '계약 상태가 `등록됨`이 아닐 때는 입금이 막힙니다.',
              '승인 금액은 해당 계약의 보증금 금액만큼만 요청합니다.',
              '현재 연결 지갑이 계약상 임차인이 아니면 버튼을 비활성화합니다.',
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-500/20 bg-emerald-500/10'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/10'
        : 'border-white/10 bg-slate-950/45';

  return (
    <div className={`rounded-[22px] border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{helper}</p>
    </div>
  );
}

function ContractRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-2 min-w-0 text-sm text-white ${mono ? 'font-mono break-words [overflow-wrap:anywhere]' : 'break-words'}`}>{value}</p>
    </div>
  );
}

function GuideCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-4 space-y-3">
        {lines.map((line) => (
          <p key={line} className="text-sm leading-6 text-slate-300">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
