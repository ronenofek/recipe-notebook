import Link from 'next/link';
import { Clock, Users, BookOpen } from 'lucide-react';
import type { Recipe } from '@/lib/types';

const COURSE_STYLES: Record<string, { top: string; badge: string; badgeText: string }> = {
  bread:     { top: 'bg-amber-500',   badge: 'bg-amber-50',   badgeText: 'text-amber-700' },
  main:      { top: 'bg-orange-500',  badge: 'bg-orange-50',  badgeText: 'text-orange-700' },
  dessert:   { top: 'bg-rose-500',    badge: 'bg-rose-50',    badgeText: 'text-rose-700' },
  appetizer: { top: 'bg-emerald-500', badge: 'bg-emerald-50', badgeText: 'text-emerald-700' },
  side:      { top: 'bg-teal-500',    badge: 'bg-teal-50',    badgeText: 'text-teal-700' },
  sauce:     { top: 'bg-yellow-500',  badge: 'bg-yellow-50',  badgeText: 'text-yellow-700' },
  drink:     { top: 'bg-sky-500',     badge: 'bg-sky-50',     badgeText: 'text-sky-700' },
  breakfast: { top: 'bg-orange-400',  badge: 'bg-orange-50',  badgeText: 'text-orange-600' },
  snack:     { top: 'bg-violet-500',  badge: 'bg-violet-50',  badgeText: 'text-violet-700' },
};
const DEFAULT_STYLE = { top: 'bg-stone-300', badge: 'bg-stone-50', badgeText: 'text-stone-500' };

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  const style = (recipe.course && COURSE_STYLES[recipe.course]) ?? DEFAULT_STYLE;

  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className="group bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-lg hover:border-amber-300 transition-all flex flex-col"
    >
      {/* Colored course accent bar */}
      <div className={`h-1.5 w-full ${style.top}`} />

      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Course + cuisine badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {recipe.course && (
            <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${style.badge} ${style.badgeText}`}>
              {recipe.course}
            </span>
          )}
          {recipe.cuisine && (
            <span className="text-xs text-stone-400">{recipe.cuisine}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-serif-display font-bold text-stone-900 text-base leading-snug group-hover:text-amber-700 transition-colors line-clamp-2">
          {recipe.title}
        </h3>

        {/* Description */}
        {recipe.description && (
          <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed">
            {recipe.description}
          </p>
        )}

        {/* Meta row */}
        <div className="mt-auto pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs text-stone-400">
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
          <span className="text-xs text-stone-400 truncate flex items-center gap-1 min-w-0">
            <BookOpen className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{recipe.book_author}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
