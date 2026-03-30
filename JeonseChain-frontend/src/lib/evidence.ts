export type EvidenceFileRecord = {
  originalName: string;
  storedName: string;
  size: number;
  mimeType: string;
  sha256: `0x${string}`;
  url?: string | null;
};

export type EvidenceBundleRecord = {
  bundleId: string;
  leaseId: string;
  note: string;
  createdAt: string;
  bundleHash: `0x${string}`;
  manifestUrl: string;
  storageMode?: 'local-disk' | 'stateless-hash';
  files: EvidenceFileRecord[];
};
