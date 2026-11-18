import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Luggage,
  Minus,
  Plus,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { generateSmartPackingSuggestions } from '../lib/smartPacking';
import { ConfirmDialog } from './ConfirmDialog';
import type {
  BookingRecord,
  EventRecord,
  PackingCategory,
  PackingItemRecord,
  TripRecord,
  WeatherForecastResponse,
} from '../types/journal';

interface PackingChecklistViewProps {
  trip: TripRecord | null;
  items: PackingItemRecord[];
  events: EventRecord[];
  bookings: BookingRecord[];
  weather: WeatherForecastResponse | null;
  pdfCount: number;
  canEdit: boolean;
  onAddItems: (
    items: Array<{
      name: string;
      category: PackingCategory;
      quantity: number;
      isAutoSuggested: boolean;
      reason: string;
    }>
  ) => Promise<void>;
  onToggleItem: (item: PackingItemRecord) => Promise<void>;
  onUpdateQuantity: (item: PackingItemRecord, nextQty: number) => Promise<void>;
  onDeleteItem: (clientId: string) => Promise<void>;
  onClearPacked: () => Promise<void>;
}

const CATEGORIES: PackingCategory[] = [
  'Documents',
  'Clothing',
  'Electronics',
  'Toiletries',
  'Health & Safety',
  'Gear & Comfort',
  'Other',
];

export const PackingChecklistView: React.FC<PackingChecklistViewProps> = ({
  trip,
  items,
  events,
  bookings,
  weather,
  pdfCount,
  canEdit,
  onAddItems,
  onToggleItem,
  onUpdateQuantity,
  onDeleteItem,
  onClearPacked,
}) => {
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PackingCategory>('Clothing');
  const [newQty, setNewQty] = useState(1);
  const [filter, setFilter] = useState<'all' | 'remaining' | 'packed'>('all');
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [addingBusy, setAddingBusy] = useState(false);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<PackingItemRecord | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const smartSuggestions = useMemo(() => {
    if (!trip) return [];
    return generateSmartPackingSuggestions({
      trip,
      events,
      bookings,
      existingItems: items,
      weather,
      pdfCount,
    });
  }, [trip, events, bookings, items, weather, pdfCount]);

  const packedCount = useMemo(() => items.filter((i) => i.packed).length, [items]);
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0;

  const filteredItems = useMemo(() => {
    if (filter === 'remaining') return items.filter((i) => !i.packed);
    if (filter === 'packed') return items.filter((i) => i.packed);
    return items;
  }, [items, filter]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<PackingCategory, PackingItemRecord[]>();
    for (const cat of CATEGORIES) {
      map.set(cat, []);
    }
    for (const item of filteredItems) {
      const cat = CATEGORIES.includes(item.category) ? item.category : 'Other';
      const list = map.get(cat) || [];
      list.push(item);
      map.set(cat, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.packed !== b.packed) return a.packed ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    }
    return CATEGORIES.map((cat) => [cat, map.get(cat) || []] as const).filter(
      ([, list]) => list.length > 0
    );
  }, [filteredItems]);

  if (!trip) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center max-w-xl mx-auto mt-8">
        <Luggage className="w-8 h-8 text-teal-700 mx-auto mb-3" />
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          Select or create a trip
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Smart packing checklists adapt automatically to each trip&rsquo;s duration, weather
          forecast, stays, and itinerary activities.
        </p>
      </div>
    );
  }

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newName.trim();
    if (!clean || !canEdit) return;
    setAddingBusy(true);
    try {
      await onAddItems([
        {
          name: clean,
          category: newCategory,
          quantity: Math.max(1, Math.min(99, Number(newQty) || 1)),
          isAutoSuggested: false,
          reason: '',
        },
      ]);
      setNewName('');
      setNewQty(1);
    } finally {
      setAddingBusy(false);
    }
  };

  const handleAddAllSuggestions = async () => {
    if (!canEdit || smartSuggestions.length === 0) return;
    setAddingBusy(true);
    try {
      await onAddItems(
        smartSuggestions.map((s) => ({
          name: s.name,
          category: s.category,
          quantity: s.quantity,
          isAutoSuggested: true,
          reason: s.reason,
        }))
      );
    } finally {
      setAddingBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header + Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-slate-900">
            Smart Packing Checklist
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {trip.title} · {packedCount} of {totalCount} items packed ({progressPct}%)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', 'All'],
                ['remaining', 'To Pack'],
                ['packed', 'Packed'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {canEdit && packedCount > 0 && (
            <button
              type="button"
              onClick={onClearPacked}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 min-h-[38px]"
            >
              Uncheck All
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-slate-700 tabular-nums">
          <span>Trip Readiness</span>
          <span>
            {packedCount} / {totalCount} packed
          </span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-teal-700 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Smart Suggestions Engine Panel */}
      {canEdit && smartSuggestions.length > 0 && (
        <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Sparkles className="w-4 h-4 text-teal-700 shrink-0" />
                <span>Smart Suggestions ({smartSuggestions.length})</span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Tailored from {trip.startDate}–{trip.endDate} duration
                {weather ? `, ${weather.resolvedName} weather` : ''}, {bookings.length}{' '}
                {bookings.length === 1 ? 'stay' : 'stays'}, and {events.length} planned stops.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSuggestionsOpen((v) => !v)}
                className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[38px]"
              >
                {suggestionsOpen ? 'Hide' : 'Preview'}
              </button>
              <button
                type="button"
                disabled={addingBusy}
                onClick={handleAddAllSuggestions}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 min-h-[38px]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Add All ({smartSuggestions.length})
              </button>
            </div>
          </div>

          {suggestionsOpen && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
              {smartSuggestions.map((s) => (
                <button
                  key={`${s.category}-${s.name}`}
                  type="button"
                  disabled={addingBusy}
                  onClick={() =>
                    onAddItems([
                      {
                        name: s.name,
                        category: s.category,
                        quantity: s.quantity,
                        isAutoSuggested: true,
                        reason: s.reason,
                      },
                    ])
                  }
                  className="text-left rounded-xl border border-teal-200/80 bg-white px-3 py-2.5 hover:border-teal-600 hover:bg-teal-50/40 transition-colors flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {s.quantity > 1 ? `${s.quantity}× ` : ''}
                      {s.name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {s.category} · {s.reason}
                    </p>
                  </div>
                  <Plus className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Manual Quick Add Form */}
      {canEdit && (
        <form
          onSubmit={handleManualAdd}
          className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add custom packing item (e.g. Sunglasses case, Camera tripod)..."
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15 min-h-[42px]"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as PackingCategory)}
            aria-label="Item category"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-700 focus:outline-none min-h-[42px]"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={99}
            value={newQty}
            onChange={(e) => setNewQty(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Quantity"
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none min-h-[42px]"
          />
          <button
            type="submit"
            disabled={addingBusy || !newName.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap min-h-[42px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </form>
      )}

      {/* Checklist Grouped by Category */}
      {totalCount === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Your packing checklist is empty.
          {canEdit && smartSuggestions.length > 0
            ? ' Click “Add All” above to populate smart essentials tailored to this trip, or add custom items manually.'
            : ''}
        </div>
      ) : groupedByCategory.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          No packing items match this filter.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5 items-start">
          {groupedByCategory.map(([category, catItems]) => {
            const catPacked = catItems.filter((i) => i.packed).length;
            return (
              <section
                key={category}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    {category}
                  </h3>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {catPacked} / {catItems.length}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {catItems.map((item) => (
                    <div
                      key={item.clientId}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                    >
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => onToggleItem(item)}
                        className="flex items-start gap-3 text-left flex-1 min-w-0 disabled:cursor-default"
                      >
                        {item.packed ? (
                          <CheckSquare className="w-4.5 h-4.5 text-teal-700 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium ${
                              item.packed ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {item.name}
                          </p>
                          {(item.reason || item.syncStatus === 'pending') && (
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {[
                                item.reason,
                                item.syncStatus === 'pending' ? 'Queued for sync' : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {canEdit ? (
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 text-xs tabular-nums">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateQuantity(item, Math.max(1, item.quantity - 1))
                              }
                              className="p-1.5 text-slate-600 hover:text-slate-900"
                              aria-label={`Decrease quantity of ${item.name}`}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 font-semibold text-slate-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateQuantity(item, Math.min(99, item.quantity + 1))
                              }
                              className="p-1.5 text-slate-600 hover:text-slate-900"
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-500 tabular-nums px-2">
                            ×{item.quantity}
                          </span>
                        )}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteItem(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteItem)}
        title="Delete Packing Item?"
        message={
          pendingDeleteItem
            ? `Remove "${pendingDeleteItem.name}" from the packing checklist for ${trip.title}?`
            : ''
        }
        confirmLabel="Delete Item"
        busy={deletingBusy}
        onCancel={() => {
          if (!deletingBusy) setPendingDeleteItem(null);
        }}
        onConfirm={async () => {
          if (!pendingDeleteItem) return;
          setDeletingBusy(true);
          try {
            await onDeleteItem(pendingDeleteItem.clientId);
            setPendingDeleteItem(null);
          } finally {
            setDeletingBusy(false);
          }
        }}
      />
    </div>
  );
};
