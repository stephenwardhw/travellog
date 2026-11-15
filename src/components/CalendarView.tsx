import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { EventRecord, TripRecord } from '../types/journal';

interface CalendarViewProps {
  trip: TripRecord | null;
  events: EventRecord[];
  canEdit: boolean;
  onSelectEvent: (event: EventRecord) => void;
  onAddStop: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CalendarView: React.FC<CalendarViewProps> = ({
  trip,
  events,
  canEdit,
  onSelectEvent,
  onAddStop,
}) => {
  const initialDate = useMemo(() => {
    const ref = events[0]?.eventDate || trip?.startDate || new Date().toISOString().slice(0, 10);
    const [y, m] = ref.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
  }, [trip?.clientId]);

  const [cursor, setCursor] = useState(initialDate);
  const [selectedDay, setSelectedDay] = useState<string>(
    events[0]?.eventDate || trip?.startDate || new Date().toISOString().slice(0, 10)
  );

  useEffect(() => {
    setCursor(initialDate);
    if (events[0]?.eventDate) {
      setSelectedDay(events[0].eventDate);
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
              const isSelected = cell.iso === selectedDay;
              const inTripRange =
                trip && cell.iso >= trip.startDate && cell.iso <= trip.endDate;

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
                  className={`min-h-[76px] sm:min-h-[104px] p-1.5 sm:p-2 cursor-pointer transition-colors flex flex-col ${
                    !cell.inMonth
                      ? 'bg-slate-50/70 text-slate-400'
                      : inTripRange
                      ? 'bg-teal-50/35 text-slate-900'
                      : 'bg-white text-slate-900'
                  } ${isSelected ? 'ring-2 ring-inset ring-teal-700' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium tabular-nums ${
                        isSelected ? 'text-teal-800 font-semibold' : ''
                      }`}
                    >
                      {cell.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="sm:hidden text-[10px] font-semibold text-teal-700 tabular-nums">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="hidden sm:flex flex-col gap-1 mt-1.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
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
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] font-medium text-slate-500 px-1 tabular-nums">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs text-slate-500">Selected Date</p>
              <h3 className="text-base font-semibold text-slate-900 tabular-nums">
                {selectedDay}
              </h3>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => onAddStop(selectedDay)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 min-h-[40px] whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Stop
              </button>
            )}
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No stops logged on {selectedDay}.
              {canEdit ? ' Tap “Add Stop” to schedule an event or write a day journal.' : ''}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {selectedDayEvents.map((ev) => (
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
                  {(ev.journalEntry || ev.details) && (
                    <p className="text-xs text-slate-600 line-clamp-2 mt-1">
                      {ev.journalEntry || ev.details}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
