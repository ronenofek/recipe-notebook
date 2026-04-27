import { NextRequest } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getDb } from '@/lib/db';
import type { Book } from '@/lib/types';

function checkAuth(req: NextRequest): boolean {
  // Phase 1 (local): allow requests from localhost
  const host = req.headers.get('host') ?? '';
  if (host.startsWith('localhost:') || host === 'localhost') return true;

  // Phase 2 (deployed): require Bearer token
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json() as { drive_ids: string[] };
  const { drive_ids } = body;
  if (!Array.isArray(drive_ids) || drive_ids.length === 0) {
    return new Response('Missing drive_ids', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const { downloadFile, listCookbookFiles, parseBookMeta } = await import('../../../../../scripts/lib/drive-client');
        const { parseEpub } = await import('../../../../../scripts/lib/epub-parser');
        const { extractPdfText, chunkPdfPages, renderPdfPages } = await import('../../../../../scripts/lib/pdf-parser');
        const { extractRecipesFromChapter } = await import('../../../../../scripts/lib/claude-extractor');
        const { upsertBook, logChapterPending, isChapterDone, markChapterStatus, writeRecipes, markBookIngested } = await import('../../../../../scripts/lib/db-writer');
        const pLimit = (await import('p-limit')).default;

        const db = getDb();
        const driveFiles = await listCookbookFiles();
        const filesToProcess = driveFiles.filter(f => drive_ids.includes(f.id));

        const BOOKS_DIR = path.join(process.cwd(), 'books');
        const PUBLIC_IMAGES = path.join(process.cwd(), 'public', 'book-images');

        for (const file of filesToProcess) {
          const fileType = file.mimeType === 'application/pdf' ? 'pdf' : 'epub';
          const ext = fileType === 'pdf' ? '.pdf' : '.epub';
          const meta = parseBookMeta(file.name);
          const bookId = upsertBook(db, file.id, meta.title, meta.author, file.name, fileType, meta.publisher, meta.year);

          send({ type: 'book_start', drive_id: file.id, book_title: meta.title });

          // Step 1: Download
          const bookDir = path.join(BOOKS_DIR, file.id);
          const srcPath = path.join(bookDir, `original${ext}`);
          if (!fs.existsSync(srcPath)) {
            send({ type: 'chapter_progress', drive_id: file.id, message: 'Downloading...' });
            await downloadFile(file.id, srcPath);
          }

          // Step 2: Extract content
          const chaptersDir = path.join(bookDir, 'chapters');
          fs.mkdirSync(chaptersDir, { recursive: true });

          const destImages = path.join(PUBLIC_IMAGES, file.id);
          fs.mkdirSync(destImages, { recursive: true });

          let chapterFiles: string[] = [];

          if (fileType === 'epub') {
            send({ type: 'chapter_progress', drive_id: file.id, message: 'Parsing EPUB...' });
            const content = parseEpub(srcPath, bookDir);

            const srcImages = path.join(bookDir, 'images');
            if (fs.existsSync(srcImages)) {
              for (const img of fs.readdirSync(srcImages)) {
                fs.copyFileSync(path.join(srcImages, img), path.join(destImages, img));
              }
            }

            // Save cover to standardized name for library thumbnails
            if (content.coverFile) {
              const coverExt = path.extname(content.coverFile).toLowerCase();
              const coverSrc = path.join(srcImages, content.coverFile);
              if (fs.existsSync(coverSrc)) {
                fs.copyFileSync(coverSrc, path.join(destImages, `cover${coverExt}`));
              }
            }

            for (const chapter of content.chapters) {
              const f = path.join(chaptersDir, `${chapter.id}.json`);
              fs.writeFileSync(f, JSON.stringify(chapter, null, 2));
              logChapterPending(db, bookId, chapter.id);
            }
            chapterFiles = content.chapters.map(c => `${c.id}.json`);
          } else {
            send({ type: 'chapter_progress', drive_id: file.id, message: 'Extracting PDF text...' });
            const pages = await extractPdfText(srcPath);

            send({ type: 'chapter_progress', drive_id: file.id, message: 'Rendering PDF pages...' });
            const imageFiles = await renderPdfPages(srcPath, bookDir);
            const srcImages = path.join(bookDir, 'images');
            for (const img of imageFiles) {
              const src = path.join(srcImages, img);
              if (fs.existsSync(src)) {
                fs.copyFileSync(src, path.join(destImages, img));
              }
            }

            const chunks = chunkPdfPages(pages);
            for (const chunk of chunks) {
              const f = path.join(chaptersDir, `${chunk.id}.json`);
              fs.writeFileSync(f, JSON.stringify(chunk, null, 2));
              logChapterPending(db, bookId, chunk.id);
            }
            chapterFiles = chunks.map(c => `${c.id}.json`);
          }

          // Step 3: Claude extraction
          const total = chapterFiles.length;
          let done = 0;
          let totalRecipes = 0;
          let isFirst = true;
          const limit = pLimit(1);

          const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as Book;

          await Promise.all(chapterFiles.map(filename =>
            limit(async () => {
              const chapterId = filename.replace('.json', '');
              if (isChapterDone(db, bookId, chapterId)) {
                done++;
                send({ type: 'chapter_progress', drive_id: file.id, chapter_current: done, chapter_total: total, recipes_found: totalRecipes });
                return;
              }

              const chapterData = JSON.parse(fs.readFileSync(path.join(chaptersDir, filename), 'utf8'));
              const content = chapterData.text ?? '';
              const title = chapterData.title ?? chapterId;
              const imagesDir = path.join(bookDir, 'images');

              try {
                const recipes = await extractRecipesFromChapter(book.title, book.author, title, content, isFirst);
                isFirst = false;
                if (recipes.length > 0) {
                  writeRecipes(db, bookId, title, recipes, imagesDir, file.id);
                  totalRecipes += recipes.length;
                }
                markChapterStatus(db, bookId, chapterId, 'done', recipes.length);
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                markChapterStatus(db, bookId, chapterId, 'error', 0, msg);
              }

              done++;
              send({ type: 'chapter_progress', drive_id: file.id, chapter_current: done, chapter_total: total, recipes_found: totalRecipes });
            })
          ));

          markBookIngested(db, bookId);
          send({ type: 'book_done', drive_id: file.id, recipes_found: totalRecipes });
        }

        send({ type: 'all_done' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
