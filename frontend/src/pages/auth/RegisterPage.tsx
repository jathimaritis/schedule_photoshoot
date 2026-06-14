import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Clock } from 'lucide-react';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', organisationName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.register(form);
      setAuth(data.user, data.accessToken);
      if (data.user.status === 'PENDING') {
        // Don't enter the app — show pending message
        setPendingEmail(data.user.email);
      } else {
        navigate('/');
      }
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // Post-registration pending screen
  if (pendingEmail) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <Camera className="w-8 h-8 text-[#D4AF37]" />
              <span className="text-2xl font-bold text-[#D4AF37] tracking-wide">SHOOT SCHEDULER</span>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-2xl p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Account Pending Approval</h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Your account (<strong>{pendingEmail}</strong>) has been created and is awaiting approval
              by an administrator. You will be notified once access has been granted.
            </p>
            <Link to="/login" className="text-sm text-[#1A1A2E] font-medium hover:underline">
              Return to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Camera className="w-8 h-8 text-[#D4AF37]" />
            <span className="text-2xl font-bold text-[#D4AF37] tracking-wide">SHOOT SCHEDULER</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Create your account</h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Your name" value={form.name} onChange={set('name')} placeholder="Jane Smith" required />
            <Input label="Email address" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
            <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required minLength={8} />
            <Input label="Studio / Agency name" value={form.organisationName} onChange={set('organisationName')} placeholder="Acme Photography" required />
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-[#1A1A2E] font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
