import React, { useEffect, useMemo, useState } from 'react';
import { BedDouble, CheckCircle2, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import { htmlToPlainText } from '../lib/htmlSanitizer';
import {
  DEFAULT_CALENDAR_SETTINGS,
  type BookingRecord,
  type CalendarThemeSettings,
  type EventRecord,
  type TripRecord,
} from '../types/journal';

interface CalendarViewProps {
  trip: TripRecord | null;
  events: EventRecord[];
  bookings?: BookingRecord[];
  canEdit: boolean;
  calendarSettings?: CalendarThemeSettings;
  onSelectEvent: (event: EventRecord) => void;
  onAddStop: (date: string) => void;
  onSelectBooking?: (booking: BookingRecord) => void;
  onAddBooking?: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isDarkHexColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 140;
}

function expandDateRange(startIso: string, endIso: string): string[] {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return [];
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  if (end < start) return [startIso];

  const dates: string[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard++;
  }
  return dates;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  trip,
  events,
  bookings = [],
  canEdit,
  calendarSettings = DEFAULT_CALENDAR_SETTINGS,
  onSelectEvent,
  onAddStop,
  onSelectBooking,
  onAddBooking,
}) => {
  const initialDate = useMemo(() => {
    const ref =
      events[0]?.eventDate ||
      bookings[0]?.checkInDate ||
      trip?.startDate ||
      new Date().toISOString().slice(0, 10);
    const [y, m] = ref.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
  }, [trip?.clientId]);

  const [cursor, setCursor] = useState(initialDate);
  const [selectedDay, setSelectedDay] = useState<string>(
    events[0]?.eventDate ||
      bookings[0]?.checkInDate ||
      trip?.startDate ||
      new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    setCursor(initialDate);
    if (events[0]?.eventDate) {
      setSelectedDay(events[0].eventDate);
    } else if (bookings[0]?.checkInDate) {
      setSelectedDay(bookings[0].checkInDate);
    } else if (trip?.startDate) {
      setSelectedDay(trip.startDate);
    }
  }, [trip?.clientId]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    for (const ev of events) {
      const list = map.get(ev.eventDate) || [];
      list.push(ev);
      map.set(ev.eventDate, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.eventTime || '').localeCompare(b.eventTime || ''));
    }
    return map;
  }, [events]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, BookingRecord[]>();
    const sorted = [...bookings].sort((a, b) => a.checkInDate.localeCompare(b.checkInDate));
    for (const booking of sorted) {
      for (const dayIso of expandDateRange(booking.checkInDate, booking.checkOutDate)) {
        const list = map.get(dayIso) || [];
        list.push(booking);
        map.set(dayIso, list);
      }
    }
    return map;
  }, [bookings]);

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(cursor.year, cursor.month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];

    const prevDays = new Date(cursor.year, cursor.month, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevDays - i;
      const dt = new Date(cursor.year, cursor.month - 1, d);
      cells.push({
        iso: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        inMonth: false,
      });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, day: d, inMonth: true });
    }

    const trailing = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= trailing; d++) {
      const dt = new Date(cursor.year, cursor.month + 1, d);
      cells.push({
        iso: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        inMonth: false,
      });
    }
    return cells;
  }, [cursor]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  const selectedDayEvents = eventsByDate.get(selectedDay) || [];
  const selectedDayBookings = bookingsByDate.get(selectedDay) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Trip Calendar
          </h2>
          {trip && (
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {trip.title} · {trip.startDate} to {trip.endDate}
              {bookings.length > 0
                ? ` · ${bookings.length} ${bookings.length === 1 ? 'stay' : 'stays'}`
                : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {trip && (
            <button
              type="button"
              onClick={() => {
                const [y, m] = trip.startDate.split('-').map(Number);
                if (y && m) setCursor({ year: y, month: m - 1 });
                setSelectedDay(trip.startDate);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
            >
              Jump to Trip Start
            </button>
          )}

          <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-semibold text-slate-900 whitespace-nowrap min-w-[124px] text-center">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 hover:bg-slate-50"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="py-2.5 text-center text-[11px] font-semibold text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {calendarCells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.iso) || [];
              const dayBookings = bookingsByDate.get(cell.iso) || [];
              const hasEvents = dayEvents.length > 0;
              const isSelected = cell.iso === selectedDay;
              const inTripRange =
                Boolean(trip && cell.iso >= trip.startDate && cell.iso <= trip.endDate);

              let cellBgStyle: React.CSSProperties | undefined;
              let cellBgClass = 'bg-white text-slate-900 hover:bg-slate-50';
              let isDarkBg = false;

              if (hasEvents) {
                cellBgStyle = { backgroundColor: calendarSettings.eventDayBg };
                isDarkBg = isDarkHexColor(calendarSettings.eventDayBg);
                cellBgClass = `${
                  cell.inMonth ? '' : 'opacity-70 '
                }hover:brightness-95 ${isDarkBg ? 'text-white' : 'text-slate-900'}`;
              } else if (inTripRange && cell.inMonth) {
                cellBgStyle = { backgroundColor: calendarSettings.tripDayBg };
                isDarkBg = isDarkHexColor(calendarSettings.tripDayBg);
                cellBgClass = `hover:brightness-95 ${isDarkBg ? 'text-white' : 'text-slate-900'}`;
              } else if (!cell.inMonth) {
                cellBgClass = 'bg-slate-50/70 text-slate-400 hover:bg-slate-100/60';
              }

              return (
                <div
                  key={cell.iso}
                  onClick={() => setSelectedDay(cell.iso)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDay(cell.iso);
                    }
                  }}
                  style={cellBgStyle}
                  className={`min-h-[82px] sm:min-h-[112px] p-1.5 sm:p-2 cursor-pointer transition-all flex flex-col ${cellBgClass} ${
                    isSelected ? 'ring-2 ring-inset ring-teal-700' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        isDarkBg
                          ? 'text-white font-semibold'
                          : isSelected
                          ? 'text-teal-800 font-semibold'
                          : hasEvents
                          ? 'text-slate-900 font-semibold'
                          : ''
                      }`}
                    >
                      {cell.day}
                    </span>
                    <div className="sm:hidden flex items-center gap-1">
                      {dayBookings.length > 0 && (
                        <span
                          className={`inline-block w-2 h-2 rounded-xs ${
                            dayBookings.some((b) => b.status === 'confirmed')
                              ? 'bg-indigo-700'
                              : 'bg-amber-500'
                          }`}
                          title={dayBookings.map((b) => b.name).join(', ')}
                        />
                      )}
                      {dayEvents.length > 0 && (
                        <span
                          className={`text-[10px] font-semibold tabular-nums ${
                            isDarkBg ? 'text-white/90' : 'text-slate-800'
                          }`}
                        >
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Multiday Stays & Stops */}
                  <div className="hidden sm:flex flex-col gap-1 mt-1.5 overflow-hidden">
                    {dayBookings.slice(0, 2).map((bk) => {
                      const isConfirmed = bk.status === 'confirmed';
                      const stayTag =
                        bk.checkInDate === bk.checkOutDate
                          ? ''
                          : cell.iso === bk.checkInDate
                          ? 'In: '
                          : cell.iso === bk.checkOutDate
                          ? 'Out: '
                          : '';
                      return (
                        <button
                          key={bk.clientId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectBooking?.(bk);
                          }}
                          className={`w-full text-left truncate rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1 transition-colors ${
                            isConfirmed
                              ? 'bg-indigo-700 text-white hover:bg-indigo-800'
                              : 'bg-amber-100 text-amber-950 border border-dashed border-amber-500 hover:bg-amber-200'
                          }`}
                          title={`${bk.name} (${bk.status}) · ${bk.checkInDate} to ${bk.checkOutDate}`}
                        >
                          <BedDouble className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">
                            {stayTag}
                            {bk.name}
                          </span>
                        </button>
                      );
                    })}

                    {dayEvents.slice(0, dayBookings.length > 0 ? 1 : 2).map((ev) => (
                      <button
                        key={ev.clientId}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(ev);
                        }}
                        className="w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] font-medium bg-teal-700 text-white hover:bg-teal-800"
                        title={ev.location}
                      >
                        {ev.eventTime ? `${ev.eventTime} ` : ''}
                        {ev.location}
                      </button>
                    ))}

                    {dayEvents.length + dayBookings.length > 2 && (
                      <span
                        className={`text-[10px] font-medium px-1 tabular-nums ${
                          isDarkBg ? 'text-white/90' : 'text-slate-700'
                        }`}
                      >
                        +
                        {dayEvents.length +
                          dayBookings.length -
                          (Math.min(dayBookings.length, 2) +
                            Math.min(dayEvents.length, dayBookings.length > 0 ? 1 : 2))}{' '}
                        more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded border border-slate-300 inline-block"
                style={{ backgroundColor: calendarSettings.eventDayBg }}
              />
              Day with stops
            </span>
            {trip && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded border border-slate-300 inline-block"
                  style={{ backgroundColor: calendarSettings.tripDayBg }}
                />
                Trip dates
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-indigo-700 inline-block" />
              Confirmed stay
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-dashed border-amber-500 inline-block" />
              Unconfirmed stay
            </span>
          </div>
        </div>

        <aside className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs text-slate-500">Selected Date</p>
              <h3 className="text-base font-semibold text-slate-900 tabular-nums">
                {selectedDay}
              </h3>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1.5 shrink-0">
                {onAddBooking && (
                  <button
                    type="button"
                    onClick={() => onAddBooking(selectedDay)}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 min-h-[38px] whitespace-nowrap"
                  >
                    <BedDouble className="w-3.5 h-3.5" />
                    Add Stay
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAddStop(selectedDay)}
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 min-h-[38px] whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Stop
                </button>
              </div>
            )}
          </div>

          {/* Stays overlapping selected date */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Stays &amp; Bookings ({selectedDayBookings.length})
            </p>
            {selectedDayBookings.length === 0 ? (
              <p className="text-xs text-slate-500">
                No accommodations booked for {selectedDay}.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDayBookings.map((bk) => {
                  const isConfirmed = bk.status === 'confirmed';
                  const phaseLabel =
                    bk.checkInDate === bk.checkOutDate
                      ? 'Single-day stay'
                      : selectedDay === bk.checkInDate
                      ? 'Check-in'
                      : selectedDay === bk.checkOutDate
                      ? 'Check-out'
                      : 'Overnight stay';
                  return (
                    <button
                      key={bk.clientId}
                      type="button"
                      onClick={() => onSelectBooking?.(bk)}
                      className={`w-full text-left rounded-xl border p-3 transition-colors ${
                        isConfirmed
                          ? 'border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50'
                          : 'border-amber-200 bg-amber-50/60 hover:bg-amber-50 border-dashed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                        <span className="font-medium text-slate-600">
                          {phaseLabel} · {bk.checkInDate} – {bk.checkOutDate}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                            isConfirmed ? 'text-indigo-800' : 'text-amber-800'
                          }`}
                        >
                          {isConfirmed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {isConfirmed ? 'Confirmed' : 'Unconfirmed'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                        <BedDouble className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                        <span className="truncate">{bk.name}</span>
                      </p>
                      {(bk.confirmationCode || bk.address) && (
                        <p className="text-xs text-slate-600 truncate mt-0.5">
                          {[bk.confirmationCode ? `#${bk.confirmationCode}` : '', bk.address]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Itinerary stops for selected date */}
          <div className="space-y-2.5 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Itinerary Stops ({selectedDayEvents.length})
            </p>
            {selectedDayEvents.length === 0 ? (
              <p className="text-xs text-slate-500">
                No stops logged on {selectedDay}.
                {canEdit ? ' Tap “Add Stop” to schedule an event or write a day journal.' : ''}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedDayEvents.map((ev) => {
                  const preview = ev.journalEntry || htmlToPlainText(ev.details);
                  return (
                    <button
                      key={ev.clientId}
                      type="button"
                      onClick={() => onSelectEvent(ev)}
                      className="w-full text-left py-3 first:pt-0 last:pb-0 hover:text-teal-800 transition-colors"
                    >
                      <p className="text-xs text-slate-500 tabular-nums">
                        {ev.eventTime || 'All day'}
                      </p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">{ev.location}</p>
                      {preview && (
                        <p className="text-xs text-slate-600 line-clamp-2 mt-1">{preview}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
