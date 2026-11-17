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

const BLOCKED_URI_SCHEMES = new Set([
  'javascript',
  'vbscript',
  'data',
  'blob',
  'filesystem',
]);

function stripControlChars(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F\s]+/g, '');
}

export function getUriScheme(href: string): string {
  const cleaned = stripControlChars(href || '').toLowerCase();
  const match = cleaned.match(/^([a-z][a-z0-9+_.-]*):/);
  return match ? match[1] : '';
}

export function isSafeHref(href: string): boolean {
  const trimmed = (href || '').trim();
  if (!trimmed) return false;
  const normalized = stripControlChars(trimmed).toLowerCase();
  const schemeMatch = normalized.match(/^([a-z][a-z0-9+_.-]*):/);
  if (!schemeMatch) return false;

  const scheme = schemeMatch[1];
  if (BLOCKED_URI_SCHEMES.has(scheme)) {
    return false;
  }
  return true;
}

function isWebHref(href: string): boolean {
  const scheme = getUriScheme(href);
  return scheme === 'http' || scheme === 'https';
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
      const trimmedHref = rawHref.trim();
      cleanEl.setAttribute('href', trimmedHref);
      if (isWebHref(trimmedHref)) {
        cleanEl.setAttribute('target', '_blank');
        cleanEl.setAttribute('rel', 'noopener noreferrer');
      } else {
        cleanEl.setAttribute('rel', 'noopener noreferrer');
      }
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

export interface ExtractedLink {
  href: string;
  label: string;
  scheme: string;
  isExternalApp: boolean;
}

export function extractLinksFromHtml(raw: string): ExtractedLink[] {
  const cleaned = sanitizeHtml(ensureDisplayHtml(raw));
  if (!cleaned || typeof DOMParser === 'undefined') return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${cleaned}</div>`, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  const seen = new Set<string>();
  const links: ExtractedLink[] = [];

  for (const anchor of anchors) {
    const href = (anchor.getAttribute('href') || '').trim();
    if (!href || !isSafeHref(href)) continue;
    const label = (anchor.textContent || '').trim() || href;
    const key = `${href}::${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const scheme = getUriScheme(href);
    links.push({
      href,
      label,
      scheme,
      isExternalApp: scheme !== 'http' && scheme !== 'https',
    });
  }

  return links;
}
