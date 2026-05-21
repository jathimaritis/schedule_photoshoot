import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Wand2 } from 'lucide-react';
import { format } from 'date-fns';
import { projectsApi } from '../../api/projects';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';

export default function CallSheetsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: days = [], isLoading: daysLoading } = useQuery({
    queryKey: ['days', id],
    queryFn: () => projectsApi.getDays(id!),
  });

  const { data: callSheets = [], isLoading: csLoading } = useQuery({
    queryKey: ['callsheets', id],
    queryFn: () => projectsApi.getCallSheets(id!),
  });

  const generateMutation = useMutation({
    mutationFn: () => projectsApi.generateCallSheets(id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['callsheets', id] });
      toast.success(`Generated ${(data as { created: number }).created} call sheets`);
    },
    onError: () => toast.error('Failed to generate call sheets'),
  });

  const isLoading = daysLoading || csLoading;
  const callSheetByDayId = new Map(callSheets.map((cs) => [cs.shootingDayId, cs]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Call Sheets</h1>
        <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending} variant="secondary">
          <Wand2 className="w-4 h-4" /> Auto-generate All
        </Button>
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={3} />
      ) : days.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No shooting days"
          description="Add shooting days to your project before creating call sheets."
        />
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const cs = callSheetByDayId.get(day.id);
            const type = day.photographyType;
            return (
              <div
                key={day.id}
                onClick={() => navigate(`/projects/${id}/callsheets/${day.id}`)}
                className="flex items-center gap-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow group"
              >
                {/* Day number */}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                  style={{ backgroundColor: type?.hexColour ?? '#1A1A2E' }}
                >
                  {day.dayNumber}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {format(new Date(day.calendarDate), 'EEEE, dd MMMM yyyy')}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    {day.label && <span>{day.label}</span>}
                    {type && (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: type.hexColour }} />
                        {type.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {cs ? (
                    <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 font-medium">
                      {cs.isLocked ? '🔒 Locked' : 'Ready'}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500">Not generated</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
