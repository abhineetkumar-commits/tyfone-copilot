import { extractText as unpdfExtractText, getDocumentProxy } from 'unpdf';

const MAX_CHARS = 150000;

/**
 * Extract plain text from an uploaded File (PDF, DOCX, or plain text).
 *
 * Uses `unpdf` for PDF parsing — it bundles pdfjs-dist into a single
 * self-contained file with no separate worker script, which is required
 * for serverless platforms like Vercel. The previous attempt with
 * `pdf-parse` (which spawns a pdf.worker.mjs file at runtime) failed in
 * production because Vercel's file tracer doesn't include that worker
 * script in the deployed function bundle, causing a 500 error. Before
 * that, a hand-written regex PDF parser could hang indefinitely on
 * certain PDF structures (catastrophic backtracking), which caused the
 * original timeout issue.
 */
export async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // PDF (magic bytes %PDF)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    try {
      const pdf = await Promise.race([
        getDocumentProxy(bytes),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF load timeout')), 15000)),
      ]);
      const { text } = await Promise.race([
        unpdfExtractText(pdf, { mergePages: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF parse timeout')), 15000)),
      ]);
      const trimmed = (text || '').trim();
      if (trimmed.length > 50) return trimmed.substring(0, MAX_CHARS);
    } catch (e) {
      console.warn('[extractText] PDF parse failed, falling back to raw scan:', e);
    }
    // Fallback: crude byte scan for any readable ASCII if proper parsing failed/timed out
    const raw = new TextDecoder('latin1').decode(buf);
    return raw.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ').substring(0, MAX_CHARS);
  }

  // DOCX (zip-based XML)
  if (file.name.toLowerCase().endsWith('.docx')) {
    try {
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      const matches = raw.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
      const text = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').trim();
      if (text.length > 50) return text.substring(0, MAX_CHARS);
    } catch (e) {
      console.warn('[extractText] DOCX parse failed:', e);
    }
  }

  // Plain text / fallback
  return new TextDecoder('utf-8', { fatal: false }).decode(buf).substring(0, MAX_CHARS);
}
