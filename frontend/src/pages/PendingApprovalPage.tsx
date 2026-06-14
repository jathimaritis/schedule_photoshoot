// Kept for backward compat — delegates to StatusBlockPage
import StatusBlockPage from './StatusBlockPage';
export default function PendingApprovalPage() {
  return <StatusBlockPage status="PENDING" />;
}
