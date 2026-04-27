import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Recipe, RecipeImage, Ingredient } from '@/lib/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (!Number.isInteger(recipeId) || recipeId < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const db = getDb();
  const recipe = db.prepare(`
    SELECT r.*, b.title as book_title, b.author as book_author, b.year as book_year, b.publisher as book_publisher
    FROM recipes r
    JOIN books b ON r.book_id = b.id
    WHERE r.id = ?
  `).get(recipeId) as (Recipe & { book_year?: number; book_publisher?: string }) | undefined;

  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const images = db.prepare(
    'SELECT * FROM recipe_images WHERE recipe_id = ? ORDER BY sort_order'
  ).all(recipeId) as RecipeImage[];

  const ingredients = db.prepare(
    'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY id'
  ).all(recipeId) as Ingredient[];

  return NextResponse.json({ recipe, images, ingredients });
}
