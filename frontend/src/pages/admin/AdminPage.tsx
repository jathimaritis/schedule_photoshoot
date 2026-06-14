import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Trash2, Check, X } from 'lucide-react';
import { orgApi } from '../../api/org';
import { useAuthStore } from '../../stores/authStore';
import { ModuleAccess } from '../../types';
import { SkeletonTable } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ACCESS_LABELS: Record<ModuleAccess, string> = {
  NONE: 'Pending',
  SCHEDULER: 'Scheduler only',
  CALL_SHEET: 'Call Sheet only',
  BOTH: 'Full access',
};

const ACCESS_COLOURS: Record<ModuleAccess, string> = {
  NONE: 'bg-amber-100 text-amber-700',
  SCHEDULER: 'bg-blue-100 text-blue-700',
  CALL_SHEET: 'bg-purple-100 text-purple-700',
  BOTH: 'bg-green-100 text-green-700',
};

export default function AdminPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['org-users'],
    queryFn: orgApi.getUsers,
  });

  const accessMutation = useMutation({
    mutationFn: ({ userId, moduleAccess }: { userId: string; moduleAccess: string }) =>
      orgApi.updateAccess(userId, moduleAccess),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-users'] });
      toast.success('Access updated');
    },
    onError: () => toast.error('Failed to update access'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => orgApi.removeUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-users'] });
      toast.success('User deleted');
    },
    onError: (e: unknown) => {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete user');
    },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-[#1A1A2E]" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        New users who join via invite are set to <strong>Pending</strong> by default. Use this panel to grant them access to modules.
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Module Access</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {data?.users.map((user) => {
                const isMe = user.id === currentUser?.id;
                const isOwner = user.role === 'OWNER';
                const effectiveAccess: ModuleAccess =
                  isOwner || user.role === 'ADMIN' ? 'BOTH' : (user.moduleAccess as ModuleAccess) ?? 'NONE';

                return (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {user.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{user.name} {isMe && <span className="text-xs text-gray-400">(you)</span>}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{user.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {user.isActive ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner || isMe ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ACCESS_COLOURS[effectiveAccess]}`}>
                          {ACCESS_LABELS[effectiveAccess]}
                        </span>
                      ) : (
                        <select
                          value={(user.moduleAccess as ModuleAccess) ?? 'NONE'}
                          onChange={(e) => accessMutation.mutate({ userId: user.id, moduleAccess: e.target.value })}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                        >
                          <option value="NONE">Pending (no access)</option>
                          <option value="SCHEDULER">Scheduler only</option>
                          <option value="CALL_SHEET">Call Sheet only</option>
                          <option value="BOTH">Full access (both)</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">
                      {format(new Date(user.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isMe && !isOwner && (
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
      )}

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
