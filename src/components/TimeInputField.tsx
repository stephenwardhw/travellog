import React, { useEffect, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';
import {
  format12Hour,
  format24Hour,
  formatTimeForMode,
  getStoredTimeFormat,
  parseFlexibleTime,
  setStoredTimeFormat,
  splitCanonicalTime,
  to24HourFrom12Hour,
  toCanonicalTime,
  type TimeFormatMode,
} from '../lib/timeUtils';

interface TimeInputFieldProps {
  value: string; // Canonical "HH:MM" or ""
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  label?: string;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES_FIVE = Array.from({ length: 12 }, (_, i) => i * 5);
const MINUTES_ALL = Array.from({ length: 60 }, (_, i) => i);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export const TimeInputField: React.FC<TimeInputFieldProps> = ({
  value,
  onChange,
  disabled = false,
  label = 'Time (optional)',
}) => {
  const [mode, setMode] = useState<TimeFormatMode>(() => getStoredTimeFormat());
  const [textValue, setTextValue] = useState<string>(() =>
    formatTimeForMode(value, getStoredTimeFormat())
  );
  const [isFocused, setIsFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showExactMinutes, setShowExactMinutes] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const hourListRef = useRef<HTMLDivElement | null>(null);
  const minuteListRef = useRef<HTMLDivElement | null>(null);

  // Keep text synced when parent `value` or `mode` changes while user isn't mid-typing
  useEffect(() => {
    if (!isFocused) {
      setTextValue(formatTimeForMode(value, mode));
      setParseError(null);
    }
  }, [value, mode, isFocused]);

  // Expand exact minutes automatically if stored minute isn't a multiple of 5
  useEffect(() => {
    const parts = splitCanonicalTime(value);
    if (parts && parts.minute % 5 !== 0) {
      setShowExactMinutes(true);
    }
  }, [value]);

  // Close picker on outside click or Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  // Center selected hour/minute rows when opening picker
  useEffect(() => {
    if (!pickerOpen) return;
    const timer = window.setTimeout(() => {
      const activeHour = hourListRef.current?.querySelector('[data-active="true"]');
      const activeMinute = minuteListRef.current?.querySelector('[data-active="true"]');
      activeHour?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      activeMinute?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    }, 10);
    return () => window.clearTimeout(timer);
  }, [pickerOpen, mode, showExactMinutes]);

  const parsedParts = splitCanonicalTime(value);
  const currentPeriod: 'AM' | 'PM' = parsedParts?.period || 'AM';

  const switchMode = (nextMode: TimeFormatMode) => {
    setMode(nextMode);
    setStoredTimeFormat(nextMode);
    setParseError(null);
    setTextValue(formatTimeForMode(value, nextMode));
  };

  const commitTypedText = (raw: string, reformatDisplay: boolean) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setParseError(null);
      onChange('');
      if (reformatDisplay) setTextValue('');
      return true;
    }

    const parsed = parseFlexibleTime(trimmed, mode, currentPeriod);
    if (parsed !== null) {
      setParseError(null);
      onChange(parsed);
      if (reformatDisplay) {
        setTextValue(formatTimeForMode(parsed, mode));
      }
      return true;
    }

    if (reformatDisplay) {
      setParseError('Enter 24h (14:30) or 12h (2:30 PM)');
    }
    return false;
  };

  const handleTextChange = (nextText: string) => {
    setTextValue(nextText);
    const trimmed = nextText.trim();
    if (!trimmed) {
      setParseError(null);
      onChange('');
      return;
    }
    // Only commit eagerly while typing if it contains ":" or "am/pm" or 4 digits
    // so typing "1" on the way to "14:30" doesn't prematurely rewrite or lock
    if (/:|am|pm|a|p|\d{3,4}/i.test(trimmed)) {
      const parsed = parseFlexibleTime(trimmed, mode, currentPeriod);
      if (parsed !== null) {
        setParseError(null);
        onChange(parsed);
      }
    }
  };

  const selectHour24 = (h24: number) => {
    const min = parsedParts?.minute ?? 0;
    const next = toCanonicalTime(h24, min);
    onChange(next);
    setTextValue(formatTimeForMode(next, mode));
    setParseError(null);
  };

  const selectHour12 = (h12: number) => {
    const min = parsedParts?.minute ?? 0;
    const period = parsedParts?.period ?? currentPeriod;
    const next = to24HourFrom12Hour(h12, min, period);
    onChange(next);
    setTextValue(formatTimeForMode(next, mode));
    setParseError(null);
  };

  const selectMinute = (min: number) => {
    const h24 = parsedParts?.hour24 ?? (mode === '12h' ? 12 : 9);
    const next = toCanonicalTime(h24, min);
    onChange(next);
    setTextValue(formatTimeForMode(next, mode));
    setParseError(null);
  };

  const selectPeriod = (period: 'AM' | 'PM') => {
    const h12 = parsedParts?.hour12 ?? 12;
    const min = parsedParts?.minute ?? 0;
    const next = to24HourFrom12Hour(h12, min, period);
    onChange(next);
    setTextValue(formatTimeForMode(next, mode));
    setParseError(null);
  };

  const handleSetNow = () => {
    const now = new Date();
    const next = toCanonicalTime(now.getHours(), now.getMinutes());
    onChange(next);
    setTextValue(formatTimeForMode(next, mode));
    setParseError(null);
  };

  const handleClear = () => {
    onChange('');
    setTextValue('');
    setParseError(null);
  };

  const minuteChoices = showExactMinutes ? MINUTES_ALL : MINUTES_FIVE;
  const displayHour24 = parsedParts?.hour24 ?? null;
  const displayHour12 = parsedParts?.hour12 ?? null;
  const displayMinute = parsedParts?.minute ?? null;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-xs font-medium text-slate-700">{label}</label>
        {!disabled && (
          <div
            role="group"
            aria-label="Time format preference"
            className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[10px] font-semibold"
          >
            <button
              type="button"
              onClick={() => switchMode('12h')}
              aria-pressed={mode === '12h'}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                mode === '12h'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              12h AM/PM
            </button>
            <button
              type="button"
              onClick={() => switchMode('24h')}
              aria-pressed={mode === '24h'}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                mode === '24h'
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              24h
            </button>
          </div>
        )}
      </div>

      <div className="flex items-stretch gap-1.5">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            inputMode="text"
            aria-label={label}
            value={textValue}
            disabled={disabled}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => handleTextChange(e.target.value)}
            onBlur={() => {
              setIsFocused(false);
              commitTypedText(textValue, true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTypedText(textValue, true);
              }
            }}
            placeholder={mode === '12h' ? '2:30 PM or 14:30' : '14:30 or 2:30 PM'}
            className={`w-full rounded-lg border bg-white pl-3 pr-8 py-2.5 text-sm text-slate-900 tabular-nums focus:outline-none disabled:bg-slate-50 disabled:text-slate-700 ${
              parseError
                ? 'border-red-400 focus:border-red-600'
                : 'border-slate-300 focus:border-teal-700'
            }`}
          />
          {!disabled && textValue && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear time"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => setPickerOpen((prev) => !prev)}
            aria-expanded={pickerOpen}
            aria-label="Open time picker widget"
            title="Pick hour and minute"
            className={`inline-flex items-center justify-center rounded-lg border px-3 transition-colors shrink-0 min-h-[42px] ${
              pickerOpen
                ? 'border-teal-700 bg-teal-50 text-teal-800'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Helpful dual-format readout or validation hint */}
      {parseError ? (
        <p className="mt-1 text-[11px] font-medium text-red-600">{parseError}</p>
      ) : value ? (
        <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
          {mode === '12h' ? `24-hour: ${format24Hour(value)}` : `12-hour: ${format12Hour(value)}`}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-400">
          All day · Type 14:30 or 2:30 PM, or tap clock
        </p>
      )}

      {/* Consistent Mobile & Desktop Scrollable Column / Wheel Time Widget */}
      {pickerOpen && !disabled && (
        <div
          role="dialog"
          aria-label="Select time"
          className="absolute right-0 left-0 sm:left-auto z-50 mt-1.5 w-full sm:w-[310px] rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="text-xs tabular-nums">
              {value ? (
                <span className="font-semibold text-slate-900">
                  {format12Hour(value)}{' '}
                  <span className="font-normal text-slate-500">({format24Hour(value)})</span>
                </span>
              ) : (
                <span className="text-slate-500">All day (no time set)</span>
              )}
            </div>

            <div className="inline-flex items-center rounded-md border border-slate-200 bg-slate-100 p-0.5 text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => switchMode('12h')}
                className={`px-1.5 py-0.5 rounded ${
                  mode === '12h' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500'
                }`}
              >
                12h
              </button>
              <button
                type="button"
                onClick={() => switchMode('24h')}
                className={`px-1.5 py-0.5 rounded ${
                  mode === '24h' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-500'
                }`}
              >
                24h
              </button>
            </div>
          </div>

          <div
            className={`grid gap-2 ${mode === '12h' ? 'grid-cols-3' : 'grid-cols-2'}`}
          >
            {/* Hour Wheel Column */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-center mb-1">
                Hour
              </p>
              <div
                ref={hourListRef}
                className="h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-1 space-y-0.5 snap-y"
              >
                {mode === '12h'
                  ? HOURS_12.map((h12) => {
                      const active = displayHour12 === h12;
                      return (
                        <button
                          key={h12}
                          type="button"
                          data-active={active}
                          onClick={() => selectHour12(h12)}
                          className={`w-full rounded-md py-1.5 text-xs font-medium tabular-nums snap-center transition-colors ${
                            active
                              ? 'bg-teal-700 text-white font-semibold'
                              : 'text-slate-700 hover:bg-white'
                          }`}
                        >
                          {h12}
                        </button>
                      );
                    })
                  : HOURS_24.map((h24) => {
                      const active = displayHour24 === h24;
                      return (
                        <button
                          key={h24}
                          type="button"
                          data-active={active}
                          onClick={() => selectHour24(h24)}
                          className={`w-full rounded-md py-1.5 text-xs font-medium tabular-nums snap-center transition-colors ${
                            active
                              ? 'bg-teal-700 text-white font-semibold'
                              : 'text-slate-700 hover:bg-white'
                          }`}
                        >
                          {pad2(h24)}
                        </button>
                      );
                    })}
              </div>
            </div>

            {/* Minute Wheel Column */}
            <div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Min
                </p>
                <button
                  type="button"
                  onClick={() => setShowExactMinutes((v) => !v)}
                  className="text-[10px] font-semibold text-teal-700 hover:underline"
                  title={showExactMinutes ? 'Show 5-minute steps' : 'Show all 60 minutes'}
                >
                  {showExactMinutes ? '· 5m' : '· 1m'}
                </button>
              </div>
              <div
                ref={minuteListRef}
                className="h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-1 space-y-0.5 snap-y"
              >
                {minuteChoices.map((min) => {
                  const active = displayMinute === min;
                  return (
                    <button
                      key={min}
                      type="button"
                      data-active={active}
                      onClick={() => selectMinute(min)}
                      className={`w-full rounded-md py-1.5 text-xs font-medium tabular-nums snap-center transition-colors ${
                        active
                          ? 'bg-teal-700 text-white font-semibold'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {pad2(min)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AM / PM Column (12h mode) */}
            {mode === '12h' && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-center mb-1">
                  AM / PM
                </p>
                <div className="h-44 flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
                  {(['AM', 'PM'] as const).map((period) => {
                    const active = (parsedParts ? parsedParts.period : currentPeriod) === period;
                    return (
                      <button
                        key={period}
                        type="button"
                        onClick={() => selectPeriod(period)}
                        className={`flex-1 rounded-md text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-teal-700 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {period}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSetNow}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                Now
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                All day
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
