import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Trash2, Check, X, Calendar, ClipboardList } from 'lucide-react';
import { orgApi } from '../../api/org';
import { useAuthStore } from '../../stores/authStore';
import { User, UserStatus } from '../../types';
import { SkeletonTable } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ─── status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<UserStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  RESTRICTED: 'bg-red-100 text-red-700',
};
const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  RESTRICTED: 'Restricted',
};

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}>
      {status === 'APPROVED' && <Check className="w-3 h-3" />}
      {status === 'RESTRICTED' && <X className="w-3 h-3" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── access toggle ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1A1A2E] ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-[#1A1A2E]' : 'bg-gray-200 dark:bg-gray-600'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['org-users'],
    queryFn: orgApi.getUsers,
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      orgApi.updateStatus(userId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('Status updated'); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed'),
  });

  const flagsMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: { accessScheduler?: boolean; accessCallSheet?: boolean } }) =>
      orgApi.updateAccessFlags(userId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('Access updated'); },
    onError: () => toast.error('Failed to update access'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => orgApi.removeUser(userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('User deleted'); },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete user');
    },
  });

  const pendingCount = data?.users.filter((u) => (u.status ?? 'PENDING') === 'PENDING' && u.id !== currentUser?.id).length ?? 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-[#1A1A2E]" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
      </div>

      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
          <strong>{pendingCount} user{pendingCount > 1 ? 's' : ''} pending approval.</strong>{' '}
          Review the table below and approve or restrict each account.
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Scheduler
                    </span>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" /> Call Sheet
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data?.users.map((user: User) => {
                  const isMe = user.id === currentUser?.id;
                  const isThisAdmin = user.isAdmin;
                  const locked = isMe || !!isThisAdmin;
                  const userStatus: UserStatus = (user.status as UserStatus) ?? 'PENDING';
                  const isApproved = userStatus === 'APPROVED';

                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      {/* User info */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {user.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {user.name}
                              {isMe && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                              {isThisAdmin && <span className="ml-1 text-xs text-[#D4AF37] font-semibold">Admin</span>}
                            </p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {locked ? (
                          <StatusBadge status={isThisAdmin ? 'APPROVED' : userStatus} />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={userStatus} />
                            {!isApproved && (
                              <button
                                onClick={() => statusMutation.mutate({ userId: user.id, status: 'APPROVED' })}
                                className="text-xs text-green-600 hover:text-green-700 font-medium underline underline-offset-2"
                              >
                                Approve
                              </button>
                            )}
                            {isApproved && (
                              <button
                                onClick={() => statusMutation.mutate({ userId: user.id, status: 'RESTRICTED' })}
                                className="text-xs text-red-500 hover:text-red-600 font-medium underline underline-offset-2"
                              >
                                Restrict
                              </button>
                            )}
                            {userStatus === 'RESTRICTED' && (
                              <button
                                onClick={() => statusMutation.mutate({ userId: user.id, status: 'APPROVED' })}
                                className="text-xs text-blue-500 hover:text-blue-600 font-medium underline underline-offset-2"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Scheduler toggle */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <Toggle
                            checked={locked ? true : (user.accessScheduler ?? false)}
                            disabled={locked}
                            onChange={() => flagsMutation.mutate({
                              userId: user.id,
                              data: { accessScheduler: !user.accessScheduler },
                            })}
                          />
                        </div>
                      </td>

                      {/* Call Sheet toggle */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <Toggle
                            checked={locked ? true : (user.accessCallSheet ?? false)}
                            disabled={locked}
                            onChange={() => flagsMutation.mutate({
                              userId: user.id,
                              data: { accessCallSheet: !user.accessCallSheet },
                            })}
                          />
                        </div>
                      </td>

                      {/* Joined */}
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                        {format(new Date(user.createdAt), 'dd MMM yyyy')}
                      </td>

                      {/* Delete */}
                      <td className="px-4 py-3 text-right">
                        {!locked && (
                          <button
                            onClick={() => {
                              if (confirm(`Permanently delete ${user.name}? This cannot be undone.`)) {
                                deleteMutation.mutate(user.id);
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending invites */}
      {data?.pendingInvites && data.pendingInvites.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Pending Invites</h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {data.pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-gray-500">Expires {format(new Date(invite.expiresAt), 'dd MMM yyyy HH:mm')}</p>
                </div>
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Will be pending on join</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
