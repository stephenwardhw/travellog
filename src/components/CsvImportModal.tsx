import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, X, AlertCircle, Check } from 'lucide-react';
import { parseItineraryCsv, SAMPLE_ITINERARY_CSV, type ParsedCsvStop } from '../lib/csvParser';
import type { TripRecord } from '../types/journal';

interface CsvImportModalProps {
  open: boolean;
  trips: TripRecord[];
  activeTripClientId: string | null;
  onClose: () => void;
  onImport: (opts: {
    targetTripClientId: string | 'new';
    newTripTitle?: string;
    rows: ParsedCsvStop[];
  }) => Promise<void>;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  open,
  trips,
  activeTripClientId,
  onClose,
  onImport,
}) => {
  const [csvText, setCsvText] = useState('');
  const [targetTrip, setTargetTrip] = useState<string>(
    activeTripClientId || (trips[0]?.clientId ?? 'new')
  );
  const [newTripTitle, setNewTripTitle] = useState('Imported Itinerary');
  const [importing, setImporting] = useState(false);

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseItineraryCsv(csvText);
  }, [csvText]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    if (!newTripTitle || newTripTitle === 'Imported Itinerary') {
      setNewTripTitle(file.name.replace(/\.csv$/i, ''));
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    try {
      await onImport({
        targetTripClientId: targetTrip === 'new' || trips.length === 0 ? 'new' : targetTrip,
        newTripTitle: newTripTitle.trim() || 'Imported Trip',
        rows: parsed.rows,
      });
      setCsvText('');
      onClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-900">
              Import Itinerary CSV
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Required: date, location · Optional: latitude, longitude, details, time
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close import modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Destination Trip
              </label>
              <select
                value={trips.length === 0 ? 'new' : targetTrip}
                onChange={(e) => setTargetTrip(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              >
                {trips.map((t) => (
                  <option key={t.clientId} value={t.clientId}>
                    {t.title} ({t.startDate})
                  </option>
                ))}
                <option value="new">+ Create a new trip from CSV</option>
              </select>
            </div>

            {(targetTrip === 'new' || trips.length === 0) && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  New Trip Title
                </label>
                <input
                  type="text"
                  value={newTripTitle}
                  onChange={(e) => setNewTripTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[44px]">
              <Upload className="w-4 h-4 text-teal-700" />
              Choose .csv file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setCsvText(SAMPLE_ITINERARY_CSV)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 min-h-[44px]"
            >
              <FileSpreadsheet className="w-4 h-4 text-slate-600" />
              Load sample itinerary
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Or paste CSV text
            </label>
            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`date,location,latitude,longitude,details\n2026-11-16,Tokyo Station,35.6812,139.7671,Pick up rail pass`}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-800 focus:border-teal-700 focus:outline-none"
            />
          </div>

          {parsed?.error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parsed.error}</span>
            </div>
          )}

          {parsed && parsed.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 space-y-1">
              {parsed.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          {parsed && parsed.rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-900 inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-teal-700" />
                  Ready to import {parsed.rows.length} stops
                </span>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-52">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Location</th>
                      <th className="px-3 py-2 font-medium">Coordinates</th>
                      <th className="px-3 py-2 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsed.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {row.eventDate}
                          {row.eventTime ? ` ${row.eventTime}` : ''}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">{row.location}</td>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {row.latitude !== null && row.longitude !== null
                            ? `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-xs truncate">
                          {row.details || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parsed || parsed.rows.length === 0 || importing}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 min-h-[44px]"
          >
            {importing
              ? 'Importing...'
              : `Import ${parsed?.rows.length || 0} Stops`}
          </button>
        </div>
      </div>
    </div>
  );
};
