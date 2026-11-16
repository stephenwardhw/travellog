import React, { useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  RefreshCw,
  Sun,
  Wind,
} from 'lucide-react';
import type { TripRecord, WeatherForecastResponse } from '../types/journal';

interface WeatherForecastStripProps {
  trip: TripRecord;
  weather: WeatherForecastResponse | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  isOnline: boolean;
  onRefresh: () => void;
  onEditTrip?: () => void;
}

function WeatherCodeIcon({ code }: { code: number }) {
  if (code === 0 || code === 1) {
    return <Sun className="w-5 h-5 text-amber-500 shrink-0" />;
  }
  if (code === 2) {
    return <CloudSun className="w-5 h-5 text-amber-600 shrink-0" />;
  }
  if (code === 3) {
    return <Cloud className="w-5 h-5 text-slate-500 shrink-0" />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog className="w-5 h-5 text-slate-500 shrink-0" />;
  }
  if (code >= 51 && code <= 57) {
    return <CloudDrizzle className="w-5 h-5 text-sky-600 shrink-0" />;
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className="w-5 h-5 text-blue-600 shrink-0" />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow className="w-5 h-5 text-cyan-600 shrink-0" />;
  }
  if (code >= 95) {
    return <CloudLightning className="w-5 h-5 text-indigo-600 shrink-0" />;
  }
  return <CloudSun className="w-5 h-5 text-slate-500 shrink-0" />;
}

function formatDayShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTemp(celsius: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

export const WeatherForecastStrip: React.FC<WeatherForecastStripProps> = ({
  trip,
  weather,
  loading,
  error,
  canEdit,
  isOnline,
  onRefresh,
  onEditTrip,
}) => {
  const [unit, setUnit] = useState<'C' | 'F'>('C');

  if (!trip.destination.trim()) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          <CloudSun className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            Add a primary destination to <strong className="font-medium text-slate-900">{trip.title}</strong> to view a 5-day weather forecast.
          </span>
        </div>
        {canEdit && onEditTrip && (
          <button
            type="button"
            onClick={onEditTrip}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
          >
            Set Destination
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
            <span className="truncate">
              5-Day Weather ·{' '}
              {weather
                ? [weather.resolvedName, weather.country].filter(Boolean).join(', ')
                : trip.destination}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {weather
              ? weather.note
              : loading
              ? 'Loading destination forecast...'
              : error || 'Weather forecast for trip destination.'}
            {weather && !isOnline ? ' · Offline cached' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setUnit('C')}
              className={`px-2 py-1 rounded-md transition-colors ${
                unit === 'C' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              °C
            </button>
            <button
              type="button"
              onClick={() => setUnit('F')}
              className={`px-2 py-1 rounded-md transition-colors ${
                unit === 'F' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              °F
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || !isOnline}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh weather forecast"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && !weather && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && !weather ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[0, 1, 2, 3, 4].map((idx) => (
            <div
              key={idx}
              className="h-24 rounded-xl border border-slate-100 bg-slate-50 animate-pulse"
            />
          ))}
        </div>
      ) : weather && weather.days.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {weather.days.map((day) => (
            <div
              key={day.date}
              className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 flex flex-col justify-between gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-900 tabular-nums truncate">
                    {formatDayShort(day.date)}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{day.label}</p>
                </div>
                <WeatherCodeIcon code={day.weatherCode} />
              </div>

              <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-200/60 tabular-nums">
                <div className="text-xs font-semibold text-slate-900">
                  {formatTemp(day.tempMaxC, unit)}
                  <span className="text-slate-400 font-normal ml-1">
                    / {formatTemp(day.tempMinC, unit)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  {day.precipProbMax !== null ? (
                    <span className="inline-flex items-center gap-0.5" title="Precipitation probability">
                      <Droplets className="w-2.5 h-2.5 text-sky-600" />
                      {day.precipProbMax}%
                    </span>
                  ) : day.precipMm !== null ? (
                    <span className="inline-flex items-center gap-0.5" title="Precipitation total">
                      <Droplets className="w-2.5 h-2.5 text-sky-600" />
                      {day.precipMm}mm
                    </span>
                  ) : null}
                  {day.windMaxKmh !== null && (
                    <span className="hidden lg:inline-flex items-center gap-0.5" title="Max wind speed">
                      <Wind className="w-2.5 h-2.5 text-slate-400" />
                      {day.windMaxKmh}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
