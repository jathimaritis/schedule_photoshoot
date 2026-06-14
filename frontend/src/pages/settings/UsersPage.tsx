import { Navigate } from 'react-router-dom';

// Team management has moved to the Admin Panel
export default function UsersPage() {
  return <Navigate to="/admin" replace />;
}
