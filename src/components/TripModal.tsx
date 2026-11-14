import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { TripRecord } from '../types/journal';

interface TripModalProps {
  open: boolean;
  initialTrip?: TripRecord | null;
  onClose: () => void;
  onSave: (data: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    description: string;
  }) => Promise<void>;
}

export const TripModal: React.FC<TripModalProps> = ({
  open,
  initialTrip,
  onClose,
  onSave,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTrip?.title || '');
      setDestination(initialTrip?.destination || '');
      setStartDate(initialTrip?.startDate || today);
      setEndDate(initialTrip?.endDate || today);
      setDescription(initialTrip?.description || '');
      setError(null);
    }
  }, [open, initialTrip, today]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Trip title is required.');
      return;
    }
    if (endDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        description: description.trim(),
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save trip.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            {initialTrip ? 'Edit Trip' : 'Create New Trip'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Trip Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Autumn in Kansai & Setouchi"
              required
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Primary Region / Destination
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Japan"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Overview Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Flight confirmation codes, rail pass reminders, packing notes..."
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 min-h-[44px]"
            >
              {saving ? 'Saving...' : initialTrip ? 'Save Changes' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
