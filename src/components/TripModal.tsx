import React, { useEffect, useState } from 'react';
import { Flag, MapPin, Search, X } from 'lucide-react';
import { MiniCartoMap } from './MiniCartoMap';
import type { TripRecord } from '../types/journal';

interface GeocodeCandidate {
  displayName: string;
  latitude: number;
  longitude: number;
  category?: string;
}

interface TripModalProps {
  open: boolean;
  initialTrip?: TripRecord | null;
  authToken?: string;
  onClose: () => void;
  onSave: (data: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    description: string;
    startLocationName: string;
    startLatitude: number | null;
    startLongitude: number | null;
    endLocationName: string;
    endLatitude: number | null;
    endLongitude: number | null;
    targetBudget: number | null;
    budgetCurrency: string;
  }) => Promise<void>;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'MXN'];

interface LocationPickerBlockProps {
  heading: string;
  accentColor: 'emerald' | 'red';
  pinVariant: 'start' | 'end';
  locationName: string;
  latitude: string;
  longitude: string;
  authToken?: string;
  placeholder: string;
  onChangeName: (v: string) => void;
  onChangeLat: (v: string) => void;
  onChangeLng: (v: string) => void;
}

const LocationPickerBlock: React.FC<LocationPickerBlockProps> = ({
  heading,
  accentColor,
  pinVariant,
  locationName,
  latitude,
  longitude,
  authToken,
  placeholder,
  onChangeName,
  onChangeLat,
  onChangeLng,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GeocodeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const parsedLat =
    latitude.trim() !== '' && Number.isFinite(Number(latitude)) ? Number(latitude) : null;
  const parsedLng =
    longitude.trim() !== '' && Number.isFinite(Number(longitude)) ? Number(longitude) : null;
  const hasCoords = parsedLat !== null && parsedLng !== null;

  const runLookup = async (overrideQuery?: string) => {
    const query = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();
    if (!query) {
      setNotice('Enter a city, airport, address, or landmark name to look up.');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNotice('Offline — location lookup requires an internet connection.');
      return;
    }
    if (overrideQuery !== undefined) {
      setSearchQuery(query);
    }

    setSearching(true);
    setNotice(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { headers });
      const data = (await res.json()) as {
        results?: GeocodeCandidate[];
        error?: string;
      };
      if (!res.ok) {
        setNotice(data?.error || 'Unable to look up that location.');
        setResults([]);
        return;
      }
      const found = Array.isArray(data.results) ? data.results : [];
      setResults(found);
      if (found.length > 0) {
        onChangeLat(found[0].latitude.toFixed(5));
        onChangeLng(found[0].longitude.toFixed(5));
        if (!locationName.trim()) {
          onChangeName(found[0].displayName.split(',')[0].trim());
        }
        setNotice(null);
      } else {
        setNotice('No matching coordinates found. Try adding country or city.');
      }
    } catch {
      setNotice('Could not reach location lookup service.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Flag
            className={`w-3.5 h-3.5 ${
              accentColor === 'emerald' ? 'text-emerald-700' : 'text-red-700'
            }`}
          />
          <span className="text-xs font-semibold text-slate-900">{heading}</span>
        </div>
        <div className="flex items-center gap-3">
          {locationName.trim() && (
            <button
              type="button"
              disabled={searching}
              onClick={() => runLookup(locationName.trim())}
              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                accentColor === 'emerald'
                  ? 'text-emerald-700 hover:text-emerald-800'
                  : 'text-red-700 hover:text-red-800'
              } disabled:opacity-50`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {searching ? 'Looking up...' : 'Look up Lat/Lng'}
            </button>
          )}
          {!hasCoords && (
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              {showPicker ? 'Hide Map Picker' : 'Pick on Map'}
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        value={locationName}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
      />

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runLookup();
              }
            }}
            placeholder="Search address, airport, or landmark..."
            aria-label={`Search ${heading}`}
            className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
          />
        </div>
        <button
          type="button"
          disabled={searching}
          onClick={() => runLookup()}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60 whitespace-nowrap"
        >
          {searching ? 'Finding...' : 'Find'}
        </button>
      </div>

      {notice && (
        <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
          {notice}
        </p>
      )}

      {results.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {results.map((item, idx) => {
            const isActiveMatch =
              parsedLat !== null &&
              parsedLng !== null &&
              Math.abs(parsedLat - item.latitude) < 0.0002 &&
              Math.abs(parsedLng - item.longitude) < 0.0002;
            return (
              <button
                key={`${item.latitude}-${item.longitude}-${idx}`}
                type="button"
                onClick={() => {
                  onChangeLat(item.latitude.toFixed(5));
                  onChangeLng(item.longitude.toFixed(5));
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-start justify-between gap-2 ${
                  isActiveMatch
                    ? 'bg-teal-50 text-teal-950 font-medium'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="line-clamp-2 flex-1">{item.displayName}</span>
                <span className="font-mono text-[10px] text-slate-500 tabular-nums shrink-0 mt-0.5">
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <input
          type="number"
          step="any"
          value={latitude}
          onChange={(e) => onChangeLat(e.target.value)}
          placeholder="Latitude"
          aria-label={`${heading} Latitude`}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
        />
        <input
          type="number"
          step="any"
          value={longitude}
          onChange={(e) => onChangeLng(e.target.value)}
          placeholder="Longitude"
          aria-label={`${heading} Longitude`}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
        />
      </div>

      {(hasCoords || showPicker) && (
        <MiniCartoMap
          latitude={parsedLat}
          longitude={parsedLng}
          title={locationName || heading}
          pinVariant={pinVariant}
          interactive
          allowEmptyMap={showPicker}
          onChangeCoordinates={(lat, lng) => {
            onChangeLat(lat.toFixed(5));
            onChangeLng(lng.toFixed(5));
          }}
        />
      )}
    </div>
  );
};

export const TripModal: React.FC<TripModalProps> = ({
  open,
  initialTrip,
  authToken,
  onClose,
  onSave,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [description, setDescription] = useState('');

  const [startLocationName, setStartLocationName] = useState('');
  const [startLatitude, setStartLatitude] = useState('');
  const [startLongitude, setStartLongitude] = useState('');

  const [endLocationName, setEndLocationName] = useState('');
  const [endLatitude, setEndLatitude] = useState('');
  const [endLongitude, setEndLongitude] = useState('');

  const [targetBudget, setTargetBudget] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('USD');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTrip?.title || '');
      setDestination(initialTrip?.destination || '');
      setStartDate(initialTrip?.startDate || today);
      setEndDate(initialTrip?.endDate || today);
      setDescription(initialTrip?.description || '');
      setStartLocationName(initialTrip?.startLocationName || '');
      setStartLatitude(
        initialTrip?.startLatitude !== null && initialTrip?.startLatitude !== undefined
          ? String(initialTrip.startLatitude)
          : ''
      );
      setStartLongitude(
        initialTrip?.startLongitude !== null && initialTrip?.startLongitude !== undefined
          ? String(initialTrip.startLongitude)
          : ''
      );
      setEndLocationName(initialTrip?.endLocationName || '');
      setEndLatitude(
        initialTrip?.endLatitude !== null && initialTrip?.endLatitude !== undefined
          ? String(initialTrip.endLatitude)
          : ''
      );
      setEndLongitude(
        initialTrip?.endLongitude !== null && initialTrip?.endLongitude !== undefined
          ? String(initialTrip.endLongitude)
          : ''
      );
      setTargetBudget(
        initialTrip?.targetBudget !== null && initialTrip?.targetBudget !== undefined
          ? String(initialTrip.targetBudget)
          : ''
      );
      setBudgetCurrency(initialTrip?.budgetCurrency || 'USD');
      setError(null);
    }
  }, [open, initialTrip, today]);

  if (!open) return null;

  const parseCoord = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

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
    const parsedBudget = targetBudget.trim() !== '' ? Number(targetBudget) : null;
    if (parsedBudget !== null && (!Number.isFinite(parsedBudget) || parsedBudget < 0)) {
      setError('Target budget must be a valid non-negative number.');
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
        startLocationName: startLocationName.trim(),
        startLatitude: parseCoord(startLatitude),
        startLongitude: parseCoord(startLongitude),
        endLocationName: endLocationName.trim(),
        endLatitude: parseCoord(endLatitude),
        endLongitude: parseCoord(endLongitude),
        targetBudget: parsedBudget !== null ? Number(parsedBudget.toFixed(2)) : null,
        budgetCurrency: budgetCurrency || 'USD',
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
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100">
          <h2 className="font-display text-xl font-semibold text-slate-900">
            {initialTrip ? 'Edit Trip Information' : 'Create New Trip'}
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
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

          <div className="grid sm:grid-cols-2 gap-3">
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

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Target Budget (optional)
              </label>
              <div className="grid grid-cols-12 gap-2">
                <select
                  value={budgetCurrency}
                  onChange={(e) => setBudgetCurrency(e.target.value)}
                  aria-label="Budget currency"
                  className="col-span-4 rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-xs font-semibold text-slate-900 focus:border-teal-700 focus:outline-none"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={targetBudget}
                  onChange={(e) => setTargetBudget(e.target.value)}
                  placeholder="2500.00"
                  className="col-span-8 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 tabular-nums focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>
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

          {/* Starting & Ending Locations */}
          <LocationPickerBlock
            heading="Starting Location (Map Origin)"
            accentColor="emerald"
            pinVariant="start"
            locationName={startLocationName}
            latitude={startLatitude}
            longitude={startLongitude}
            authToken={authToken}
            placeholder="e.g. Kansai International Airport / Home"
            onChangeName={setStartLocationName}
            onChangeLat={setStartLatitude}
            onChangeLng={setStartLongitude}
          />

          <LocationPickerBlock
            heading="Ending Location (Map Destination)"
            accentColor="red"
            pinVariant="end"
            locationName={endLocationName}
            latitude={endLatitude}
            longitude={endLongitude}
            authToken={authToken}
            placeholder="e.g. Tokyo Haneda Airport"
            onChangeName={setEndLocationName}
            onChangeLat={setEndLatitude}
            onChangeLng={setEndLongitude}
          />

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
