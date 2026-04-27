import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { getDb } from '@/lib/db';
import RecipePDF from '@/pdf-templates/RecipePDF';
import type { Recipe, Ingredient } from '@/lib/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (!Number.isInteger(recipeId) || recipeId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = getDb();
  const recipe = db.prepare(`
    SELECT r.*, b.title as book_title, b.author as book_author, b.year as book_year
    FROM recipes r JOIN books b ON r.book_id = b.id
    WHERE r.id = ?
  `).get(recipeId) as (Recipe & { book_year?: number }) | undefined;

  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ingredients = db.prepare(
    'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY id'
  ).all(recipeId) as Ingredient[];

  const buffer = await renderToBuffer(
    createElement(RecipePDF, { recipe, ingredients })
  );

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${recipe.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf"`,
    },
  });
}
