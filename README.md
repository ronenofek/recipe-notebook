# Recipe Notebook

A local-first web application that turns your personal cookbook collection into a single searchable recipe database. Books live in Google Drive; the app downloads them, uses Claude AI to extract every recipe, and serves a clean browsable UI.

---

## Features

- **Full-text search** across all recipes (title, ingredients, instructions, cuisine, tags)
- **Recipe detail pages** with ingredients, instructions, and notes
- **Books page** showing all loaded cookbooks with cover art
- **Library management** to sync with Google Drive and selectively load books
- **Book categories**: Bread Baking, Fermentation, Asian, Central/South America, Others
- **Book cover thumbnails** extracted from EPUB files and shown in the library and books pages
- **PDF export** of any recipe with book/author credit
- **Live ingestion progress** streamed to the browser via Server-Sent Events
- **Resume-safe ingestion**: re-runs skip already-processed chapters
- **Automatic chapter chunking**: large chapters are split into overlapping pieces so Claude's output never hits the token limit

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| Database | SQLite via `better-sqlite3` + FTS5 full-text search |
| AI extraction | Anthropic Claude Haiku (`@anthropic-ai/sdk`) with prompt caching |
| EPUB parsing | `adm-zip` + `cheerio` |
| PDF parsing | `pdfjs-dist` (text) + `pdf2pic` + `sharp` (page images) |
| PDF export | `@react-pdf/renderer` |
| Drive access | `googleapis` with Google Service Account (read-only) |

---

## Prerequisites

1. **Node.js 18+**
2. **Ghostscript** (for PDF page rendering only)
   ```
   winget install ArtifexSoftware.GhostScript
   ```
3. **Anthropic API key** — get one at console.anthropic.com
4. **Google Cloud Service Account** with Drive read-only access (see setup below)

---

## First-Time Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Google Drive service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project, enable the **Google Drive API**
3. Create a **Service Account**, download the JSON key
4. Place the key at `credentials/service-account.json`
5. Share your "Cook Books" Drive folder with the service account email (viewer access)

### 3. Environment variables

Create `.env.local` in the project root:

```env
ANTHROPIC_API_KEY=sk-ant-...

# Absolute path avoids issues if the server starts from a different directory
GOOGLE_SA_PATH=C:/Users/yourname/path/to/Recipe Notebook/credentials/service-account.json

DRIVE_FOLDER_ID=your_google_drive_folder_id
```

To find your Drive folder ID: open the folder in Google Drive, copy the last segment of the URL.

### 4. Initialize the database

```bash
npm run db:init
```

---

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first launch you land on the Library page automatically.

---

## Loading Books

Everything is done from the **Library** page (`/library`):

1. Click **Sync with Drive** to fetch the current folder contents
2. Books are grouped by category with their status shown
3. Check the books you want to load, click **Load Selected Books**
4. Watch live progress per book — chapters extracted, recipes found
5. When done, books move to "In your cookbook" with recipe counts and cover art

Books already processed are skipped on re-runs, so you can safely retry after an error.

### If you hit a Claude API rate limit

The app automatically retries with backoff (waits 60s, then 90s, up to 4 attempts). If a book ends up in error state, just select it and click Load Selected again — it picks up where it left off.

---

## Project Structure

```
recipe-notebook/
├── .env.local                        # API keys (gitignored)
├── credentials/
│   └── service-account.json          # Google SA key (gitignored)
├── db/
│   └── recipe-notebook.db            # SQLite database (gitignored)
├── books/                            # Downloaded EPUBs/PDFs (gitignored)
│   └── {drive_id}/
│       ├── original.epub
│       └── chapters/
├── public/
│   └── book-images/                  # Book cover images served statically
│       └── {drive_id}/
│           └── cover.jpg             # Extracted from EPUB
├── scripts/
│   ├── 0-init-db.ts                  # Create database schema
│   ├── 1-download-books.ts           # Download from Drive
│   ├── 2-extract-content.ts          # Parse EPUB/PDF, extract chapters
│   ├── 3-ingest-recipes.ts           # Claude extraction, write to DB
│   └── lib/
│       ├── drive-client.ts           # Google Drive API wrapper
│       ├── epub-parser.ts            # adm-zip + cheerio parser
│       ├── pdf-parser.ts             # pdfjs-dist + pdf2pic
│       ├── claude-extractor.ts       # Claude API calls with chunking + retry
│       └── db-writer.ts              # DB writes
└── src/
    ├── lib/
    │   ├── db.ts                     # SQLite singleton + schema
    │   ├── search.ts                 # FTS5 query wrapper
    │   └── types.ts                  # Shared TypeScript types
    ├── app/
    │   ├── page.tsx                  # Home: search + recipe grid
    │   ├── recipe/[id]/page.tsx      # Recipe detail
    │   ├── books/page.tsx            # Browse by book
    │   └── library/page.tsx          # Library management
    └── app/api/
        ├── search/route.ts
        ├── recipes/[id]/route.ts
        ├── books/route.ts
        ├── export/[id]/route.ts      # PDF download
        ├── library/route.ts          # Drive sync + DB status
        ├── library/load/route.ts     # SSE ingestion stream
        └── library/thumbnail/[driveId]/route.ts
```

---

## Book Categories

Books are auto-categorized by title and author keywords:

| Category | Color | Examples |
|---|---|---|
| Bread Baking | Amber | sourdough, bread, tartine, levain |
| Fermentation | Purple | fermented, pickle, kombucha, koji |
| Asian | Red | thai, indian, chinese, korean, mowgli, kalaya |
| Central/South America | Green | peruvian, oaxaca, ceviche, mexican |
| Others | Blue | everything else |

To adjust a book's category, update the keyword lists in `src/app/api/library/route.ts` → `categorizeBook()`.

---

## Scripts (standalone ingestion)

These scripts let you run each pipeline stage manually:

```bash
npm run books:download       # Download all Drive books to books/
npm run books:extract        # Parse EPUB/PDF, extract chapters
npm run books:ingest         # Run Claude extraction, write recipes to DB
npm run books:ingest:retry   # Re-run only chapters that previously errored
```

---

## Estimated API Cost

Around $2-5 total for all 22 books using Claude Haiku with prompt caching (~400-600 API calls). Large chapters are automatically split into 14,000-character chunks, so each API call stays within the output token limit.

---

## Security Notes

- Google Service Account has **read-only** Drive scope — it cannot modify any files
- The credentials file and `.env.local` are gitignored
- FTS5 queries use parameterized statements
- The ingestion endpoint only accepts requests from localhost in Phase 1

---

## Adding New Books

1. Drop the EPUB or PDF into your "Cook Books" Drive folder
2. Open the app, go to Library, click **Sync with Drive**
3. The new book appears — check it, click **Load Selected Books**
