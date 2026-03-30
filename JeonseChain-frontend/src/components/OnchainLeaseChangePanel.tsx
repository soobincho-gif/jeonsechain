'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { keccak256, toBytes } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import {
  CONTRACT_ADDRESSES,
  CONTRACT_STATE,
  LEASE_CHANGE_TYPE,
  VAULT_ABI,
} from '@/lib/contracts';
import { digitsOnly, formatAddress, formatDateTimeFromUnix, formatFullAddress } from '@/lib/format';
import { ActivityItem } from '@/lib/workflow';

type OnchainLeaseChangePanelProps = {
  leaseId: string;
  leaseReady: boolean;
  stateNum: number;
  remainingDays?: bigint;
  tenantAddress?: string;
  landlordAddress?: string;
  onActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
};

type LeaseChangeAction =
  | 'request-extension'
  | 'request-termination'
  | 'accept'
  | 'reject'
  | 'cancel'
  | null;

function hashText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return keccak256(toBytes(trimmed)) as `0x${string}`;
}

export default function OnchainLeaseChangePanel({
  leaseId,
  leaseReady,
  stateNum,
  remainingDays,
  tenantAddress,
  landlordAddress,
  onActivity,
}: OnchainLeaseChangePanelProps) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  const actionRef = useRef<LeaseChangeAction>(null);
  const handledReceiptRef = useRef<string | null>(null);

  const [extensionDays, setExtensionDays] = useState('90');
  const [requestMemo, setRequestMemo] = useState('계약 연장 또는 중도 해지 합의 요청');

  const { data: changeInfo } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getLeaseChangeRequest',
    args: leaseReady ? [leaseId as `0x${string}`] : undefined,
    query: {
      enabled: leaseReady,
      refetchInterval: 5000,
    },
  });

  const request = changeInfo as
    | readonly [bigint, string, bigint, bigint, bigint, `0x${string}`]
    | undefined;

  const changeTypeNum = request ? Number(request[0]) : 0;
  const proposer = request?.[1];
  const requestedAt = request?.[2];
  const responseDeadline = request?.[3];
  const additionalDays = request?.[4];
  const requestHash = request?.[5];

  const connectedRole = useMemo(() => {
    if (!address) return '연결 안 됨';
    if (tenantAddress && address.toLowerCase() === tenantAddress.toLowerCase()) return '임차인';
    if (landlordAddress && address.toLowerCase() === landlordAddress.toLowerCase()) return '임대인';
    return '조회 전용';
  }, [address, landlordAddress, tenantAddress]);

  const isCounterparty =
    !!address &&
    !!proposer &&
    proposer !== '0x0000000000000000000000000000000000000000' &&
    address.toLowerCase() !== proposer.toLowerCase() &&
    connectedRole !== '조회 전용';
  const isProposer =
    !!address &&
    !!proposer &&
    proposer !== '0x0000000000000000000000000000000000000000' &&
    address.toLowerCase() === proposer.toLowerCase();
  const canProposeExtension =
    changeTypeNum === 0 &&
    (connectedRole === '임차인' || connectedRole === '임대인') &&
    (stateNum === 1 || stateNum === 3);
  const canProposeTermination =
    changeTypeNum === 0 &&
    (connectedRole === '임차인' || connectedRole === '임대인') &&
    stateNum === 1;

  useEffect(() => {
    if (!receipt || handledReceiptRef.current === receipt.transactionHash) return;
    handledReceiptRef.current = receipt.transactionHash;

    const action = actionRef.current;
    actionRef.current = null;

    if (action === 'request-extension') {
      onActivity({
        title: '계약 연장 제안을 보냈어요',
        description: '상대방이 승인하면 만기일이 늘어나고 계약은 다시 진행 중 상태를 유지합니다.',
        tone: 'info',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (action === 'request-termination') {
      onActivity({
        title: '중도 해지 제안을 보냈어요',
        description: '상대방이 승인하면 계약이 조기 만기로 전환되고 퇴실 정산 단계가 열립니다.',
        tone: 'warning',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (action === 'accept') {
      onActivity({
        title: '계약 변경 제안을 승인했어요',
        description: changeTypeNum === 2
          ? '연장 합의가 반영되어 새 만기일 기준으로 계약이 이어집니다.'
          : '중도 해지가 반영되어 퇴실 정산 절차가 시작됩니다.',
        tone: 'success',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (action === 'reject') {
      onActivity({
        title: '계약 변경 제안을 거절했어요',
        description: '기존 계약 조건은 유지되고, 필요하면 새 제안을 다시 올릴 수 있습니다.',
        tone: 'info',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (action === 'cancel') {
      onActivity({
        title: '계약 변경 제안을 취소했어요',
        description: '대기 중이던 제안을 정리하고 기존 계약 흐름으로 돌아갔습니다.',
        tone: 'info',
        txHash: receipt.transactionHash,
        leaseId,
      });
    }
  }, [changeTypeNum, leaseId, onActivity, receipt]);

  function handleRequestExtension() {
    const requestProof = hashText(requestMemo);
    const normalizedDays = digitsOnly(extensionDays);
    if (!requestProof || !normalizedDays) return;

    actionRef.current = 'request-extension';
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'requestLeaseExtension',
      args: [leaseId as `0x${string}`, BigInt(normalizedDays), requestProof],
    });
  }

  function handleRequestTermination() {
    const requestProof = hashText(requestMemo);
    if (!requestProof) return;

    actionRef.current = 'request-termination';
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'requestEarlyTermination',
      args: [leaseId as `0x${string}`, requestProof],
    });
  }

  function handleRespond(accept: boolean) {
    actionRef.current = accept ? 'accept' : 'reject';
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'respondToLeaseChange',
      args: [leaseId as `0x${string}`, accept],
    });
  }

  function handleCancel() {
    actionRef.current = 'cancel';
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'cancelLeaseChangeRequest',
      args: [leaseId as `0x${string}`],
    });
  }

  if (!leaseReady) return null;

  return (
    <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">계약 변경 시나리오</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            중도 해지와 연장은 둘 다 상대방 승인 전까지는 확정되지 않습니다. 연장은 만기일을 늘리고, 중도 해지는 곧바로 퇴실 정산 윈도우를 엽니다.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200">
          연결 역할: {connectedRole}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="현재 계약 상태"
          value={CONTRACT_STATE[stateNum] || '미확인'}
          helper={
            remainingDays === undefined
              ? '잔여 일수 계산 중'
              : remainingDays > BigInt(0)
                ? `만기까지 ${remainingDays.toString()}일`
                : '만기 도래'
          }
        />
        <MetricCard label="변경 요청 상태" value={LEASE_CHANGE_TYPE[changeTypeNum] || '변경 없음'} helper={leaseId} mono />
        <MetricCard label="제안자" value={formatAddress(proposer)} helper={formatFullAddress(proposer)} />
        <MetricCard
          label="응답 마감"
          value={formatDateTimeFromUnix(responseDeadline)}
          helper={requestedAt && requestedAt > BigInt(0) ? `요청 시각 ${formatDateTimeFromUnix(requestedAt)}` : '대기 중인 요청 없음'}
        />
      </div>

      {changeTypeNum === 0 ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <ActionBlock
            title="계약 연장 제안"
            description="임차인 또는 임대인이 추가 일수를 제안하고, 상대방이 승인하면 만기일이 늘어납니다."
          >
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">추가 일수</span>
              <input
                value={extensionDays}
                onChange={(event) => setExtensionDays(digitsOnly(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300/40"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">제안 메모</span>
              <input
                value={requestMemo}
                onChange={(event) => setRequestMemo(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300/40"
              />
            </label>
            <div className="mt-4">
              <button
                onClick={handleRequestExtension}
                disabled={!canProposeExtension || !digitsOnly(extensionDays) || !hashText(requestMemo) || isPending || isConfirming}
                className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isPending ? '지갑 승인 대기...' : isConfirming ? '연장 제안 확인 중...' : '계약 연장 제안'}
              </button>
            </div>
          </ActionBlock>

          <ActionBlock
            title="중도 해지 제안"
            description="합의된 조기 종료 시나리오입니다. 승인되면 계약이 조기 만기로 전환되고 퇴실 정산 단계가 열립니다."
          >
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">해지 사유 메모</span>
              <input
                value={requestMemo}
                onChange={(event) => setRequestMemo(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300/40"
              />
            </label>
            <div className="mt-4">
              <button
                onClick={handleRequestTermination}
                disabled={!canProposeTermination || !hashText(requestMemo) || isPending || isConfirming}
                className="rounded-full border border-amber-300/20 bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isPending ? '지갑 승인 대기...' : isConfirming ? '해지 제안 확인 중...' : '중도 해지 제안'}
              </button>
            </div>
          </ActionBlock>
        </div>
      ) : (
        <ActionBlock
          title="대기 중인 계약 변경 요청"
          description={
            changeTypeNum === 2
              ? `추가 ${additionalDays?.toString() || '0'}일 연장 요청이 대기 중입니다.`
              : '중도 해지 요청이 대기 중입니다. 승인되면 곧바로 퇴실 정산 단계가 시작됩니다.'
          }
        >
          <div className="flex flex-wrap gap-3">
            {isCounterparty ? (
              <>
                <button
                  onClick={() => handleRespond(true)}
                  disabled={isPending || isConfirming}
                  className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  승인하기
                </button>
                <button
                  onClick={() => handleRespond(false)}
                  disabled={isPending || isConfirming}
                  className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  거절하기
                </button>
              </>
            ) : null}
            {isProposer ? (
              <button
                onClick={handleCancel}
                disabled={isPending || isConfirming}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
              >
                제안 취소
              </button>
            ) : null}
          </div>
          {requestHash && requestHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' ? (
            <p className="mt-4 break-words font-mono text-xs text-slate-400 [overflow-wrap:anywhere]">
              requestHash {requestHash}
            </p>
          ) : null}
        </ActionBlock>
      )}
    </div>
  );
}

function ActionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  mono,
}: {
  label: string;
  value: string;
  helper?: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-3 break-words text-sm leading-6 text-white [overflow-wrap:anywhere] ${mono ? 'font-mono' : ''}`}>{value}</p>
      {helper ? <p className="mt-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">{helper}</p> : null}
    </div>
  );
}
