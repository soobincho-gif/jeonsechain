export type ActivityTone = 'info' | 'success' | 'warning';

export type ActivityRoute = {
  surface?: 'experience' | 'contract' | 'more';
  tab?: 'landlord' | 'tenant' | 'viewer';
  moreView?: 'signals' | 'trust' | 'activity' | 'data' | 'faq';
  section?: 'demo' | 'workspace' | 'settlement';
};

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  tone: ActivityTone;
  timestamp: number;
  txHash?: string;
  leaseId?: string;
  route?: ActivityRoute;
  actionLabel?: string;
};

export type LeaseDraft = {
  leaseId: string;
  tenant?: string;
  landlord?: string;
  propertyLabel?: string;
  propertyId?: string;
  depositKRW?: string;
  durationDays?: string;
  txHash?: string;
};
