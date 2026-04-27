import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import SearchPage from '@/components/SearchPage';

export default function Home() {
  // Server-side: check if any books are loaded; redirect to library if not
  try {
    const db = getDb();
    const loaded = db.prepare(`SELECT COUNT(*) as n FROM books WHERE ingested_at IS NOT NULL`).get() as { n: number };
    if (loaded.n === 0) {
      redirect('/library');
    }
  } catch {
    redirect('/library');
  }

  return <SearchPage />;
}
