'use client';

import type { ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useReadContract, useSwitchChain } from 'wagmi';
import AddressSearchPanel from '@/components/AddressSearchPanel';
import GuidedStoryMode from '@/components/GuidedStoryMode';
import HeroProtectionScene from '@/components/HeroProtectionScene';
import LandlordPanel from '@/components/LandlordPanel';
import LeaseViewer from '@/components/LeaseViewer';
import LiveMonitor from '@/components/LiveMonitor';
import MyContractSummary, { SummaryTone } from '@/components/MyContractSummary';
import NotificationCenter from '@/components/NotificationCenter';
import OracleTrustPanel from '@/components/OracleTrustPanel';
import SettlementPreview from '@/components/SettlementPreview';
import TenantPanel from '@/components/TenantPanel';
import ToastStack from '@/components/ToastStack';
import {
  CHAIN_ID,
  CONTRACT_ADDRESSES,
  CONTRACT_STATE,
  DEPLOYMENT_META,
  EXPLORER_BASE_URL,
  NETWORK_LABEL,
  VAULT_ABI,
} from '@/lib/contracts';
import {
  ADDRESS_BOOK,
  AddressRecord,
  DEMO_LEASES,
  DemoLeaseRecord,
  SETTLEMENT_STAGE_META,
  SettlementStatus,
} from '@/lib/demo-data';
import { formatAddress, formatKRW } from '@/lib/format';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';

type Tab = 'landlord' | 'tenant' | 'viewer';
type WalletViewState =
  | 'wallet-not-connected'
  | 'wallet-connecting'
  | 'wrong-network'
  | 'connected-no-contract'
  | 'connected-active-contract';

const WALLET_STATE_LABEL: Record<WalletViewState, string> = {
  'wallet-not-connected':      '미연결',
  'wallet-connecting':         '연결 중',
  'wrong-network':             '네트워크 불일치',
  'connected-no-contract':     '연결됨 · 계약 없음',
  'connected-active-contract': '활성 계약 있음',
};

type SummaryView = {
  title: string;
  addressLine: string;
  buildingLabel: string;
  depositLabel: string;
  protectionPercent: number;
  remainingLabel: string;
  maturityLabel: string;
  statusLabel: string;
  riskScore: number;
  tone: SummaryTone;
  stage: number;
  note: string;
  liveLabel: string;
  depositKRW: string;
  nextActionLabel: string;
  situationTitle: string;
  situationDescription: string;
  settlementStatus: SettlementStatus;
  scenario: DemoLeaseRecord['scenario'] | 'live';
};

const STORAGE_KEY = 'jeonsechain-workspace-v2';

const TAB_META: Record<
  Tab,
  { label: string; eyebrow: string; title: string; description: string }
> = {
  landlord: {
    label: '새 전세계약 등록',
    eyebrow: 'Step 1',
    title: '주소와 계약 조건을 등록해 leaseId를 생성',
    description: '주소 검색에서 고른 부동산을 바탕으로 임차인 주소, 보증금, 기간을 입력하고 온체인 계약을 엽니다.',
  },
  tenant: {
    label: '보증금 예치',
    eyebrow: 'Step 2',
    title: '임차인 승인과 입금을 한 흐름으로 처리',
    description: '선택된 leaseId를 자동으로 이어받아 승인과 예치를 자연스럽게 진행합니다.',
  },
  viewer: {
    label: '내 계약 모니터링',
    eyebrow: 'Step 3',
    title: '위험 감지와 자동 반환 상태를 실시간 확인',
    description: '만기까지 남은 일수, 리스크 플래그, 반환 가능 여부를 5초 간격으로 갱신합니다.',
  },
};

const CORE_VALUES = [
  {
    title: '보증금 분리 보관',
    description: '임대인 일반재산과 분리해 보증금 원금을 보호하는 구조',
  },
  {
    title: '자동 반환 규칙',
    description: '만기 조건 충족 시 누구나 실행 가능한 반환 플로우',
  },
  {
    title: '실시간 위험 감지',
    description: '리스크 이벤트 시 토큰 동결과 중재 절차를 바로 연결',
  },
];

export default function Home() {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const [tab, setTab] = useState<Tab>('landlord');
  const [activeLease, setActiveLease] = useState<LeaseDraft | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [toasts, setToasts] = useState<ActivityItem[]>([]);
  const [detailMode, setDetailMode] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<number>(Date.now());
  const [hydrated, setHydrated] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [selectedAddress, setSelectedAddress] = useState<AddressRecord | null>(ADDRESS_BOOK[0]);
  const [selectedDemoId, setSelectedDemoId] = useState(DEMO_LEASES[0].id);
  const [settlementDemoStatus, setSettlementDemoStatus] = useState<SettlementStatus>(
    DEMO_LEASES.find((item) => item.id === 'settlement-contract')?.settlementStatus ?? '임차인 응답 대기',
  );
  const [demoMode, setDemoMode] = useState(true);
  const [registrationIntent, setRegistrationIntent] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState<'demo' | 'workspace' | 'settlement' | null>(null);
  const guidedDemoRef = useRef<HTMLDivElement | null>(null);
  const settlementRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const activeLeaseId = activeLease?.leaseId;
  const activeLeaseReady = Boolean(activeLeaseId?.startsWith('0x') && activeLeaseId.length === 66);
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  const { data: liveInfo, refetch: refetchLiveInfo } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getDepositInfo',
    args: activeLeaseReady ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: activeLeaseReady && !wrongNetwork,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  const { data: liveRemaining, refetch: refetchLiveRemaining } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getRemainingDays',
    args: activeLeaseReady ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: activeLeaseReady && !wrongNetwork,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  const { data: liveLeaseData, refetch: refetchLiveLeaseData } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'leases',
    args: activeLeaseReady ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: activeLeaseReady && !wrongNetwork,
      refetchInterval: autoRefreshEnabled ? 5000 : false,
    },
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          activeLease: LeaseDraft | null;
          activities: ActivityItem[];
          selectedAddressId?: string;
          demoMode?: boolean;
          selectedDemoId?: string;
          autoRefreshEnabled?: boolean;
          settlementDemoStatus?: SettlementStatus;
          registrationIntent?: boolean;
        };

        setActiveLease(parsed.activeLease);
        setActivities(parsed.activities ?? []);
        setDemoMode(parsed.demoMode ?? true);
        setAutoRefreshEnabled(parsed.autoRefreshEnabled ?? true);
        setRegistrationIntent(parsed.registrationIntent ?? false);

        const storedAddress = ADDRESS_BOOK.find((item) => item.id === parsed.selectedAddressId);
        if (storedAddress) setSelectedAddress(storedAddress);

        if (parsed.selectedDemoId && DEMO_LEASES.some((item) => item.id === parsed.selectedDemoId)) {
          setSelectedDemoId(parsed.selectedDemoId);
        }
        if (parsed.settlementDemoStatus && SETTLEMENT_STAGE_META[parsed.settlementDemoStatus]) {
          setSettlementDemoStatus(parsed.settlementDemoStatus);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeLease,
        activities,
        selectedAddressId: selectedAddress?.id,
        demoMode,
        selectedDemoId,
        autoRefreshEnabled,
        settlementDemoStatus,
        registrationIntent,
      }),
    );
  }, [
    activeLease,
    activities,
    autoRefreshEnabled,
    demoMode,
    hydrated,
    selectedAddress,
    selectedDemoId,
    settlementDemoStatus,
    registrationIntent,
  ]);

  function scrollToSection(
    ref: RefObject<HTMLElement | HTMLDivElement>,
    section?: 'demo' | 'workspace' | 'settlement',
  ) {
    if (section) {
      setHighlightedSection(section);
      window.setTimeout(() => setHighlightedSection((current) => (current === section ? null : current)), 1800);
    }
    window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function refreshLiveData() {
    if (!activeLeaseReady || wrongNetwork) return;
    await Promise.all([refetchLiveInfo(), refetchLiveRemaining(), refetchLiveLeaseData()]);
  }

  const walletState = deriveWalletState({
    hasActiveContract: Boolean(activeLease?.leaseId),
    isConnected,
    status,
    wrongNetwork,
  });

  const selectedDemo = DEMO_LEASES.find((item) => item.id === selectedDemoId) ?? DEMO_LEASES[0];
  const selectedDemoAddress =
    selectedAddress ?? ADDRESS_BOOK.find((item) => item.id === selectedDemo.addressId) ?? ADDRESS_BOOK[0];

  const summaryView = useMemo<SummaryView>(() => {
    if (liveInfo && liveLeaseData && !demoMode) {
      return buildLiveSummary({
        activeLease,
        liveInfo,
        liveLeaseData,
        liveRemaining,
      });
    }

    if (!demoMode) {
      return buildRegisterSummary(selectedAddress ?? selectedDemoAddress);
    }

    return buildDemoSummary(selectedDemo, selectedDemoAddress, settlementDemoStatus);
  }, [
    activeLease,
    demoMode,
    liveInfo,
    liveLeaseData,
    liveRemaining,
    selectedDemo,
    selectedDemoAddress,
    settlementDemoStatus,
  ]);

  function pushActivity(activity: Omit<ActivityItem, 'id' | 'timestamp'>) {
    const nextItem: ActivityItem = {
      ...activity,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: Date.now(),
    };

    setActivities((current) => [nextItem, ...current].slice(0, 12));
    setToasts([nextItem]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== nextItem.id));
    }, 3200);
  }

  function mergeLease(next: LeaseDraft, nextTab?: Tab) {
    setDemoMode(false);
    setRegistrationIntent(false);
    setActiveLease((current) => ({
      ...(current ?? { leaseId: next.leaseId }),
      ...next,
    }));
    if (nextTab) setTab(nextTab);
  }

  function selectDemoLease(demoId: string) {
    const demo = DEMO_LEASES.find((item) => item.id === demoId);
    if (!demo) return;

    setDemoMode(true);
    setRegistrationIntent(false);
    setSelectedDemoId(demoId);
    setSettlementDemoStatus(demo.scenario === 'settlement' ? demo.settlementStatus : '정산 없음');
    setTab('viewer');
    const addressItem = ADDRESS_BOOK.find((item) => item.id === demo.addressId);
    if (addressItem) setSelectedAddress(addressItem);
    pushActivity({
      title: '데모 계약을 불러왔어요',
      description: '지갑 연결 없이도 전세 lifecycle과 퇴실 정산 흐름을 미리 볼 수 있습니다.',
      tone: 'info',
    });
  }

  function openDemoSelector() {
    setDemoMode(true);
    setRegistrationIntent(false);
    scrollToSection(guidedDemoRef, 'demo');
  }

  function openWorkspaceTab(nextTab: Tab) {
    setDemoMode(false);
    setRegistrationIntent(nextTab === 'landlord');
    setTab(nextTab);
    scrollToSection(workspaceRef, 'workspace');
  }

  function openSettlementDemo(status?: SettlementStatus) {
    selectDemoLease('settlement-contract');
    if (status) setSettlementDemoStatus(status);
    scrollToSection(settlementRef, 'settlement');
  }

  const heroMetrics = [
    {
      label: '보호 중 보증금',
      value: summaryView.depositLabel,
      helper: demoMode ? '데모 계약 기준' : '선택 계약 기준',
    },
    {
      label: '만기까지',
      value: summaryView.remainingLabel,
      helper: demoMode ? '샘플 일정' : '실시간 계산',
    },
    {
      label: '리스크 상태',
      value: `${summaryView.statusLabel} · ${summaryView.riskScore}`,
      helper: summaryView.note,
    },
  ];

  const unreadCount = activities.filter((item) => item.timestamp > lastSeenAt).length;
  const contextualAction = getContextualAction(walletState, summaryView, {
    onOpenDemo: openDemoSelector,
    onSwitchNetwork: () => switchChain({ chainId: CHAIN_ID }),
    onOpenViewer: () => openWorkspaceTab('viewer'),
    onOpenSettlement: () => openSettlementDemo(settlementDemoStatus),
    onOpenRegister: () => openWorkspaceTab('landlord'),
  });

  return (
    <div className="min-h-screen pb-20">
      <ToastStack items={toasts} />

      <div className="shell pt-6 sm:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-slate-950/55 px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
                JeonseChain
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
                {NETWORK_LABEL} Testnet
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              공공데이터 · 온체인 규칙 · 설명 가능한 정산 흐름으로 전세보증금을 구조적으로 보호하는 부동산 금융 플랫폼
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`${EXPLORER_BASE_URL}/address/${CONTRACT_ADDRESSES.JeonseVault}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-300/30"
            >
              보증금 보호함 보기
            </a>
            <button
              onClick={() => setDetailMode((current) => !current)}
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
            >
              {detailMode ? '상세 용어 ON' : '쉬운 설명 ON'}
            </button>
            <NotificationCenter
              items={activities}
              unreadCount={unreadCount}
              isOpen={alertsOpen}
              onToggle={() => {
                setAlertsOpen((current) => {
                  const next = !current;
                  if (next) setLastSeenAt(Date.now());
                  return next;
                });
              }}
              onClose={() => {
                setAlertsOpen(false);
                setLastSeenAt(Date.now());
              }}
            />
            <ConnectButton />
          </div>
        </header>

        <div className="mt-4 flex flex-wrap gap-3">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
            현재 설명 모드: {detailMode ? '상세 용어 모드' : '쉬운 설명 모드'}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
            현재 흐름: {demoMode ? '데모 시나리오 탐색' : '실제 등록 준비 / 실시간 계약 확인'}
          </span>
        </div>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_520px]">
          <div className="glass-card subtle-grid overflow-hidden p-5 sm:p-7">
            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">전세보증금 구조 보호 플랫폼</p>
                <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
                  전세보증금을 구조화해 보호하는
                  <br className="hidden sm:block" />
                  한국형 부동산 금융 플랫폼
                </h1>
                <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
                  주소 검색, 계약 등록, 보증금 예치, 위험 감지, 자동 반환, 제한적 퇴실 정산까지의 흐름을
                  한 화면에서 이해할 수 있도록 구성했습니다. 발표용 데모로도, 실제 온체인 기능 시연용으로도
                  바로 설명할 수 있는 구조입니다.
                </p>
              </div>

              <HeroProtectionScene tone={summaryView.tone} statusLabel={summaryView.statusLabel} />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {CORE_VALUES.map((value) => (
                <div key={value.title} className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                  <p className="text-base font-semibold text-white">{value.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{value.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={contextualAction.onClick}
                className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                {contextualAction.label}
              </button>
              <button
                onClick={openDemoSelector}
                className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
              >
                데모 시나리오 선택
              </button>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
                배포 지갑 {formatAddress(DEPLOYMENT_META.deployer, 8, 6)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 px-3 py-2">
                실사용 흐름은 아래 워크스페이스 Step 1부터 시작됩니다.
              </span>
              <span className="rounded-full border border-white/10 px-3 py-2">
                데모 버튼은 시나리오별 계약 흐름 설명으로 바로 연결됩니다.
              </span>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {heroMetrics.map((item) => (
                <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-3 text-xl font-semibold text-white">{item.value}</p>
                  <p className="mt-2 text-sm text-slate-400">{item.helper}</p>
                </div>
              ))}
            </div>
          </div>

          <MyContractSummary
            {...summaryView}
            detailMode={detailMode}
            activities={activities}
          />
        </section>

        <div className="mt-6">
          <OracleTrustPanel
            detailMode={detailMode}
            autoRefreshEnabled={autoRefreshEnabled}
          />
        </div>

        <div
          ref={guidedDemoRef}
          className={`mt-6 scroll-mt-24 ${highlightedSection === 'demo' ? 'section-spotlight rounded-[32px]' : ''}`}
        >
          <GuidedStoryMode
            demos={DEMO_LEASES}
            selectedId={selectedDemoId}
            currentStage={summaryView.stage}
            situation={summaryView.situationTitle}
            storyTitle={selectedDemo.storyTitle}
            storyDescription={selectedDemo.storyDescription}
            nextActionLabel={summaryView.nextActionLabel}
            detailMode={detailMode}
            onSelect={selectDemoLease}
          />
        </div>

        <div className="mt-6">
          <AddressSearchPanel
            selectedAddress={selectedAddress}
            onSelect={(record) => {
              setSelectedAddress(record);
            }}
          />
        </div>

        <div
          ref={settlementRef}
          className={`mt-6 scroll-mt-24 ${highlightedSection === 'settlement' ? 'section-spotlight rounded-[32px]' : ''}`}
        >
          <SettlementPreview
            depositKRW={summaryView.depositKRW}
            statusLabel={demoMode ? '시나리오 시뮬레이션' : '실시간 온체인 정산 레이어'}
            settlementStatus={summaryView.settlementStatus}
            detailMode={detailMode}
            isDemoMode={demoMode}
            scenario={summaryView.scenario}
            onSelectSettlementStatus={setSettlementDemoStatus}
            onOpenSettlementDemo={() => openSettlementDemo('정산 요청 접수')}
          />
        </div>

        <main
          ref={workspaceRef}
          className={`mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_420px] scroll-mt-24 ${highlightedSection === 'workspace' ? 'section-spotlight rounded-[32px]' : ''}`}
        >
          <section className="glass-card overflow-hidden">
            <div className="border-b border-white/10 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{TAB_META[tab].eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{TAB_META[tab].title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                    {TAB_META[tab].description}
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
                  연결 상태: {WALLET_STATE_LABEL[walletState]}
                </div>
              </div>

              {walletState === 'connected-active-contract' ? (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {(Object.entries(TAB_META) as [Tab, (typeof TAB_META)[Tab]][]).map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`rounded-[22px] border p-4 text-left transition ${
                        tab === key
                          ? 'border-cyan-300/30 bg-cyan-300/10'
                          : 'border-white/10 bg-slate-950/35 hover:border-white/20 hover:bg-white/[0.04]'
                      }`}
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{meta.eyebrow}</p>
                      <p className="mt-3 text-base font-semibold text-white">{meta.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{meta.description}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="px-5 py-6 sm:px-6">
              {renderWorkspace({
                walletState,
                registrationIntent,
                isSwitchingChain,
                onSelectDemo: openDemoSelector,
                onSwitchNetwork: () => switchChain({ chainId: CHAIN_ID }),
                onMoveToRegister: () => openWorkspaceTab('landlord'),
                children: (
                  <>
                    {tab === 'landlord' ? (
                      <LandlordPanel
                        activeLease={activeLease}
                        suggestedPropertyLabel={
                          selectedAddress
                            ? `${selectedAddress.roadAddress} | ${selectedAddress.building}`
                            : undefined
                        }
                        onLeaseCreated={(lease) => mergeLease(lease, 'tenant')}
                        onActivity={pushActivity}
                      />
                    ) : null}

                    {tab === 'tenant' ? (
                      <TenantPanel
                        activeLease={activeLease}
                        onLeaseSelected={(leaseId) => mergeLease({ leaseId })}
                        onDepositComplete={(lease) => mergeLease(lease, 'viewer')}
                        onActivity={pushActivity}
                      />
                    ) : null}

                    {tab === 'viewer' ? (
                      <LeaseViewer
                        activeLease={activeLease}
                        onLeaseSelected={(leaseId) => mergeLease({ leaseId })}
                        onReturnComplete={(lease) => mergeLease(lease)}
                        onActivity={pushActivity}
                      />
                    ) : null}
                  </>
                ),
              })}
            </div>
          </section>

          <LiveMonitor
            activeLease={demoMode ? null : activeLease}
            activities={activities}
            connectedAddress={address}
            currentTabLabel={TAB_META[tab].label}
            isConnected={isConnected}
            autoRefreshEnabled={autoRefreshEnabled}
            onToggleAutoRefresh={() => setAutoRefreshEnabled((current) => !current)}
            onManualRefresh={refreshLiveData}
          />
        </main>
      </div>
    </div>
  );
}

function deriveWalletState({
  hasActiveContract,
  isConnected,
  status,
  wrongNetwork,
}: {
  hasActiveContract: boolean;
  isConnected: boolean;
  status: string;
  wrongNetwork: boolean;
}): WalletViewState {
  if (status === 'connecting' || status === 'reconnecting') return 'wallet-connecting';
  if (!isConnected) return 'wallet-not-connected';
  if (wrongNetwork) return 'wrong-network';
  if (!hasActiveContract) return 'connected-no-contract';
  return 'connected-active-contract';
}

function renderWorkspace({
  walletState,
  registrationIntent,
  isSwitchingChain,
  onSwitchNetwork,
  onMoveToRegister,
  onSelectDemo,
  children,
}: {
  walletState: WalletViewState;
  registrationIntent: boolean;
  isSwitchingChain: boolean;
  onSwitchNetwork: () => void;
  onMoveToRegister: () => void;
  onSelectDemo: () => void;
  children: ReactNode;
}) {
  if (walletState === 'wallet-connecting') {
    return <WorkspaceSkeleton title="지갑 연결 상태를 확인하고 있어요" description="연결이 완료되면 계약 등록 또는 보증금 예치 단계로 바로 이동할 수 있습니다." />;
  }

  if (walletState === 'wallet-not-connected') {
    if (registrationIntent) {
      return (
        <div className="space-y-5">
          <WorkspaceActionBanner
            tone="warning"
            title="등록 준비 화면을 열었어요"
            description="주소와 보증금, 기간을 먼저 입력해볼 수 있고 실제 온체인 등록은 상단 Connect Wallet 연결 후 가능합니다."
          />
          {children}
        </div>
      );
    }

    return (
      <WorkspaceEmptyState
        title="지갑 연결 전에도 서비스 구조를 충분히 이해할 수 있어요"
        description="주소 검색, 샘플 계약, 계약 요약 카드로 흐름을 미리 보시고, 실제 등록 준비 화면도 바로 열어볼 수 있습니다."
        primaryLabel="새 전세계약 등록 준비"
        secondaryLabel="데모 보기"
        onPrimary={onMoveToRegister}
        onSecondary={onSelectDemo}
      />
    );
  }

  if (walletState === 'wrong-network') {
    return (
      <WorkspaceEmptyState
        title="Sepolia 네트워크로 전환이 필요합니다"
        description="현재 연결 지갑은 다른 네트워크에 있습니다. 원클릭 전환 후 실제 계약 등록과 보증금 예치를 진행하세요."
        primaryLabel={isSwitchingChain ? '전환 중...' : 'Sepolia로 전환'}
        onPrimary={onSwitchNetwork}
      />
    );
  }

  if (walletState === 'connected-no-contract') {
    if (registrationIntent) {
      return (
        <div className="space-y-5">
          <WorkspaceActionBanner
            tone="info"
            title="실제 계약 등록 단계로 들어왔어요"
            description="아래 Step 1에서 임차인 주소, 보증금, 기간을 입력하면 실제 leaseId가 생성되고 다음 단계로 이어집니다."
          />
          {children}
        </div>
      );
    }

    return (
      <WorkspaceEmptyState
        title="아직 연결된 내 계약이 없어요"
        description="주소를 먼저 고른 뒤 새 전세계약을 등록하거나, 데모 계약을 불러와 서비스 흐름을 살펴볼 수 있습니다."
        primaryLabel="새 전세계약 등록"
        secondaryLabel="데모 보기"
        onPrimary={onMoveToRegister}
        onSecondary={onSelectDemo}
      />
    );
  }

  return children;
}

function WorkspaceActionBanner({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: 'info' | 'warning';
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-50'
      : 'border-cyan-300/20 bg-cyan-300/10 text-cyan-50';

  return (
    <div className={`rounded-[24px] border px-4 py-4 ${toneClass}`}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">{description}</p>
    </div>
  );
}

function WorkspaceEmptyState({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 bg-slate-950/40 px-5 py-12 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-500">워크스페이스</p>
      <p className="mt-4 text-2xl font-semibold text-white">{title}</p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-400">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          onClick={onPrimary}
          className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            onClick={onSecondary}
            className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-white/10 bg-slate-950/40 px-5 py-10">
        <p className="text-center text-2xl font-semibold text-white">{title}</p>
        <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.04]"
          />
        ))}
      </div>
    </div>
  );
}

function buildRegisterSummary(addressItem: AddressRecord): SummaryView {
  return {
    title: '새 전세 계약 등록 준비',
    addressLine: addressItem.roadAddress,
    buildingLabel: `${addressItem.building} · 주소 선택 완료`,
    depositLabel: '보증금 입력 전',
    protectionPercent: 0,
    remainingLabel: '-',
    maturityLabel: '계약 정보 입력 필요',
    statusLabel: '등록 전',
    riskScore: addressItem.riskScore,
    tone: 'monitor',
    stage: 1,
    note: '아래 Step 1에서 임대인·임차인·보증금·기간을 입력하면 실제 leaseId가 생성됩니다.',
    liveLabel: '실제 등록 준비',
    depositKRW: '0',
    nextActionLabel: '임대인 패널 입력 시작',
    situationTitle: '선택한 주소를 기준으로 실제 등록 준비 상태예요.',
    situationDescription: '데모가 아니라 실제 등록 흐름으로 전환된 상태입니다. 아래 워크스페이스에서 계약 정보를 입력하면 됩니다.',
    settlementStatus: '정산 없음',
    scenario: 'live',
  };
}

function buildDemoSummary(
  demo: (typeof DEMO_LEASES)[number],
  addressItem: AddressRecord,
  settlementStatusOverride?: SettlementStatus,
): SummaryView {
  const settlementStatus =
    demo.scenario === 'settlement' && settlementStatusOverride
      ? settlementStatusOverride
      : demo.settlementStatus;
  const settlementMeta = SETTLEMENT_STAGE_META[settlementStatus];
  const usesSettlementNarrative =
    demo.scenario === 'settlement' || demo.scenario === 'termination';

  return {
    title: '내 전세 계약 요약',
    addressLine: addressItem.roadAddress,
    buildingLabel: addressItem.building,
    depositLabel: demo.depositText,
    protectionPercent: Number(demo.protectionRatio.replace('%', '')),
    remainingLabel: `${demo.remainingDays}일`,
    maturityLabel: demo.maturityText,
    statusLabel: demo.riskLabel,
    riskScore: demo.riskScore,
    tone: toneFromRisk(demo.riskLabel),
    stage: demo.stage,
    note: '지갑 연결 전에도 서비스 가치와 계약 흐름을 읽을 수 있는 샘플 계약 요약입니다.',
    liveLabel: '데모 스토리 모드',
    depositKRW: demo.depositKRW,
    nextActionLabel: usesSettlementNarrative ? settlementMeta.nextActionLabel : demo.nextActionLabel,
    situationTitle: usesSettlementNarrative ? settlementMeta.headline : demo.currentSituation,
    situationDescription: usesSettlementNarrative ? settlementMeta.description : demo.storyDescription,
    settlementStatus,
    scenario: demo.scenario,
  };
}

function buildLiveSummary({
  activeLease,
  liveInfo,
  liveLeaseData,
  liveRemaining,
}: {
  activeLease: LeaseDraft | null;
  liveInfo: readonly [string, string, bigint, bigint, number];
  liveLeaseData: readonly [string, string, bigint, bigint, bigint, string, number, bigint, boolean];
  liveRemaining: bigint | undefined;
}): SummaryView {
  const stateNum = Number(liveInfo[4]);
  const tone = toneFromState(stateNum);
  const deposit = liveInfo[2];
  const currentValue = liveInfo[3];
  const depositNumber = Number(deposit);
  const currentValueNumber = Number(currentValue);
  const protectionPercent =
    depositNumber > 0 ? Math.min(100, (currentValueNumber / depositNumber) * 100) : 0;

  return {
    title: '내 전세 계약 요약',
    addressLine: activeLease?.propertyLabel || '선택된 주소 없음',
    buildingLabel: `임차인 ${formatAddress(String(liveInfo[0]))} · 임대인 ${formatAddress(String(liveInfo[1]))}`,
    depositLabel: formatKRW(deposit),
    protectionPercent: Math.round(protectionPercent),
    remainingLabel:
      liveRemaining === undefined
        ? '계산 중'
        : Number(liveRemaining) > 0
          ? `${String(liveRemaining)}일`
          : '만기 도래',
    maturityLabel: new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Number(liveLeaseData[4]) * 1000)),
    statusLabel: CONTRACT_STATE[stateNum] || '상태 미확인',
    riskScore: riskScoreFromState(stateNum),
    tone,
    stage: stageFromState(stateNum),
    note: currentValueNumber > 0 ? '실시간 계약 데이터를 기반으로 현재 보호 상태를 표시합니다.' : '등록은 됐지만 아직 보증금이 예치되지 않은 상태입니다.',
    liveLabel: '실시간 온체인 계약',
    depositKRW: activeLease?.depositKRW || String(Math.round(depositNumber / 1e18)),
    nextActionLabel: nextActionFromState(stateNum),
    situationTitle: situationTitleFromState(stateNum),
    situationDescription: situationDescriptionFromState(stateNum),
    settlementStatus: stateNum === 4 ? '최종 정산 완료' : '정산 없음',
    scenario: 'live',
  };
}

function toneFromRisk(riskLabel: string): SummaryTone {
  if (riskLabel === '정상') return 'safe';
  if (riskLabel === '주의') return 'monitor';
  return 'warning';
}

function toneFromState(stateNum: number): SummaryTone {
  if (stateNum === 2 || stateNum === 5) return 'warning';
  if (stateNum === 0 || stateNum === 3) return 'monitor';
  return 'safe';
}

function riskScoreFromState(stateNum: number) {
  if (stateNum === 2 || stateNum === 5) return 41;
  if (stateNum === 0 || stateNum === 3) return 67;
  return 84;
}

function stageFromState(stateNum: number) {
  if (stateNum === 0) return 1;
  if (stateNum === 1) return 3;
  if (stateNum === 2 || stateNum === 5) return 3;
  if (stateNum === 3) return 4;
  return 5;
}

function nextActionFromState(stateNum: number) {
  if (stateNum === 0) return '보증금 예치 준비';
  if (stateNum === 1) return '위험 신호 모니터링';
  if (stateNum === 2 || stateNum === 5) return '중재 또는 조정 대기';
  if (stateNum === 3) return '자동 반환 실행';
  return '반환 완료 확인';
}

function situationTitleFromState(stateNum: number) {
  if (stateNum === 0) return '계약은 등록됐지만 아직 보호가 시작되기 전이에요.';
  if (stateNum === 1) return '이 계약은 현재 안전하게 보호되고 있어요.';
  if (stateNum === 2 || stateNum === 5) return '위험 신호가 감지되어 보호 조치가 필요해요.';
  if (stateNum === 3) return '만기 도래로 자동 반환 또는 정산 단계에 진입했어요.';
  return '반환과 정산이 모두 마무리된 상태예요.';
}

function situationDescriptionFromState(stateNum: number) {
  if (stateNum === 0) return '임차인 입금이 완료되면 보증금 보호함과 수익권 구조가 시작됩니다.';
  if (stateNum === 1) return '보증금이 분리 보관되고, 반환 규칙이 자동으로 준비된 상태입니다.';
  if (stateNum === 2 || stateNum === 5) return '위험 상태에서는 토큰 동결과 중재 절차가 우선됩니다.';
  if (stateNum === 3) return '만기 조건을 확인한 뒤 자동 반환이나 제한적 퇴실 정산으로 연결됩니다.';
  return '임차인 반환 또는 최종 정산 반영이 완료되었습니다.';
}

function getContextualAction(
  walletState: WalletViewState,
  summaryView: SummaryView,
  actions: {
    onOpenDemo: () => void;
    onSwitchNetwork: () => void;
    onOpenViewer: () => void;
    onOpenSettlement: () => void;
    onOpenRegister: () => void;
  },
) {
  if (walletState === 'wrong-network') {
    return { label: 'Sepolia로 전환하기', onClick: actions.onSwitchNetwork };
  }

  if (walletState === 'connected-no-contract') {
    return { label: '실제 계약 등록 시작', onClick: actions.onOpenRegister };
  }

  if (walletState === 'connected-active-contract') {
    if (summaryView.scenario === 'settlement' || summaryView.scenario === 'termination') {
      return { label: '퇴실 정산 단계 보기', onClick: actions.onOpenSettlement };
    }
    return { label: '내 계약 모니터링 보기', onClick: actions.onOpenViewer };
  }

  return { label: '데모 스토리 보기', onClick: actions.onOpenDemo };
}
