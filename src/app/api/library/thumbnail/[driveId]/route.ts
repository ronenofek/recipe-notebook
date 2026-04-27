import { NextResponse } from 'next/server';

// In-memory cache: driveId -> { url, expires }
const urlCache = new Map<string, { url: string; expires: number }>();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ driveId: string }> }
) {
  const { driveId } = await params;

  // Validate driveId: Drive IDs are alphanumeric with _ and -
  if (!/^[a-zA-Z0-9_-]+$/.test(driveId)) {
    return new NextResponse('Invalid id', { status: 400 });
  }

  try {
    const { getFileThumbnailLink } = await import('../../../../../../scripts/lib/drive-client');

    let thumbnailUrl = urlCache.get(driveId);
    if (!thumbnailUrl || Date.now() > thumbnailUrl.expires) {
      const url = await getFileThumbnailLink(driveId);
      if (!url) return new NextResponse('No thumbnail', { status: 404 });
      thumbnailUrl = { url, expires: Date.now() + 55 * 60 * 1000 }; // cache 55 min
      urlCache.set(driveId, thumbnailUrl);
    }

    const imgRes = await fetch(thumbnailUrl.url);
    if (!imgRes.ok) {
      urlCache.delete(driveId); // stale URL, clear cache
      return new NextResponse('Thumbnail fetch failed', { status: 502 });
    }

    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
    const body = await imgRes.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(msg, { status: 500 });
  }
}
