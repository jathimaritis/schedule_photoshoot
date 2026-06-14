import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ClipboardList, Trash2, FileSpreadsheet } from 'lucide-react';

import { format } from 'date-fns';
import { productionCsApi } from '../../api/productionCallsheets';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/Skeleton';
import toast from 'react-hot-toast';

export default function CallSheetListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ['production-callsheets'],
    queryFn: productionCsApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productionCsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-callsheets'] });
      toast.success('Call sheet deleted');
    },
  });

  const createMutation = useMutation({
    mutationFn: () => productionCsApi.create({ projectName: 'New Call Sheet' }),
    onSuccess: (sheet) => {
      qc.invalidateQueries({ queryKey: ['production-callsheets'] });
      navigate(`/call-sheet/${sheet.id}`);
    },
    onError: () => toast.error('Failed to create call sheet'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-[#1A1A2E] dark:text-gray-200" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Production Call Sheets</h1>
        </div>
        <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
          <Plus className="w-4 h-4" /> New Call Sheet
        </Button>
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : sheets.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No call sheets yet"
          description="Create a production call sheet to organise your shoot day with all crew, logistics, and shot details."
          action={{ label: 'Create First Call Sheet', onClick: () => createMutation.mutate() }}
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Shoot Date</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Shots</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {sheets.map((sheet) => (
                <tr
                  key={sheet.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  onClick={() => navigate(`/call-sheet/${sheet.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-[#1A1A2E] dark:text-[#D4AF37] flex-shrink-0" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">{sheet.projectName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{sheet.client ?? '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                    {sheet.shootingDate ? format(new Date(sheet.shootingDate), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                    {(sheet as typeof sheet & { _count: { shots: number } })._count?.shots ?? 0}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-400">
                    {format(new Date(sheet.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { if (confirm('Delete this call sheet?')) deleteMutation.mutate(sheet.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
