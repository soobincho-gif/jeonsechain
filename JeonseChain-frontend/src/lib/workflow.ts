export type ActivityTone = 'info' | 'success' | 'warning';

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  tone: ActivityTone;
  timestamp: number;
  txHash?: string;
  leaseId?: string;
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
