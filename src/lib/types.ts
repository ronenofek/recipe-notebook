export interface Book {
  id: number;
  drive_id: string;
  title: string;
  author: string;
  publisher: string | null;
  year: number | null;
  filename: string;
  file_type: 'epub' | 'pdf';
  recipe_count: number;
  ingested_at: string | null;
  created_at: string;
}

export interface Recipe {
  id: number;
  book_id: number;
  title: string;
  description: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  course: string | null;
  cuisine: string | null;
  ingredients_raw: string; // JSON string of string[]
  instructions: string;    // JSON string of string[]
  notes: string | null;
  tags: string | null;     // JSON string of string[]
  source_chapter: string | null;
  primary_image: string | null;
  created_at: string;
  // Joined fields
  book_title?: string;
  book_author?: string;
}

export interface RecipeImage {
  id: number;
  recipe_id: number;
  path: string;
  sort_order: number;
}

export interface Ingredient {
  id: number;
  recipe_id: number;
  name: string;
  quantity: string | null;
  unit: string | null;
  preparation: string | null;
  is_optional: number;
}

export interface IngredientInput {
  quantity: string | null;
  unit: string | null;
  name: string;
  preparation: string | null;
  optional: boolean;
}

export interface ExtractedRecipe {
  title: string;
  description: string | null;
  servings: string | null;
  prep_time: string | null;
  cook_time: string | null;
  total_time: string | null;
  course: string | null;
  cuisine: string | null;
  ingredients: IngredientInput[];
  instructions: string[];
  notes: string | null;
  tags: string[];
  image_refs: string[];
}

export type BookCategory = 'Bread Baking' | 'Fermentation' | 'Asian' | 'Central/South America' | 'Others';

export interface LibraryEntry {
  drive_id: string;
  title: string;
  author: string;
  filename: string;
  file_type: 'epub' | 'pdf';
  file_size: number;
  status: 'loaded' | 'loading' | 'not_loaded' | 'error';
  recipe_count: number;
  category: BookCategory;
  thumbnail_url: string | null;
  error_msg?: string;
  db_id?: number;
}

export interface IngestionProgress {
  type: 'book_start' | 'chapter_progress' | 'book_done' | 'book_error' | 'all_done';
  drive_id: string;
  book_title?: string;
  chapter_current?: number;
  chapter_total?: number;
  recipes_found?: number;
  error?: string;
}
