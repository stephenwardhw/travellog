import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold,
  Code2,
  ExternalLink,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from 'lucide-react';
import {
  ensureDisplayHtml,
  extractLinksFromHtml,
  getUriScheme,
  isSafeHref,
  sanitizeHtml,
} from '../lib/htmlSanitizer';

interface RichTextEditorProps {
  value: string;
  onChange: (nextHtml: string) => void;
  placeholder?: string;
  emptyReadOnlyText?: string;
  readOnly?: boolean;
  minHeightClass?: string;
}

const LINK_PRESETS: Array<{ label: string; prefix: string; defaultText?: string }> = [
  { label: 'Web', prefix: 'https://' },
  { label: 'Maps', prefix: 'maps://?q=', defaultText: 'Open in Maps' },
  { label: 'Google Maps', prefix: 'comgooglemaps://?q=', defaultText: 'Open in Google Maps' },
  { label: 'Waze', prefix: 'waze://?q=', defaultText: 'Navigate in Waze' },
  { label: 'Obsidian', prefix: 'obsidian://open?vault=', defaultText: 'Open in Obsidian' },
  { label: 'Notion', prefix: 'notion://', defaultText: 'Open in Notion' },
  { label: 'Shortcuts', prefix: 'shortcuts://run-shortcut?name=', defaultText: 'Run Shortcut' },
  { label: 'WhatsApp', prefix: 'whatsapp://send?text=', defaultText: 'Open WhatsApp' },
  { label: 'Phone', prefix: 'tel:' },
  { label: 'Email', prefix: 'mailto:' },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write itinerary details, reservation numbers, transit notes, or app links...',
  emptyReadOnlyText = 'No details logged.',
  readOnly = false,
  minHeightClass = 'min-h-[140px]',
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string>(value);
  const [sourceMode, setSourceMode] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (readOnly || sourceMode) return;
    const el = editorRef.current;
    if (!el) return;

    // Avoid resetting cursor while typing when the current HTML matches our last emitted value
    if (value === lastEmittedRef.current && el.innerHTML !== '') {
      return;
    }

    const displayHtml = ensureDisplayHtml(value);
    if (el.innerHTML !== displayHtml) {
      el.innerHTML = displayHtml;
    }
    lastEmittedRef.current = value;
  }, [value, readOnly, sourceMode]);

  const extractedLinks = useMemo(() => extractLinksFromHtml(value), [value]);

  const emitSanitized = () => {
    const el = editorRef.current;
    if (!el) return;
    const cleaned = sanitizeHtml(el.innerHTML);
    lastEmittedRef.current = cleaned;
    onChange(cleaned);
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (readOnly || sourceMode) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, commandValue);
    emitSanitized();
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
      const selectedText = sel.toString().trim();
      return selectedText;
    }
    savedSelectionRef.current = null;
    return '';
  };

  const handleOpenLinkBar = () => {
    if (readOnly || sourceMode) return;
    if (linkInputOpen) {
      setLinkInputOpen(false);
      return;
    }
    const selectedText = saveSelection();
    setLinkUrl('https://');
    setLinkLabel(selectedText);
    setLinkError(null);
    setLinkInputOpen(true);
  };

  const handleApplyLink = () => {
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      setLinkError('Enter a web URL or program link (e.g. obsidian://..., maps://..., tel:...).');
      return;
    }

    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    const normalized = hasScheme ? trimmed : `https://${trimmed}`;

    if (!isSafeHref(normalized)) {
      setLinkError('That URI scheme is blocked for security reasons.');
      return;
    }

    const scheme = getUriScheme(normalized);
    const isWeb = scheme === 'http' || scheme === 'https';
    const displayText = linkLabel.trim() || normalized;

    const el = editorRef.current;
    if (el) {
      el.focus();
      const sel = window.getSelection();
      if (savedSelectionRef.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }

      const anchor = document.createElement('a');
      anchor.href = normalized;
      anchor.rel = 'noopener noreferrer';
      if (isWeb) {
        anchor.target = '_blank';
      }
      anchor.textContent = displayText;

      const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      if (range && el.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        range.insertNode(anchor);
        const space = document.createTextNode(' ');
        anchor.after(space);
        range.setStartAfter(space);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } else {
        el.appendChild(anchor);
        el.appendChild(document.createTextNode(' '));
      }
      emitSanitized();
    }

    savedSelectionRef.current = null;
    setLinkLabel('');
    setLinkError(null);
    setLinkInputOpen(false);
  };

  const handleToggleSourceMode = () => {
    if (sourceMode) {
      const cleaned = sanitizeHtml(value);
      lastEmittedRef.current = cleaned;
      onChange(cleaned);
      setSourceMode(false);
    } else {
      const cleaned = sanitizeHtml(ensureDisplayHtml(value));
      lastEmittedRef.current = cleaned;
      onChange(cleaned);
      setLinkInputOpen(false);
      setSourceMode(true);
    }
  };

  const renderedReadOnlyHtml = sanitizeHtml(ensureDisplayHtml(value));

  if (readOnly) {
    return (
      <div className="space-y-2">
        {renderedReadOnlyHtml ? (
          <div
            className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-800 leading-relaxed ${minHeightClass} [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_blockquote]:border-l-3 [&_blockquote]:border-teal-700 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_blockquote]:italic [&_a]:text-teal-700 [&_a]:underline`}
            dangerouslySetInnerHTML={{ __html: renderedReadOnlyHtml }}
          />
        ) : (
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-400">
            {emptyReadOnlyText}
          </div>
        )}

        {extractedLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {extractedLinks.map((lnk) => (
              <a
                key={`${lnk.href}-${lnk.label}`}
                href={lnk.href}
                target={lnk.isExternalApp ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-50"
                title={lnk.href}
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[180px]">{lnk.label}</span>
                {lnk.isExternalApp && (
                  <span className="text-[10px] font-mono text-slate-500 uppercase">
                    {lnk.scheme}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-300 bg-white overflow-hidden focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700/15">
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('bold')}
          disabled={sourceMode}
          title="Bold"
          aria-label="Bold"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('italic')}
          disabled={sourceMode}
          title="Italic"
          aria-label="Italic"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('underline')}
          disabled={sourceMode}
          title="Underline"
          aria-label="Underline"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('strikeThrough')}
          disabled={sourceMode}
          title="Strikethrough"
          aria-label="Strikethrough"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </button>

        <span className="h-4 w-px bg-slate-200 mx-1" aria-hidden="true" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('formatBlock', 'h3')}
          disabled={sourceMode}
          title="Section Heading"
          aria-label="Section Heading"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <Heading3 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('insertUnorderedList')}
          disabled={sourceMode}
          title="Bulleted List"
          aria-label="Bulleted List"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('insertOrderedList')}
          disabled={sourceMode}
          title="Numbered List"
          aria-label="Numbered List"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('formatBlock', 'blockquote')}
          disabled={sourceMode}
          title="Quote"
          aria-label="Quote"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <Quote className="w-3.5 h-3.5" />
        </button>

        <span className="h-4 w-px bg-slate-200 mx-1" aria-hidden="true" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleOpenLinkBar}
          disabled={sourceMode}
          title="Insert Web or Program Link (https://, obsidian://, maps://, tel:, etc.)"
          aria-label="Insert Link or Program Link"
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium hover:bg-slate-200/70 disabled:opacity-40 ${
            linkInputOpen ? 'bg-teal-100 text-teal-800' : 'text-slate-700'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>Link / App</span>
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => runCommand('removeFormat')}
          disabled={sourceMode}
          title="Clear Formatting"
          aria-label="Clear Formatting"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-700 disabled:opacity-40"
        >
          <RemoveFormatting className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleToggleSourceMode}
          title={sourceMode ? 'Switch to Visual Editor' : 'Edit HTML Source'}
          aria-label={sourceMode ? 'Switch to Visual Editor' : 'Edit HTML Source'}
          className={`ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            sourceMode
              ? 'bg-teal-700 text-white'
              : 'text-slate-600 hover:bg-slate-200/70'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>{sourceMode ? 'Visual' : 'HTML'}</span>
        </button>
      </div>

      {linkInputOpen && !sourceMode && (
        <div className="border-b border-slate-200 bg-teal-50/50 px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
              Presets:
            </span>
            {LINK_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setLinkUrl(preset.prefix);
                  if (!linkLabel.trim() && preset.defaultText) {
                    setLinkLabel(preset.defaultText);
                  }
                  setLinkError(null);
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:border-teal-600 hover:text-teal-800"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              inputMode="url"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyLink();
                } else if (e.key === 'Escape') {
                  setLinkInputOpen(false);
                }
              }}
              placeholder="https://..., obsidian://open?..., maps://?q=..., tel:+1..."
              aria-label="URL or program link"
              className="sm:col-span-6 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-teal-700 focus:outline-none"
            />
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyLink();
                } else if (e.key === 'Escape') {
                  setLinkInputOpen(false);
                }
              }}
              placeholder="Label (optional, e.g. Open in Maps)"
              aria-label="Link display text"
              className="sm:col-span-4 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
            />
            <div className="sm:col-span-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleApplyLink}
                className="flex-1 rounded-md bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Insert
              </button>
              <button
                type="button"
                onClick={() => setLinkInputOpen(false)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>

          {linkError && <p className="text-[11px] text-red-700">{linkError}</p>}
        </div>
      )}

      {sourceMode ? (
        <textarea
          rows={6}
          value={value}
          onChange={(e) => {
            lastEmittedRef.current = e.target.value;
            onChange(e.target.value);
          }}
          placeholder="<p>HTML source...</p>"
          className={`w-full px-3.5 py-2.5 font-mono text-xs text-slate-800 bg-white focus:outline-none ${minHeightClass}`}
        />
      ) : (
        <div className="relative">
          {!value.trim() && (
            <div className="pointer-events-none absolute top-2.5 left-3.5 right-3.5 text-sm text-slate-400">
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={emitSanitized}
            onBlur={emitSanitized}
            className={`w-full px-3.5 py-2.5 text-sm text-slate-900 leading-relaxed focus:outline-none ${minHeightClass} [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_blockquote]:border-l-3 [&_blockquote]:border-teal-700 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_blockquote]:italic [&_a]:text-teal-700 [&_a]:underline`}
          />
        </div>
      )}

      {extractedLinks.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
            Launch Links:
          </span>
          {extractedLinks.map((lnk) => (
            <a
              key={`${lnk.href}-${lnk.label}`}
              href={lnk.href}
              target={lnk.isExternalApp ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-teal-800 hover:border-teal-600 hover:bg-teal-50/60"
              title={`Open ${lnk.href}`}
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[180px]">{lnk.label}</span>
              {lnk.isExternalApp && (
                <span className="text-[10px] font-mono text-slate-500 uppercase">
                  {lnk.scheme}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
