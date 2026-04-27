'use client';

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, AlertCircle, Loader2, BookOpen, Download } from 'lucide-react';
import type { LibraryEntry, IngestionProgress, BookCategory } from '@/lib/types';

interface LoadingState {
  [driveId: string]: {
    chapter_current?: number;
    chapter_total?: number;
    recipes_found?: number;
    message?: string;
    done?: boolean;
    error?: string;
  };
}

const CATEGORY_ORDER: BookCategory[] = ['Bread Baking', 'Fermentation', 'Asian', 'Central/South America', 'Others'];

const CATEGORY_COLORS: Record<BookCategory, string> = {
  'Bread Baking': 'bg-amber-100',
  'Fermentation': 'bg-purple-100',
  'Asian': 'bg-red-100',
  'Central/South America': 'bg-green-100',
  'Others': 'bg-blue-100',
};

function BookThumbnail({ url, title, category }: { url: string | null; title: string; category: BookCategory }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className={`w-12 h-16 rounded flex items-center justify-center flex-shrink-0 ${CATEGORY_COLORS[category]}`}>
        <BookOpen className="w-5 h-5 text-stone-400" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={title}
      onError={() => setFailed(true)}
      className="w-12 h-16 object-cover rounded flex-shrink-0"
    />
  );
}

export default function LibraryPage() {
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingState, setLoadingState] = useState<LoadingState>({});
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);

  const fetchLibrary = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch(showRefreshing ? '/api/library?force=true' : '/api/library');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { library: LibraryEntry[] };
      setLibrary(data.library);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  const toggleSelect = (driveId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(driveId)) next.delete(driveId); else next.add(driveId);
      return next;
    });
  };

  const selectAll = () => {
    const available = library.filter(b => b.status === 'not_loaded' || b.status === 'error');
    setSelected(new Set(available.map(b => b.drive_id)));
  };

  const loadSelected = async () => {
    if (selected.size === 0 || isLoadingBooks) return;
    setIsLoadingBooks(true);

    const initState: LoadingState = {};
    for (const id of selected) initState[id] = {};
    setLoadingState(initState);

    setLibrary(prev => prev.map(b =>
      selected.has(b.drive_id) ? { ...b, status: 'loading' } : b
    ));

    const res = await fetch('/api/library/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drive_ids: Array.from(selected) }),
    });

    if (!res.ok) {
      setError(`Load failed: ${await res.text()}`);
      setIsLoadingBooks(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as IngestionProgress & { message?: string };

          if (event.type === 'book_start') {
            setLoadingState(prev => ({ ...prev, [event.drive_id]: { message: 'Starting...' } }));
          } else if (event.type === 'chapter_progress') {
            setLoadingState(prev => ({
              ...prev,
              [event.drive_id]: {
                chapter_current: event.chapter_current,
                chapter_total: event.chapter_total,
                recipes_found: event.recipes_found,
                message: event.message,
              },
            }));
          } else if (event.type === 'book_done') {
            setLoadingState(prev => ({
              ...prev,
              [event.drive_id]: { done: true, recipes_found: event.recipes_found },
            }));
            setLibrary(prev => prev.map(b =>
              b.drive_id === event.drive_id
                ? { ...b, status: 'loaded', recipe_count: event.recipes_found ?? 0 }
                : b
            ));
          } else if (event.type === 'book_error') {
            setLoadingState(prev => ({
              ...prev,
              [event.drive_id]: { error: event.error },
            }));
          } else if (event.type === 'all_done') {
            setIsLoadingBooks(false);
            setSelected(new Set());
            await fetchLibrary(true); // force refresh after ingestion completes
          }
        } catch {}
      }
    }

    setIsLoadingBooks(false);
  };

  const loaded = library.filter(b => b.status === 'loaded');
  const available = library.filter(b => b.status !== 'loaded');

  // Group loaded books by category
  const loadedByCategory = CATEGORY_ORDER.reduce<Record<BookCategory, LibraryEntry[]>>(
    (acc, cat) => {
      acc[cat] = loaded.filter(b => b.category === cat);
      return acc;
    },
    {} as Record<BookCategory, LibraryEntry[]>
  );

  // Group available books by category
  const availableByCategory = CATEGORY_ORDER.reduce<Record<BookCategory, LibraryEntry[]>>(
    (acc, cat) => {
      acc[cat] = available.filter(b => b.category === cat);
      return acc;
    },
    {} as Record<BookCategory, LibraryEntry[]>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
        <span className="ml-3 text-stone-500">Fetching library from Google Drive...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-xl mx-auto mt-12">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-800">Could not load library</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <p className="text-sm text-stone-500 mt-2">
              Make sure your Google Service Account credentials are set up correctly. See <code>.env.local.example</code>.
            </p>
          </div>
        </div>
        <button onClick={() => fetchLibrary(true)} className="mt-4 text-sm text-red-700 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Library</h1>
          <p className="text-stone-500 text-sm mt-1">
            {loaded.length} books loaded, {available.length} available to load
          </p>
        </div>
        <button
          onClick={() => fetchLibrary(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Sync with Drive
        </button>
      </div>

      {loaded.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">
            In your cookbook
          </h2>
          {CATEGORY_ORDER.map(cat => {
            const books = loadedByCategory[cat];
            if (books.length === 0) return null;
            return (
              <div key={cat} className="mb-6">
                <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-widest mb-2 pl-1">{cat}</h3>
                <div className="space-y-2">
                  {books.map(book => (
                    <div key={book.drive_id} className="flex items-center gap-4 bg-white rounded-lg border border-stone-200 px-4 py-3">
                      <BookThumbnail url={book.thumbnail_url} title={book.title} category={book.category} />
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-stone-900 truncate">{book.title}</p>
                        <p className="text-sm text-stone-500">{book.author} &middot; {book.file_type.toUpperCase()}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-medium text-stone-700">{book.recipe_count} recipes</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {available.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              Available to load
            </h2>
            <button onClick={selectAll} className="text-sm text-amber-700 hover:underline">
              Select all
            </button>
          </div>

          {CATEGORY_ORDER.map(cat => {
            const books = availableByCategory[cat];
            if (books.length === 0) return null;
            return (
              <div key={cat} className="mb-6">
                <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-widest mb-2 pl-1">{cat}</h3>
                <div className="space-y-2">
                  {books.map(book => {
                    const ls = loadingState[book.drive_id];
                    const isThisLoading = book.status === 'loading' || (ls && !ls.done && !ls.error);
                    const isChecked = selected.has(book.drive_id);

                    return (
                      <div
                        key={book.drive_id}
                        className={`flex items-center gap-4 bg-white rounded-lg border px-4 py-3 transition-colors ${
                          isChecked ? 'border-amber-400 bg-amber-50' : 'border-stone-200'
                        } ${isThisLoading ? 'opacity-75' : ''}`}
                      >
                        <BookThumbnail url={book.thumbnail_url} title={book.title} category={book.category} />

                        {isThisLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-amber-500 flex-shrink-0" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(book.drive_id)}
                            disabled={isLoadingBooks}
                            className="w-4 h-4 accent-amber-600 cursor-pointer"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-stone-900 truncate">{book.title}</p>
                          <p className="text-sm text-stone-500">{book.author} &middot; {book.file_type.toUpperCase()} &middot; {(book.file_size / 1024 / 1024).toFixed(1)} MB</p>
                          {ls?.message && !ls.chapter_total && (
                            <p className="text-xs text-amber-600 mt-0.5">{ls.message}</p>
                          )}
                          {ls?.chapter_total && (
                            <div className="mt-1.5">
                              <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                                <span>Extracting recipes... {ls.chapter_current}/{ls.chapter_total} chapters</span>
                                <span>{ls.recipes_found ?? 0} recipes found</span>
                              </div>
                              <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-amber-500 rounded-full transition-all"
                                  style={{ width: `${((ls.chapter_current ?? 0) / ls.chapter_total) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {book.status === 'error' && (
                            <p className="text-xs text-red-500 mt-0.5">
                              {book.error_msg
                                ? (book.error_msg.includes('rate_limit') ? 'Rate limit hit — select and reload to retry' : book.error_msg.slice(0, 80))
                                : 'Ingestion error — select and reload to retry'}
                            </p>
                          )}
                        </div>

                        <div className="flex-shrink-0">
                          {ls?.done && (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" /> {ls.recipes_found} recipes
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        </section>
      )}

      {/* Sticky load bar — always visible when there are unloaded books */}
      {available.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 shadow-lg z-50">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-sm text-stone-500">
              {selected.size > 0
                ? `${selected.size} book${selected.size > 1 ? 's' : ''} selected`
                : 'Select books above to load'}
            </p>
            <button
              onClick={loadSelected}
              disabled={selected.size === 0 || isLoadingBooks}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingBooks ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Loading books...</>
              ) : (
                <><Download className="w-4 h-4" /> Load {selected.size > 0 ? `${selected.size} ` : ''}Selected</>
              )}
            </button>
          </div>
        </div>
      )}

      {library.length === 0 && (
        <div className="text-center py-16 text-stone-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No books found in your Drive folder.</p>
          <p className="text-sm mt-1">Make sure your Google Service Account is set up and the &quot;Cook Books&quot; folder is shared with it.</p>
        </div>
      )}
    </div>
  );
}
