import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Shield, Trash2, UserPlus, WifiOff } from 'lucide-react';
import { useNetworkStatus } from '../lib/network';
import type { LocalUser } from '../types/journal';

interface AdminUsersViewProps {
  token: string;
  currentUser: LocalUser;
  onUnauthorized: () => void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  token,
  currentUser,
  onUnauthorized,
}) => {
  const { isOnline } = useNetworkStatus();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create user form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [creating, setCreating] = useState(false);

  // Confirm delete / password reset inline state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
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

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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
      setConfirmDeleteId(null);
      setNotice(`Deleted user ${target.email}.`);
      await loadUsers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to delete user.');
    } finally {
      setBusyId(null);
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
                const isConfirmingDelete = confirmDeleteId === u.id;

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
                            setConfirmDeleteId(null);
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
                              setConfirmDeleteId(isConfirmingDelete ? null : u.id);
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

                    {isConfirmingDelete && (
                      <div className="pt-2 border-t border-red-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-red-800 font-medium">
                          Permanently delete {u.email} and all their trips, photos, and PDFs?
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => handleDeleteUser(u)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 min-h-[36px]"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 min-h-[36px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
