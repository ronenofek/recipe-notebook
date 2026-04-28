import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Search, Library, BookMarked } from 'lucide-react';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Recipe Notebook',
  description: 'Your personal searchable cookbook',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={playfair.variable}>
      <body className="min-h-screen text-stone-900" style={{ backgroundColor: '#faf7f2' }}>
        <header className="bg-white border-b-2 border-amber-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
                <BookMarked className="w-4 h-4 text-white" />
              </div>
              <span className="font-serif-display text-xl font-bold text-stone-900 tracking-tight whitespace-nowrap">
                Recipe Notebook
              </span>
            </Link>
            <nav className="flex items-center gap-0.5">
              <Link href="/" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-amber-50 hover:text-amber-800 transition-colors">
                <Search className="w-4 h-4" />
                Search
              </Link>
              <Link href="/books" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-amber-50 hover:text-amber-800 transition-colors">
                <BookMarked className="w-4 h-4" />
                Books
              </Link>
              <Link href="/library" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-amber-50 hover:text-amber-800 transition-colors">
                <Library className="w-4 h-4" />
                Library
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
