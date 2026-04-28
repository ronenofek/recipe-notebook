import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedRecipe } from '../../src/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Titles that reliably contain no recipes
const NON_RECIPE_TITLES = [
  'introduction', 'preface', 'foreword', 'acknowledgment', 'about the author',
  'contents', 'table of contents', 'index', 'copyright', 'bibliography',
  'glossary', 'notes', 'appendix', 'dedication', 'resources', 'conversions',
  'measurement', 'equipment', 'pantry', 'about this book', 'how to use',
  'part i', 'part ii', 'part iii', 'part iv', 'part v',
];

// Signals that text likely contains at least one recipe
const RECIPE_SIGNALS = [
  /\b\d+\s*(g|gram|kg|oz|lb|cup|cups|tbsp|tsp|ml|liter|litre)\b/i,
  /\b(yield|serves|servings|makes)\b/i,
  /\bstep\s*\d+\b/i,
  /\bingredients?\b/i,
  /\b(preheat|bake at|bake for|cook for|simmer|knead|fold in|whisk|sift)\b/i,
];

export function looksLikeRecipeChapter(title: string, text: string): boolean {
  const t = title.toLowerCase();
  if (NON_RECIPE_TITLES.some(skip => t.includes(skip))) return false;
  const sample = text.slice(0, 8000);
  return RECIPE_SIGNALS.some(re => re.test(sample));
}

const SYSTEM_PROMPT = `You are a precise recipe extraction engine. Given cookbook content, extract ALL complete recipes found. Return a JSON array. If no recipes are present, return [].

For each recipe return exactly this structure:
{
  "title": string,
  "description": string | null,
  "servings": string | null,
  "prep_time": string | null,
  "cook_time": string | null,
  "total_time": string | null,
  "course": string | null,
  "cuisine": string | null,
  "ingredients": [
    { "quantity": string | null, "unit": string | null, "name": string, "preparation": string | null, "optional": boolean }
  ],
  "instructions": string[],
  "notes": string | null,
  "tags": string[]
}

Rules:
- course must be one of: appetizer, main, side, dessert, bread, sauce, drink, breakfast, snack, or null
- Include the COMPLETE recipe - never truncate ingredients or instructions
- Each instruction step should be one action, not a paragraph
- Do not invent information not present in the text
- Return ONLY valid JSON array, no explanation text`;

async function callWithRetry(fn: () => Promise<Anthropic.Message>, maxRetries = 4): Promise<Anthropic.Message> {
  let delay = 60_000; // start at 60s — rate limit resets per minute
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Error && err.message.includes('rate_limit_error'));

      if (isRateLimit && attempt < maxRetries) {
        console.warn(`Rate limit hit, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 1.5, 300_000); // cap at 5 min
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// Max chars to send in a single Claude call. Keeps output within ~8k token limit.
const CHUNK_SIZE = 14000;
const CHUNK_OVERLAP = 400;

async function extractChunk(
  bookTitle: string,
  bookAuthor: string,
  chapterTitle: string,
  chunkContent: string,
  isFirstCall: boolean,
  chunkIndex: number,
  totalChunks: number,
): Promise<ExtractedRecipe[]> {
  const chunkLabel = totalChunks > 1 ? ` (part ${chunkIndex + 1}/${totalChunks})` : '';
  const userContent = `Book: ${bookTitle}
Author: ${bookAuthor}
Chapter: ${chapterTitle}${chunkLabel}

---
${chunkContent}
---

Extract all recipes from the above content. Return a JSON array only.`;

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      ...(isFirstCall ? {} : { cache_control: { type: 'ephemeral' } }),
    },
  ];

  const response = await callWithRetry(() =>
    client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      system: systemBlocks,
      messages: [{ role: 'user', content: userContent }],
    })
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  if (response.stop_reason === 'max_tokens') {
    // Still truncated even after chunking — salvage what we can
    const lastClose = text.lastIndexOf('}');
    const salvage = lastClose > 0 ? text.slice(0, lastClose + 1) + ']' : text;
    const m = salvage.match(/\[[\s\S]*\]/);
    if (!m) return [];
    try {
      const parsed = JSON.parse(m[0]);
      return Array.isArray(parsed) ? (parsed as ExtractedRecipe[]) : [];
    } catch { return []; }
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? (parsed as ExtractedRecipe[]) : [];
  } catch { return []; }
}

export async function extractRecipesFromChapter(
  bookTitle: string,
  bookAuthor: string,
  chapterTitle: string,
  chapterContent: string,
  isFirstChapter: boolean
): Promise<ExtractedRecipe[]> {
  // Split large chapters into overlapping chunks so output never exceeds token limit
  const chunks: string[] = [];
  if (chapterContent.length <= CHUNK_SIZE) {
    chunks.push(chapterContent);
  } else {
    for (let offset = 0; offset < chapterContent.length; offset += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(chapterContent.slice(offset, offset + CHUNK_SIZE));
      if (offset + CHUNK_SIZE >= chapterContent.length) break;
    }
  }

  const seen = new Set<string>();
  const results: ExtractedRecipe[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const isFirstCall = isFirstChapter && i === 0;
    const recipes = await extractChunk(bookTitle, bookAuthor, chapterTitle, chunks[i], isFirstCall, i, chunks.length);
    for (const recipe of recipes) {
      const key = recipe.title.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(recipe);
      }
    }
  }

  return results;
}
