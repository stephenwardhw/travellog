import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractPdfText(fileOrBlob: Blob): Promise<string> {
  try {
    const buffer = await fileOrBlob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const strings = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      pageTexts.push(strings.join(' '));
    }

    return pageTexts.join('\n\n').replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('PDF text extraction failed:', error);
    return '';
  }
}
