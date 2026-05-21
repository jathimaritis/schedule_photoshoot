import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { authApi } from '../../api/auth';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await authApi.forgotPassword(email).catch(() => {});
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Camera className="w-8 h-8 text-[#D4AF37] mx-auto mb-2" />
          <h1 className="text-xl font-semibold text-white">Reset your password</h1>
        </div>
        <div className="bg-white rounded-xl shadow-2xl p-8">
          {sent ? (
            <div className="text-center">
              <p className="text-gray-700 mb-4">If that email exists, we've sent a reset link. Check your inbox.</p>
              <Link to="/login" className="text-[#1A1A2E] font-medium hover:underline text-sm">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Button type="submit" loading={loading} className="w-full">Send reset link</Button>
              <p className="text-center text-sm">
                <Link to="/login" className="text-gray-500 hover:underline">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
