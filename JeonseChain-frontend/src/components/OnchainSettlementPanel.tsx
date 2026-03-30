'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { keccak256, parseEther, toBytes } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import {
  CONTRACT_ADDRESSES,
  CONTRACT_STATE,
  DEPLOYMENT_META,
  SETTLEMENT_STATUS,
  VAULT_ABI,
} from '@/lib/contracts';
import {
  digitsOnly,
  explorerLink,
  formatAddress,
  formatDateTimeFromUnix,
  formatInputKRW,
  formatKRW,
} from '@/lib/format';
import type { EvidenceBundleRecord } from '@/lib/evidence';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';

type OnchainSettlementPanelProps = {
  activeLease: LeaseDraft | null;
  leaseId: string;
  leaseReady: boolean;
  stateNum: number;
  remainingDays?: bigint;
  tenantAddress?: string;
  landlordAddress?: string;
  depositAmount?: bigint;
  settlementInfo?: readonly unknown[];
  onActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
  onSettlementResolved: (lease: LeaseDraft) => void;
};

type SettlementAction =
  | 'moveout'
  | 'claim'
  | 'tenant-accept-full'
  | 'tenant-accept-partial'
  | 'tenant-dispute'
  | 'deadline-finalize'
  | 'hug-resolve'
  | null;

const CATEGORY_OPTIONS = [
  { value: '0', label: '청소비', hint: '최대 30만 원' },
  { value: '1', label: '소모성 수리비', hint: '최대 50만 원' },
  { value: '2', label: '시설 파손', hint: '최대 200만 원' },
  { value: '3', label: '공과금/관리비', hint: '최대 50만 원' },
] as const;

function hashText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return keccak256(toBytes(trimmed)) as `0x${string}`;
}

export default function OnchainSettlementPanel({
  activeLease,
  leaseId,
  leaseReady,
  stateNum,
  remainingDays,
  tenantAddress,
  landlordAddress,
  depositAmount,
  settlementInfo,
  onActivity,
  onSettlementResolved,
}: OnchainSettlementPanelProps) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  const handledReceiptRef = useRef<string | null>(null);
  const actionRef = useRef<SettlementAction>(null);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);

  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]['value']>('2');
  const [claimAmount, setClaimAmount] = useState('1500000');
  const [evidenceMemo, setEvidenceMemo] = useState('퇴실 점검 사진 12장 및 시설 파손 내역');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadedEvidence, setUploadedEvidence] = useState<EvidenceBundleRecord | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [partialAcceptedAmount, setPartialAcceptedAmount] = useState('500000');
  const [responseMemo, setResponseMemo] = useState('청소비 일부만 수락하고 나머지는 이의 제기');
  const [resolutionAmount, setResolutionAmount] = useState('900000');
  const [resolutionMemo, setResolutionMemo] = useState('HUG 조정 결과 반영');

  const settlement = settlementInfo as
    | readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, `0x${string}`, `0x${string}`, `0x${string}`]
    | undefined;

  const { data: holdCap } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getSettlementHoldCap',
    args: leaseReady ? [leaseId as `0x${string}`] : undefined,
    query: {
      enabled: leaseReady,
      refetchInterval: 5000,
    },
  });

  const settlementStatusNum = settlement ? Number(settlement[0]) : 0;
  const claimDeadline = settlement?.[2];
  const responseDeadline = settlement?.[3];
  const claimedAmount = settlement?.[4];
  const heldAmount = settlement?.[5];
  const immediateReturnAmount = settlement?.[6];
  const finalLandlordAmount = settlement?.[7];

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const connectedRole = useMemo(() => {
    if (!address) return '연결 안 됨';
    if (tenantAddress && address.toLowerCase() === tenantAddress.toLowerCase()) return '임차인';
    if (landlordAddress && address.toLowerCase() === landlordAddress.toLowerCase()) return '임대인';
    if (address.toLowerCase() === DEPLOYMENT_META.deployer.toLowerCase()) return 'HUG 관리자';
    return '조회 전용';
  }, [address, landlordAddress, tenantAddress]);

  const isTenant = connectedRole === '임차인';
  const isLandlord = connectedRole === '임대인';
  const isHug = connectedRole === 'HUG 관리자';
  const evidenceSignature = evidenceFiles
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .join('|');
  const expired = remainingDays !== undefined && remainingDays <= BigInt(0);
  const canRequestMoveOut =
    leaseReady &&
    expired &&
    (stateNum === 1 || stateNum === 3) &&
    settlementStatusNum === 0 &&
    (isTenant || isLandlord);
  const canFinalizeAfterDeadline =
    settlementStatusNum === 2 &&
    responseDeadline !== undefined &&
    responseDeadline > BigInt(0) &&
    nowSec > responseDeadline;

  useEffect(() => {
    setUploadedEvidence(null);
    setUploadError('');
  }, [evidenceMemo, evidenceSignature, leaseId]);

  useEffect(() => {
    if (!receipt || handledReceiptRef.current === receipt.transactionHash) return;
    handledReceiptRef.current = receipt.transactionHash;

    const action = actionRef.current;
    actionRef.current = null;

    if (action === 'moveout') {
      onActivity({
        title: '퇴실 요청이 접수됐어요',
        description: '이제 72시간 안에 임대인이 제한된 범위에서만 정산 청구를 넣을 수 있습니다.',
        tone: 'success',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (action === 'claim') {
      onActivity({
        title: '정산 청구가 등록됐어요',
        description: '무분쟁 금액은 즉시 반환되고, 분쟁 금액만 보류 상태로 전환됩니다.',
        tone: 'warning',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (action === 'tenant-dispute') {
      onActivity({
        title: '임차인 이의 제기가 기록됐어요',
        description: '이제 HUG 관리자 지갑에서 최종 배분을 확정할 수 있습니다.',
        tone: 'warning',
        txHash: receipt.transactionHash,
        leaseId,
      });
      return;
    }

    if (
      action === 'tenant-accept-full' ||
      action === 'tenant-accept-partial' ||
      action === 'deadline-finalize' ||
      action === 'hug-resolve'
    ) {
      onSettlementResolved({
        leaseId,
        txHash: receipt.transactionHash,
        depositKRW: activeLease?.depositKRW,
        durationDays: activeLease?.durationDays,
        propertyLabel: activeLease?.propertyLabel,
        propertyId: activeLease?.propertyId,
        tenant: tenantAddress || activeLease?.tenant,
        landlord: landlordAddress || activeLease?.landlord,
      });
      onActivity({
        title: '퇴실 정산이 확정됐어요',
        description: '보류 금액이 최종 배분되었고 계약 상태는 반환 완료로 전환됩니다.',
        tone: 'success',
        txHash: receipt.transactionHash,
        leaseId,
      });
    }
  }, [
    activeLease?.depositKRW,
    activeLease?.durationDays,
    activeLease?.landlord,
    activeLease?.propertyId,
    activeLease?.propertyLabel,
    activeLease?.tenant,
    landlordAddress,
    leaseId,
    onActivity,
    onSettlementResolved,
    receipt,
    tenantAddress,
  ]);

  function handleMoveOut() {
    actionRef.current = 'moveout';
    onActivity({
      title: '퇴실 요청을 전송했어요',
      description: '계약을 퇴실 정산 모드로 전환하고 검수 시간을 시작합니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'requestMoveOut',
      args: [leaseId as `0x${string}`],
    });
  }

  function handleClaim() {
    const normalizedAmount = digitsOnly(claimAmount);
    const evidenceHash = uploadedEvidence?.bundleHash;
    if (!normalizedAmount || !evidenceHash) return;

    actionRef.current = 'claim';
    onActivity({
      title: '정산 청구를 전송했어요',
      description: '업로드한 증빙 번들 해시와 함께 카테고리 상한, 보류 한도를 체인에서 검증합니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'submitSettlementClaim',
      args: [
        leaseId as `0x${string}`,
        Number(category),
        parseEther(normalizedAmount),
        evidenceHash,
      ],
    });
  }

  async function handleEvidenceUpload() {
    if (!leaseReady || evidenceFiles.length === 0) {
      setUploadError('증빙 파일을 먼저 선택해 주세요.');
      return;
    }

    setIsUploadingEvidence(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('leaseId', leaseId);
      formData.append('note', evidenceMemo);
      if (address) formData.append('uploader', address);
      evidenceFiles.forEach((file) => formData.append('files', file));

      const response = await fetch('/api/evidence', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || '증빙 업로드에 실패했습니다.');
      }

      const bundle = (await response.json()) as EvidenceBundleRecord;
      setUploadedEvidence(bundle);
      onActivity({
        title: '증빙 업로드가 완료됐어요',
        description:
          bundle.storageMode === 'stateless-hash'
            ? `${bundle.files.length}개 파일의 해시 번들을 생성했습니다. 외부 배포 환경에서는 원본 파일 대신 해시와 manifest만 사용합니다.`
            : `${bundle.files.length}개 파일을 저장하고 번들 해시를 생성했습니다. 이제 이 해시를 정산 청구에 넣을 수 있습니다.`,
        tone: 'success',
        leaseId,
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '증빙 업로드에 실패했습니다.');
    } finally {
      setIsUploadingEvidence(false);
    }
  }

  function handleTenantAcceptFull() {
    const responseHash = hashText(responseMemo);
    if (!claimedAmount || !responseHash) return;

    actionRef.current = 'tenant-accept-full';
    onActivity({
      title: '임차인 전액 수락 응답을 전송했어요',
      description: '보류 금액 전체가 임대인에게 정산되고 계약이 종료됩니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'respondToSettlementClaim',
      args: [leaseId as `0x${string}`, 0, claimedAmount, responseHash],
    });
  }

  function handleTenantAcceptPartial() {
    const normalizedAmount = digitsOnly(partialAcceptedAmount);
    const responseHash = hashText(responseMemo);
    if (!normalizedAmount || !responseHash) return;

    actionRef.current = 'tenant-accept-partial';
    onActivity({
      title: '임차인 부분 수락 응답을 전송했어요',
      description: '수락 금액만 임대인에게 배분하고 나머지는 임차인에게 반환합니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'respondToSettlementClaim',
      args: [
        leaseId as `0x${string}`,
        1,
        parseEther(normalizedAmount),
        responseHash,
      ],
    });
  }

  function handleTenantDispute() {
    const responseHash = hashText(responseMemo);
    if (!responseHash) return;

    actionRef.current = 'tenant-dispute';
    onActivity({
      title: '임차인 이의 제기를 전송했어요',
      description: '이제 HUG 관리자 또는 조정기관 결과를 반영할 수 있습니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'respondToSettlementClaim',
      args: [leaseId as `0x${string}`, 2, BigInt(0), responseHash],
    });
  }

  function handleFinalizeAfterDeadline() {
    actionRef.current = 'deadline-finalize';
    onActivity({
      title: '응답 기한 경과 정산 확정을 전송했어요',
      description: '임차인 미응답 규칙에 따라 보류 금액만 임대인에게 정산합니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'finalizeSettlementAfterDeadline',
      args: [leaseId as `0x${string}`],
    });
  }

  function handleResolveByHug() {
    const normalizedAmount = digitsOnly(resolutionAmount);
    const resolutionHash = hashText(resolutionMemo);
    if (!normalizedAmount || !resolutionHash) return;

    actionRef.current = 'hug-resolve';
    onActivity({
      title: 'HUG 최종 배분을 전송했어요',
      description: '조정 결과에 따라 임대인 몫을 확정하고 나머지를 임차인에게 반환합니다.',
      tone: 'info',
      leaseId,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'resolveSettlementByHug',
      args: [leaseId as `0x${string}`, parseEther(normalizedAmount), resolutionHash],
    });
  }

  if (!leaseReady) return null;

  return (
    <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">실제 온체인 퇴실 정산</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            방금 배포한 Sepolia 정산 모듈에 직접 연결된 영역입니다. 데모가 아니라 실제 트랜잭션으로 퇴실 요청, 정산 청구, 임차인 응답, HUG 배분을 실행합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200">
            연결 역할: {connectedRole}
          </span>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
            {SETTLEMENT_STATUS[settlementStatusNum] || '정산 없음'}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="계약 상태" value={CONTRACT_STATE[stateNum] || '미확인'} helper={formatAddress(leaseId, 10, 6)} />
        <MetricCard label="보류 상한" value={formatKRW(holdCap)} helper={depositAmount ? `보증금 기준 ${formatKRW(depositAmount)}` : undefined} />
        <MetricCard label="청구 금액" value={formatKRW(claimedAmount)} helper={claimDeadline ? `청구 마감 ${formatDateTimeFromUnix(claimDeadline)}` : '청구 전'} />
        <MetricCard label="즉시 반환 금액" value={formatKRW(immediateReturnAmount)} helper={responseDeadline ? `응답 마감 ${formatDateTimeFromUnix(responseDeadline)}` : '응답 전'} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="보류 중 금액" value={formatKRW(heldAmount)} />
        <MetricCard label="최종 임대인 배분" value={formatKRW(finalLandlordAmount)} />
        <MetricCard
          label="남은 일수"
          value={
            remainingDays === undefined
              ? '계산 중'
              : remainingDays > BigInt(0)
                ? `${remainingDays.toString()}일`
                : '만기 도래'
          }
          helper={`임차인 ${formatAddress(tenantAddress)} / 임대인 ${formatAddress(landlordAddress)}`}
        />
      </div>

      <div className="mt-5 space-y-4">
        {canRequestMoveOut ? (
          <ActionBlock
            title="1. 퇴실 요청 시작"
            description="만기 후 임차인 또는 임대인이 퇴실 정산 절차를 시작합니다. 이 시점부터 72시간 동안만 제한적 정산 청구가 가능합니다."
          >
            <button
              onClick={handleMoveOut}
              disabled={isPending || isConfirming}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isPending ? '지갑 승인 대기...' : isConfirming ? '퇴실 요청 확인 중...' : '퇴실 요청 시작'}
            </button>
          </ActionBlock>
        ) : null}

        {settlementStatusNum === 1 && isLandlord ? (
          <ActionBlock
            title="2. 임대인 정산 청구"
            description="청소비, 시설 파손, 공과금 등 제한된 범위에서만 정산 청구를 올릴 수 있습니다. 증빙 메모는 bytes32 해시로 변환되어 저장됩니다."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">청구 카테고리</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as (typeof CATEGORY_OPTIONS)[number]['value'])}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300/40"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} · {option.hint}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">청구 금액</span>
                <input
                  value={claimAmount}
                  onChange={(event) => setClaimAmount(digitsOnly(event.target.value))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
                />
                <p className="mt-2 text-xs text-slate-400">{formatInputKRW(claimAmount)}</p>
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">증빙 메모</span>
              <input
                value={evidenceMemo}
                onChange={(event) => setEvidenceMemo(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
                placeholder="퇴실 점검 사진/문서 설명"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">증빙 파일 업로드</span>
              <input
                ref={evidenceInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))}
                className="mt-2 block w-full rounded-2xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-4 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:border-cyan-300/30"
              />
              <p className="mt-2 text-xs text-slate-400">
                이미지 또는 PDF를 올리면 서버에 저장하고, 파일 해시를 묶어 bytes32 번들 해시를 생성합니다.
              </p>
            </label>
            {evidenceFiles.length > 0 ? (
              <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">선택한 증빙 파일 {evidenceFiles.length}개</p>
                  <button
                    onClick={() => {
                      setEvidenceFiles([]);
                      if (evidenceInputRef.current) evidenceInputRef.current.value = '';
                    }}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20"
                  >
                    파일 비우기
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {evidenceFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.lastModified}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{file.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleEvidenceUpload}
                disabled={evidenceFiles.length === 0 || isUploadingEvidence}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploadingEvidence ? '증빙 업로드 중...' : '증빙 업로드하고 해시 생성'}
              </button>
              {uploadedEvidence ? (
                <a
                  href={uploadedEvidence.manifestUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={uploadedEvidence.storageMode === 'stateless-hash' ? `evidence-manifest-${uploadedEvidence.bundleId}.json` : undefined}
                  className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  {uploadedEvidence.storageMode === 'stateless-hash' ? 'manifest 다운로드' : '증빙 manifest 보기'}
                </a>
              ) : null}
            </div>
            {uploadError ? (
              <p className="mt-3 text-sm text-rose-200">{uploadError}</p>
            ) : null}
            {uploadedEvidence ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-sm font-semibold text-white">업로드 완료된 증빙 번들</p>
                <p className="mt-2 break-all font-mono text-xs text-emerald-100">{uploadedEvidence.bundleHash}</p>
                {uploadedEvidence.storageMode === 'stateless-hash' ? (
                  <p className="mt-3 text-xs leading-6 text-emerald-50/85">
                    현재 외부 배포 환경에서는 원본 파일을 서버에 보관하지 않고, 해시 번들과 manifest만 생성합니다.
                  </p>
                ) : null}
                <div className="mt-3 space-y-2">
                  {uploadedEvidence.files.map((file) => (
                    <div
                      key={file.sha256}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{file.originalName}</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-400">{file.sha256}</p>
                      </div>
                      {file.url ? (
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-300/30"
                        >
                          파일 보기
                        </a>
                      ) : (
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                          해시만 저장
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleClaim}
                disabled={!digitsOnly(claimAmount) || !uploadedEvidence?.bundleHash || isPending || isConfirming}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isPending ? '지갑 승인 대기...' : isConfirming ? '청구 확인 중...' : '정산 청구 제출'}
              </button>
            </div>
            {!uploadedEvidence ? (
              <p className="mt-3 text-xs text-slate-400">
                정산 청구 전에는 최소 1개 이상의 증빙 파일을 업로드해 번들 해시를 만들어야 합니다.
              </p>
            ) : null}
          </ActionBlock>
        ) : null}

        {settlementStatusNum === 2 && isTenant ? (
          <ActionBlock
            title="3. 임차인 응답"
            description="전액 수락, 일부 수락, 이의 제기 중 하나를 선택해 실제 정산 흐름을 진행할 수 있습니다."
          >
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">응답 메모</span>
              <input
                value={responseMemo}
                onChange={(event) => setResponseMemo(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
                placeholder="수락 사유 또는 이의 제기 근거"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleTenantAcceptFull}
                disabled={!claimedAmount || !hashText(responseMemo) || isPending || isConfirming}
                className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                전액 수락
              </button>
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2">
                <input
                  value={partialAcceptedAmount}
                  onChange={(event) => setPartialAcceptedAmount(digitsOnly(event.target.value))}
                  className="w-28 bg-transparent text-sm text-white outline-none"
                />
                <button
                  onClick={handleTenantAcceptPartial}
                  disabled={!digitsOnly(partialAcceptedAmount) || !hashText(responseMemo) || isPending || isConfirming}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:border-emerald-300/30"
                >
                  일부 수락
                </button>
              </div>
              <button
                onClick={handleTenantDispute}
                disabled={!hashText(responseMemo) || isPending || isConfirming}
                className="rounded-full border border-rose-400/30 bg-rose-400/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                이의 제기
              </button>
            </div>
          </ActionBlock>
        ) : null}

        {canFinalizeAfterDeadline ? (
          <ActionBlock
            title="4. 응답 기한 경과 처리"
            description="임차인 응답 마감 시간을 넘기면 누구나 보류 금액 정산을 확정할 수 있습니다."
          >
            <button
              onClick={handleFinalizeAfterDeadline}
              disabled={isPending || isConfirming}
              className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/30 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? '지갑 승인 대기...' : isConfirming ? '정산 확정 중...' : '응답 기한 경과 정산 확정'}
            </button>
          </ActionBlock>
        ) : null}

        {settlementStatusNum === 3 && isHug ? (
          <ActionBlock
            title="5. HUG 최종 배분"
            description="분쟁 상태에서는 HUG 관리자 지갑이 임대인 배분 금액을 확정합니다. 나머지는 자동으로 임차인에게 돌아갑니다."
          >
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">임대인 배분 금액</span>
              <input
                value={resolutionAmount}
                onChange={(event) => setResolutionAmount(digitsOnly(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300/40"
              />
              <p className="mt-2 text-xs text-slate-400">{formatInputKRW(resolutionAmount)}</p>
            </label>
            <label className="mt-3 block">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">조정 메모</span>
              <input
                value={resolutionMemo}
                onChange={(event) => setResolutionMemo(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-300/40"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleResolveByHug}
                disabled={!digitsOnly(resolutionAmount) || !hashText(resolutionMemo) || isPending || isConfirming}
                className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isPending ? '지갑 승인 대기...' : isConfirming ? '조정 반영 중...' : 'HUG 최종 배분 확정'}
              </button>
            </div>
          </ActionBlock>
        ) : null}
      </div>

      {hash ? (
        <div className="mt-5">
          <a
            href={explorerLink('tx', hash)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-teal-300/30"
          >
            마지막 정산 tx 보기
          </a>
        </div>
      ) : null}
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
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/55 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 break-words text-sm leading-6 text-white [overflow-wrap:anywhere]">{value}</p>
      {helper ? <p className="mt-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">{helper}</p> : null}
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
