import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Compass, Calendar, FileSearch, Wifi, ArrowRight } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { PWAInstallButton } from './PWAInstallButton';

export const AuthGate: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Fieldlog
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-20 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-medium tracking-wide text-teal-800">
            Offline-First Travel Journal · Cross-Device Sync
          </p>
          <h1 className="font-display text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900 leading-[1.12]">
            Every route, journal note, photo, and travel PDF in one offline atlas.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            Import itineraries from CSV, track stops across an interactive CARTO map, calendar, and
            agenda, and log daily entries with photos and PDFs even when disconnected. Photos and
            documents synchronize automatically across your devices whenever Wi-Fi is available.
          </p>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="inline-flex items-center gap-2.5 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors shadow-sm disabled:opacity-60 min-h-[44px]"
            >
              {loading ? 'Connecting account...' : 'Continue with Google'}
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500">
              Sign in once online to enable offline access & multi-device Wi-Fi sync.
            </span>
          </div>
        </div>

        <div className="lg:col-span-5 grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700 shrink-0">
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Disconnected Mode & Wi-Fi Sync
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  All trips, journal entries, photos, and PDFs are cached locally in IndexedDB and
                  synced over Wi-Fi—never burning mobile data.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  CARTO Map, Calendar & Agenda
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Import CSV itineraries with coordinates and switch effortlessly between a monthly
                  calendar, chronological agenda, and CARTO Voyager map.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
                <FileSearch className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Searchable PDF Documents & Disk Media
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Attach boarding passes, bookings, and field guides in PDF form and search inside
                  both event notes and PDF text offline.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Built for Desktop & Mobile PWA
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Install on iOS, Android, or desktop to log stops on the move with responsive
                  thumb-zone navigation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
