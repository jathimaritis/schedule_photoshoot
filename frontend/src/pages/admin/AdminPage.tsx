import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Trash2, Send, X, Calendar, ClipboardList, LayoutGrid, CheckCircle, Clock, AlertCircle, Link2 } from 'lucide-react';
import { orgApi } from '../../api/org';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import { User, InviteToken, ModuleAccess } from '../../types';
import { SkeletonTable } from '../../components/ui/Skeleton';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';
import { format, isPast } from 'date-fns';

// ─── small helpers ────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<ModuleAccess, string> = {
  SCHEDULER: 'Scheduler',
  CALLSHEET: 'Call Sheet',
  BOTH: 'Both',
};

const MODULE_ICON: Record<ModuleAccess, React.ReactNode> = {
  SCHEDULER: <Calendar className="w-3.5 h-3.5" />,
  CALLSHEET: <ClipboardList className="w-3.5 h-3.5" />,
  BOTH: <LayoutGrid className="w-3.5 h-3.5" />,
};

function inviteStatus(invite: InviteToken): 'accepted' | 'expired' | 'pending' {
  if (invite.usedAt) return 'accepted';
  if (isPast(new Date(invite.expiresAt))) return 'expired';
  return 'pending';
}

const STATUS_STYLE = {
  accepted: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
  pending: 'bg-amber-100 text-amber-700',
};
const STATUS_ICON = {
  accepted: <CheckCircle className="w-3 h-3" />,
  expired: <AlertCircle className="w-3 h-3" />,
  pending: <Clock className="w-3 h-3" />,
};

// ─── Tab 1: Users ─────────────────────────────────────────────────────────────

function UsersTab({ users, isLoading, currentUserId, qc }: {
  users: User[];
  isLoading: boolean;
  currentUserId: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const accessMutation = useMutation({
    mutationFn: ({ userId, moduleAccess }: { userId: string; moduleAccess: ModuleAccess }) =>
      orgApi.updateModuleAccess(userId, moduleAccess),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('Access updated'); },
    onError: () => toast.error('Failed to update access'),
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      orgApi.setActive(userId, isActive),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('Status updated'); },
    onError: () => toast.error('Failed to update status'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => orgApi.removeUser(userId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('User deleted'); },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to delete'),
  });

  if (isLoading) return <SkeletonTable rows={4} cols={5} />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Module Access</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Last Login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map((user) => {
              const isMe = user.id === currentUserId;
              const isAdmin = user.role === 'ADMIN';
              const locked = isMe || isAdmin;

              return (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {user.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {user.name}
                          {isMe && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                          {isAdmin && <span className="ml-1 text-xs text-[#D4AF37] font-semibold">Admin</span>}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {locked ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                        {MODULE_ICON[user.moduleAccess]} {MODULE_LABELS[user.moduleAccess]}
                      </span>
                    ) : (
                      <select
                        value={user.moduleAccess}
                        onChange={(e) => accessMutation.mutate({ userId: user.id, moduleAccess: e.target.value as ModuleAccess })}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:border-gray-600"
                      >
                        {(['SCHEDULER', 'CALLSHEET', 'BOTH'] as ModuleAccess[]).map((v) => (
                          <option key={v} value={v}>{MODULE_LABELS[v]}</option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {locked ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                    ) : (
                      <button
                        onClick={() => activeMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer ${user.isActive ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'}`}
                        title={user.isActive ? 'Click to deactivate' : 'Click to reactivate'}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    )}
                  </td>

                  <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                    {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'dd MMM yyyy') : 'Never'}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {!locked && (
                      <button
                        onClick={() => { if (confirm(`Permanently delete ${user.name}? This cannot be undone.`)) deleteMutation.mutate(user.id); }}
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
  );
}

// ─── Tab 2: Invites ───────────────────────────────────────────────────────────

const APP_URL = window.location.origin;

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-[#1A1A2E] hover:text-[#2C2C54] font-medium underline underline-offset-2"
      title={url}
    >
      <Link2 className="w-3 h-3" />
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

function InvitesTab({ invites, isLoading, qc }: {
  invites: InviteToken[];
  isLoading: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [email, setEmail] = useState('');
  const [moduleAccess, setModuleAccess] = useState<ModuleAccess>('SCHEDULER');
  const [lastInvite, setLastInvite] = useState<{ email: string; url: string } | null>(null);

  const inviteMutation = useMutation({
    mutationFn: () => authApi.invite({ email: email.trim(), moduleAccess }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['org-users'] });
      setLastInvite({ email: data.email, url: data.inviteUrl });
      setEmail('');
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => orgApi.cancelInvite(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['org-users'] }); toast.success('Invite cancelled'); },
    onError: () => toast.error('Failed to cancel invite'),
  });

  return (
    <div className="space-y-6">
      {/* Send form */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Create an invite link</h3>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setLastInvite(null); }}
              placeholder="colleague@example.com"
              required
            />
          </div>
          <div className="sm:w-52">
            <Select
              label="Module access"
              value={moduleAccess}
              onChange={(e) => setModuleAccess(e.target.value as ModuleAccess)}
              options={[
                { value: 'SCHEDULER', label: 'Scheduler' },
                { value: 'CALLSHEET', label: 'Call Sheet' },
                { value: 'BOTH', label: 'Both modules' },
              ]}
            />
          </div>
          <Button
            onClick={() => inviteMutation.mutate()}
            loading={inviteMutation.isPending}
            disabled={!email.trim()}
            className="shrink-0"
          >
            <Send className="w-4 h-4" /> Generate Invite
          </Button>
        </div>

        {lastInvite && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Invite created for {lastInvite.email} — share this link:
            </p>
            <div className="flex items-center gap-3 bg-white border border-green-200 rounded-md px-3 py-2">
              <code className="text-xs text-gray-700 break-all flex-1">{lastInvite.url}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(lastInvite!.url); toast.success('Link copied!'); }}
                className="shrink-0 text-xs font-medium bg-[#1A1A2E] text-white px-3 py-1.5 rounded hover:bg-[#2C2C54] transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-green-600 mt-1.5">This link expires in 7 days.</p>
          </div>
        )}
      </div>

      {/* Invites table */}
      {isLoading ? <SkeletonTable rows={3} cols={5} /> : invites.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No invites yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Access</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Sent</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Expires</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {invites.map((invite) => {
                  const status = inviteStatus(invite);
                  const inviteUrl = `${APP_URL}/invite/${invite.token}`;
                  return (
                    <tr key={invite.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{invite.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                          {MODULE_ICON[invite.moduleAccess]} {MODULE_LABELS[invite.moduleAccess]}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">
                        {format(new Date(invite.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-500">
                        {format(new Date(invite.expiresAt), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[status]}`}>
                          {STATUS_ICON[status]} {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {status === 'pending' && <CopyLinkButton url={inviteUrl} />}
                          {status === 'pending' && (
                            <button
                              onClick={() => cancelMutation.mutate(invite.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Cancel invite"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'invites'>('users');
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['org-users'],
    queryFn: orgApi.getUsers,
  });

  const pendingInvites = (data?.invites ?? []).filter((i) => !i.usedAt && !isPast(new Date(i.expiresAt)));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-[#1A1A2E]" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-6 w-fit">
        {(['users', 'invites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize relative ${
              tab === t
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'invites' && pendingInvites.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingInvites.length}
              </span>
            )}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'users' ? (
        <UsersTab
          users={data?.users ?? []}
          isLoading={isLoading}
          currentUserId={currentUser?.id ?? ''}
          qc={qc}
        />
      ) : (
        <InvitesTab
          invites={data?.invites ?? []}
          isLoading={isLoading}
          qc={qc}
        />
      )}
    </div>
  );
}
