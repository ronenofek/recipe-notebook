import Link from 'next/link';
import { Clock, Users, BookOpen } from 'lucide-react';
import type { Recipe } from '@/lib/types';

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className="group bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-md hover:border-amber-200 transition-all"
    >
      <div className="aspect-video bg-stone-100 relative overflow-hidden flex items-center justify-center text-stone-300">
        <BookOpen className="w-10 h-10" />
        {recipe.course && (
          <span className="absolute top-2 left-2 bg-white/90 text-stone-700 text-xs font-medium px-2 py-0.5 rounded-full">
            {recipe.course}
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-semibold text-stone-900 text-sm leading-tight mb-1 line-clamp-2 group-hover:text-amber-700 transition-colors">
          {recipe.title}
        </h3>

        {recipe.description && (
          <p className="text-xs text-stone-500 line-clamp-2 mb-2">{recipe.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-stone-400 mb-2">
          {(recipe.total_time || recipe.cook_time) && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {recipe.total_time ?? recipe.cook_time}
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {recipe.servings}
            </span>
          )}
        </div>

        <p className="text-xs text-stone-400 truncate">
          <BookOpen className="w-3 h-3 inline mr-1" />
          {recipe.book_author ?? ''} &middot; {recipe.book_title ?? ''}
        </p>
      </div>
    </Link>
  );
}
