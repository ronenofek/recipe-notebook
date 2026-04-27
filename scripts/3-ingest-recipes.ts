import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import pLimit from 'p-limit';
import { getDb } from '../src/lib/db';
import { extractRecipesFromChapter, looksLikeRecipeChapter } from './lib/claude-extractor';
import { isChapterDone, markChapterStatus, writeRecipes, markBookIngested } from './lib/db-writer';
import type { Book } from '../src/lib/types';

const BOOKS_DIR = path.join(process.cwd(), 'books');
const RETRY_ERRORS = process.argv.includes('--retry-errors');
const CONCURRENCY = 1;

async function ingestBook(book: Book) {
  const db = getDb();
  const chaptersDir = path.join(BOOKS_DIR, book.drive_id, 'chapters');
  const imagesDir = path.join(BOOKS_DIR, book.drive_id, 'images');

  if (!fs.existsSync(chaptersDir)) {
    console.log(`  [SKIP] No chapters directory (run books:extract first)`);
    return;
  }

  const chapterFiles = fs.readdirSync(chaptersDir).filter(f => f.endsWith('.json')).sort();
  console.log(`  Processing ${chapterFiles.length} chapters...`);

  const limit = pLimit(CONCURRENCY);
  let totalRecipes = 0;
  let isFirst = true;

  const tasks = chapterFiles.map((filename, idx) =>
    limit(async () => {
      const chapterId = filename.replace('.json', '');

      if (!RETRY_ERRORS && isChapterDone(db, book.id, chapterId)) {
        process.stdout.write('.');
        return;
      }

      const chapterData = JSON.parse(fs.readFileSync(path.join(chaptersDir, filename), 'utf8'));
      const content = chapterData.text ?? '';
      const title = chapterData.title ?? chapterData.id ?? filename;

      if (!looksLikeRecipeChapter(title, content)) {
        markChapterStatus(db, book.id, chapterId, 'done', 0);
        process.stdout.write('-');
        return;
      }

      try {
        const recipes = await extractRecipesFromChapter(
          book.title, book.author, title, content, isFirst
        );
        isFirst = false;

        if (recipes.length > 0) {
          writeRecipes(db, book.id, title, recipes, imagesDir, book.drive_id);
          totalRecipes += recipes.length;
          process.stdout.write(`[${recipes.length}]`);
        } else {
          process.stdout.write('·');
        }

        markChapterStatus(db, book.id, chapterId, 'done', recipes.length);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        markChapterStatus(db, book.id, chapterId, 'error', 0, msg);
        process.stdout.write('E');
      }
    })
  );

  await Promise.all(tasks);
  process.stdout.write('\n');

  markBookIngested(db, book.id);
  console.log(`  Done. Extracted ${totalRecipes} recipes.`);
}

async function main() {
  const db = getDb();

  // Only process books that have been downloaded + extracted (chapters dir exists)
  // and haven't been fully ingested yet (or have errors if --retry-errors)
  const books = db.prepare('SELECT * FROM books').all() as Book[];

  let processed = 0;
  for (const book of books) {
    const chaptersDir = path.join(BOOKS_DIR, book.drive_id, 'chapters');
    if (!fs.existsSync(chaptersDir)) continue;

    // Skip fully ingested books unless --retry-errors
    if (book.ingested_at && !RETRY_ERRORS) {
      const hasErrors = db.prepare(
        `SELECT COUNT(*) as n FROM ingestion_log WHERE book_id = ? AND status = 'error'`
      ).get(book.id) as { n: number };
      if (hasErrors.n === 0) {
        console.log(`[SKIP] ${book.title} (already ingested, ${book.recipe_count} recipes)`);
        continue;
      }
    }

    console.log(`\n[${book.title}]`);
    await ingestBook(book);
    processed++;
  }

  if (processed === 0) {
    console.log('All books already ingested. Use --retry-errors to re-process failed chapters.');
  }

  const total = db.prepare('SELECT COUNT(*) as n FROM recipes').get() as { n: number };
  console.log(`\nTotal recipes in database: ${total.n}`);
}

main().catch(err => { console.error(err); process.exit(1); });
