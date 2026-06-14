import { Clock, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../api/auth';
import Button from '../components/ui/Button';

export default function PendingApprovalPage() {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Account Pending Approval</h1>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          Your account has been created but is awaiting approval from your organisation's administrator.
          Once approved, you'll have access to the modules assigned to you.
        </p>
        <Button variant="secondary" onClick={handleLogout} className="mx-auto">
          <LogOut className="w-4 h-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
