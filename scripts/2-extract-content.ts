import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { getDb } from '../src/lib/db';
import { parseEpub } from './lib/epub-parser';
import { extractPdfText, chunkPdfPages, renderPdfPages } from './lib/pdf-parser';
import { logChapterPending } from './lib/db-writer';
import type { Book } from '../src/lib/types';

const BOOKS_DIR = path.join(process.cwd(), 'books');
const PUBLIC_IMAGES_DIR = path.join(process.cwd(), 'public', 'book-images');

async function processBook(book: Book) {
  const db = getDb();
  const bookDir = path.join(BOOKS_DIR, book.drive_id);
  const ext = book.file_type === 'pdf' ? '.pdf' : '.epub';
  const srcPath = path.join(bookDir, `original${ext}`);

  if (!fs.existsSync(srcPath)) {
    console.log(`  [SKIP] File not downloaded: ${srcPath}`);
    return;
  }

  const chaptersDir = path.join(bookDir, 'chapters');
  fs.mkdirSync(chaptersDir, { recursive: true });

  if (book.file_type === 'epub') {
    console.log(`  Parsing EPUB...`);
    const content = parseEpub(srcPath, bookDir);

    // Copy images to public dir
    const srcImages = path.join(bookDir, 'images');
    const destImages = path.join(PUBLIC_IMAGES_DIR, book.drive_id);
    fs.mkdirSync(destImages, { recursive: true });
    if (fs.existsSync(srcImages)) {
      for (const img of fs.readdirSync(srcImages)) {
        fs.copyFileSync(path.join(srcImages, img), path.join(destImages, img));
      }
    }

    // Save cover to standardized name for library thumbnails
    if (content.coverFile) {
      const ext = path.extname(content.coverFile).toLowerCase();
      fs.copyFileSync(
        path.join(srcImages, content.coverFile),
        path.join(destImages, `cover${ext}`)
      );
    }

    console.log(`  Found ${content.chapters.length} chapters, ${content.imageFiles.length} images`);

    for (const chapter of content.chapters) {
      const chapterFile = path.join(chaptersDir, `${chapter.id}.json`);
      fs.writeFileSync(chapterFile, JSON.stringify(chapter, null, 2));
      logChapterPending(db, book.id, chapter.id);
    }

  } else {
    // PDF
    console.log(`  Extracting PDF text...`);
    const pages = await extractPdfText(srcPath);
    console.log(`  Got ${pages.length} text pages`);

    console.log(`  Rendering PDF pages as images (this may take a few minutes)...`);
    const imageFiles = await renderPdfPages(srcPath, bookDir);
    console.log(`  Rendered ${imageFiles.length} page images`);

    // Copy images to public dir
    const srcImages = path.join(bookDir, 'images');
    const destImages = path.join(PUBLIC_IMAGES_DIR, book.drive_id);
    fs.mkdirSync(destImages, { recursive: true });
    for (const img of imageFiles) {
      const src = path.join(srcImages, img);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(destImages, img));
      }
    }

    const chunks = chunkPdfPages(pages);
    for (const chunk of chunks) {
      const chunkFile = path.join(chaptersDir, `${chunk.id}.json`);
      fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2));
      logChapterPending(db, book.id, chunk.id);
    }
    console.log(`  Split into ${chunks.length} chunks for Claude`);
  }
}

async function main() {
  const db = getDb();
  const books = db.prepare('SELECT * FROM books').all() as Book[];

  for (const book of books) {
    console.log(`\n[${book.title}] (${book.file_type.toUpperCase()})`);
    await processBook(book);
  }

  console.log('\nContent extraction complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
