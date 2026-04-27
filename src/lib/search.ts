import { getDb } from './db';
import type { Recipe } from './types';

function sanitizeFtsQuery(raw: string): string {
  // Allow letters, numbers, spaces, quotes, asterisk (prefix search), hyphen
  // Strip characters that break FTS5 syntax
  return raw
    .replace(/[^\w\s"*\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchOptions {
  q?: string;
  book_id?: number;
  course?: string;
  cuisine?: string;
  limit?: number;
  offset?: number;
}

export function searchRecipes(opts: SearchOptions): { recipes: Recipe[]; total: number } {
  const db = getDb();
  const { q, book_id, course, cuisine, limit = 48, offset = 0 } = opts;

  if (q && q.trim()) {
    const query = sanitizeFtsQuery(q);
    if (!query) return { recipes: [], total: 0 };

    const filterClauses: string[] = [];
    const filterParams: unknown[] = [query];

    if (book_id) {
      filterClauses.push('AND r.book_id = ?');
      filterParams.push(book_id);
    }
    if (course) {
      filterClauses.push('AND r.course = ?');
      filterParams.push(course);
    }
    if (cuisine) {
      filterClauses.push('AND r.cuisine = ?');
      filterParams.push(cuisine);
    }

    const filterSql = filterClauses.join(' ');

    const recipes = db.prepare(`
      SELECT r.*, b.title as book_title, b.author as book_author,
             bm25(recipes_fts) as rank
      FROM recipes_fts
      JOIN recipes r ON recipes_fts.rowid = r.id
      JOIN books b ON r.book_id = b.id
      WHERE recipes_fts MATCH ?
      ${filterSql}
      ORDER BY rank
      LIMIT ${limit} OFFSET ${offset}
    `).all(...filterParams) as Recipe[];

    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM recipes_fts
      JOIN recipes r ON recipes_fts.rowid = r.id
      WHERE recipes_fts MATCH ?
      ${filterSql}
    `).get(...filterParams) as { total: number };

    return { recipes, total: countRow.total };
  }

  // No query - browse all with optional filters
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (book_id) { conditions.push('r.book_id = ?'); params.push(book_id); }
  if (course) { conditions.push('r.course = ?'); params.push(course); }
  if (cuisine) { conditions.push('r.cuisine = ?'); params.push(cuisine); }

  const where = conditions.join(' AND ');

  const recipes = db.prepare(`
    SELECT r.*, b.title as book_title, b.author as book_author
    FROM recipes r
    JOIN books b ON r.book_id = b.id
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `).all(...params) as Recipe[];

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM recipes r WHERE ${where}
  `).get(...params) as { total: number };

  return { recipes, total: countRow.total };
}

export function getDistinctCourses(): string[] {
  const db = getDb();
  return (db.prepare(`
    SELECT DISTINCT course FROM recipes WHERE course IS NOT NULL ORDER BY course
  `).all() as { course: string }[]).map(r => r.course);
}

export function getDistinctCuisines(): string[] {
  const db = getDb();
  return (db.prepare(`
    SELECT DISTINCT cuisine FROM recipes WHERE cuisine IS NOT NULL ORDER BY cuisine
  `).all() as { cuisine: string }[]).map(r => r.cuisine);
}
