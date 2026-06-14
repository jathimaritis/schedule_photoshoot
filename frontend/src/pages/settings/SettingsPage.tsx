import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, X } from 'lucide-react';
import { orgApi } from '../../api/org';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const logoFileRef = useRef<HTMLInputElement>(null);

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
      logoUrl: form.logoUrl || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Organisation settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be smaller than 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

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

        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Company logo (shown on exports)
          </label>
          {form.logoUrl && (
            <div className="mb-3 inline-flex items-start gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <img src={form.logoUrl} alt="Logo preview" className="h-14 max-w-[180px] object-contain" />
              <button
                onClick={() => setForm((f) => ({ ...f, logoUrl: '' }))}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove logo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div>
            <input
              ref={logoFileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              onClick={() => logoFileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {form.logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF or WebP — max 2 MB</p>
          </div>
        </div>

        <div className="pt-2">
          <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
            <Save className="w-4 h-4" /> Save Settings
          </Button>
        </div>
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <strong>Slug:</strong> {org?.slug}<br />
        Manage team members in the <a href="/admin" className="underline font-medium">Admin panel</a>.
      </div>
    </div>
  );
}
