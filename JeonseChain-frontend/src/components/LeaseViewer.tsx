'use client';

import { useEffect, useRef, useState } from 'react';
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { decodeEventLog } from 'viem';
import {
  CONTRACT_ADDRESSES,
  CONTRACT_STATE,
  NETWORK_LABEL,
  SETTLEMENT_STATUS,
  STATE_COLOR,
  STATE_DESCRIPTION,
  VAULT_ABI,
} from '@/lib/contracts';
import {
  explorerLink,
  formatAddress,
  formatDateTimeFromUnix,
  formatFullAddress,
  formatKRW,
  isMeaningfulAddress,
} from '@/lib/format';
import { buildSepoliaShowcaseLeasePresets } from '@/lib/showcase-leases';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';
import OnchainLeaseChangePanel from '@/components/OnchainLeaseChangePanel';
import OnchainSettlementPanel from '@/components/OnchainSettlementPanel';

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const;

type LeaseViewerProps = {
  activeLease: LeaseDraft | null;
  onLeaseSelected: (leaseId: string) => void;
  onReturnComplete: (lease: LeaseDraft) => void;
  onActivity: (activity: Omit<ActivityItem, 'id' | 'timestamp'>) => void;
};

export default function LeaseViewer({
  activeLease,
  onLeaseSelected,
  onReturnComplete,
  onActivity,
}: LeaseViewerProps) {
  const [leaseId, setLeaseId] = useState(activeLease?.leaseId ?? '');
  const [queried, setQueried] = useState(activeLease?.leaseId ?? '');
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  const handledReceiptRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeLease?.leaseId) return;
    setLeaseId(activeLease.leaseId);
    setQueried(activeLease.leaseId);
  }, [activeLease?.leaseId]);

  const leaseReady = queried.startsWith('0x') && queried.length === 66;

  const { data: info, isLoading: infoLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getDepositInfo',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: {
      enabled: leaseReady,
      refetchInterval: 5000,
    },
  });

  const { data: remainingDays, isLoading: daysLoading } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getRemainingDays',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: {
      enabled: leaseReady,
      refetchInterval: 5000,
    },
  });

  const { data: leaseData } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'leases',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: {
      enabled: leaseReady,
      refetchInterval: 5000,
    },
  });

  const landlordAddress = leaseData?.[1];

  const { data: settlementInfo } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getSettlementInfo',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: {
      enabled: leaseReady,
      refetchInterval: 5000,
    },
  });

  const { data: protectedAssets } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getProtectedAssets',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: { enabled: leaseReady, refetchInterval: 10000 },
  });

  const { data: leaseDocuments } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getLeaseDocuments',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: { enabled: leaseReady, refetchInterval: 10000 },
  });

  const { data: leaseTrustRecord } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getLeaseTrustRecord',
    args: leaseReady ? [queried as `0x${string}`] : undefined,
    query: { enabled: leaseReady, refetchInterval: 10000 },
  });

  const { data: frozenTokens } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'frozenTokens',
    args: landlordAddress ? [landlordAddress] : undefined,
    query: {
      enabled: !!landlordAddress,
      refetchInterval: 5000,
    },
  });

  const stateNum = info ? Number(info[4]) : -1;
  const settlementStatusNum = settlementInfo ? Number(settlementInfo[0]) : 0;
  const settlementClaimDeadline = settlementInfo?.[2];
  const settlementEvidenceHash = settlementInfo?.[8];
  const tenantResponseHash = settlementInfo?.[9];
  const resolutionHash = settlementInfo?.[10];
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const settlementAllowsReturn =
    settlementStatusNum === 0 ||
    (
      settlementStatusNum === 1 &&
      settlementClaimDeadline !== undefined &&
      settlementClaimDeadline > BigInt(0) &&
      nowSec > settlementClaimDeadline
    );
  const canExecuteReturnState = stateNum === 1 || stateNum === 3;
  const canReturn =
    canExecuteReturnState &&
    remainingDays !== undefined &&
    remainingDays <= BigInt(0) &&
    settlementAllowsReturn;
  const returnStatusText = canReturn ? '실행 가능' : '대기 중';
  const returnHelperText =
    stateNum === -1 || remainingDays === undefined
      ? '계약 상태와 만기 정보를 읽는 중입니다.'
      : !canExecuteReturnState
        ? `현재 상태(${CONTRACT_STATE[stateNum] || '미확인'})에서는 자동 반환을 실행할 수 없습니다.`
        : remainingDays > BigInt(0)
          ? '만기 전에는 자동 반환을 실행할 수 없습니다.'
          : settlementStatusNum === 1 &&
              settlementClaimDeadline !== undefined &&
              settlementClaimDeadline > BigInt(0) &&
              nowSec <= settlementClaimDeadline
            ? '퇴실 정산 청구 마감 전이라 자동 반환이 잠시 잠겨 있습니다.'
            : settlementStatusNum !== 0
              ? '정산 절차가 진행 중이거나 이미 정리되어 자동 반환 대신 정산 결과를 확인해야 합니다.'
              : '자동 반환 조건이 모두 충족되면 실행할 수 있습니다.';

  useEffect(() => {
    if (!receipt || handledReceiptRef.current === receipt.transactionHash) return;
    handledReceiptRef.current = receipt.transactionHash;

    let returnedLeaseId = queried;

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: VAULT_ABI,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'DepositReturned') {
          returnedLeaseId = String(decoded.args.leaseId);
          break;
        }
      } catch {
        continue;
      }
    }

    onReturnComplete({
      leaseId: returnedLeaseId,
      txHash: receipt.transactionHash,
      depositKRW: activeLease?.depositKRW,
      durationDays: activeLease?.durationDays,
      propertyLabel: activeLease?.propertyLabel,
      propertyId: activeLease?.propertyId,
      tenant: info ? String(info[0]) : activeLease?.tenant,
      landlord: info ? String(info[1]) : activeLease?.landlord,
    });
    onActivity({
      title: '자동 반환 실행 완료',
      description: '만기 조건을 만족해 임차인에게 보증금이 반환되었습니다.',
      tone: 'success',
      txHash: receipt.transactionHash,
      leaseId: returnedLeaseId,
    });
  }, [
    activeLease?.depositKRW,
    activeLease?.durationDays,
    activeLease?.landlord,
    activeLease?.propertyId,
    activeLease?.propertyLabel,
    activeLease?.tenant,
    info,
    onActivity,
    onReturnComplete,
    queried,
    receipt,
  ]);

  function handleQuery() {
    if (!leaseId) return;
    setQueried(leaseId.trim());
    onLeaseSelected(leaseId.trim());
  }

  function handleReturn() {
    if (!leaseReady) return;
    onActivity({
      title: '자동 반환 실행 요청',
      description: '만기 조건을 다시 확인한 뒤 반환 트랜잭션을 보냅니다.',
      tone: 'info',
      leaseId: queried,
    });
    writeContract({
      address: CONTRACT_ADDRESSES.JeonseVault,
      abi: VAULT_ABI,
      functionName: 'executeReturn',
      args: [queried as `0x${string}`],
    });
  }

  const loading = infoLoading || daysLoading;
  const showcasePresets = buildSepoliaShowcaseLeasePresets(activeLease?.leaseId);
  const hasLeaseRecord =
    Boolean(info) &&
    Boolean(leaseData) &&
    isMeaningfulAddress(info ? String(info[0]) : undefined) &&
    Boolean(leaseData && leaseData[4] > BigInt(0));

  function loadShowcaseLease(nextLeaseId: string, title: string) {
    setLeaseId(nextLeaseId);
    setQueried(nextLeaseId);
    onLeaseSelected(nextLeaseId);
    onActivity({
      title,
      description: 'Sepolia 직접 시연용 leaseId를 불러왔습니다. 상태와 반환 가능 여부를 바로 확인할 수 있습니다.',
      tone: 'info',
      leaseId: nextLeaseId,
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_340px]">
        <div className="rounded-[26px] border border-white/10 bg-slate-950/35 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-teal-200/80">계약 조회</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">내 계약 상세 조회</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                계약 ID를 입력하면 현재 상태, 리스크 플래그, 만기까지 남은 시간, 자동 반환 가능 여부를 확인할 수 있습니다.
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
              실시간 갱신
            </span>
          </div>

          <div className="mt-5 rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{NETWORK_LABEL} 직접 시연 바로가기</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  새 계약은 ACTIVE 상태까지 바로 보여주고, 자동 반환은 별도로 준비한 반환 가능 leaseId로 불러오는 방식이 가장
                  자연스럽습니다.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-100">
                ACTIVE 시연 / 반환 시연 분리
              </span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-3">
              {showcasePresets.map((preset) => (
                <ShowcaseLeaseCard
                  key={preset.id}
                  title={preset.title}
                  description={preset.description}
                  helper={preset.helper}
                  leaseId={preset.leaseId}
                  tone={preset.tone}
                  buttonLabel={preset.buttonLabel}
                  disabled={preset.disabled}
                  onClick={
                    preset.leaseId && preset.buttonLabel
                      ? () => loadShowcaseLease(preset.leaseId!, `${preset.title} 불러오기`)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-[24px] border border-white/10 bg-slate-900/60 p-4 md:flex-row">
            <input
              value={leaseId}
              onChange={(event) => setLeaseId(event.target.value)}
              placeholder="계약 ID (0x...)"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-teal-300/40"
            />
            <button
              onClick={handleQuery}
              disabled={!leaseId}
              className="rounded-2xl bg-teal-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              계약 불러오기
            </button>
          </div>

          {!leaseReady ? (
            <EmptyState
              title="선택된 계약이 아직 없어요"
              description="등록 또는 임차인 단계에서 이어받은 leaseId가 있으면 자동 입력되고, 직접 붙여넣어서 조회할 수도 있습니다."
            />
          ) : loading ? (
            <LoadingState />
          ) : hasLeaseRecord && info ? (
            <>
              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_COLOR[stateNum] || 'border border-white/10 bg-white/[0.04] text-slate-200'}`}>
                    {CONTRACT_STATE[stateNum] || '알 수 없음'}
                  </span>
                  <span className="text-xs text-slate-400" title={STATE_DESCRIPTION[stateNum]}>
                    {STATE_DESCRIPTION[stateNum] || '상태 설명 없음'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <InfoBox label="임차인" value={formatFullAddress(String(info[0]))} mono />
                  <InfoBox label="임대인" value={formatFullAddress(String(info[1]))} mono />
                  <InfoBox label="보증금 원금" value={formatKRW(info[2])} />
                  <InfoBox label="볼트 현재 가치" value={formatKRW(info[3])} />
                  {protectedAssets && (
                    <>
                      <InfoBox
                        label="모의 누적 수익 (연 3%)"
                        value={formatKRW(protectedAssets[1])}
                        highlight
                      />
                      <InfoBox
                        label="총 보호 자산"
                        value={formatKRW(protectedAssets[2])}
                        highlight
                      />
                    </>
                  )}
                  <InfoBox
                    label="남은 일수"
                    value={
                      remainingDays === undefined
                        ? '계산 중'
                        : remainingDays > BigInt(0)
                          ? `${remainingDays.toString()}일`
                          : '만기 도래'
                    }
                  />
                  <InfoBox
                    label="토큰 상태"
                    value={frozenTokens ? '동결' : '정상'}
                    helper={frozenTokens ? 'HUG 중재 필요' : '이전 가능'}
                  />
                  <InfoBox label="계약 시작" value={formatDateTimeFromUnix(leaseData?.[3])} />
                  <InfoBox label="만기 예정" value={formatDateTimeFromUnix(leaseData?.[4])} />
                  <InfoBox
                    label="퇴실 정산 상태"
                    value={SETTLEMENT_STATUS[settlementStatusNum] || '정산 없음'}
                    helper={
                      settlementClaimDeadline && settlementClaimDeadline > BigInt(0)
                        ? `청구 마감 ${formatDateTimeFromUnix(settlementClaimDeadline)}`
                        : '정산 흐름이 아직 시작되지 않았습니다.'
                    }
                  />
                </div>
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">자동 반환 실행</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      만기 후에는 누구나 반환 트랜잭션을 실행할 수 있어 집행 임의성을 줄입니다. 다만 퇴실 정산이 시작된 뒤 청구 마감 전이라면 자동 반환은 잠시 잠깁니다.
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      canReturn
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300'
                    }`}
                  >
                    {returnStatusText}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400">{returnHelperText}</p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={handleReturn}
                    disabled={!canReturn || isPending || isConfirming}
                    className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {isPending ? '지갑 승인 대기...' : isConfirming ? '반환 확인 중...' : '보증금 자동 반환 실행'}
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

              <div className="mt-5 rounded-[24px] border border-white/10 bg-slate-950/45 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">온체인 계약 근거</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      원래 계약 등록 시 남긴 문서 해시와, 퇴실 정산 과정에서 별도로 기록되는 evidenceHash·응답 해시·조정 해시를 분리해서 보여줍니다.
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                    문서 + 정산 기록
                  </span>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <InfoBox
                    label="문서 해시 첨부"
                    value={leaseTrustRecord?.[0] ? '등록됨' : '아직 없음'}
                    helper={
                      leaseDocuments?.[3] && leaseDocuments[3] > BigInt(0)
                        ? `기록 시각 ${formatDateTimeFromUnix(leaseDocuments[3])}`
                        : '계약 등록 시 계약서·특약·체크리스트 해시를 별도로 남길 수 있습니다.'
                    }
                  />
                  <InfoBox
                    label="정상 종료 기록"
                    value={leaseTrustRecord?.[1] ? '확인됨' : '대기 중'}
                    helper="분쟁 없이 계약 종료되면 true로 기록됩니다."
                  />
                  <InfoBox
                    label="제때 반환"
                    value={leaseTrustRecord?.[2] ? '기록됨' : '미기록'}
                    helper="만기 후 7일 내 반환되면 신뢰 이벤트가 남습니다."
                  />
                  <InfoBox
                    label="분쟁 / 응답 이력"
                    value={
                      leaseTrustRecord?.[3]
                        ? '분쟁 발생'
                        : leaseTrustRecord?.[4]
                          ? '응답 기한 준수'
                          : '아직 없음'
                    }
                    helper="퇴실 정산 중 분쟁 발생과 기한 내 응답 여부를 함께 기록합니다."
                  />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <InfoBox
                    label="계약서 해시"
                    value={hasMeaningfulHash(leaseDocuments?.[0]) ? formatAddress(String(leaseDocuments?.[0]), 10, 8) : '없음'}
                    helper="원문 대신 요약 또는 PDF 해시"
                    mono
                  />
                  <InfoBox
                    label="특약 해시"
                    value={hasMeaningfulHash(leaseDocuments?.[1]) ? formatAddress(String(leaseDocuments?.[1]), 10, 8) : '없음'}
                    helper="특약 또는 추가 합의 해시"
                    mono
                  />
                  <InfoBox
                    label="체크리스트 해시"
                    value={hasMeaningfulHash(leaseDocuments?.[2]) ? formatAddress(String(leaseDocuments?.[2]), 10, 8) : '없음'}
                    helper="계약 등록 시 남긴 체크리스트 해시"
                    mono
                  />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <InfoBox
                    label="정산 evidenceHash"
                    value={hasMeaningfulHash(settlementEvidenceHash) ? formatAddress(String(settlementEvidenceHash), 10, 8) : '없음'}
                    helper="submitSettlementClaim 때 기록되는 증빙 번들 해시"
                    mono
                  />
                  <InfoBox
                    label="임차인 응답 해시"
                    value={hasMeaningfulHash(tenantResponseHash) ? formatAddress(String(tenantResponseHash), 10, 8) : '없음'}
                    helper="respondToSettlementClaim 때 기록되는 응답 해시"
                    mono
                  />
                  <InfoBox
                    label="HUG 조정 해시"
                    value={hasMeaningfulHash(resolutionHash) ? formatAddress(String(resolutionHash), 10, 8) : '없음'}
                    helper="resolveSettlementByHug 때 기록되는 최종 조정 해시"
                    mono
                  />
                </div>
              </div>

              <OnchainLeaseChangePanel
                leaseId={queried}
                leaseReady={leaseReady}
                stateNum={stateNum}
                remainingDays={remainingDays}
                tenantAddress={info ? String(info[0]) : undefined}
                landlordAddress={info ? String(info[1]) : undefined}
                onActivity={onActivity}
              />

              <OnchainSettlementPanel
                activeLease={activeLease}
                leaseId={queried}
                leaseReady={leaseReady}
                stateNum={stateNum}
                remainingDays={remainingDays}
                tenantAddress={info ? String(info[0]) : undefined}
                landlordAddress={info ? String(info[1]) : undefined}
                depositAmount={info?.[2]}
                settlementInfo={settlementInfo}
                onActivity={onActivity}
                onSettlementResolved={onReturnComplete}
              />
            </>
          ) : (
            <EmptyState
              title="온체인 계약 데이터를 찾지 못했어요"
              description="없는 leaseId이거나 아직 실제 계약 등록이 끝나지 않은 값일 수 있습니다. leaseId를 다시 확인하거나, 위의 Sepolia 시연 바로가기에서 준비된 계약을 불러와 주세요."
            />
          )}
        </div>

        <div className="space-y-4">
          <GuideCard
            title="Sepolia 시연 팁"
            lines={[
              '새 계약은 임대인 등록과 임차인 예치 직후 ACTIVE 상태까지 바로 보여줄 수 있습니다.',
              '합의된 중도 해지로 EXPIRED 상태까지는 빠르게 갈 수 있지만, 자동 반환은 정산 점검 72시간이 지나야 열립니다.',
              '그래서 발표나 시연에서는 ACTIVE 계약과 반환 가능 계약을 따로 준비해 불러오는 구성이 가장 안정적입니다.',
            ]}
          />
          <GuideCard
            title="모니터링 포인트"
            lines={[
              '정상: 보증금이 볼트에 예치되고 수익권 토큰이 발행된 상태',
              '주의: 만기 임박, 반환 가능 조건을 미리 확인해야 하는 상태',
              '위험: 리스크 이벤트 감지, 토큰 동결 및 HUG 중재가 필요한 상태',
            ]}
          />
          <GuideCard
            title="실시간 설명"
            lines={[
              '이 화면은 5초마다 상태와 남은 일수를 다시 읽습니다.',
              '토큰 동결 여부와 마진콜 플래그도 함께 확인합니다.',
              '반환 실행 후에는 활동 로그와 우측 모니터가 동시에 갱신됩니다.',
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function InfoBox({
  label,
  value,
  helper,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  helper?: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 ${
      highlight
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-white/10 bg-slate-950/55'
    }`}>
      <p className={`text-xs uppercase tracking-[0.18em] ${highlight ? 'text-emerald-400' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-3 min-w-0 text-sm leading-6 ${highlight ? 'text-emerald-200 font-semibold' : 'text-white'} ${mono ? 'font-mono break-words [overflow-wrap:anywhere]' : 'break-words'}`}>{value}</p>
      {helper ? <p className="mt-2 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">{helper}</p> : null}
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

function ShowcaseLeaseCard({
  title,
  description,
  helper,
  leaseId,
  tone,
  buttonLabel,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  helper: string;
  leaseId?: string;
  tone: 'active' | 'return' | 'note';
  buttonLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'active'
      ? 'border-emerald-400/25 bg-emerald-400/10'
      : tone === 'return'
        ? 'border-cyan-300/25 bg-cyan-300/10'
        : 'border-white/10 bg-white/[0.03]';

  return (
    <div className={`rounded-[22px] border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">{description}</p>
      <p className="mt-3 text-xs leading-5 text-slate-300">{helper}</p>
      {leaseId ? (
        <p className="mt-3 break-all font-mono text-[11px] text-slate-200">{leaseId}</p>
      ) : null}
      {buttonLabel ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="mt-4 rounded-full border border-white/10 px-4 py-2 text-sm text-white transition hover:border-cyan-300/30 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {buttonLabel}
        </button>
      ) : null}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-5 rounded-[24px] border border-dashed border-white/10 bg-slate-950/35 px-5 py-10 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-5 grid gap-3 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
        />
      ))}
    </div>
  );
}

function hasMeaningfulHash(value: unknown) {
  return typeof value === 'string' && value !== ZERO_BYTES32;
}
