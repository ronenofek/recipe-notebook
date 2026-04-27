import path from 'path';
import fs from 'fs';

export interface PdfPage {
  pageNum: number;
  text: string;
}

export interface PdfChunk {
  id: string;
  startPage: number;
  endPage: number;
  text: string;
  pageNums: number[];
}

export async function extractPdfText(pdfPath: string): Promise<PdfPage[]> {
  // Use pdfjs-dist for server-side text extraction (no browser rendering)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;

  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: { str?: string }) => item.str ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 20) {
      pages.push({ pageNum: i, text });
    }
  }
  return pages;
}

export function chunkPdfPages(pages: PdfPage[], chunkSize = 12): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  for (let i = 0; i < pages.length; i += chunkSize) {
    const batch = pages.slice(i, i + chunkSize);
    chunks.push({
      id: `pages-${batch[0].pageNum}-${batch[batch.length - 1].pageNum}`,
      startPage: batch[0].pageNum,
      endPage: batch[batch.length - 1].pageNum,
      text: batch.map(p => `[Page ${p.pageNum}]\n${p.text}`).join('\n\n'),
      pageNums: batch.map(p => p.pageNum),
    });
  }
  return chunks;
}

export async function renderPdfPages(pdfPath: string, outputDir: string): Promise<string[]> {
  const { fromPath } = await import('pdf2pic');
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const convert = fromPath(pdfPath, {
    density: 150,
    saveFilename: 'page',
    savePath: imagesDir,
    format: 'png',
    width: 1200,
    height: 1600,
  });

  // Get page count first via pdfjs
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  const numPages = doc.numPages;

  const filenames: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    try {
      const result = await convert(i);
      if (result.path) filenames.push(path.basename(result.path));
    } catch {
      // Skip pages that fail (e.g. purely vector/blank pages)
    }
  }
  return filenames;
}
