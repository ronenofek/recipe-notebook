import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Clock, Users, ChevronLeft, BookOpen, Tag } from 'lucide-react';
import { getDb } from '@/lib/db';
import ExportButton from '@/components/ExportButton';
import type { Recipe, Ingredient } from '@/lib/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecipePage({ params }: PageProps) {
  const { id } = await params;
  const recipeId = parseInt(id, 10);
  if (!Number.isInteger(recipeId) || recipeId < 1) notFound();

  const db = getDb();
  const recipe = db.prepare(`
    SELECT r.*, b.title as book_title, b.author as book_author,
           b.year as book_year, b.publisher as book_publisher
    FROM recipes r JOIN books b ON r.book_id = b.id
    WHERE r.id = ?
  `).get(recipeId) as (Recipe & { book_year?: number; book_publisher?: string }) | undefined;

  if (!recipe) notFound();

  const ingredients = db.prepare(
    'SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY id'
  ).all(recipeId) as Ingredient[];

  const instructions: string[] = recipe.instructions ? JSON.parse(recipe.instructions) : [];
  const tags: string[] = recipe.tags ? JSON.parse(recipe.tags) : [];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Back to search
        </Link>
        <ExportButton recipeId={recipeId} recipeTitle={recipe.title} />
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2 mb-2">
          {recipe.cuisine && (
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
              {recipe.cuisine}
            </span>
          )}
          {recipe.course && (
            <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">
              {recipe.course}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-bold text-stone-900 mb-2">{recipe.title}</h1>

        {recipe.description && (
          <p className="text-stone-600 text-base leading-relaxed">{recipe.description}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm text-stone-500">
          {recipe.prep_time && (
            <div><span className="font-medium text-stone-700">Prep</span> {recipe.prep_time}</div>
          )}
          {recipe.cook_time && (
            <div><span className="font-medium text-stone-700">Cook</span> {recipe.cook_time}</div>
          )}
          {recipe.total_time && (
            <div><Clock className="w-4 h-4 inline mr-1" /><span className="font-medium text-stone-700">Total</span> {recipe.total_time}</div>
          )}
          {recipe.servings && (
            <div><Users className="w-4 h-4 inline mr-1" />{recipe.servings}</div>
          )}
        </div>

        {/* Book credit */}
        <div className="mt-4 flex items-start gap-2 text-sm text-stone-500 bg-stone-50 rounded-lg px-4 py-3 border border-stone-200">
          <BookOpen className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
          <div>
            <span className="font-medium text-stone-700">{recipe.book_title}</span>
            <span className="text-stone-500"> by {recipe.book_author}</span>
            {recipe.book_year && <span className="text-stone-400"> ({recipe.book_year})</span>}
            {recipe.source_chapter && (
              <span className="text-stone-400 block text-xs mt-0.5">From: {recipe.source_chapter}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
        {/* Ingredients */}
        <div className="md:col-span-2">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Ingredients</h2>
          <ul className="space-y-2">
            {ingredients.length > 0 ? (
              ingredients.map(ing => (
                <li key={ing.id} className="flex gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                  <span className={ing.is_optional ? 'text-stone-400 italic' : 'text-stone-700'}>
                    {[ing.quantity, ing.unit, ing.name, ing.preparation].filter(Boolean).join(' ')}
                    {ing.is_optional && ' (optional)'}
                  </span>
                </li>
              ))
            ) : (
              // Fallback to raw JSON
              JSON.parse(recipe.ingredients_raw || '[]').map((ing: string, i: number) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                  <span className="text-stone-700">{ing}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Instructions */}
        <div className="md:col-span-3">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Instructions</h2>
          <ol className="space-y-4">
            {instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-stone-700 text-sm leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Notes */}
      {recipe.notes && (
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-semibold text-amber-800 mb-2">Notes</h3>
          <p className="text-stone-700 text-sm leading-relaxed">{recipe.notes}</p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2 items-center">
          <Tag className="w-4 h-4 text-stone-400" />
          {tags.map(tag => (
            <span key={tag} className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

    </div>
  );
}
