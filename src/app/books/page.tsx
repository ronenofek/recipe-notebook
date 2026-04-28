import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import { BookOpen } from 'lucide-react';
import { getDb } from '@/lib/db';
import type { Book } from '@/lib/types';

const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function getCoverUrl(driveId: string): string | null {
  for (const ext of COVER_EXTENSIONS) {
    if (fs.existsSync(path.join(process.cwd(), 'public', 'book-images', driveId, `cover${ext}`))) {
      return `/book-images/${driveId}/cover${ext}`;
    }
  }
  return null;
}

export default function BooksPage() {
  const db = getDb();
  const books = db.prepare(`
    SELECT * FROM books WHERE ingested_at IS NOT NULL ORDER BY title
  `).all() as Book[];

  const totalRecipes = books.reduce((s, b) => s + b.recipe_count, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-serif-display text-4xl font-bold text-stone-900 mb-1">Your Cookbooks</h1>
        <p className="text-stone-500">
          {books.length} books &middot; {totalRecipes.toLocaleString()} recipes
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {books.map(book => {
          const cover = getCoverUrl(book.drive_id);
          return (
            <Link
              key={book.id}
              href={`/?book_id=${book.id}`}
              className="group bg-white rounded-xl border border-stone-200 p-5 hover:shadow-lg hover:border-amber-300 transition-all flex items-start gap-4"
            >
              {/* Cover */}
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt={book.title}
                  className="w-16 h-22 object-cover rounded-lg flex-shrink-0 shadow-sm"
                  style={{ height: '88px' }}
                />
              ) : (
                <div className="w-16 flex-shrink-0 bg-amber-50 rounded-lg flex items-center justify-center group-hover:bg-amber-100 transition-colors border border-amber-100" style={{ height: '88px' }}>
                  <BookOpen className="w-6 h-6 text-amber-400" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="font-serif-display font-bold text-stone-900 leading-tight mb-1 group-hover:text-amber-700 transition-colors line-clamp-2">
                  {book.title}
                </h2>
                <p className="text-sm text-stone-500 mb-3">{book.author}{book.year ? ` · ${book.year}` : ''}</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    {book.recipe_count} recipes
                  </span>
                  <span className="text-xs text-stone-400 uppercase tracking-wide">{book.file_type}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {books.length === 0 && (
        <div className="text-center py-20 text-stone-400">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium text-stone-500">No books loaded yet</p>
          <Link href="/library" className="text-amber-600 text-sm hover:underline mt-2 block">
            Go to Library to load books
          </Link>
        </div>
      )}
    </div>
  );
}
