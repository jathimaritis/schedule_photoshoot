import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { orgApi } from '../../api/org';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery({
    queryKey: ['org'],
    queryFn: orgApi.get,
  });

  const [form, setForm] = useState({
    name: '',
    agencyName: '',
    footerText: '',
    logoUrl: '',
  });

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name,
        agencyName: org.agencyName ?? '',
        footerText: org.footerText ?? '',
        logoUrl: org.logoUrl ?? '',
      });
    }
  }, [org]);

  const updateMutation = useMutation({
    mutationFn: () => orgApi.update({
      name: form.name,
      agencyName: form.agencyName || undefined,
      footerText: form.footerText || undefined,
      logoUrl: form.logoUrl || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Organisation settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (isLoading) return <div className="animate-pulse h-40 bg-gray-200 rounded-xl" />;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Organisation Settings</h1>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <Input
          label="Organisation name"
          value={form.name}
          onChange={set('name')}
          required
        />
        <Input
          label="Agency name (shown on exports)"
          value={form.agencyName}
          onChange={set('agencyName')}
          placeholder="Defaults to organisation name"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Footer text (shown on exports)
          </label>
          <textarea
            value={form.footerText}
            onChange={set('footerText')}
            placeholder="e.g. Confidential | For internal use only"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] bg-white dark:bg-gray-800"
          />
        </div>
        <Input
          label="Logo URL (optional)"
          value={form.logoUrl}
          onChange={set('logoUrl')}
          placeholder="https://..."
          type="url"
        />

        <div className="pt-2">
          <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
            <Save className="w-4 h-4" /> Save Settings
          </Button>
        </div>
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Slug:</strong> {org?.slug}<br />
        Manage team members in the <a href="/settings/users" className="underline font-medium">Team</a> tab.
      </div>
    </div>
  );
}
