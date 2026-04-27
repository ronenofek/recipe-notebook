import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs';

export interface Chapter {
  id: string;
  title: string;
  text: string;
  html: string;
  wordCount: number;
  imageRefs: string[]; // img src values found in this chapter
}

export interface EpubContent {
  title: string;
  author: string;
  chapters: Chapter[];
  imageFiles: string[]; // filenames of extracted images
  coverFile: string | null; // filename of cover image in outputDir/images/
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

export function parseEpub(epubPath: string, outputDir: string): EpubContent {
  const zip = new AdmZip(epubPath);
  const entries = zip.getEntries();

  // Find and parse container.xml to locate the OPF file
  const containerEntry = entries.find(e => e.entryName === 'META-INF/container.xml');
  if (!containerEntry) throw new Error('Not a valid EPUB: missing META-INF/container.xml');

  const containerXml = containerEntry.getData().toString('utf8');
  const $c = cheerio.load(containerXml, { xmlMode: true });
  const opfPath = $c('rootfile').attr('full-path');
  if (!opfPath) throw new Error('Cannot find OPF path in container.xml');

  const opfEntry = entries.find(e => e.entryName === opfPath);
  if (!opfEntry) throw new Error(`OPF file not found: ${opfPath}`);

  const opfXml = opfEntry.getData().toString('utf8');
  const $opf = cheerio.load(opfXml, { xmlMode: true });
  const opfDir = path.dirname(opfPath);

  // Extract metadata
  const title = $opf('dc\\:title').first().text() || 'Unknown Title';
  const author = $opf('dc\\:creator').first().text() || 'Unknown Author';

  // Build manifest map: id -> { href, mediaType }
  const manifest = new Map<string, { href: string; mediaType: string; fullPath: string }>();
  $opf('manifest item').each((_, el) => {
    const id = $opf(el).attr('id') ?? '';
    const href = $opf(el).attr('href') ?? '';
    const mediaType = $opf(el).attr('media-type') ?? '';
    const fullPath = opfDir ? `${opfDir}/${href}` : href;
    manifest.set(id, { href, mediaType, fullPath });
  });

  // Extract all images to outputDir/images/
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const imageFiles: string[] = [];

  for (const [, item] of manifest) {
    const ext = path.extname(item.href).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME_TYPES.has(item.mediaType)) {
      const entry = entries.find(e =>
        e.entryName === item.fullPath ||
        e.entryName === item.href
      );
      if (entry) {
        const filename = path.basename(item.href);
        const destPath = path.join(imagesDir, filename);
        fs.writeFileSync(destPath, entry.getData());
        imageFiles.push(filename);
      }
    }
  }

  // Get spine order
  const spineIds: string[] = [];
  $opf('spine itemref').each((_, el) => {
    const idref = $opf(el).attr('idref');
    if (idref) spineIds.push(idref);
  });

  // Build NCX/nav title map for chapter titles
  const navTitles = new Map<string, string>();
  const ncxEntry = [...manifest.values()].find(m => m.mediaType === 'application/x-dtbncx+xml');
  if (ncxEntry) {
    const ncxEntry2 = entries.find(e => e.entryName === ncxEntry.fullPath || e.entryName === ncxEntry.href);
    if (ncxEntry2) {
      const $ncx = cheerio.load(ncxEntry2.getData().toString('utf8'), { xmlMode: true });
      $ncx('navPoint').each((_, el) => {
        const src = $ncx(el).find('content').attr('src') ?? '';
        const titleText = $ncx(el).find('navLabel text').first().text();
        const baseSrc = src.split('#')[0];
        navTitles.set(baseSrc, titleText);
      });
    }
  }

  // Parse chapters from spine
  const chapters: Chapter[] = [];

  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i];
    const item = manifest.get(id);
    if (!item) continue;

    const entry = entries.find(e =>
      e.entryName === item.fullPath ||
      e.entryName === item.href
    );
    if (!entry) continue;

    const html = entry.getData().toString('utf8');
    const $ = cheerio.load(html);

    // Get chapter title from NCX, or first heading, or spine position
    const navTitle = navTitles.get(item.href) ?? navTitles.get(path.basename(item.href));
    const headingTitle = $('h1, h2, h3').first().text().trim();
    const chapterTitle = navTitle || headingTitle || `Chapter ${i + 1}`;

    // Extract text (strip all HTML tags)
    const text = $('body').text()
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 50) continue; // skip near-empty chapters

    // Find all image references
    const imageRefs: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) imageRefs.push(path.basename(src));
    });

    chapters.push({
      id: `chapter-${i}`,
      title: chapterTitle,
      text,
      html,
      wordCount,
      imageRefs,
    });
  }

  // Detect cover image
  let coverFile: string | null = null;

  // EPUB3: item with properties="cover-image"
  $opf('manifest item').each((_, el) => {
    if (coverFile) return;
    const props = $opf(el).attr('properties') ?? '';
    if (props.includes('cover-image')) {
      const href = $opf(el).attr('href') ?? '';
      const filename = path.basename(href);
      if (imageFiles.includes(filename)) coverFile = filename;
    }
  });

  // EPUB2: <meta name="cover" content="item-id">
  if (!coverFile) {
    $opf('meta[name="cover"]').each((_, el) => {
      if (coverFile) return;
      const coverId = $opf(el).attr('content') ?? '';
      const item = manifest.get(coverId);
      if (item) {
        const filename = path.basename(item.href);
        if (imageFiles.includes(filename)) coverFile = filename;
      }
    });
  }

  // Fallback: manifest item whose id contains "cover" and is an image
  if (!coverFile) {
    for (const [id, item] of manifest) {
      if (id.toLowerCase().includes('cover')) {
        const ext = path.extname(item.href).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          const filename = path.basename(item.href);
          if (imageFiles.includes(filename)) {
            coverFile = filename;
            break;
          }
        }
      }
    }
  }

  return { title, author, chapters, imageFiles, coverFile };
}
