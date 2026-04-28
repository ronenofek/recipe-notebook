import Database from 'better-sqlite3';
import type { ExtractedRecipe } from '../../src/lib/types';

export function upsertBook(
  db: Database.Database,
  driveId: string,
  title: string,
  author: string,
  filename: string,
  fileType: 'epub' | 'pdf',
  publisher?: string | null,
  year?: number | null,
): number {
  const existing = db.prepare('SELECT id FROM books WHERE drive_id = ?').get(driveId) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db.prepare(`
    INSERT INTO books (drive_id, title, author, filename, file_type, publisher, year)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(driveId, title, author, filename, fileType, publisher ?? null, year ?? null);

  return result.lastInsertRowid as number;
}

export function logChapterPending(
  db: Database.Database,
  bookId: number,
  chapterRef: string,
): number {
  const result = db.prepare(`
    INSERT OR IGNORE INTO ingestion_log (book_id, chapter_ref, status)
    VALUES (?, ?, 'pending')
  `).run(bookId, chapterRef);
  return result.lastInsertRowid as number;
}

export function isChapterDone(db: Database.Database, bookId: number, chapterRef: string): boolean {
  const row = db.prepare(`
    SELECT status FROM ingestion_log WHERE book_id = ? AND chapter_ref = ?
  `).get(bookId, chapterRef) as { status: string } | undefined;
  return row?.status === 'done';
}

export function markChapterStatus(
  db: Database.Database,
  bookId: number,
  chapterRef: string,
  status: 'done' | 'error',
  recipesFound: number,
  errorMsg?: string,
): void {
  db.prepare(`
    INSERT INTO ingestion_log (book_id, chapter_ref, status, recipes_found, error_msg, processed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(book_id, chapter_ref) DO UPDATE SET
      status = excluded.status,
      recipes_found = excluded.recipes_found,
      error_msg = excluded.error_msg,
      processed_at = excluded.processed_at
  `).run(bookId, chapterRef, status, recipesFound, errorMsg ?? null);
}

export function writeRecipes(
  db: Database.Database,
  bookId: number,
  chapterTitle: string,
  recipes: ExtractedRecipe[],
): void {
  const insertRecipe = db.prepare(`
    INSERT INTO recipes (
      book_id, title, description, servings, prep_time, cook_time, total_time,
      course, cuisine, ingredients_raw, instructions, notes, tags, source_chapter
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertIngredient = db.prepare(`
    INSERT INTO ingredients (recipe_id, name, quantity, unit, preparation, is_optional)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const writeAll = db.transaction(() => {
    for (const recipe of recipes) {
      if (!recipe.title?.trim()) continue;

      const ingredientsJson = JSON.stringify(
        (recipe.ingredients ?? []).map(i => {
          const parts = [i.quantity, i.unit, i.name, i.preparation].filter(Boolean);
          return parts.join(' ').trim();
        })
      );

      const result = insertRecipe.run(
        bookId,
        recipe.title.trim(),
        recipe.description ?? null,
        recipe.servings ?? null,
        recipe.prep_time ?? null,
        recipe.cook_time ?? null,
        recipe.total_time ?? null,
        recipe.course ?? null,
        recipe.cuisine ?? null,
        ingredientsJson,
        JSON.stringify(recipe.instructions ?? []),
        recipe.notes ?? null,
        JSON.stringify(recipe.tags ?? []),
        chapterTitle,
      );

      const recipeId = result.lastInsertRowid as number;

      for (const ing of (recipe.ingredients ?? [])) {
        if (!ing.name?.trim()) continue;
        insertIngredient.run(
          recipeId, ing.name.trim(),
          ing.quantity ?? null, ing.unit ?? null,
          ing.preparation ?? null, ing.optional ? 1 : 0
        );
      }
    }
  });

  writeAll();
}

export function markBookIngested(db: Database.Database, bookId: number): void {
  db.prepare(`
    UPDATE books SET
      ingested_at = datetime('now'),
      recipe_count = (SELECT COUNT(*) FROM recipes WHERE book_id = ?)
    WHERE id = ?
  `).run(bookId, bookId);
}
