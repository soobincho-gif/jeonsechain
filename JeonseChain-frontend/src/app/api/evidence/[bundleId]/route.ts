import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { bundleId: string } },
) {
  const manifestPath = path.join(
    process.cwd(),
    'data',
    'evidence',
    params.bundleId,
    'manifest.json',
  );

  try {
    const raw = await readFile(manifestPath, 'utf8');
    return new NextResponse(raw, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Evidence bundle not found.',
        hint: '외부 배포 환경에서는 원본 파일 대신 해시 번들과 manifest 다운로드만 제공될 수 있습니다.',
      },
      { status: 404 },
    );
  }
}
