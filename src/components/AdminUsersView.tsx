import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Calendar,
  FileArchive,
  KeyRound,
  MapPin,
  Palette,
  RotateCcw,
  Shield,
  Trash2,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { useNetworkStatus } from '../lib/network';
import { ConfirmDialog } from './ConfirmDialog';
import {
  DEFAULT_CALENDAR_SETTINGS,
  type AdminTripSummary,
  type CalendarThemeSettings,
  type LocalUser,
} from '../types/journal';

interface AdminUsersViewProps {
  token: string;
  currentUser: LocalUser;
  calendarSettings: CalendarThemeSettings;
  onCalendarSettingsSaved: (settings: CalendarThemeSettings) => Promise<void> | void;
  onTripsChanged?: (deletedClientId?: string) => Promise<void> | void;
  onDownloadTripBackup?: (clientId: string, title: string) => Promise<void> | void;
  onUnauthorized: () => void;
}

const EVENT_DAY_PRESETS = [
  { label: 'Warm Amber', hex: '#fef3c7' },
  { label: 'Soft Rose', hex: '#ffe4e6' },
  { label: 'Sky Blue', hex: '#dbeafe' },
  { label: 'Fresh Mint', hex: '#d1fae5' },
  { label: 'Lavender', hex: '#ede9fe' },
  { label: 'Peach', hex: '#ffedd5' },
];

const TRIP_DAY_PRESETS = [
  { label: 'Soft Teal', hex: '#dff5f2' },
  { label: 'Ice Blue', hex: '#eff6ff' },
  { label: 'Sage', hex: '#ecfdf5' },
  { label: 'Sand', hex: '#faf7ed' },
  { label: 'Slate Tint', hex: '#f1f5f9' },
  { label: 'Pure White', hex: '#ffffff' },
];

function safeHex(val: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(val.trim()) ? val.trim() : fallback;
}

function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  token,
  currentUser,
  calendarSettings,
  onCalendarSettingsSaved,
  onTripsChanged,
  onDownloadTripBackup,
  onUnauthorized,
}) => {
  const { isOnline } = useNetworkStatus();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Admin Trip Management state
  const [adminTrips, setAdminTrips] = useState<AdminTripSummary[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripFilter, setTripFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [tripBusyClientId, setTripBusyClientId] = useState<string | null>(null);
  const [pendingTripAction, setPendingTripAction] = useState<{
    trip: AdminTripSummary;
    action: 'archive' | 'delete';
  } | null>(null);

  // Calendar color settings state
  const [eventDayBg, setEventDayBg] = useState(calendarSettings.eventDayBg);
  const [tripDayBg, setTripDayBg] = useState(calendarSettings.tripDayBg);
  const [savingColors, setSavingColors] = useState(false);

  // Create user form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [creating, setCreating] = useState(false);

  // Confirm delete / password reset state
  const [pendingDeleteUser, setPendingDeleteUser] = useState<LocalUser | null>(null);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load users.');
      setUsers(data.users || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  }, [token, isOnline, onUnauthorized]);

  const loadAdminTrips = useCallback(async () => {
    if (!isOnline) {
      setTripsLoading(false);
      return;
    }
    setTripsLoading(true);
    try {
      const res = await fetch('/api/admin/trips', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load trips.');
      setAdminTrips(data.trips || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load trips.');
    } finally {
      setTripsLoading(false);
    }
  }, [token, isOnline, onUnauthorized]);

  useEffect(() => {
    setEventDayBg(calendarSettings.eventDayBg);
    setTripDayBg(calendarSettings.tripDayBg);
  }, [calendarSettings.eventDayBg, calendarSettings.tripDayBg]);

  useEffect(() => {
    loadUsers();
    loadAdminTrips();
  }, [loadUsers, loadAdminTrips]);

  const filteredTrips = useMemo(() => {
    if (tripFilter === 'active') return adminTrips.filter((t) => !t.archivedAt);
    if (tripFilter === 'archived') return adminTrips.filter((t) => Boolean(t.archivedAt));
    return adminTrips;
  }, [adminTrips, tripFilter]);

  const activeTripCount = useMemo(
    () => adminTrips.filter((t) => !t.archivedAt).length,
    [adminTrips]
  );
  const archivedTripCount = useMemo(
    () => adminTrips.filter((t) => Boolean(t.archivedAt)).length,
    [adminTrips]
  );

  const persistCalendarColors = async (next: CalendarThemeSettings, successMessage: string) => {
    setSavingColors(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/settings/calendar', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(next),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save calendar colors.');
      setEventDayBg(data.settings.eventDayBg);
      setTripDayBg(data.settings.tripDayBg);
      await onCalendarSettingsSaved(data.settings);
      setNotice(successMessage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save calendar colors.');
    } finally {
      setSavingColors(false);
    }
  };

  const handleSaveCalendarColors = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistCalendarColors(
      { eventDayBg, tripDayBg },
      'Calendar background colors saved to database.'
    );
  };

  const handleResetCalendarColors = async () => {
    setEventDayBg(DEFAULT_CALENDAR_SETTINGS.eventDayBg);
    setTripDayBg(DEFAULT_CALENDAR_SETTINGS.tripDayBg);
    await persistCalendarColors(
      DEFAULT_CALENDAR_SETTINGS,
      'Calendar background colors reset to defaults.'
    );
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password, role }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create user.');
      setName('');
      setEmail('');
      setPassword('');
      setRole('user');
      setNotice(`Created user ${data.user.email}.`);
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRole = async (target: LocalUser) => {
    const nextRole = target.role === 'admin' ? 'user' : 'admin';
    setBusyId(target.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: nextRole }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update role.');
      setNotice(`Updated ${target.email} role to ${nextRole}.`);
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update role.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent, target: LocalUser) => {
    e.preventDefault();
    if (resetPasswordValue.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setBusyId(target.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: resetPasswordValue }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to reset password.');
      setResetUserId(null);
      setResetPasswordValue('');
      setNotice(`Password updated for ${target.email}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (target: LocalUser) => {
    setBusyId(target.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to delete user.');
      setPendingDeleteUser(null);
      setNotice(`Deleted user ${target.email}.`);
      await loadUsers();
      await loadAdminTrips();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete user.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleArchiveTrip = async (target: AdminTripSummary, archived: boolean) => {
    setTripBusyClientId(target.clientId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/trips/${encodeURIComponent(target.clientId)}/archive`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ archived }),
        }
      );
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update trip archive state.');
      setNotice(
        archived
          ? `Archived trip "${target.title}".`
          : `Restored trip "${target.title}" to active dropdowns.`
      );
      await loadAdminTrips();
      await onTripsChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update trip archive state.');
    } finally {
      setTripBusyClientId(null);
    }
  };

  const handlePermanentDeleteTrip = async (target: AdminTripSummary) => {
    setTripBusyClientId(target.clientId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/trips/${encodeURIComponent(target.clientId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to delete trip.');
      setNotice(`Permanently deleted trip "${target.title}" and all associated media.`);
      await loadAdminTrips();
      await onTripsChanged?.(target.clientId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete trip.');
    } finally {
      setTripBusyClientId(null);
    }
  };

  const handleBackupTripZip = async (target: AdminTripSummary) => {
    if (!onDownloadTripBackup) return;
    setTripBusyClientId(target.clientId);
    setError(null);
    setNotice(`Preparing backup ZIP for "${target.title}"...`);
    try {
      await onDownloadTripBackup(target.clientId, target.title);
      setNotice(`Backup ZIP downloaded for "${target.title}".`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create trip backup ZIP.');
    } finally {
      setTripBusyClientId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-slate-900">
          User Administration
        </h2>
        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
          Manage local PostgreSQL accounts · {users.length}{' '}
          {users.length === 1 ? 'registered user' : 'registered users'}
        </p>
      </div>

      {!isOnline && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
          <span>
            Offline mode — creating, modifying, or deleting users requires a connection to the
            PostgreSQL server.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-900">
          {notice}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Create User Form */}
        <section className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <UserPlus className="w-4 h-4 text-teal-700" />
            <h3 className="text-sm font-semibold text-slate-900">Create User</h3>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Traveler"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Temporary Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'user')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
              >
                <option value="user">Standard User</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating || !isOnline}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? 'Creating...' : 'Add User Account'}
            </button>
          </form>
        </section>

        {/* Users List */}
        <section className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Registered Accounts</h3>
            <span className="text-xs text-slate-500 tabular-nums">{users.length} total</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No users found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const isResetting = resetUserId === u.id;

                return (
                  <div key={u.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums flex-wrap">
                          <span
                            className={
                              u.role === 'admin'
                                ? 'font-semibold text-teal-800'
                                : 'text-slate-600'
                            }
                          >
                            {u.role === 'admin' ? 'Administrator' : 'User'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Created {new Date(u.createdAt).toLocaleDateString()}
                          </span>
                          {isSelf && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-slate-800">Current session</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {u.name || u.email}
                        </p>
                        <p className="text-xs text-slate-600 truncate">{u.email}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <button
                          type="button"
                          disabled={!isOnline || busyId === u.id || isSelf}
                          onClick={() => handleToggleRole(u)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                          title={
                            isSelf
                              ? 'Cannot change your own active role'
                              : u.role === 'admin'
                              ? 'Demote to User'
                              : 'Promote to Admin'
                          }
                        >
                          <Shield className="w-3.5 h-3.5 text-slate-500" />
                          {u.role === 'admin' ? 'Set User' : 'Set Admin'}
                        </button>

                        <button
                          type="button"
                          disabled={!isOnline || busyId === u.id}
                          onClick={() => {
                            setResetUserId(isResetting ? null : u.id);
                            setResetPasswordValue('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                          Reset Password
                        </button>

                        {!isSelf && (
                          <button
                            type="button"
                            disabled={!isOnline || busyId === u.id}
                            onClick={() => {
                              setPendingDeleteUser(u);
                              setResetUserId(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {isResetting && (
                      <form
                        onSubmit={(e) => handleResetPassword(e, u)}
                        className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="password"
                          value={resetPasswordValue}
                          onChange={(e) => setResetPasswordValue(e.target.value)}
                          placeholder="New password (min 6 chars)"
                          minLength={6}
                          required
                          className="flex-1 min-w-[180px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={busyId === u.id}
                          className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 min-h-[36px]"
                        >
                          Save Password
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetUserId(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 min-h-[36px]"
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Calendar Appearance Settings */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-teal-700" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Calendar Background Colors</h3>
              <p className="text-xs text-slate-500">
                Customize how days with stops and trip date ranges appear on the Calendar tab.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={savingColors || !isOnline}
            onClick={handleResetCalendarColors}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[36px] self-start sm:self-auto"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset Defaults
          </button>
        </div>

        <form onSubmit={handleSaveCalendarColors} className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="event-day-bg" className="text-xs font-semibold text-slate-800">
                Days with Events / Stops
              </label>
              <span className="font-mono text-xs text-slate-500 uppercase tabular-nums">
                {eventDayBg}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="event-day-bg"
                type="color"
                value={safeHex(eventDayBg, DEFAULT_CALENDAR_SETTINGS.eventDayBg)}
                onChange={(e) => setEventDayBg(e.target.value)}
                className="h-10 w-14 rounded-lg border border-slate-300 bg-white p-1 cursor-pointer"
              />
              <input
                type="text"
                aria-label="Days with events hex color"
                value={eventDayBg}
                onChange={(e) => setEventDayBg(e.target.value)}
                pattern="^#[0-9a-fA-F]{6}$"
                placeholder="#fef3c7"
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_DAY_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setEventDayBg(preset.hex)}
                  title={preset.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                    eventDayBg.toLowerCase() === preset.hex.toLowerCase()
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded border border-slate-300 inline-block"
                    style={{ backgroundColor: preset.hex }}
                  />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="trip-day-bg" className="text-xs font-semibold text-slate-800">
                Trip Date Range (No Events)
              </label>
              <span className="font-mono text-xs text-slate-500 uppercase tabular-nums">
                {tripDayBg}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="trip-day-bg"
                type="color"
                value={safeHex(tripDayBg, DEFAULT_CALENDAR_SETTINGS.tripDayBg)}
                onChange={(e) => setTripDayBg(e.target.value)}
                className="h-10 w-14 rounded-lg border border-slate-300 bg-white p-1 cursor-pointer"
              />
              <input
                type="text"
                aria-label="Trip days hex color"
                value={tripDayBg}
                onChange={(e) => setTripDayBg(e.target.value)}
                pattern="^#[0-9a-fA-F]{6}$"
                placeholder="#dff5f2"
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TRIP_DAY_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => setTripDayBg(preset.hex)}
                  title={preset.label}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors ${
                    tripDayBg.toLowerCase() === preset.hex.toLowerCase()
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded border border-slate-300 inline-block"
                    style={{ backgroundColor: preset.hex }}
                  />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-12 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="text-[11px] font-medium text-slate-500 mr-1">Preview:</span>
              <span
                className={`inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium ${
                  isDarkHex(safeHex(eventDayBg, DEFAULT_CALENDAR_SETTINGS.eventDayBg))
                    ? 'text-white'
                    : 'text-slate-900'
                }`}
                style={{ backgroundColor: safeHex(eventDayBg, DEFAULT_CALENDAR_SETTINGS.eventDayBg) }}
              >
                14 · Stop logged
              </span>
              <span
                className={`inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium ${
                  isDarkHex(safeHex(tripDayBg, DEFAULT_CALENDAR_SETTINGS.tripDayBg))
                    ? 'text-white'
                    : 'text-slate-900'
                }`}
                style={{ backgroundColor: safeHex(tripDayBg, DEFAULT_CALENDAR_SETTINGS.tripDayBg) }}
              >
                15 · Trip day
              </span>
              <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                16 · Outside trip
              </span>
            </div>

            <button
              type="submit"
              disabled={savingColors || !isOnline}
              className="rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 min-h-[40px] whitespace-nowrap self-start sm:self-auto"
            >
              {savingColors ? 'Saving...' : 'Save Calendar Colors'}
            </button>
          </div>
        </form>
      </section>

      {/* Active & Archived Trips Management */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Archive className="w-4 h-4 text-teal-700" />
              Trip Management (Active &amp; Archived)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {activeTripCount} active · {archivedTripCount} archived · Restore archived trips or
              permanently delete trips and all media.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
            {(
              [
                ['all', `All (${adminTrips.length})`],
                ['active', `Active (${activeTripCount})`],
                ['archived', `Archived (${archivedTripCount})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTripFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tripFilter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tripsLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading trips...</div>
        ) : filteredTrips.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No trips in this view.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTrips.map((tr) => {
              const isArchived = Boolean(tr.archivedAt);
              const busy = tripBusyClientId === tr.clientId;
              return (
                <div
                  key={tr.clientId}
                  className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isArchived ? 'bg-amber-50/30' : ''
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums flex-wrap">
                      <span
                        className={`font-semibold ${
                          isArchived ? 'text-amber-700' : 'text-teal-800'
                        }`}
                      >
                        {isArchived ? 'Archived' : 'Active'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {tr.startDate} – {tr.endDate}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Owner: {tr.ownerName || tr.ownerEmail}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{tr.title}</p>
                    <p className="text-xs text-slate-500 tabular-nums flex items-center gap-2 flex-wrap">
                      {tr.destination && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          {tr.destination}
                        </span>
                      )}
                      <span>
                        {tr.eventCount} stops · {tr.bookingCount} stays · {tr.expenseCount} expenses
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {onDownloadTripBackup && (
                      <button
                        type="button"
                        disabled={!isOnline || busy}
                        onClick={() => handleBackupTripZip(tr)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                        title="Download full trip backup ZIP (PDF report, CSV itinerary, JSON, linked documents, and images)"
                      >
                        <FileArchive className="w-3.5 h-3.5 text-teal-700" />
                        Backup ZIP
                      </button>
                    )}

                    {isArchived ? (
                      <button
                        type="button"
                        disabled={!isOnline || busy}
                        onClick={() => handleToggleArchiveTrip(tr, false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore Active
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!isOnline || busy}
                        onClick={() => setPendingTripAction({ trip: tr, action: 'archive' })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={!isOnline || busy}
                      onClick={() => setPendingTripAction({ trip: tr, action: 'delete' })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-45 min-h-[36px] whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Forever
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Confirm User Delete */}
      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title="Delete User Account?"
        message={
          pendingDeleteUser
            ? `Permanently delete ${pendingDeleteUser.email} and all of their trips, stays, photos, and PDFs? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete User"
        busy={busyId !== null}
        onCancel={() => {
          if (busyId === null) setPendingDeleteUser(null);
        }}
        onConfirm={() => {
          if (pendingDeleteUser) {
            return handleDeleteUser(pendingDeleteUser);
          }
        }}
      />

      {/* Confirm Trip Archive / Permanent Delete */}
      <ConfirmDialog
        open={Boolean(pendingTripAction)}
        title={
          pendingTripAction?.action === 'archive'
            ? 'Archive Trip?'
            : 'Permanently Delete Trip?'
        }
        message={
          pendingTripAction?.action === 'archive'
            ? `Archive "${pendingTripAction.trip.title}"? It will be hidden from trip dropdowns until restored here in Admin.`
            : pendingTripAction
            ? `Permanently delete "${pendingTripAction.trip.title}" along with ${pendingTripAction.trip.eventCount} stops, ${pendingTripAction.trip.bookingCount} stays, ${pendingTripAction.trip.expenseCount} expenses, and all photos and PDFs? This cannot be undone.`
            : ''
        }
        confirmLabel={
          pendingTripAction?.action === 'archive' ? 'Archive Trip' : 'Delete Forever'
        }
        tone={pendingTripAction?.action === 'archive' ? 'amber' : 'danger'}
        busy={tripBusyClientId !== null}
        onCancel={() => {
          if (tripBusyClientId === null) setPendingTripAction(null);
        }}
        onConfirm={async () => {
          if (!pendingTripAction) return;
          const target = pendingTripAction;
          if (target.action === 'archive') {
            await handleToggleArchiveTrip(target.trip, true);
          } else {
            await handlePermanentDeleteTrip(target.trip);
          }
          setPendingTripAction(null);
        }}
      />
    </div>
  );
};
