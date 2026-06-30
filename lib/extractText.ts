import { PDFParse } from 'pdf-parse';

const MAX_CHARS = 150000;

/**
 * Extract plain text from an uploaded File (PDF, DOCX, or plain text).
 * Uses pdf-parse (wraps pdfjs-dist) for reliable, fast PDF parsing — the
 * previous regex-based PDF extractor could pathologically hang on certain
 * PDF structures, which was the root cause of generate requests timing out
 * with zero progress logged.
 */
export async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // PDF (magic bytes %PDF)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    try {
      const parser = new PDFParse({ data: Buffer.from(buf) });
      const result = await Promise.race([
        parser.getText(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF parse timeout')), 20000)),
      ]);
      await parser.destroy().catch(() => {});
      const text = (result.text || '').trim();
      if (text.length > 50) return text.substring(0, MAX_CHARS);
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
