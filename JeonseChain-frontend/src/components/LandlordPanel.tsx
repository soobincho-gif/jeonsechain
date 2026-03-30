'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { decodeEventLog, isAddress, keccak256, parseEther, toBytes } from 'viem';
import { CONTRACT_ADDRESSES, VAULT_ABI } from '@/lib/contracts';
import { AddressRecord } from '@/lib/demo-data';
import { digitsOnly, explorerLink, formatInputKRW } from '@/lib/format';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';

type LandlordPanelProps = {
  activeLease: LeaseDraft | null;
  suggestedPropertyLabel?: string;
  selectedAddress?: AddressRecord | null;
  onLeaseCreated: (lease: LeaseDraft) => void;
  onActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
};

type SubmissionSnapshot = {
  tenant: string;
  depositKRW: string;
  durationDays: string;
  propertyLabel: string;
  propertyId: `0x${string}`;
  landlord?: string;
};

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

export default function LandlordPanel({
  activeLease,
  suggestedPropertyLabel,
  selectedAddress,
  onLeaseCreated,
  onActivity,
}: LandlordPanelProps) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [form, setForm] = useState({
    tenant: activeLease?.tenant ?? '',
    depositKRW: activeLease?.depositKRW ?? '300000000',
    durationDays: activeLease?.durationDays ?? '365',
    propertyLabel: activeLease?.propertyLabel ?? '서울-마포구-APT-101',
    leaseDocumentMemo: '',
    specialTermsMemo: '',
    checklistMemo: '',
  });
  const [lastLeaseId, setLastLeaseId] = useState(activeLease?.leaseId ?? '');
  const submittedRef = useRef<SubmissionSnapshot | null>(null);
  const handledReceiptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeLease?.tenant) return;
    setForm((current) => ({
      ...current,
      tenant: current.tenant || activeLease.tenant || '',
    }));
  }, [activeLease?.tenant]);

  useEffect(() => {
    if (!suggestedPropertyLabel) return;
    setForm((current) => {
      if (
        current.propertyLabel &&
        current.propertyLabel !== '서울-마포구-APT-101' &&
        current.propertyLabel !== activeLease?.propertyLabel
      ) {
        return current;
      }

      return {
        ...current,
        propertyLabel: suggestedPropertyLabel,
      };
    });
  }, [activeLease?.propertyLabel, suggestedPropertyLabel]);

  const normalizedDeposit = digitsOnly(form.depositKRW);
  const normalizedDuration = digitsOnly(form.durationDays);
  const normalizedPropertyLabel = form.propertyLabel.trim();
  const normalizedLeaseDocumentMemo = form.leaseDocumentMemo.trim();
  const normalizedSpecialTermsMemo = form.specialTermsMemo.trim();
  const normalizedChecklistMemo = form.checklistMemo.trim();
  const hasDocumentInputs =
    Boolean(normalizedLeaseDocumentMemo) ||
    Boolean(normalizedSpecialTermsMemo) ||
    Boolean(normalizedChecklistMemo);
  const propertyId = keccak256(toBytes(normalizedPropertyLabel || 'unknown-property')) as `0x${string}`;
  const tenantValid = isAddress(form.tenant);
  const walletReady = Boolean(address);
  const canSubmit =
    walletReady &&
    tenantValid &&
    Boolean(normalizedDeposit) &&
    Boolean(normalizedDuration) &&
    Number(normalizedDuration) >= 365 &&
    Boolean(normalizedPropertyLabel);
  const riskMeta = selectedAddress ? getRiskMeta(selectedAddress.riskScore, selectedAddress.riskLabel) : null;

  useEffect(() => {
    if (!receipt || handledReceiptRef.current === receipt.transactionHash) return;
    handledReceiptRef.current = receipt.transactionHash;

    let detectedLeaseId = '';

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: VAULT_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'LeaseRegistered') {
          detectedLeaseId = String(decoded.args.leaseId);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!detectedLeaseId) return;

    const snapshot = submittedRef.current;

    setLastLeaseId(detectedLeaseId);
    onLeaseCreated({
      leaseId: detectedLeaseId,
      tenant: snapshot?.tenant,
      landlord: snapshot?.landlord,
      depositKRW: snapshot?.depositKRW,
      durationDays: snapshot?.durationDays,
      propertyLabel: snapshot?.propertyLabel,
      propertyId: snapshot?.propertyId,
      txHash: receipt.transactionHash,
    });
    onActivity({
      title: '계약 등록이 완료됐어요',
      description: 'leaseId를 자동 추출해서 임차인 단계와 실시간 모니터에 연결했습니다.',
      tone: 'success',
      leaseId: detectedLeaseId,
      txHash: receipt.transactionHash,
    });
  }, [onActivity, onLeaseCreated, receipt]);

  function handleRegister() {
    if (!address || !canSubmit) return;

    const leaseDocumentHash = hasDocumentInputs
      ? (keccak256(toBytes(normalizedLeaseDocumentMemo || `${normalizedPropertyLabel}|${normalizedDeposit}|${normalizedDuration}`)) as `0x${string}`)
      : undefined;
    const specialTermsHash = normalizedSpecialTermsMemo
      ? (keccak256(toBytes(normalizedSpecialTermsMemo)) as `0x${string}`)
      : undefined;
    const checklistHash = normalizedChecklistMemo
      ? (keccak256(toBytes(normalizedChecklistMemo)) as `0x${string}`)
      : undefined;

    submittedRef.current = {
      tenant: form.tenant,
      depositKRW: normalizedDeposit,
      durationDays: normalizedDuration,
      propertyLabel: normalizedPropertyLabel,
      propertyId,
      landlord: address,
    };

    onActivity({
      title: '계약 등록 요청을 보냈어요',
      description: hasDocumentInputs
        ? '문서 메모 해시와 함께 계약을 등록합니다. 승인 후 leaseId가 생성되면 다음 단계로 이어집니다.'
        : '지갑 승인 후 leaseId가 생성되면 자동으로 다음 단계에 채워집니다.',
      tone: 'info',
    });

    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: hasDocumentInputs ? 'registerLeaseWithDocuments' : 'registerLease',
      args: hasDocumentInputs
        ? [
            form.tenant as `0x${string}`,
            parseEther(normalizedDeposit),
            BigInt(normalizedDuration),
            propertyId,
            leaseDocumentHash!,
            specialTermsHash ?? ZERO_BYTES32,
            checklistHash ?? ZERO_BYTES32,
          ]
        : [
            form.tenant as `0x${string}`,
            parseEther(normalizedDeposit),
            BigInt(normalizedDuration),
            propertyId,
          ],
    });
  }

  async function copyLeaseId() {
    if (!lastLeaseId) return;
    await navigator.clipboard.writeText(lastLeaseId);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,320px)]">
        <div className="rounded-[26px] border border-white/10 bg-slate-950/35 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-teal-200/80">Landlord Workspace</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">임대인 계약 등록</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                계약 내용을 온체인에 등록하면 leaseId를 자동으로 저장하고, 임차인 납입 단계까지 같은 계약 문맥을 유지합니다.
              </p>
            </div>
            <span className="self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              Oracle pre-screen 포함
            </span>
          </div>

          {!walletReady ? (
            <div className="mt-5 rounded-[22px] border border-amber-400/20 bg-amber-400/10 px-4 py-4">
              <p className="text-sm font-semibold text-white">지갑 연결 후 등록을 시작할 수 있어요</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                지금은 입력값을 미리 채워볼 수 있고, 실제 `계약 등록 시작` 실행은 상단 `Connect Wallet` 연결 후 활성화됩니다.
              </p>
            </div>
          ) : null}

          {selectedAddress && riskMeta ? (
            <div className={`mt-5 rounded-[24px] border px-4 py-4 ${riskMeta.surfaceClass}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">주소 선택 직후 리스크 사전 점검</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    {selectedAddress.roadAddress}
                    <span className="mx-2 text-slate-500">·</span>
                    {selectedAddress.building}
                  </p>
                </div>
                <span className={`self-start rounded-full border px-3 py-1 text-xs font-semibold ${riskMeta.badgeClass}`}>
                  {riskMeta.badgeLabel}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <SummaryRow label="현재 위험 점수" value={`${selectedAddress.riskScore}점`} />
                <SummaryRow label="추천 판단" value={riskMeta.recommendation} />
                <SummaryRow label="권장 액션" value={riskMeta.nextAction} />
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-200/90">{riskMeta.description}</p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="임차인 주소" helper="보증금을 실제로 납입할 지갑 주소">
              <input
                value={form.tenant}
                onChange={(event) => setForm((current) => ({ ...current, tenant: event.target.value.trim() }))}
                placeholder="0x..."
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
              {!tenantValid && form.tenant ? (
                <p className="mt-2 text-xs text-rose-300">유효한 EVM 주소 형식이 필요합니다.</p>
              ) : null}
            </Field>

            <Field label="보증금" helper="KRW 토큰 기준 금액">
              <input
                value={form.depositKRW}
                onChange={(event) => setForm((current) => ({ ...current, depositKRW: digitsOnly(event.target.value) }))}
                placeholder="300000000"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
              <p className="mt-2 text-xs text-slate-400">{formatInputKRW(normalizedDeposit)}</p>
            </Field>

            <Field label="임대 기간" helper="컨트랙트 최소 365일">
              <input
                value={form.durationDays}
                onChange={(event) => setForm((current) => ({ ...current, durationDays: digitsOnly(event.target.value) }))}
                placeholder="365"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
              <p className={`mt-2 text-xs ${Number(normalizedDuration) >= 365 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {normalizedDuration ? `${normalizedDuration}일 계약` : '일수를 입력하세요'}
              </p>
            </Field>

            <Field label="부동산 라벨" helper="라벨은 propertyId 해시로 변환됩니다.">
              <input
                value={form.propertyLabel}
                onChange={(event) => setForm((current) => ({ ...current, propertyLabel: event.target.value }))}
                placeholder="서울-마포구-APT-101"
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
              {suggestedPropertyLabel ? (
                <p className="mt-2 text-xs text-cyan-200">
                  주소 검색에서 선택한 제안값이 반영돼 있습니다.
                </p>
              ) : null}
              <p className="mt-2 min-w-0 truncate font-mono text-xs text-slate-500">{propertyId}</p>
            </Field>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Field label="계약서 메모" helper="원문 대신 요약 메모를 해시로 저장합니다.">
              <textarea
                value={form.leaseDocumentMemo}
                onChange={(event) => setForm((current) => ({ ...current, leaseDocumentMemo: event.target.value }))}
                placeholder="계약서 핵심 내용, 주소, 보증금, 기간 등"
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
            </Field>

            <Field label="특약 메모" helper="특약이 있으면 별도 해시로 같이 남깁니다.">
              <textarea
                value={form.specialTermsMemo}
                onChange={(event) => setForm((current) => ({ ...current, specialTermsMemo: event.target.value }))}
                placeholder="수리 책임, 반환 조건, 추가 합의 등"
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
            </Field>

            <Field label="입주 체크리스트 메모" helper="입주 상태나 사진 정리 메모를 해시로 보관합니다.">
              <textarea
                value={form.checklistMemo}
                onChange={(event) => setForm((current) => ({ ...current, checklistMemo: event.target.value }))}
                placeholder="하자, 비품, 사진 묶음 설명 등"
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleRegister}
              disabled={!canSubmit || isPending || isConfirming}
              className="rounded-full bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {!walletReady
                ? '지갑 연결 후 등록 가능'
                : isPending
                  ? '지갑 승인 대기...'
                  : isConfirming
                    ? '블록 확인 중...'
                    : '계약 등록 시작'}
            </button>
            {hash ? (
              <a
                href={explorerLink('tx', hash)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-200 transition hover:border-teal-300/30"
              >
                현재 tx 보기
              </a>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-slate-950/45 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">등록 미리보기</p>
            <div className="mt-4 space-y-4">
              <SummaryRow label="예상 보증금" value={formatInputKRW(normalizedDeposit)} />
              <SummaryRow label="계약 기간" value={`${normalizedDuration || '0'}일`} />
              <SummaryRow label="propertyId" value={propertyId.slice(0, 16) + '...'} />
              <SummaryRow label="문서 해시 등록" value={hasDocumentInputs ? '포함됨' : '이번엔 생략'} />
              <SummaryRow label="다음 단계" value="임차인 승인 및 납입" />
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-semibold text-white">등록 후 흐름</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <li>등록 후 leaseId가 자동으로 추출돼 다음 단계로 바로 이어집니다.</li>
              <li>Etherscan에서 로그를 직접 찾지 않아도 됩니다.</li>
              <li>선택한 계약은 브라우저에 저장돼 새로고침 후에도 유지됩니다.</li>
            </ul>
          </div>
        </div>
      </div>

      {(isSuccess || lastLeaseId) && (
        <div className="rounded-[26px] border border-emerald-400/20 bg-emerald-400/10 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-100">계약 등록 완료</p>
              <p className="mt-2 text-sm leading-6 text-emerald-50/85">
                생성된 leaseId는 임차인 패널과 계약 모니터에 자동으로 전달됩니다.
              </p>
              <p className="mt-3 break-all font-mono text-xs text-white">{lastLeaseId}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                onClick={copyLeaseId}
                className="rounded-full border border-emerald-100/20 px-4 py-2 text-sm text-emerald-50 transition hover:border-emerald-100/40 sm:w-auto"
              >
                leaseId 복사
              </button>
              {hash ? (
                <a
                  href={explorerLink('tx', hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-emerald-100/20 px-4 py-2 text-sm text-emerald-50 transition hover:border-emerald-100/40 sm:w-auto"
                >
                  트랜잭션 보기
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <span className="mt-1 block text-xs text-slate-500">{helper}</span>
      <div className="mt-3">{children}</div>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <span className="min-w-0 break-all text-sm font-medium text-white [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function getRiskMeta(score: number, label: AddressRecord['riskLabel']) {
  if (label === 'Safe' || score >= 75) {
    return {
      badgeLabel: '계약 진행 추천',
      recommendation: '바로 진행 가능',
      nextAction: '보증금·기간 입력 후 등록',
      description: '최근 위험 점수가 안정권이라 등록 단계로 바로 넘어가도 설명이 자연스럽습니다.',
      surfaceClass: 'border-emerald-400/20 bg-emerald-400/10',
      badgeClass: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    };
  }

  if (label === 'Monitor' || score >= 55) {
    return {
      badgeLabel: '조건 확인 후 진행',
      recommendation: '추가 확인 필요',
      nextAction: '계약 특약과 위험 근거 같이 검토',
      description: '경고 단계는 아니지만, 보증금 규모와 담보·등기 신호를 함께 설명해주면 더 설득력 있는 데모가 됩니다.',
      surfaceClass: 'border-amber-400/20 bg-amber-400/10',
      badgeClass: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
    };
  }

  return {
    badgeLabel: '추가 검토 없이는 비추천',
    recommendation: '등록 전 재검토',
    nextAction: '다른 주소 비교 또는 보호 조건 강화',
    description: '이 주소는 현재 위험 구간이라, 그대로 등록하기보다 위험 근거를 확인하거나 다른 후보를 비교해보는 흐름이 더 적절합니다.',
    surfaceClass: 'border-rose-400/20 bg-rose-400/10',
    badgeClass: 'border-rose-300/25 bg-rose-300/10 text-rose-100',
  };
}
