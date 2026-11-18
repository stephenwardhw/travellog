import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Share2, Trash2, UserPlus, WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '../lib/network';
import { ConfirmDialog } from './ConfirmDialog';
import type { ShareableUser, TripRecord, TripShareRecord } from '../types/journal';

interface TripShareModalProps {
  open: boolean;
  trip: TripRecord | null;
  token: string;
  onUnauthorized: () => void;
  onClose: () => void;
}

export const TripShareModal: React.FC<TripShareModalProps> = ({
  open,
  trip,
  token,
  onUnauthorized,
  onClose,
}) => {
  const { isOnline } = useNetworkStatus();
  const [users, setUsers] = useState<ShareableUser[]>([]);
  const [shares, setShares] = useState<TripShareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRemoveShare, setPendingRemoveShare] = useState<TripShareRecord | null>(null);

  const loadSharingData = useCallback(async () => {
    if (!open || !trip) return;
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [usersRes, sharesRes] = await Promise.all([
        fetch('/api/users/shareable', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/trips/${encodeURIComponent(trip.clientId)}/shares`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (usersRes.status === 401 || sharesRes.status === 401) {
        onUnauthorized();
        return;
      }

      const usersData = await usersRes.json();
      const sharesData = await sharesRes.json();

      if (!usersRes.ok) throw new Error(usersData?.error || 'Failed to load users.');
      if (!sharesRes.ok) {
        throw new Error(
          sharesRes.status === 404
            ? 'Sync this trip first before sharing it with other users.'
            : sharesData?.error || 'Failed to load sharing settings.'
        );
      }

      setUsers(usersData.users || []);
      setShares(sharesData.shares || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load sharing settings.');
    } finally {
      setLoading(false);
    }
  }, [open, trip, token, isOnline, onUnauthorized]);

  useEffect(() => {
    if (open) {
      setNotice(null);
      setError(null);
      setSelectedUserId('');
      setPermission('view');
      loadSharingData();
    }
  }, [open, loadSharingData]);

  const unsharedUsers = useMemo(() => {
    const sharedIds = new Set(shares.map((s) => s.userId));
    return users.filter((u) => !sharedIds.has(u.id));
  }, [users, shares]);

  if (!open || !trip) return null;

  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(trip.clientId)}/shares`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId: Number(selectedUserId),
          permission,
        }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to share trip.');
      setShares(data.shares || []);
      setSelectedUserId('');
      setNotice('Trip access updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to share trip.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePermission = async (targetUserId: number, nextPerm: 'view' | 'edit') => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(trip.clientId)}/shares`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetUserId,
          permission: nextPerm,
        }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update permission.');
      setShares(data.shares || []);
      setNotice('Permission updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update permission.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveShare = async (targetUserId: number) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/trips/${encodeURIComponent(trip.clientId)}/shares/${targetUserId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to remove access.');
      setShares(data.shares || []);
      setNotice('Access removed.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to remove access.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-teal-800">
              <Share2 className="w-3.5 h-3.5" />
              Trip Sharing
            </div>
            <h2 className="font-display text-xl font-semibold text-slate-900 truncate mt-0.5">
              {trip.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
            aria-label="Close sharing dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isOnline && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Sharing settings require an online connection to the server.</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}

        {notice && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
            {notice}
          </div>
        )}

        <form onSubmit={handleAddShare} className="space-y-3">
          <label className="block text-xs font-semibold text-slate-800">
            Share with another user
          </label>
          <div className="grid sm:grid-cols-12 gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={!isOnline || loading || unsharedUsers.length === 0}
              className="sm:col-span-7 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
            >
              <option value="">
                {unsharedUsers.length === 0
                  ? 'No other users available'
                  : 'Select user...'}
              </option>
              {unsharedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ? `${u.name} (${u.email})` : u.email}
                </option>
              ))}
            </select>

            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value === 'edit' ? 'edit' : 'view')}
              disabled={!isOnline || loading}
              className="sm:col-span-5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none min-h-[40px]"
            >
              <option value="view">View only</option>
              <option value="edit">Can edit</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!isOnline || saving || !selectedUserId}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 min-h-[40px]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {saving ? 'Updating...' : 'Grant Access'}
          </button>
        </form>

        <div className="border-t border-slate-100 pt-4 space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-800">
            Shared Users ({shares.length})
          </h3>

          {loading ? (
            <p className="text-xs text-slate-500 py-3">Loading sharing list...</p>
          ) : shares.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">
              Only you can view or edit this trip right now.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {shares.map((s) => (
                <div
                  key={s.userId}
                  className="p-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {s.name || s.email}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{s.email}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label={`Permission for ${s.email}`}
                      value={s.permission}
                      disabled={!isOnline || saving}
                      onChange={(e) =>
                        handleChangePermission(
                          s.userId,
                          e.target.value === 'edit' ? 'edit' : 'view'
                        )
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-teal-700 focus:outline-none min-h-[36px]"
                    >
                      <option value="view">View only</option>
                      <option value="edit">Can edit</option>
                    </select>

                    <button
                      type="button"
                      disabled={!isOnline || saving}
                      onClick={() => setPendingRemoveShare(s)}
                      aria-label={`Remove ${s.email}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-45"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingRemoveShare)}
        title="Revoke Trip Access?"
        message={
          pendingRemoveShare
            ? `Remove ${pendingRemoveShare.name || pendingRemoveShare.email}'s access to "${trip.title}"?`
            : ''
        }
        confirmLabel="Remove Access"
        busy={saving}
        onCancel={() => {
          if (!saving) setPendingRemoveShare(null);
        }}
        onConfirm={async () => {
          if (!pendingRemoveShare) return;
          const targetId = pendingRemoveShare.userId;
          await handleRemoveShare(targetId);
          setPendingRemoveShare(null);
        }}
      />
    </div>
  );
};
