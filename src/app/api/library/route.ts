import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';
import type { Book, BookCategory } from '@/lib/types';

const PUBLIC_IMAGES = path.join(process.cwd(), 'public', 'book-images');
const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function findLocalCover(driveId: string): string | null {
  for (const ext of COVER_EXTENSIONS) {
    if (fs.existsSync(path.join(PUBLIC_IMAGES, driveId, `cover${ext}`))) {
      return `/book-images/${driveId}/cover${ext}`;
    }
  }
  return null;
}

// Cached in memory for 60s to avoid hammering Drive API
let cache: { data: unknown; expires: number } | null = null;

function categorizeBook(title: string, author: string): BookCategory {
  const text = (title + ' ' + author).toLowerCase();

  const breadTerms = ['bread', 'sourdough', 'baking', 'baker', 'pastry', 'loaf', 'crust', 'flour', 'levain', 'tartine', 'dough'];
  const fermentTerms = ['ferment', 'fermented', 'fermentation', 'pickle', 'pickling', 'kombucha', 'koji', 'kefir', 'brine', 'shockey', 'lacto-ferment', 'cultured', 'probiotic'];
  const asianTerms = ['asian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'indian', 'sushi', 'wok', 'ramen', 'curry', 'dim sum', 'noodle', 'dumpling', 'miso', 'szechuan', 'sichuan', 'cantonese', 'hakka', 'southern thai', 'kalaya', 'mowgli'];
  const latinTerms = ['mexican', 'latin', 'south american', 'central american', 'colombian', 'peruvian', 'brazilian', 'venezuelan', 'taco', 'enchilada', 'salsa', 'guacamole', 'burrito', 'tortilla', 'masa', 'oaxaca', 'oaxacan', 'yucatan', 'ceviche'];

  if (breadTerms.some(t => text.includes(t))) return 'Bread Baking';
  if (fermentTerms.some(t => text.includes(t))) return 'Fermentation';
  if (asianTerms.some(t => text.includes(t))) return 'Asian';
  if (latinTerms.some(t => text.includes(t))) return 'Central/South America';
  return 'Others';
}

export async function GET() {
  if (cache && Date.now() < cache.expires) {
    return NextResponse.json(cache.data);
  }

  try {
    // Import Drive client dynamically (needs service account credentials)
    const { listCookbookFiles, parseBookMeta } = await import('../../../../scripts/lib/drive-client');
    const db = getDb();

    const driveFiles = await listCookbookFiles();
    const loadedBooks = db.prepare('SELECT * FROM books').all() as Book[];
    const loadedByDriveId = new Map(loadedBooks.map(b => [b.drive_id, b]));

    const library = driveFiles.map(file => {
      const loaded = loadedByDriveId.get(file.id);
      const meta = parseBookMeta(file.name);
      const fileType = file.mimeType === 'application/pdf' ? 'pdf' : 'epub';

      // Determine status
      let status: 'loaded' | 'loading' | 'not_loaded' | 'error' = 'not_loaded';
      let recipe_count = 0;
      let error_msg: string | undefined;

      if (loaded) {
        if (loaded.ingested_at) {
          status = 'loaded';
          recipe_count = loaded.recipe_count;
        } else {
          // Check for errors
          const errRow = db.prepare(
            `SELECT COUNT(*) as n FROM ingestion_log WHERE book_id = ? AND status = 'error'`
          ).get(loaded.id) as { n: number };
          const pendingRow = db.prepare(
            `SELECT COUNT(*) as n FROM ingestion_log WHERE book_id = ? AND status IN ('pending','processing')`
          ).get(loaded.id) as { n: number };

          if (errRow.n > 0 && pendingRow.n === 0) {
            status = 'error';
            const lastErr = db.prepare(
              `SELECT error_msg FROM ingestion_log WHERE book_id = ? AND status = 'error' LIMIT 1`
            ).get(loaded.id) as { error_msg: string } | undefined;
            error_msg = lastErr?.error_msg;
          } else {
            status = pendingRow.n > 0 ? 'loading' : 'not_loaded';
          }
        }
      }

      const title = loaded?.title ?? meta.title;
      const author = loaded?.author ?? meta.author;

      // Prefer local extracted cover; fall back to Drive proxy thumbnail
      const localCover = findLocalCover(file.id);
      const thumbnail_url = localCover
        ?? (file.thumbnailLink ? `/api/library/thumbnail/${file.id}` : null);

      return {
        drive_id: file.id,
        title,
        author,
        filename: file.name,
        file_type: fileType,
        file_size: file.size,
        status,
        recipe_count,
        error_msg,
        db_id: loaded?.id,
        category: categorizeBook(title, author),
        thumbnail_url,
      };
    });

    const result = { library };
    cache = { data: result, expires: Date.now() + 60_000 };
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function invalidateLibraryCache() {
  cache = null;
}
