import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { User, Lock, Save } from 'lucide-react';
import { profileApi } from '../api/org';
import { useAuthStore } from '../stores/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({ name: '', email: '', avatarUrl: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  useEffect(() => {
    if (user) {
      setForm({ name: user.name, email: user.email, avatarUrl: user.avatarUrl ?? '' });
    }
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: () => profileApi.update({ name: form.name, email: form.email, avatarUrl: form.avatarUrl || undefined }),
    onSuccess: (data) => {
      updateUser(data);
      toast.success('Profile updated');
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Update failed'),
  });

  const passwordMutation = useMutation({
    mutationFn: () => profileApi.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
    onSuccess: () => {
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed');
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to change password'),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const setPw = (key: keyof typeof pwForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPwForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Your Profile</h1>

      {/* Profile info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Personal Info</h2>
        </div>
        <div className="space-y-4">
          <Input label="Full name" value={form.name} onChange={set('name')} required />
          <Input label="Email address" type="email" value={form.email} onChange={set('email')} required />
          <Input label="Avatar URL (optional)" value={form.avatarUrl} onChange={set('avatarUrl')} placeholder="https://…" type="url" />

          {form.avatarUrl && (
            <img src={form.avatarUrl} alt="Avatar preview" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
          )}

          <div className="pt-2">
            <Button onClick={() => profileMutation.mutate()} loading={profileMutation.isPending}>
              <Save className="w-4 h-4" /> Save Profile
            </Button>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-5">
          <Lock className="w-5 h-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Change Password</h2>
        </div>
        <div className="space-y-4">
          <Input label="Current password" type="password" value={pwForm.currentPassword} onChange={setPw('currentPassword')} />
          <Input label="New password" type="password" value={pwForm.newPassword} onChange={setPw('newPassword')} minLength={8} />
          <Input label="Confirm new password" type="password" value={pwForm.confirmPassword} onChange={setPw('confirmPassword')} />
          {pwForm.newPassword && pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
            <p className="text-xs text-red-600">Passwords don't match</p>
          )}
          <div className="pt-2">
            <Button
              onClick={() => passwordMutation.mutate()}
              loading={passwordMutation.isPending}
              disabled={!pwForm.currentPassword || !pwForm.newPassword || pwForm.newPassword !== pwForm.confirmPassword}
            >
              <Lock className="w-4 h-4" /> Change Password
            </Button>
          </div>
        </div>
      </div>

      {/* User role */}
      <div className="mt-4 px-4 py-3 bg-gray-50 dark:bg-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400">
        Role: <strong>{user?.role}</strong> · Organisation ID: <code className="text-xs">{user?.organisationId}</code>
      </div>
    </div>
  );
}
