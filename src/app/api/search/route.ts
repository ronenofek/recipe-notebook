import { NextRequest, NextResponse } from 'next/server';
import { searchRecipes, getDistinctCourses, getDistinctCuisines } from '@/lib/search';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q') ?? undefined;
  const book_id = searchParams.get('book_id') ? parseInt(searchParams.get('book_id')!, 10) : undefined;
  const course = searchParams.get('course') ?? undefined;
  const cuisine = searchParams.get('cuisine') ?? undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = 48;
  const offset = (page - 1) * limit;

  const { recipes, total } = searchRecipes({ q, book_id, course, cuisine, limit, offset });
  const courses = getDistinctCourses();
  const cuisines = getDistinctCuisines();

  return NextResponse.json({ recipes, total, page, limit, courses, cuisines });
}
