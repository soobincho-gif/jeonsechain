import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import type { EvidenceBundleRecord, EvidenceFileRecord } from '@/lib/evidence';

export const runtime = 'nodejs';

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createManifestDataUrl(manifest: Omit<EvidenceBundleRecord, 'manifestUrl'>) {
  const encoded = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8').toString('base64');
  return `data:application/json;base64,${encoded}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const leaseId = String(formData.get('leaseId') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!leaseId) {
    return NextResponse.json({ error: 'leaseId is required.' }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one evidence file is required.' }, { status: 400 });
  }

  const bundleId = randomUUID();
  const createdAt = new Date().toISOString();
  const storageMode: NonNullable<EvidenceBundleRecord['storageMode']> =
    process.env.VERCEL || process.env.JEONSE_EVIDENCE_MODE === 'stateless'
      ? 'stateless-hash'
      : 'local-disk';
  const publicDir = path.join(process.cwd(), 'public', 'evidence', bundleId);
  const dataDir = path.join(process.cwd(), 'data', 'evidence', bundleId);

  if (storageMode === 'local-disk') {
    await mkdir(publicDir, { recursive: true });
    await mkdir(dataDir, { recursive: true });
  }

  const fileRecords: EvidenceFileRecord[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = `0x${createHash('sha256').update(bytes).digest('hex')}` as `0x${string}`;
    const ext = path.extname(file.name || '') || '';
    const storedName = `${String(index + 1).padStart(2, '0')}-${sha256.slice(2, 14)}${sanitizeFilename(ext)}`;

    if (storageMode === 'local-disk') {
      await writeFile(path.join(publicDir, storedName), bytes);
    }

    fileRecords.push({
      originalName: file.name || `evidence-${index + 1}`,
      storedName,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      sha256,
      url: storageMode === 'local-disk' ? `/evidence/${bundleId}/${storedName}` : null,
    });
  }

  const bundleHashSource = JSON.stringify({
    leaseId,
    note,
    createdAt,
    fileHashes: fileRecords.map((file) => file.sha256),
  });
  const bundleHash = `0x${createHash('sha256').update(bundleHashSource).digest('hex')}` as `0x${string}`;

  const manifestBase = {
    bundleId,
    leaseId,
    note,
    createdAt,
    bundleHash,
    storageMode,
    files: fileRecords,
  };
  const manifest: EvidenceBundleRecord = {
    ...manifestBase,
    manifestUrl:
      storageMode === 'local-disk'
        ? `/api/evidence/${bundleId}`
        : createManifestDataUrl(manifestBase),
  };

  if (storageMode === 'local-disk') {
    await writeFile(
      path.join(dataDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
  }

  return NextResponse.json(manifest);
}
