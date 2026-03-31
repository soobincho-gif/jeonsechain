'use client';

import type { ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useReadContract, useSwitchChain } from 'wagmi';
import AddressSearchPanel from '@/components/AddressSearchPanel';
import GuidedStoryMode from '@/components/GuidedStoryMode';
import HeroProtectionScene from '@/components/HeroProtectionScene';
import HugMultisigPanel from '@/components/HugMultisigPanel';
import LandlordPanel from '@/components/LandlordPanel';
import LeaseViewer from '@/components/LeaseViewer';
import LiveMonitor from '@/components/LiveMonitor';
import MyContractSummary, { SummaryTone } from '@/components/MyContractSummary';
import NotificationCenter from '@/components/NotificationCenter';
import OracleTrustPanel from '@/components/OracleTrustPanel';
import SettlementPreview from '@/components/SettlementPreview';
import TenantPanel from '@/components/TenantPanel';
import ToastStack from '@/components/ToastStack';
import TrustProfilePanel from '@/components/TrustProfilePanel';
import {
  CHAIN_ID,
  CONTRACT_ADDRESSES,
  CONTRACT_STATE,
  DEPLOYMENT_META,
  EXPLORER_BASE_URL,
  NETWORK_LABEL,
  ORACLE_ABI,
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
import { getTrustBundle, TrustBundle, TrustBundleKind } from '@/lib/trust';
import {
  buildOracleRiskPreview,
  derivePropertyIdFromAddress,
  OraclePropertyRead,
  OracleRiskPreview,
  OracleSignalRead,
} from '@/lib/property';
import { ActivityItem, LeaseDraft } from '@/lib/workflow';

type Tab = 'landlord' | 'tenant' | 'viewer';
type Surface = 'landing' | 'experience' | 'contract' | 'more';
type MoreView = 'signals' | 'trust' | 'activity' | 'data' | 'faq';
type ContractRoleView = 'landlord' | 'tenant' | 'viewer';
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
  trustBundle: TrustBundle;
};

const STORAGE_KEY = 'jeonsechain-workspace-v2';

const ROLE_META: Record<
  ContractRoleView,
  { label: string; headline: string; description: string }
> = {
  landlord: {
    label: '임대인 화면',
    headline: '주소 확인 후 계약서를 등록하고 퇴실 정산을 요청합니다',
    description: '임대인은 주소 선택, 계약 등록, 문서 해시 첨부, 퇴실 정산 청구까지 관리합니다.',
  },
  tenant: {
    label: '임차인 화면',
    headline: '임대인이 등록한 계약을 확인하고 승인·예치합니다',
    description: '임차인은 같은 leaseId의 계약 내용을 확인한 뒤 보증금 예치, 정산 응답, 반환 완료 여부를 관리합니다.',
  },
  viewer: {
    label: '계약 조회 화면',
    headline: '양방향 계약 상태와 위험 신호를 함께 봅니다',
    description: '실시간 상태, 오라클 신호, 계약 변경, 퇴실 정산 결과를 통합해서 확인합니다.',
  },
};

const TAB_META: Record<
  Tab,
  { label: string; eyebrow: string; title: string; description: string }
> = {
  landlord: {
    label: '새 전세계약 등록',
    eyebrow: '1단계',
    title: '주소와 계약 조건을 등록해 leaseId를 생성',
    description: '주소 검색에서 고른 부동산을 바탕으로 임차인 주소, 보증금, 기간을 입력하고 온체인 계약을 엽니다.',
  },
  tenant: {
    label: '보증금 예치',
    eyebrow: '2단계',
    title: '임차인이 계약 내용을 확인하고 보증금을 예치',
    description: '임대인이 생성한 leaseId를 자동으로 이어받아 계약 확인, 승인, 예치를 순서대로 진행합니다.',
  },
  viewer: {
    label: '내 계약 모니터링',
    eyebrow: '3단계',
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

const MORE_MENU: { key: MoreView; label: string; description: string }[] = [
  {
    key: 'signals',
    label: '위험 신호',
    description: '왜 주의/위험으로 보이는지 쉬운 문장으로 읽습니다.',
  },
  {
    key: 'trust',
    label: '신뢰 프로필',
    description: '사람 점수 대신 검증 가능한 계약 이력을 봅니다.',
  },
  {
    key: 'activity',
    label: '활동 로그',
    description: '내 계약과 시스템 반영 기록을 최근 순서로 봅니다.',
  },
  {
    key: 'data',
    label: '데이터 근거',
    description: '오라클, 멀티시그, 해시와 tx 같은 검증 정보를 확인합니다.',
  },
  {
    key: 'faq',
    label: 'FAQ',
    description: '용어와 동작 방식을 빠르게 이해합니다.',
  },
];

export default function Home() {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const [surface, setSurface] = useState<Surface>('landing');
  const [moreView, setMoreView] = useState<MoreView>('signals');
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
  const [detailAddress, setDetailAddress] = useState('');
  const [selectedDemoId, setSelectedDemoId] = useState(DEMO_LEASES[0].id);
  const [settlementDemoStatus, setSettlementDemoStatus] = useState<SettlementStatus>(
    DEMO_LEASES.find((item) => item.id === 'settlement-contract')?.settlementStatus ?? '임차인 응답 대기',
  );
  const [demoMode, setDemoMode] = useState(true);
  const [registrationIntent, setRegistrationIntent] = useState(false);
  const [contractRoleView, setContractRoleView] = useState<ContractRoleView>('landlord');
  const [highlightedSection, setHighlightedSection] = useState<'demo' | 'workspace' | 'settlement' | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const guidedDemoRef = useRef<HTMLDivElement | null>(null);
  const settlementRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  const activeLeaseId = activeLease?.leaseId;
  const activeLeaseReady = Boolean(activeLeaseId?.startsWith('0x') && activeLeaseId.length === 66);
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;
  const selectedPropertyId = useMemo(
    () => (selectedAddress ? derivePropertyIdFromAddress(selectedAddress.roadAddress) : undefined),
    [selectedAddress],
  );

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
  const livePropertyId = useMemo<`0x${string}` | undefined>(() => {
    const candidate = activeLease?.propertyId ?? (liveLeaseData?.[5] as `0x${string}` | undefined);
    if (!candidate || !candidate.startsWith('0x') || candidate.length !== 66) return undefined;
    return candidate as `0x${string}`;
  }, [activeLease?.propertyId, liveLeaseData]);

  const { data: liveTrustRecord } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseVault,
    abi: VAULT_ABI,
    functionName: 'getLeaseTrustRecord',
    args: activeLeaseReady ? [activeLeaseId as `0x${string}`] : undefined,
    query: {
      enabled: activeLeaseReady && !wrongNetwork,
      refetchInterval: autoRefreshEnabled ? 10000 : false,
    },
  });

  const { data: selectedOracleProperty } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseOracle,
    abi: ORACLE_ABI,
    functionName: 'properties',
    args: selectedPropertyId ? [selectedPropertyId] : undefined,
    query: {
      enabled: Boolean(selectedPropertyId),
      refetchInterval: autoRefreshEnabled ? 15000 : false,
    },
  });

  const { data: selectedOracleSignals } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseOracle,
    abi: ORACLE_ABI,
    functionName: 'getRiskSignalSummary',
    args: selectedPropertyId ? [selectedPropertyId] : undefined,
    query: {
      enabled: Boolean(selectedPropertyId),
      refetchInterval: autoRefreshEnabled ? 15000 : false,
    },
  });

  const { data: liveOracleProperty } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseOracle,
    abi: ORACLE_ABI,
    functionName: 'properties',
    args: livePropertyId ? [livePropertyId] : undefined,
    query: {
      enabled: Boolean(livePropertyId),
      refetchInterval: autoRefreshEnabled ? 15000 : false,
    },
  });

  const { data: liveOracleSignals } = useReadContract({
    address: CONTRACT_ADDRESSES.JeonseOracle,
    abi: ORACLE_ABI,
    functionName: 'getRiskSignalSummary',
    args: livePropertyId ? [livePropertyId] : undefined,
    query: {
      enabled: Boolean(livePropertyId),
      refetchInterval: autoRefreshEnabled ? 15000 : false,
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
          detailAddress?: string;
          demoMode?: boolean;
          selectedDemoId?: string;
          autoRefreshEnabled?: boolean;
          settlementDemoStatus?: SettlementStatus;
          registrationIntent?: boolean;
          contractRoleView?: ContractRoleView;
        };

        setActiveLease(parsed.activeLease);
        setActivities(parsed.activities ?? []);
        setDemoMode(parsed.demoMode ?? true);
        setAutoRefreshEnabled(parsed.autoRefreshEnabled ?? true);
        setRegistrationIntent(parsed.registrationIntent ?? false);

        const storedAddress = ADDRESS_BOOK.find((item) => item.id === parsed.selectedAddressId);
        if (storedAddress) setSelectedAddress(storedAddress);
        setDetailAddress(parsed.detailAddress ?? '');
        setContractRoleView(parsed.contractRoleView ?? 'landlord');

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
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeLease,
        activities,
        selectedAddressId: selectedAddress?.id,
        detailAddress,
        demoMode,
        selectedDemoId,
        autoRefreshEnabled,
        settlementDemoStatus,
        registrationIntent,
        contractRoleView,
      }),
    );
  }, [
    activeLease,
    activities,
    autoRefreshEnabled,
    contractRoleView,
    detailAddress,
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
  const contractRoleMeta = ROLE_META[contractRoleView];
  const selectedOraclePreview = useMemo(
    () =>
      buildOracleRiskPreview(
        selectedOracleProperty as OraclePropertyRead,
        selectedOracleSignals as OracleSignalRead,
      ),
    [selectedOracleProperty, selectedOracleSignals],
  );
  const liveOraclePreview = useMemo(
    () =>
      buildOracleRiskPreview(
        liveOracleProperty as OraclePropertyRead,
        liveOracleSignals as OracleSignalRead,
      ),
    [liveOracleProperty, liveOracleSignals],
  );

  const summaryView = useMemo<SummaryView>(() => {
    if (liveInfo && liveLeaseData && !demoMode) {
      return buildLiveSummary({
        activeLease,
        liveInfo,
        liveLeaseData,
        liveRemaining,
        liveTrustRecord,
        liveOraclePreview,
      });
    }

    if (!demoMode) {
      return buildRegisterSummary(selectedAddress ?? selectedDemoAddress, detailAddress, selectedOraclePreview);
    }

    return buildDemoSummary(selectedDemo, selectedDemoAddress, settlementDemoStatus);
  }, [
    detailAddress,
    activeLease,
    demoMode,
    liveInfo,
    liveLeaseData,
    liveOraclePreview,
    liveRemaining,
    liveTrustRecord,
    selectedOraclePreview,
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
    if (nextTab) {
      setTab(nextTab);
      setContractRoleView(nextTab);
    }
  }

  function selectDemoLease(demoId: string) {
    const demo = DEMO_LEASES.find((item) => item.id === demoId);
    if (!demo) return;

    setSurface('experience');
    setDemoMode(true);
    setRegistrationIntent(false);
    setSelectedDemoId(demoId);
    setSettlementDemoStatus(demo.scenario === 'settlement' ? demo.settlementStatus : '정산 없음');
    setTab('viewer');
    setContractRoleView('viewer');
    const addressItem = ADDRESS_BOOK.find((item) => item.id === demo.addressId);
    if (addressItem) setSelectedAddress(addressItem);
    pushActivity({
      title: '계약 정보를 불러왔어요',
      description: '지갑 연결 없이도 전세 lifecycle과 퇴실 정산 흐름을 미리 볼 수 있습니다.',
      tone: 'info',
    });
  }

  function openDemoSelector() {
    setSurface('experience');
    setDemoMode(true);
    setRegistrationIntent(false);
    scrollToSection(guidedDemoRef, 'demo');
  }

  function openWorkspaceTab(nextTab: Tab) {
    setSurface('contract');
    setDemoMode(false);
    setRegistrationIntent(nextTab === 'landlord');
    setTab(nextTab);
    setContractRoleView(nextTab);
    scrollToSection(workspaceRef, 'workspace');
  }

  function openSettlementDemo(status?: SettlementStatus) {
    setSurface('experience');
    selectDemoLease('settlement-contract');
    if (status) setSettlementDemoStatus(status);
    scrollToSection(settlementRef, 'settlement');
  }

  function openLanding() {
    setSurface('landing');
    setAlertsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openExperience() {
    setSurface('experience');
    setDemoMode(true);
    setRegistrationIntent(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openContractHome() {
    setSurface('contract');
    setDemoMode(false);
    setRegistrationIntent(!activeLeaseReady);
    const nextTab = activeLeaseReady ? 'viewer' : 'landlord';
    setTab(nextTab);
    setContractRoleView(nextTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openMore(nextView: MoreView = 'signals') {
    setSurface('more');
    setMoreView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  const showQuickNav = scrollY > 280;
  const showScrollTop = scrollY > 540;
  const navPinned = scrollY > 96;
  const contextualAction = getContextualAction(walletState, summaryView, {
    onOpenDemo: openDemoSelector,
    onSwitchNetwork: () => switchChain({ chainId: CHAIN_ID }),
    onOpenViewer: () => openWorkspaceTab('viewer'),
    onOpenSettlement: () => openSettlementDemo(settlementDemoStatus),
    onOpenRegister: () => openWorkspaceTab('landlord'),
  });
  const signalOverview = useMemo(() => buildSignalOverview(summaryView), [summaryView]);

  return (
    <div className="min-h-screen pb-20">
      <ToastStack items={toasts} />

      <div className="shell pt-6 sm:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/10 bg-slate-950/55 px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openLanding}
                className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-300/16"
              >
                JeonseChain
              </button>
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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
              현재 설명 모드: {detailMode ? '상세 용어 모드' : '쉬운 설명 모드'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300">
              현재 흐름: {demoMode ? '체험용 샘플 계약' : '내 계약 관리 흐름'}
            </span>
          </div>
          {surface !== 'landing' ? (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs text-cyan-100">
              {surface === 'experience'
                ? '체험하기'
                : surface === 'contract'
                  ? '내 계약'
                  : '더보기'}
            </span>
          ) : null}
        </div>

        <nav
          className={`sticky top-0 z-30 mt-6 flex flex-wrap items-center gap-3 border border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl transition duration-300 ${
            navPinned
              ? 'rounded-b-[26px] rounded-t-none border-t-0 shadow-[0_20px_60px_rgba(2,6,23,0.34)]'
              : 'rounded-[26px] shadow-[0_18px_60px_rgba(2,6,23,0.28)]'
          } ${
            showQuickNav ? 'md:pointer-events-none md:-translate-y-4 md:opacity-0' : ''
          }`}
        >
          <TopNavButton
            active={surface === 'experience'}
            label="체험하기"
            description="샘플 계약 설명 모드"
            onClick={openExperience}
          />
          <TopNavButton
            active={surface === 'contract'}
            label="내 계약"
            description="주소 검색과 계약 관리"
            onClick={openContractHome}
          />
          <TopNavButton
            active={surface === 'more'}
            label="더보기"
            description="위험·신뢰·근거"
            onClick={() => openMore(moreView)}
          />
        </nav>

        {showQuickNav ? (
          <aside className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 lg:flex lg:flex-col lg:gap-3">
            <QuickNavButton active={surface === 'experience'} label="체험하기" helper="샘플 흐름" onClick={openExperience} />
            <QuickNavButton active={surface === 'contract'} label="내 계약" helper="등록·조회" onClick={openContractHome} />
            <QuickNavButton active={surface === 'more'} label="더보기" helper="근거·로그" onClick={() => openMore(moreView)} />
          </aside>
        ) : null}

        {showScrollTop ? (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-5 right-5 z-40 rounded-full border border-cyan-300/30 bg-slate-950/85 px-4 py-3 text-sm font-semibold text-cyan-100 shadow-[0_18px_40px_rgba(2,6,23,0.42)] transition hover:bg-slate-900"
          >
            ↑ 맨 위
          </button>
        ) : null}

        {surface === 'more' ? (
          <div className="mt-4 flex flex-wrap gap-2 rounded-[22px] border border-white/10 bg-slate-950/40 p-2">
            {MORE_MENU.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMoreView(item.key)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  moreView === item.key
                    ? 'bg-cyan-300 text-slate-950'
                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {surface === 'landing' ? (
          <>
            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_420px]">
              <div className="glass-card subtle-grid overflow-hidden p-5 sm:p-7">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">JeonseChain 시작하기</p>
                <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
                  처음 보는 사람도
                  <br className="hidden sm:block" />
                  5초 안에 이해할 수 있게 시작점을 나눴습니다
                </h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  샘플 계약으로 서비스 흐름을 설명하는 체험 모드와, 주소 검색부터 계약 등록까지 이어지는
                  내 계약 관리 모드를 분리했습니다. 설명용 흐름과 실제 계약 관리 흐름이 한 화면에서 섞여 보이지 않도록
                  입구부터 나눠둔 구조입니다.
                </p>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <EntryChoiceCard
                    eyebrow="체험하기"
                    title="샘플 계약으로 서비스 흐름 보기"
                    description="정상 계약, 위험 계약, 퇴실 정산 시나리오를 고르며 JeonseChain의 보호 구조를 빠르게 이해합니다."
                    primaryLabel="데모 시작"
                    secondaryLabel="시나리오 보기"
                    onPrimary={openExperience}
                    onSecondary={openDemoSelector}
                  />
                  <EntryChoiceCard
                    eyebrow="내 계약 시작하기"
                    title="주소 검색과 계약 등록부터 바로 시작"
                    description="선택한 주소의 위험 상태를 먼저 보고, 보증금·기간·지갑 연결까지 실제 계약 관리 흐름으로 이어집니다."
                    primaryLabel="내 계약 보기"
                    secondaryLabel="주소 검색 열기"
                    onPrimary={openContractHome}
                    onSecondary={openContractHome}
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => openMore('signals')}
                    className="rounded-full border border-white/10 px-3 py-2 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
                  >
                    위험 신호는 어떻게 판단하나요?
                  </button>
                  <button
                    type="button"
                    onClick={() => openMore('trust')}
                    className="rounded-full border border-white/10 px-3 py-2 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
                  >
                    신뢰 프로필이란?
                  </button>
                  <button
                    type="button"
                    onClick={() => openMore('data')}
                    className="rounded-full border border-white/10 px-3 py-2 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
                  >
                    데이터는 어디서 오나요?
                  </button>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  {CORE_VALUES.map((value) => (
                    <div key={value.title} className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-base font-semibold text-white">{value.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{value.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card overflow-hidden p-5 sm:p-6">
                <HeroProtectionScene tone={summaryView.tone} statusLabel={summaryView.statusLabel} />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {heroMetrics.map((item) => (
                    <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      <p className="mt-3 text-xl font-semibold text-white">{item.value}</p>
                      <p className="mt-2 text-sm text-slate-400">{item.helper}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {surface === 'experience' ? (
              <>
                <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_520px]">
                  <div className="glass-card subtle-grid overflow-hidden p-5 sm:p-7">
                    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
                      <div className="max-w-3xl">
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">체험하기</p>
                        <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
                          샘플 계약으로
                          <br className="hidden sm:block" />
                          보호, 위험 감지, 퇴실 정산 흐름을 보여줍니다
                        </h1>
                        <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
                          발표와 데모에 맞게 정상 계약, 위험 계약, 퇴실 정산 계약을 선택하면 아래 스토리와 요약 카드가
                          함께 바뀝니다. 실사용 데이터와 섞이지 않도록 이 탭은 설명용 샘플 계약만 보여줍니다.
                        </p>
                      </div>

                      <HeroProtectionScene tone={summaryView.tone} statusLabel={summaryView.statusLabel} />
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button
                        onClick={contextualAction.onClick}
                        className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                      >
                        {contextualAction.label}
                      </button>
                      <button
                        onClick={openContractHome}
                        className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
                      >
                        내 계약으로 이동
                      </button>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
                        샘플 계약 {selectedDemo.storyTitle}
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
                    availableTabs={['contract', 'risk', 'trust', 'settlement']}
                  />
                </section>

                <div
                  ref={guidedDemoRef}
                  className={`mt-6 scroll-mt-24 ${highlightedSection === 'demo' ? 'section-spotlight rounded-[32px]' : ''}`}
                >
                  <GuidedStoryMode
                    demos={DEMO_LEASES}
                    selectedId={selectedDemoId}
                    scenario={selectedDemo.scenario}
                    currentStage={summaryView.stage}
                    situation={summaryView.situationTitle}
                    storyTitle={selectedDemo.storyTitle}
                    storyDescription={selectedDemo.storyDescription}
                    nextActionLabel={summaryView.nextActionLabel}
                    detailMode={detailMode}
                    onSelect={selectDemoLease}
                  />
                </div>

                <div
                  ref={settlementRef}
                  className={`mt-6 scroll-mt-24 ${highlightedSection === 'settlement' ? 'section-spotlight rounded-[32px]' : ''}`}
                >
                  <SettlementPreview
                    depositKRW={summaryView.depositKRW}
                    statusLabel="시나리오 시뮬레이션"
                    settlementStatus={summaryView.settlementStatus}
                    detailMode={detailMode}
                    isDemoMode
                    scenario={summaryView.scenario}
                    onSelectSettlementStatus={setSettlementDemoStatus}
                    onOpenSettlementDemo={() => openSettlementDemo('정산 요청 접수')}
                  />
                </div>
              </>
            ) : null}

            {surface === 'contract' ? (
              <>
                <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
                  <div className="glass-card subtle-grid overflow-hidden p-5 sm:p-7">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">내 계약</p>
                    <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
                      주소 검색부터 계약 등록,
                      <br className="hidden sm:block" />
                      위험 확인과 정산 상태까지 관리합니다
                    </h1>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                      이 화면은 샘플 설명이 아니라 실제 계약 관리 흐름입니다. 주소를 고른 뒤 계약을 등록하고,
                      임차인 예치와 실시간 상태 확인까지 바로 이어집니다.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => openWorkspaceTab('landlord')}
                        className="rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                      >
                        새 전세계약 등록
                      </button>
                      <button
                        onClick={openExperience}
                        className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
                      >
                        데모 먼저 보기
                      </button>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
                        연결 상태 {WALLET_STATE_LABEL[walletState]}
                      </span>
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-xs text-cyan-100">
                        현재 역할 보기: {contractRoleMeta.label}
                      </span>
                    </div>

                    <div className="mt-6 rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">역할 전환</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(Object.keys(ROLE_META) as ContractRoleView[]).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => openWorkspaceTab(key)}
                            className={`rounded-full px-4 py-2 text-sm transition ${
                              contractRoleView === key
                                ? 'bg-cyan-300 text-slate-950'
                                : 'border border-white/10 bg-white/[0.03] text-slate-200 hover:border-cyan-300/30 hover:bg-white/[0.05]'
                            }`}
                          >
                            {ROLE_META[key].label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-white">{contractRoleMeta.headline}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{contractRoleMeta.description}</p>
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
                    availableTabs={['contract', 'settlement']}
                  />
                </section>

                <div className="mt-6">
                  <AddressSearchPanel
                    selectedAddress={selectedAddress}
                    detailAddress={detailAddress}
                    selectedRiskOverride={selectedOraclePreview}
                    onSelect={(record) => {
                      setSelectedAddress(record);
                    }}
                    onDetailAddressChange={setDetailAddress}
                  />
                </div>

                <main
                  ref={workspaceRef}
                  className={`mt-6 scroll-mt-24 ${highlightedSection === 'workspace' ? 'section-spotlight rounded-[32px]' : ''}`}
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
                        onSelectDemo: openExperience,
                        onSwitchNetwork: () => switchChain({ chainId: CHAIN_ID }),
                        onMoveToRegister: () => openWorkspaceTab('landlord'),
                        children: (
                          <>
                            {tab === 'landlord' ? (
                              <LandlordPanel
                                activeLease={activeLease}
                                suggestedPropertyLabel={
                                  selectedAddress
                                    ? buildPropertyLabel(selectedAddress, detailAddress)
                                    : undefined
                                }
                                selectedAddress={selectedAddress}
                                detailAddress={detailAddress}
                                oracleRiskPreview={selectedOraclePreview}
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
                </main>
              </>
            ) : null}

            {surface === 'more' ? (
              <>
                <section className="mt-6 glass-card overflow-hidden p-5 sm:p-6">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">더보기</p>
                  <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                    기술 정보는 뒤로 빼고,
                    <br className="hidden sm:block" />
                    필요한 순간에만 펼쳐보게 정리했습니다
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                    메인 흐름을 방해하지 않도록 위험 신호 설명, 신뢰 프로필, 활동 로그, 데이터 근거를 여기로 모았습니다.
                    사용자는 쉬운 언어부터 보고, 발표나 검증 단계에서는 해시와 tx까지 더 깊게 확인할 수 있습니다.
                  </p>
                </section>

                {moreView === 'signals' ? (
                  <section className="mt-6">
                    <div className="glass-card overflow-hidden p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="max-w-3xl">
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">위험 신호</p>
                          <h2 className="mt-3 text-2xl font-semibold text-white">
                            {summaryView.statusLabel} 상태로 보는 이유를 쉬운 언어로 정리했습니다
                          </h2>
                          <p className="mt-3 text-sm leading-6 text-slate-300">{signalOverview.summary}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMoreView('data')}
                          className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
                        >
                          데이터 근거 보기
                        </button>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {signalOverview.items.map((item) => (
                          <SignalOverviewCard key={item.label} item={item} />
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

                {moreView === 'trust' ? (
                  <div className="mt-6">
                    <TrustProfilePanel bundle={summaryView.trustBundle} detailMode={detailMode} />
                  </div>
                ) : null}

                {moreView === 'activity' ? (
                  <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                    <SimpleActivityPanel items={activities} />
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
                  </section>
                ) : null}

                {moreView === 'data' ? (
                  <>
                    <div className="mt-6">
                      <OracleTrustPanel
                        detailMode={detailMode}
                        autoRefreshEnabled={autoRefreshEnabled}
                      />
                    </div>
                    <div className="mt-6">
                      <HugMultisigPanel
                        activeLease={demoMode ? null : activeLease}
                        autoRefreshEnabled={autoRefreshEnabled}
                        onActivity={pushActivity}
                      />
                    </div>
                  </>
                ) : null}

                {moreView === 'faq' ? (
                  <section className="mt-6 grid gap-4 lg:grid-cols-2">
                    <FaqCard
                      question="보증금 보호함이 뭐예요?"
                      answer="임대인의 일반 재산과 분리해 보증금을 관리하는 구조입니다. 만기와 위험 신호에 따라 반환 규칙이 자동으로 연결됩니다."
                    />
                    <FaqCard
                      question="자동 반환은 어떻게 되나요?"
                      answer="만기 조건이 충족되고 강한 위험 신호가 없으면, 누구나 규칙 실행 트랜잭션을 호출해 반환을 진행할 수 있습니다."
                    />
                    <FaqCard
                      question="보류 금액은 왜 생기나요?"
                      answer="퇴실 정산에서 파손·청소비·미납금처럼 분쟁이 있는 부분만 제한적으로 hold하고, 무분쟁 금액은 먼저 반환하기 위해서입니다."
                    />
                    <FaqCard
                      question="위험 신호는 무엇을 보나요?"
                      answer="선순위채권, 경매·압류 강한 플래그, 최근 권리변동, 전세가율, 만기·반환 재원 신호를 조합해 현재 상태를 설명합니다."
                    />
                  </section>
                ) : null}
              </>
            ) : null}
          </>
        )}

        <footer className="mt-12 border-t border-white/10 py-8 text-center text-xs text-white/30">
          <p>© 2026 전세체인. 본 서비스는 Sepolia 테스트넷 기반 데모입니다.</p>
          <p className="mt-1">실제 법적 효력이 없으며, 실거래에 사용하지 마십시오.</p>
          <div className="mt-3 flex justify-center gap-6">
            <span className="cursor-default transition-colors hover:text-white/50">이용약관</span>
            <span className="cursor-default transition-colors hover:text-white/50">개인정보처리방침</span>
            <span className="cursor-default transition-colors hover:text-white/50">고객문의</span>
          </div>
        </footer>
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
            description="아래 1단계에서 임차인 주소, 보증금, 기간을 입력하면 leaseId가 생성되고, 이후 임차인이 같은 계약을 확인·승인·예치하는 흐름으로 이어집니다."
          />
          {children}
        </div>
      );
    }

    return (
      <WorkspaceEmptyState
        title="아직 연결된 내 계약이 없어요"
        description="주소를 먼저 고른 뒤 임대인이 계약을 등록하고, 이후 임차인이 같은 leaseId를 확인·승인·예치하는 흐름으로 진행됩니다."
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

function TopNavButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[170px] flex-1 flex-col rounded-[22px] border px-4 py-3 text-left transition ${
        active
          ? 'border-cyan-300/30 bg-cyan-300/10'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <span className={`text-sm font-semibold ${active ? 'text-cyan-100' : 'text-white'}`}>{label}</span>
      <span className="mt-1 text-xs leading-5 text-slate-400">{description}</span>
    </button>
  );
}

function QuickNavButton({
  active,
  label,
  helper,
  onClick,
}: {
  active: boolean;
  label: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-28 rounded-[20px] border px-3 py-3 text-left shadow-[0_16px_30px_rgba(2,6,23,0.28)] backdrop-blur-xl transition ${
        active
          ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100'
          : 'border-white/10 bg-slate-950/82 text-white hover:border-white/20 hover:bg-slate-900/90'
      }`}
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className="mt-1 block text-[11px] leading-4 text-slate-400">{helper}</span>
    </button>
  );
}

function EntryChoiceCard({
  eyebrow,
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950/50 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
      <p className="mt-3 text-xl font-semibold text-white">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-300/30 hover:bg-white/[0.03]"
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}

type SignalOverviewTone = 'safe' | 'monitor' | 'warning';

type SignalOverviewItem = {
  label: string;
  tone: SignalOverviewTone;
  summary: string;
  helper: string;
};

function SignalOverviewCard({ item }: { item: SignalOverviewItem }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{item.label}</p>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${signalToneClass(item.tone)}`}>
          {item.tone === 'safe' ? '안정' : item.tone === 'monitor' ? '주의' : '경고'}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-200">{item.summary}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{item.helper}</p>
    </div>
  );
}

function SimpleActivityPanel({ items }: { items: ActivityItem[] }) {
  const recentItems = items.slice(0, 5);

  return (
    <div className="glass-card overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">활동 로그</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">최근 활동과 시스템 반영 기록</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            메인 화면에서는 숨기고, 필요할 때만 최근 5개의 흐름을 빠르게 확인할 수 있게 뺐습니다.
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
          최근 5건
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {recentItems.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-slate-400">
            아직 기록된 활동이 없습니다.
          </div>
        ) : (
          recentItems.map((item) => (
            <div key={item.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${toneDot(item.tone)}`} />
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                </div>
                <span className="text-xs text-slate-500">{new Date(item.timestamp).toLocaleTimeString('ko-KR')}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FaqCard({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="glass-card overflow-hidden p-5 sm:p-6">
      <p className="text-sm font-semibold text-white">{question}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{answer}</p>
    </div>
  );
}

function buildSignalOverview(summaryView: SummaryView): { summary: string; items: SignalOverviewItem[] } {
  const score = summaryView.riskScore;
  const isWarning = summaryView.tone === 'warning';
  const isMonitor = summaryView.tone === 'monitor';
  const isSettlementFlow =
    summaryView.scenario === 'settlement' ||
    summaryView.scenario === 'termination' ||
    summaryView.settlementStatus !== '정산 없음';
  const nearingMaturity = summaryView.stage >= 4 || summaryView.remainingLabel === '만기 도래';

  const depositRatioTone: SignalOverviewTone =
    score >= 70 ? 'warning' : score >= 40 ? 'monitor' : 'safe';
  const seniorDebtTone: SignalOverviewTone = isWarning ? 'warning' : isMonitor ? 'monitor' : 'safe';
  const auctionTone: SignalOverviewTone =
    summaryView.scenario === 'risk' || summaryView.scenario === 'termination'
      ? 'warning'
      : isMonitor
        ? 'monitor'
        : 'safe';
  const rightsTone: SignalOverviewTone = isWarning ? 'warning' : isMonitor ? 'monitor' : 'safe';
  const maturityTone: SignalOverviewTone =
    isSettlementFlow || nearingMaturity ? 'warning' : isMonitor ? 'monitor' : 'safe';

  const items: SignalOverviewItem[] = [
    {
      label: '선순위채권 / 근저당',
      tone: seniorDebtTone,
      summary:
        seniorDebtTone === 'warning'
          ? '선순위채권이나 근저당을 먼저 다시 확인해야 하는 상태입니다.'
          : seniorDebtTone === 'monitor'
            ? '담보 정보가 충분히 확인되지 않았거나 보수적으로 볼 필요가 있습니다.'
            : '현재 화면 기준으로 강한 담보 스트레스 신호는 크지 않습니다.',
      helper: '보증금보다 먼저 변제되는 채권이 크면 반환 안정성이 낮아집니다.',
    },
    {
      label: '압류 / 경매 강한 플래그',
      tone: auctionTone,
      summary:
        auctionTone === 'warning'
          ? '경매·압류처럼 즉시 주의해야 할 강한 법적 신호를 우선 확인해야 합니다.'
          : auctionTone === 'monitor'
            ? '강한 플래그는 없지만 관련 권리 제한 여부를 함께 보는 편이 좋습니다.'
            : '현재는 강한 법적 제한 신호가 전면에 보이지 않습니다.',
      helper: '경매 관련 신호는 예측이 아니라 위험 경고 형태로만 보여줍니다.',
    },
    {
      label: '최근 권리변동',
      tone: rightsTone,
      summary:
        rightsTone === 'warning'
          ? '최근 권리관계가 바뀐 흔적을 우선 확인해야 하는 상태입니다.'
          : rightsTone === 'monitor'
            ? '최근 권리변동 여부를 추가 확인하면 안전 판단이 더 선명해집니다.'
            : '현재 흐름에서는 급격한 권리변동이 전면 신호로 올라오지 않았습니다.',
      helper: '최근 소유권·담보 변동은 반환 실패 위험의 조기 신호가 될 수 있습니다.',
    },
    {
      label: '보증금 대비 가격 비율',
      tone: depositRatioTone,
      summary:
        depositRatioTone === 'warning'
          ? '보증금 대비 가격 비율이 높게 읽혀 보수적인 판단이 필요합니다.'
          : depositRatioTone === 'monitor'
            ? '보증금과 매매가의 균형을 추가로 확인하는 편이 좋습니다.'
            : '현재 읽기에서는 보증금 대비 가격 비율이 상대적으로 안정적입니다.',
      helper: '주변 전월세·매매 실거래 집계를 바탕으로 설명용 판단을 제공합니다.',
    },
    {
      label: '만기 / 반환 재원 신호',
      tone: maturityTone,
      summary:
        maturityTone === 'warning'
          ? '만기 또는 정산 단계에 가까워져 반환 재원과 다음 조치를 바로 확인해야 합니다.'
          : maturityTone === 'monitor'
            ? '만기까지 남은 기간과 자동 반환 준비 상태를 함께 지켜보는 구간입니다.'
            : '만기까지 여유가 있고, 현재는 즉시 반환 스트레스가 크지 않습니다.',
      helper: '만기 임박, 자동 반환, 제한적 정산 보류 여부가 여기서 함께 읽힙니다.',
    },
  ];

  const warningItems = items.filter((item) => item.tone === 'warning');
  const monitorItems = items.filter((item) => item.tone === 'monitor');

  let summary = '현재 계약은 설명 가능한 범위 안에서 안정적으로 읽힙니다.';
  if (warningItems.length > 0) {
    summary = `${summaryView.statusLabel} 상태입니다. ${warningItems
      .slice(0, 2)
      .map((item) => item.label)
      .join(', ')} 신호를 먼저 확인하는 것이 좋습니다.`;
  } else if (monitorItems.length > 0) {
    summary = `${summaryView.statusLabel} 상태입니다. ${monitorItems
      .slice(0, 2)
      .map((item) => item.label)
      .join(', ')} 쪽을 추가 확인하면 판단이 더 선명해집니다.`;
  }

  return { summary, items };
}

function signalToneClass(tone: SignalOverviewTone) {
  if (tone === 'safe') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100';
  if (tone === 'monitor') return 'border-amber-400/20 bg-amber-400/10 text-amber-100';
  return 'border-rose-400/20 bg-rose-400/10 text-rose-100';
}

function toneDot(tone: ActivityItem['tone']) {
  if (tone === 'success') return 'bg-emerald-400';
  if (tone === 'warning') return 'bg-amber-400';
  return 'bg-cyan-300';
}

function buildAddressLine(addressItem: AddressRecord, detailAddress?: string) {
  return detailAddress
    ? `${addressItem.roadAddress}, ${detailAddress}`
    : addressItem.roadAddress;
}

function buildPropertyLabel(addressItem: AddressRecord, detailAddress?: string) {
  return [
    addressItem.postalCode,
    addressItem.roadAddress,
    addressItem.building,
    detailAddress?.trim() || null,
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildRegisterSummary(
  addressItem: AddressRecord,
  detailAddress?: string,
  oraclePreview?: OracleRiskPreview | null,
): SummaryView {
  const fallbackLabel = addressRiskLabelToKorean(addressItem.riskLabel);
  const riskLabel = oraclePreview ? addressRiskLabelToKorean(oraclePreview.label) : fallbackLabel;
  const riskScore = oraclePreview?.score ?? addressItem.riskScore;
  const tone = oraclePreview ? toneFromAddressRisk(oraclePreview.label) : toneFromAddressRisk(addressItem.riskLabel);

  return {
    title: '새 전세 계약 등록 준비',
    addressLine: buildAddressLine(addressItem, detailAddress),
    buildingLabel: `${addressItem.building} · 우편번호 ${addressItem.postalCode}`,
    depositLabel: '보증금 입력 전',
    protectionPercent: 0,
    remainingLabel: '-',
    maturityLabel: '계약 정보 입력 필요',
    statusLabel: riskLabel,
    riskScore,
    tone,
    stage: 1,
    note: oraclePreview
      ? '선택한 주소의 온체인 오라클 신호를 우선 반영했습니다. 아래 1단계에서 계약을 등록하면 같은 propertyId로 이어집니다.'
      : '아직 온체인 오라클 반영 전이라 샘플 주소 기준 위험도를 보여줍니다. 아래 1단계에서 계약을 등록하면 실제 leaseId가 생성됩니다.',
    liveLabel: '실제 등록 준비',
    depositKRW: '0',
    nextActionLabel: '임대인 패널 입력 시작',
    situationTitle: '선택한 주소를 기준으로 실제 등록 준비 상태예요.',
    situationDescription: oraclePreview
      ? '이 주소는 현재 온체인 오라클 기준으로 사전 점검이 가능한 상태입니다. 아래 워크스페이스에서 계약 정보를 입력하면 같은 부동산 기준으로 등록됩니다.'
      : '데모가 아니라 실제 등록 흐름으로 전환된 상태입니다. 아직 이 주소의 온체인 오라클 반영값이 없으면 샘플 기준 위험도를 함께 보여줍니다.',
    settlementStatus: '정산 없음',
    scenario: 'live',
    trustBundle: getTrustBundle('register'),
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
    buildingLabel: `${addressItem.building} · 우편번호 ${addressItem.postalCode}`,
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
    trustBundle: getTrustBundle(demo.scenario),
  };
}

type LiveTrustRecord = readonly [boolean, boolean, boolean, boolean, boolean, bigint, bigint] | undefined;

function buildLiveSummary({
  activeLease,
  liveInfo,
  liveLeaseData,
  liveRemaining,
  liveTrustRecord,
  liveOraclePreview,
}: {
  activeLease: LeaseDraft | null;
  liveInfo: readonly [string, string, bigint, bigint, number];
  liveLeaseData: readonly [string, string, bigint, bigint, bigint, string, number, bigint, boolean];
  liveRemaining: bigint | undefined;
  liveTrustRecord: LiveTrustRecord;
  liveOraclePreview?: OracleRiskPreview | null;
}): SummaryView {
  const stateNum = Number(liveInfo[4]);
  const contractStateLabel = CONTRACT_STATE[stateNum] || '상태 미확인';
  const deposit = liveInfo[2];
  const currentValue = liveInfo[3];
  const depositNumber = Number(deposit);
  const currentValueNumber = Number(currentValue);
  const protectionPercent =
    depositNumber > 0 ? Math.min(100, (currentValueNumber / depositNumber) * 100) : 0;
  const fallbackRiskLabel = riskLabelFromState(stateNum);
  const statusLabel = liveOraclePreview ? addressRiskLabelToKorean(liveOraclePreview.label) : fallbackRiskLabel;
  const riskScore = liveOraclePreview?.score ?? riskScoreFromState(stateNum);
  const tone = liveOraclePreview ? toneFromAddressRisk(liveOraclePreview.label) : toneFromState(stateNum);

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
    statusLabel,
    riskScore,
    tone,
    stage: stageFromState(stateNum, liveRemaining),
    note: currentValueNumber > 0
      ? `${contractStateLabel} · ${liveOraclePreview ? '오라클 점수와 신호를 함께 반영한 상태입니다.' : '계약 상태는 실시간이지만, 오라클 점수는 아직 반영 전일 수 있습니다.'}`
      : `${contractStateLabel} · 등록은 됐지만 아직 보증금이 예치되지 않은 상태입니다.`,
    liveLabel: `실시간 온체인 계약 · ${contractStateLabel}`,
    depositKRW: activeLease?.depositKRW || String(Math.round(depositNumber / 1e18)),
    nextActionLabel: nextActionFromState(stateNum),
    situationTitle: situationTitleFromState(stateNum),
    situationDescription: situationDescriptionFromState(stateNum),
    settlementStatus: stateNum === 4 ? '최종 정산 완료' : '정산 없음',
    scenario: 'live',
    trustBundle: buildLiveTrustBundle(
      liveTrustRecord,
      `임대인 ${formatAddress(String(liveInfo[1]))}`,
      `임차인 ${formatAddress(String(liveInfo[0]))}`,
      stateNum,
      liveRemaining,
    ),
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
  if (stateNum === 2 || stateNum === 5) return 78;
  if (stateNum === 0 || stateNum === 3) return 52;
  return 24;
}

function toneFromAddressRisk(riskLabel: AddressRecord['riskLabel']): SummaryTone {
  if (riskLabel === 'Safe') return 'safe';
  if (riskLabel === 'Monitor') return 'monitor';
  return 'warning';
}

function addressRiskLabelToKorean(riskLabel: AddressRecord['riskLabel']) {
  if (riskLabel === 'Safe') return '정상';
  if (riskLabel === 'Monitor') return '주의';
  return '위험';
}

function riskLabelFromState(stateNum: number) {
  if (stateNum === 2 || stateNum === 5) return '위험';
  if (stateNum === 0 || stateNum === 3) return '주의';
  return '정상';
}

function stageFromState(stateNum: number, remainingDays?: bigint) {
  if (stateNum === 0) return 1;
  if (stateNum === 1 && remainingDays !== undefined && remainingDays > BigInt(0) && remainingDays <= BigInt(30)) {
    return 4;
  }
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

function trustKindFromLiveState(stateNum: number, remainingDays?: bigint): TrustBundleKind {
  if (stateNum === 0) return 'register';
  if (stateNum === 1 && remainingDays !== undefined && remainingDays > BigInt(0) && remainingDays <= BigInt(30)) {
    return 'extension';
  }
  if (stateNum === 1) return 'safe';
  if (stateNum === 2 || stateNum === 5) return 'risk';
  if (stateNum === 3) return 'settlement';
  return 'returned';
}

function buildLiveTrustBundle(
  record: LiveTrustRecord,
  landlordName: string,
  tenantName: string,
  stateNum: number,
  remainingDays: bigint | undefined,
): TrustBundle {
  // record가 없거나 아직 로딩 중이면 기존 템플릿으로 폴백
  if (!record) {
    return getTrustBundle(trustKindFromLiveState(stateNum, remainingDays), { landlordName, tenantName });
  }

  const [documentsAttached, normalCompletion, depositReturnedOnTime, settlementDisputeOpened, responseWithinDeadline] = record;

  const landlordBadges: import('@/lib/trust').TrustBadge[] = [
    {
      label: '계약서 해시 등록',
      helper: documentsAttached ? '계약서·특약 해시가 온체인에 기록됐습니다.' : '계약 등록 시 문서 해시 첨부 미완료.',
      tone: documentsAttached ? 'safe' : 'monitor',
    },
    {
      label: settlementDisputeOpened ? '분쟁 이력 있음' : '분쟁 이력 없음',
      helper: settlementDisputeOpened ? '퇴실 정산 중 분쟁이 발생했습니다.' : '정산 분쟁 없이 진행 중입니다.',
      tone: settlementDisputeOpened ? 'warning' : 'safe',
    },
  ];

  const tenantBadges: import('@/lib/trust').TrustBadge[] = [
    {
      label: responseWithinDeadline ? '기한 내 응답 기록' : '응답 기한 준수 미확인',
      helper: responseWithinDeadline ? '72시간 내 응답 사실이 온체인에 기록됐습니다.' : '아직 응답 기한 이벤트가 발생하지 않았습니다.',
      tone: responseWithinDeadline ? 'safe' : 'monitor',
    },
    {
      label: depositReturnedOnTime ? '제때 반환 기록됨' : '반환 완료 전',
      helper: depositReturnedOnTime ? '만기 후 7일 내 반환 사실이 체인에 기록됐습니다.' : '반환이 완료되면 신뢰 이벤트가 자동으로 남습니다.',
      tone: depositReturnedOnTime ? 'safe' : 'monitor',
    },
  ];

  const metrics: import('@/lib/trust').TrustMetric[] = [
    { label: '정상 종료', value: normalCompletion ? '확인됨' : '진행 중', helper: '분쟁 없이 계약 종료 시 true 기록' },
    { label: '문서 해시', value: documentsAttached ? '등록됨' : '없음', helper: '계약서·특약 keccak 해시' },
    { label: '제때 반환', value: depositReturnedOnTime ? '기록됨' : '미기록', helper: '만기 후 7일 내 반환 여부' },
    { label: '분쟁 여부', value: settlementDisputeOpened ? '있음' : '없음', helper: '퇴실 정산 분쟁 발생 기록' },
  ];

  return {
    title: '온체인 계약 신뢰 기록',
    subtitle: '체인에서 직접 읽은 실제 계약 이력입니다. 템플릿이 아닙니다.',
    note: 'JeonseVault.getLeaseTrustRecord()로 조회한 값입니다.',
    landlord: {
      roleLabel: '임대인',
      displayName: landlordName,
      headline: settlementDisputeOpened ? '분쟁 이력이 있는 계약' : documentsAttached ? '문서 해시 등록 완료' : '계약 진행 중',
      summary: settlementDisputeOpened
        ? '이 계약에서 퇴실 정산 분쟁이 발생했습니다. HUG 중재 결과가 반영됩니다.'
        : '계약이 정상 진행 중이며, 분쟁 없이 종료되면 정상 종료 이벤트가 남습니다.',
      badges: landlordBadges,
      metrics,
    },
    tenant: {
      roleLabel: '임차인',
      displayName: tenantName,
      headline: depositReturnedOnTime ? '제때 반환 확인됨' : responseWithinDeadline ? '기한 내 응답 기록됨' : '계약 진행 중',
      summary: depositReturnedOnTime
        ? '보증금이 만기 후 7일 내에 반환되어 신뢰 이벤트가 기록됐습니다.'
        : '계약이 정상 진행 중이며, 반환 완료 시 신뢰 이벤트가 자동으로 남습니다.',
      badges: tenantBadges,
      metrics,
    },
    attestations: [],
  };
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
