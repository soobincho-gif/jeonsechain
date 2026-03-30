import type { EvidenceBundleRecord, EvidenceFileRecord } from '@/lib/evidence';

function toHex(buffer: ArrayBuffer) {
  return `0x${Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`;
}

async function sha256Hex(input: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  const normalizedBytes = new Uint8Array(bytes.byteLength);
  normalizedBytes.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', normalizedBytes);
  return toHex(digest);
}

function createManifestDataUrl(manifest: Omit<EvidenceBundleRecord, 'manifestUrl'>) {
  return `data:application/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(manifest, null, 2),
  )}`;
}

export async function buildStatelessEvidenceBundle({
  leaseId,
  note,
  files,
}: {
  leaseId: string;
  note: string;
  files: File[];
}): Promise<EvidenceBundleRecord> {
  const bundleId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const fileRecords: EvidenceFileRecord[] = await Promise.all(
    files.map(async (file, index) => {
      const bytes = await file.arrayBuffer();
      const sha256 = await sha256Hex(bytes);
      return {
        originalName: file.name || `evidence-${index + 1}`,
        storedName: `${String(index + 1).padStart(2, '0')}-${sha256.slice(2, 14)}`,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256,
        url: null,
      };
    }),
  );

  const bundleHashSource = JSON.stringify({
    leaseId,
    note,
    createdAt,
    fileHashes: fileRecords.map((file) => file.sha256),
  });
  const bundleHash = await sha256Hex(bundleHashSource);

  const manifestBase = {
    bundleId,
    leaseId,
    note,
    createdAt,
    bundleHash,
    storageMode: 'stateless-hash' as const,
    files: fileRecords,
  };

  return {
    ...manifestBase,
    manifestUrl: createManifestDataUrl(manifestBase),
  };
}
