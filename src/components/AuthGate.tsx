import React, { useEffect, useState } from 'react';
import { ArrowRight, Compass, Eye, EyeOff, FileSearch, Lock, ShieldCheck, Wifi } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import type { AuthSession } from '../types/journal';

interface AuthGateProps {
  onAuthenticated: (session: AuthSession) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/status')
      .then((res) => (res.ok ? res.json() : { needsSetup: false }))
      .then((data) => {
        if (active) setNeedsSetup(Boolean(data?.needsSetup));
      })
      .catch(() => {
        if (active) setNeedsSetup(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = needsSetup ? '/api/auth/bootstrap' : '/api/auth/login';
      const body = needsSetup ? { name, email, password } : { email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Authentication failed.');
      }
      onAuthenticated({ token: data.token, user: data.user });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            TravelLog
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-12 lg:py-16 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6 space-y-6">
          <p className="text-xs font-medium tracking-wide text-teal-800">
            Offline-First Travel Journal · Self-Hosted PostgreSQL Auth
          </p>
          <h1 className="font-display text-4xl lg:text-5xl font-semibold tracking-tight text-slate-900 leading-[1.12]">
            Every route, journal note, photo, and travel PDF in one offline atlas.
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            Import itineraries from CSV, track stops across a CARTO map, calendar, and agenda, and
            log daily entries with photos and PDFs even when disconnected. Sync runs automatically
            over Wi-Fi.
          </p>

          <div className="pt-2 space-y-3 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <Wifi className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Local IndexedDB offline storage with Wi-Fi-only media sync</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Compass className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Interactive CARTO map, monthly calendar, and upcoming agenda</span>
            </div>
            <div className="flex items-center gap-2.5">
              <FileSearch className="w-4 h-4 text-teal-700 shrink-0" />
              <span>Full-text search across journal logs and attached PDF documents</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 max-w-md mx-auto">
            <div className="space-y-1.5 mb-6">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-800">
                {needsSetup ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    First-Time Setup
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Local Account Sign-In
                  </>
                )}
              </div>
              <h2 className="font-display text-2xl font-semibold text-slate-900">
                {needsSetup ? 'Create Administrator Account' : 'Sign in to TravelLog'}
              </h2>
              <p className="text-xs text-slate-500">
                {needsSetup
                  ? 'No local administrator exists yet. Create the first admin account to manage users and sync your journal.'
                  : 'Sign in with your PostgreSQL account credentials. Offline access stays enabled on this device.'}
              </p>
            </div>

            {needsSetup === null ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Checking server status...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                    {error}
                  </div>
                )}

                {needsSetup && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Stephen Ward"
                      required
                      className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={needsSetup ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={needsSetup ? 'Minimum 6 characters' : 'Enter your password'}
                      minLength={6}
                      required
                      className="w-full rounded-lg border border-slate-300 pl-3.5 pr-11 py-2.5 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-10 text-slate-500 hover:text-slate-800 focus:outline-none focus:text-teal-700 rounded-r-lg"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 transition-colors disabled:opacity-60 min-h-[44px]"
                >
                  {loading
                    ? 'Please wait...'
                    : needsSetup
                    ? 'Create Admin & Enter Journal'
                    : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
