import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { BookOpen, Search, Library } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Recipe Notebook',
  description: 'Your personal searchable cookbook',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900">
        <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold text-lg text-amber-700">
              <BookOpen className="w-5 h-5" />
              Recipe Notebook
            </Link>
            <nav className="flex items-center gap-1">
              <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-stone-600 hover:bg-stone-100 transition-colors">
                <Search className="w-4 h-4" />
                Search
              </Link>
              <Link href="/books" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-stone-600 hover:bg-stone-100 transition-colors">
                <BookOpen className="w-4 h-4" />
                Books
              </Link>
              <Link href="/library" className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-stone-600 hover:bg-stone-100 transition-colors">
                <Library className="w-4 h-4" />
                Library
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
