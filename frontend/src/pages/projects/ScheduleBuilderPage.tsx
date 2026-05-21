import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../../api/projects';
import ScheduleGrid from '../../components/schedule/ScheduleGrid';
import Skeleton from '../../components/ui/Skeleton';

export default function ScheduleBuilderPage() {
  const { id } = useParams<{ id: string }>();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
  });

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['days', id],
    queryFn: () => projectsApi.getDays(id!),
  });

  const { data: types = [], isLoading: typesLoading } = useQuery({
    queryKey: ['types', id],
    queryFn: () => projectsApi.getTypes(id!),
  });

  if (projectLoading || daysLoading || typesLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) return <div className="text-red-500 p-4">Project not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -mx-6 -my-6">
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {project.name} — Schedule Builder
        </h1>
        {days.length === 0 && (
          <p className="text-sm text-amber-600 mt-1">
            No shooting days defined yet. Add them from the project overview.
          </p>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <ScheduleGrid projectId={id!} days={days} types={types} />
      </div>
    </div>
  );
}
