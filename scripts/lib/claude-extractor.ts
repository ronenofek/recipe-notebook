import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedRecipe } from '../../src/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  "tags": string[],
  "image_refs": string[]
}

Rules:
- course must be one of: appetizer, main, side, dessert, bread, sauce, drink, breakfast, snack, or null
- Include the COMPLETE recipe - never truncate ingredients or instructions
- Each instruction step should be one action, not a paragraph
- Do not invent information not present in the text
- image_refs: list any image filenames (e.g. "img001.jpg") found in <img> tags adjacent to this recipe
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

export async function extractRecipesFromChapter(
  bookTitle: string,
  bookAuthor: string,
  chapterTitle: string,
  chapterContent: string,
  isFirstChapter: boolean
): Promise<ExtractedRecipe[]> {
  const userContent = `Book: ${bookTitle}
Author: ${bookAuthor}
Chapter: ${chapterTitle}

---
${chapterContent.slice(0, 30000)}
---

Extract all recipes from the above content. Return a JSON array only.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userContent },
  ];

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      // Cache system prompt across chapters of the same book
      ...(isFirstChapter ? {} : { cache_control: { type: 'ephemeral' } }),
    },
  ];

  const response = await callWithRetry(() =>
    client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      system: systemBlocks,
      messages,
    })
  );

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Extract JSON array from response (strip any accidental markdown fences)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed as ExtractedRecipe[];
  } catch {
    return [];
  }
}
