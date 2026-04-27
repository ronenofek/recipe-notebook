'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import RecipeCard from './RecipeCard';
import type { Recipe } from '@/lib/types';
import { useDebounce } from '@/lib/useDebounce';

interface SearchResponse {
  recipes: Recipe[];
  total: number;
  page: number;
  limit: number;
  courses: string[];
  cuisines: string[];
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState<number | undefined>();
  const [course, setCourse] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const debouncedQuery = useDebounce(query, 200);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (bookId) params.set('book_id', String(bookId));
    if (course) params.set('course', course);
    if (cuisine) params.set('cuisine', cuisine);
    params.set('page', String(page));

    const res = await fetch(`/api/search?${params}`);
    const json = await res.json() as SearchResponse;
    setData(json);
    setLoading(false);
  }, [debouncedQuery, bookId, course, cuisine, page]);

  useEffect(() => { fetchResults(); }, [fetchResults]);
  useEffect(() => { setPage(1); }, [debouncedQuery, bookId, course, cuisine]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  return (
    <div>
      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search recipes, ingredients, cuisines..."
          className="w-full pl-12 pr-10 py-3.5 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-base shadow-sm"
          autoFocus
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {data?.courses && data.courses.length > 0 && (
          <select
            value={course}
            onChange={e => setCourse(e.target.value)}
            className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">All courses</option>
            {data.courses.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        )}
        {data?.cuisines && data.cuisines.length > 0 && (
          <select
            value={cuisine}
            onChange={e => setCuisine(e.target.value)}
            className="px-3 py-1.5 bg-white border border-stone-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">All cuisines</option>
            {data.cuisines.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {(course || cuisine || bookId) && (
          <button
            onClick={() => { setCourse(''); setCuisine(''); setBookId(undefined); }}
            className="px-3 py-1.5 text-sm text-amber-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      {data && (
        <p className="text-sm text-stone-500 mb-4">
          {loading ? 'Searching...' : `${data.total.toLocaleString()} recipe${data.total !== 1 ? 's' : ''}${query ? ` for "${query}"` : ''}`}
        </p>
      )}

      {/* Recipe grid */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        {data?.recipes.map(recipe => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>

      {data?.recipes.length === 0 && !loading && (
        <div className="text-center py-16 text-stone-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg">No recipes found</p>
          {query && <p className="text-sm mt-1">Try different keywords or clear the filters</p>}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-10">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="p-2 rounded-lg border border-stone-300 disabled:opacity-40 hover:bg-stone-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-stone-600">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-stone-300 disabled:opacity-40 hover:bg-stone-100"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
