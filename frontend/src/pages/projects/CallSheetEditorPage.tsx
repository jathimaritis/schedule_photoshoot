import { useParams } from 'react-router-dom';
import CallSheetEditor from '../../components/callsheet/CallSheetEditor';

export default function CallSheetEditorPage() {
  const { id, dayId } = useParams<{ id: string; dayId: string }>();
  return <CallSheetEditor projectId={id!} dayId={dayId!} />;
}
