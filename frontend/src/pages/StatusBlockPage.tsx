import { Clock, ShieldOff, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';
import Button from '../components/ui/Button';

interface Props {
  status: 'PENDING' | 'RESTRICTED';
}

export default function StatusBlockPage({ status }: Props) {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const isPending = status === 'PENDING';

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${isPending ? 'bg-amber-100' : 'bg-red-100'}`}>
          {isPending
            ? <Clock className="w-8 h-8 text-amber-600" />
            : <ShieldOff className="w-8 h-8 text-red-600" />
          }
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {isPending ? 'Account Pending Approval' : 'Account Restricted'}
        </h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          {isPending
            ? 'Your account is pending approval by the administrator. You will be notified once access has been granted.'
            : 'Your account access has been restricted. Please contact the administrator.'}
        </p>
        <Button variant="secondary" onClick={handleLogout} className="mx-auto">
          <LogOut className="w-4 h-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
