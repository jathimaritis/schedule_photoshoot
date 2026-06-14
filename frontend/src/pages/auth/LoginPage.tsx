import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, ShieldOff } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const deactivated = searchParams.get('deactivated') === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login({ email, password });
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: string; code?: string } } })?.response?.data;
      if (resp?.code === 'DEACTIVATED') {
        setError(resp.error ?? 'Your account has been deactivated. Please contact the administrator.');
      } else {
        setError(resp?.error ?? 'Login failed');
      }
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
          <h1 className="text-xl font-semibold text-white">Sign in to your account</h1>
        </div>

        {deactivated && (
          <div className="bg-red-900/40 border border-red-500/50 rounded-xl p-4 mb-4 flex items-start gap-3">
            <ShieldOff className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">
              Your account has been deactivated. Please contact the administrator.
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-sm text-[#1A1A2E] hover:text-[#2C2C54] underline">
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
