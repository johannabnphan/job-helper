// Extracts plain text from a resume file, entirely in the browser.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface TextItem {
  str: string;
  hasEOL: boolean;
  transform: number[];
}

async function pdfToText(data: ArrayBuffer): Promise<string> {
  // useWasm: false keeps pdf.js off WebAssembly, which the extension CSP doesn't allow.
  const task = pdfjs.getDocument({ data, useWasm: false });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    let lastY: number | undefined;
    for (const item of content.items as TextItem[]) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      // A new baseline means a new line even if pdf.js didn't mark one.
      if (lastY !== undefined && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n';
      text += item.str;
      if (item.hasEOL) text += '\n';
      else if (item.str && !item.str.endsWith(' ')) text += ' ';
      lastY = y;
    }
    pages.push(text);
  }
  await task.destroy();
  return pages.join('\n');
}

export async function resumeToText(file: Blob, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return pdfToText(await file.arrayBuffer());
  if (file.type.startsWith('text/') || /\.(txt|md)$/.test(name)) return file.text();
  throw new Error('Import supports PDF and plain-text resumes. You can still upload other formats for autofill.');
}
