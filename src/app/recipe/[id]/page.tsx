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
      {/* Back + export row */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors group">
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to search
        </Link>
        <ExportButton recipeId={recipeId} recipeTitle={recipe.title} />
      </div>

      {/* Header */}
      <div className="mb-8">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          {recipe.cuisine && (
            <span className="text-xs bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
              {recipe.cuisine}
            </span>
          )}
          {recipe.course && (
            <span className="text-xs bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full">
              {recipe.course}
            </span>
          )}
        </div>

        <h1 className="font-serif-display text-4xl font-bold text-stone-900 leading-tight mb-4">
          {recipe.title}
        </h1>

        {recipe.description && (
          <p className="text-stone-600 text-lg leading-relaxed border-l-4 border-amber-300 pl-4 italic">
            {recipe.description}
          </p>
        )}

        {/* Meta row */}
        {(recipe.prep_time || recipe.cook_time || recipe.total_time || recipe.servings) && (
          <div className="flex flex-wrap gap-6 mt-6 py-4 border-y border-stone-200">
            {recipe.prep_time && (
              <div className="text-center">
                <p className="text-xs text-stone-400 uppercase tracking-wider mb-0.5">Prep</p>
                <p className="text-sm font-semibold text-stone-700">{recipe.prep_time}</p>
              </div>
            )}
            {recipe.cook_time && (
              <div className="text-center">
                <p className="text-xs text-stone-400 uppercase tracking-wider mb-0.5">Cook</p>
                <p className="text-sm font-semibold text-stone-700">{recipe.cook_time}</p>
              </div>
            )}
            {recipe.total_time && (
              <div className="text-center">
                <p className="text-xs text-stone-400 uppercase tracking-wider mb-0.5">Total</p>
                <p className="text-sm font-semibold text-stone-700">{recipe.total_time}</p>
              </div>
            )}
            {recipe.servings && (
              <div className="text-center">
                <p className="text-xs text-stone-400 uppercase tracking-wider mb-0.5">Serves</p>
                <p className="text-sm font-semibold text-stone-700">{recipe.servings}</p>
              </div>
            )}
          </div>
        )}

        {/* Book credit */}
        <div className="mt-4 flex items-center gap-2 text-sm text-stone-500">
          <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span>
            From <span className="font-medium text-stone-700 italic">{recipe.book_title}</span>
            {' '}by {recipe.book_author}
            {recipe.book_year && <span className="text-stone-400"> ({recipe.book_year})</span>}
          </span>
        </div>
      </div>

      {/* Ingredients + Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
        {/* Ingredients */}
        <div className="md:col-span-2">
          <h2 className="font-serif-display text-2xl font-bold text-stone-900 mb-4">Ingredients</h2>
          <ul className="space-y-2.5">
            {ingredients.length > 0 ? (
              ingredients.map(ing => (
                <li key={ing.id} className={`flex gap-3 text-sm leading-snug ${ing.is_optional ? 'text-stone-400' : 'text-stone-700'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                  <span>
                    {[ing.quantity, ing.unit, ing.name, ing.preparation].filter(Boolean).join(' ')}
                    {ing.is_optional && <span className="italic text-stone-400"> (optional)</span>}
                  </span>
                </li>
              ))
            ) : (
              JSON.parse(recipe.ingredients_raw || '[]').map((ing: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm text-stone-700 leading-snug">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                  {ing}
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Instructions */}
        <div className="md:col-span-3">
          <h2 className="font-serif-display text-2xl font-bold text-stone-900 mb-4">Instructions</h2>
          <ol className="space-y-5">
            {instructions.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-stone-700 text-sm leading-relaxed pt-1">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Notes */}
      {recipe.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-6">
          <h3 className="font-serif-display text-lg font-bold text-amber-900 mb-2">Notes</h3>
          <p className="text-stone-700 text-sm leading-relaxed">{recipe.notes}</p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Tag className="w-3.5 h-3.5 text-stone-400" />
          {tags.map(tag => (
            <span key={tag} className="text-xs bg-white border border-stone-200 text-stone-600 px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
