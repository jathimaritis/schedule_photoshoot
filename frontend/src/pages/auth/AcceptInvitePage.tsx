import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Camera, AlertCircle, Calendar, ClipboardList, LayoutGrid } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import { ModuleAccess } from '../../types';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const MODULE_LABELS: Record<ModuleAccess, { label: string; icon: React.ReactNode }> = {
  SCHEDULER: { label: 'Scheduler', icon: <Calendar className="w-4 h-4" /> },
  CALLSHEET: { label: 'Call Sheet', icon: <ClipboardList className="w-4 h-4" /> },
  BOTH: { label: 'Scheduler & Call Sheet', icon: <LayoutGrid className="w-4 h-4" /> },
};

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<{ email: string; moduleAccess: ModuleAccess } | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (!token) return;
    authApi.getInvite(token)
      .then(setInvite)
      .catch(() => setInviteError('This invite link is invalid or has expired.'));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setLoading(true);
    try {
      const data = await authApi.acceptInvite(token!, { name, password });
      setAuth(data.user, data.accessToken);
      const access = data.user.moduleAccess;
      navigate(access === 'CALLSHEET' ? '/call-sheet' : '/projects');
    } catch (err: unknown) {
      setSubmitError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to set up account'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Camera className="w-8 h-8 text-[#D4AF37]" />
            <span className="text-2xl font-bold text-[#D4AF37] tracking-wide">SHOOT SCHEDULER</span>
          </div>
          <h1 className="text-xl font-semibold text-white">You've been invited</h1>
        </div>

        {inviteError ? (
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-gray-700 font-medium mb-2">Invite not valid</p>
            <p className="text-sm text-gray-500 mb-4">{inviteError}</p>
            <Link to="/login" className="text-sm text-[#1A1A2E] font-medium hover:underline">
              Go to sign in
            </Link>
          </div>
        ) : !invite ? (
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center text-gray-400 text-sm">
            Checking invite…
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-2xl p-8">
            <div className="mb-5 bg-gray-50 rounded-lg p-3 flex items-center gap-3">
              <div className="text-[#1A1A2E]">{MODULE_LABELS[invite.moduleAccess].icon}</div>
              <div>
                <p className="text-xs text-gray-500">Invited as</p>
                <p className="text-sm font-medium text-gray-800">{MODULE_LABELS[invite.moduleAccess].label}</p>
              </div>
              <div className="ml-auto text-xs text-gray-400">{invite.email}</div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                minLength={8}
              />
              {submitError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{submitError}</p>}
              <Button type="submit" loading={loading} className="w-full">
                Create my account
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
