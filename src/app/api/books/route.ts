import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Book } from '@/lib/types';

export async function GET() {
  const db = getDb();
  const books = db.prepare(`
    SELECT * FROM books WHERE ingested_at IS NOT NULL ORDER BY title
  `).all() as Book[];
  return NextResponse.json({ books });
}
