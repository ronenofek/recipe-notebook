import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const FOLDER_ID = process.env.DRIVE_FOLDER_ID ?? '1HgtPWaMPdCQrtHZeovP_J34QT0MJjT-H';

let _auth: google.auth.GoogleAuth | null = null;

function getAuth() {
  if (_auth) return _auth;

  const saPath = process.env.GOOGLE_SA_PATH ?? './credentials/service-account.json';
  const keyFile = path.resolve(saPath);
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Service account key not found at ${keyFile}. See .env.local.example for setup instructions.`);
  }
  _auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return _auth;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  thumbnailLink: string | null;
}

export async function listCookbookFiles(): Promise<DriveFile[]> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, thumbnailLink)',
      pageSize: 100,
      pageToken,
    });

    const batch = res.data.files ?? [];
    for (const f of batch) {
      if (f.id && f.name && f.mimeType) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: parseInt(f.size ?? '0', 10),
          thumbnailLink: f.thumbnailLink ?? null,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function getFileThumbnailLink(driveId: string): Promise<string | null> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get({ fileId: driveId, fields: 'thumbnailLink' });
  return res.data.thumbnailLink ?? null;
}

export async function downloadFile(driveId: string, destPath: string): Promise<void> {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const dest = fs.createWriteStream(destPath);

  const res = await drive.files.get(
    { fileId: driveId, alt: 'media' },
    { responseType: 'stream' }
  );

  await new Promise<void>((resolve, reject) => {
    (res.data as NodeJS.ReadableStream)
      .on('error', reject)
      .pipe(dest)
      .on('error', reject)
      .on('finish', resolve);
  });
}

export function parseBookMeta(filename: string): { title: string; author: string; year: number | null; publisher: string | null } {
  const base = filename.replace(/\.(epub|pdf)$/i, '').trim();

  // Anna's Archive format: "Title -- Author -- Year/Edition -- Publisher -- hash -- Anna's Archive"
  // Uses double-dash separators
  if (base.includes(' -- ')) {
    const parts = base.split(' -- ').map(p => p.trim());
    // Strip trailing hash + "Anna's Archive" parts (hashes are hex strings 20+ chars)
    const meaningful = parts.filter(p => !/^[0-9a-f]{20,}$/i.test(p) && !/^Anna.s Archive/i.test(p));

    if (meaningful.length >= 2) {
      let title = meaningful[0].replace(/_/g, ' ').trim();
      let authorRaw = meaningful[1].replace(/^by\s+/i, '').trim();

      // Year: look for a 4-digit year in parts 2+
      let year: number | null = null;
      let publisher: string | null = null;
      for (let i = 2; i < meaningful.length; i++) {
        const yearMatch = meaningful[i].match(/\b(19|20)\d{2}\b/);
        if (yearMatch && !year) year = parseInt(yearMatch[0], 10);
        else if (!publisher && meaningful[i].length > 3) publisher = meaningful[i];
      }

      // Normalize underscores: single-letter followed by _ is an initial (K_ -> K.), others become spaces
      const normalizedAuthorRaw = authorRaw
        .replace(/\b([A-Z])_/g, '$1.')
        .replace(/_/g, ' ')
        .trim();

      // Normalize author: "Lastname, Firstname; Lastname2, Firstname2" or "Ruiz, Alejandro; Altesor, Carla"
      // Stop at publisher-like tokens (all-caps words, city names after comma patterns)
      const authorOnly = normalizedAuthorRaw.split(/\s*;\s*|\s+and\s+/i).slice(0, 3).join(', ');
      const author = authorOnly
        .split(/[;,]\s*(?=[A-Z])/)
        .map(a => {
          const commaIdx = a.indexOf(',');
          if (commaIdx > 0) {
            const last = a.slice(0, commaIdx).trim();
            const first = a.slice(commaIdx + 1).trim();
            return first ? `${first} ${last}` : last;
          }
          return a.trim();
        })
        .filter(Boolean)
        .join(', ');

      return { title, author: author || authorRaw, year, publisher };
    }
  }

  // libgen format: "Author - Title (Year, Publisher) - libgen.source"
  // Strip trailing source suffix
  const stripped = base.replace(/\s+-\s+(libgen\.\w+)$/, '').trim();
  const m1 = stripped.match(/^(.+?)\s+-\s+(.+?)(?:\s+\((\d{4})(?:,\s*([^)]+))?\))?$/);
  if (m1) {
    const [, authorRaw, titleRaw, yearStr, publisher] = m1;
    const author = normalizeAuthor(authorRaw.trim());
    return {
      title: titleRaw.replace(/_/g, ' ').trim(),
      author,
      year: yearStr ? parseInt(yearStr, 10) : null,
      publisher: publisher?.trim() ?? null,
    };
  }

  // Fallback
  return { title: base.replace(/_/g, ' ').trim(), author: 'Unknown', year: null, publisher: null };
}

function normalizeAuthor(raw: string): string {
  // Normalize initials: "K_" -> "K.", other "_" -> " " (author separator in libgen)
  const cleaned = raw.replace(/\b([A-Z])_/g, '$1.').replace(/_/g, ' ').trim();

  // Split on spaces between author entries (libgen uses spaces after comma+name pattern)
  // e.g. "Lastname, Firstname Lastname2, Firstname2" -> two authors
  return cleaned
    .split(/\s+(?=[A-Z][a-z]+,)/)  // split before "Lastname," patterns
    .map(part => {
      part = part.trim();
      const commaIdx = part.indexOf(',');
      if (commaIdx > 0) {
        const last = part.slice(0, commaIdx).trim();
        const first = part.slice(commaIdx + 1).trim();
        return first ? `${first} ${last}` : last;
      }
      return part;
    })
    .filter(Boolean)
    // Deduplicate (libgen sometimes repeats the author name)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');
}
