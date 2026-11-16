const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ul',
  'ol',
  'li',
  'h3',
  'h4',
  'blockquote',
  'a',
  'code',
  'pre',
]);

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  );
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // Completely drop dangerous embedded containers and their contents
  if (
    tag === 'script' ||
    tag === 'style' ||
    tag === 'iframe' ||
    tag === 'object' ||
    tag === 'embed' ||
    tag === 'svg' ||
    tag === 'math'
  ) {
    return null;
  }

  // Unwrap disallowed structural tags while preserving sanitized children
  if (!ALLOWED_TAGS.has(tag)) {
    const frag = doc.createDocumentFragment();
    Array.from(el.childNodes).forEach((child) => {
      const cleanChild = sanitizeNode(child, doc);
      if (cleanChild) frag.appendChild(cleanChild);
    });
    return frag;
  }

  const cleanEl = doc.createElement(tag);

  if (tag === 'a') {
    const rawHref = el.getAttribute('href') || '';
    if (isSafeHref(rawHref)) {
      cleanEl.setAttribute('href', rawHref.trim());
      cleanEl.setAttribute('target', '_blank');
      cleanEl.setAttribute('rel', 'noopener noreferrer');
    }
  }

  Array.from(el.childNodes).forEach((child) => {
    const cleanChild = sanitizeNode(child, doc);
    if (cleanChild) cleanEl.appendChild(cleanChild);
  });

  return cleanEl;
}

export function sanitizeHtml(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  if (typeof DOMParser === 'undefined') {
    return escapeHtmlText(trimmed).replace(/\n/g, '<br />');
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${trimmed}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  if (!root) return '';

  const outDoc = parsed.implementation.createHTMLDocument('');
  const container = outDoc.createElement('div');
  Array.from(root.childNodes).forEach((child) => {
    const cleanChild = sanitizeNode(child, outDoc);
    if (cleanChild) container.appendChild(cleanChild);
  });

  // Normalize empty editor placeholder HTML (e.g. `<p><br></p>` with no visible text)
  const visibleText = (container.textContent || '').replace(/\u00a0/g, ' ').trim();
  if (!visibleText && !container.querySelector('br') && container.innerHTML.trim() === '') {
    return '';
  }
  if (!visibleText && container.innerHTML.replace(/<br\s*\/?>|<\/?(p|div)>/gi, '').trim() === '') {
    return '';
  }

  return container.innerHTML.trim();
}

export function ensureDisplayHtml(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return sanitizeHtml(trimmed);
  }

  const paragraphs = trimmed.split(/\n{2,}/);
  return paragraphs
    .map((p) => `<p>${escapeHtmlText(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function htmlToPlainText(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return '';

  if (!/<[a-z][\s\S]*>/i.test(value)) {
    return value.replace(/\s+/g, ' ').trim();
  }

  const withSpacing = value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h3|h4|blockquote|pre)>/gi, '\n');

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(withSpacing, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  return withSpacing.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
