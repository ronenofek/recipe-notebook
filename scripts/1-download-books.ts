import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { listCookbookFiles, downloadFile, parseBookMeta } from './lib/drive-client';
import { getDb } from '../src/lib/db';
import { upsertBook } from './lib/db-writer';

const BOOKS_DIR = path.join(process.cwd(), 'books');

async function main() {
  const db = getDb();
  console.log('Listing files in Drive "Cook Books" folder...');
  const files = await listCookbookFiles();
  console.log(`Found ${files.length} files.\n`);

  for (const file of files) {
    const fileType = file.mimeType === 'application/pdf' ? 'pdf' : 'epub';
    const ext = fileType === 'pdf' ? '.pdf' : '.epub';
    const bookDir = path.join(BOOKS_DIR, file.id);
    const destPath = path.join(bookDir, `original${ext}`);

    const meta = parseBookMeta(file.name);

    // Register in DB
    upsertBook(db, file.id, meta.title, meta.author, file.name, fileType, meta.publisher, meta.year);

    if (fs.existsSync(destPath)) {
      console.log(`[SKIP] ${file.name} (already downloaded)`);
      continue;
    }

    console.log(`[DOWN] ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
    try {
      await downloadFile(file.id, destPath);
      console.log(`       Done.`);
    } catch (err) {
      console.error(`       FAILED: ${err}`);
    }
  }

  console.log('\nAll books downloaded to /books/');
}

main().catch(err => { console.error(err); process.exit(1); });
