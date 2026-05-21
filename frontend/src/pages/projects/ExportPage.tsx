import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Calendar, FileText } from 'lucide-react';
import { projectsApi, exportApi } from '../../api/projects';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

async function downloadFile(url: string, filename: string) {
  try {
    const response = await api.get(url, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Download started');
  } catch {
    toast.error('Export failed');
  }
}

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id!),
  });

  const { data: days = [] } = useQuery({
    queryKey: ['days', id],
    queryFn: () => projectsApi.getDays(id!),
  });

  const safeName = project?.name.replace(/[^a-z0-9]/gi, '_') ?? 'project';

  const exports = [
    {
      icon: Calendar,
      label: 'Full Schedule',
      desc: 'Complete shoot schedule with all days, sections, categories, and shot tick grid',
      filename: `${safeName}_schedule.xlsx`,
      url: exportApi.scheduleUrl(id!),
      colour: 'bg-blue-50 border-blue-200 text-blue-700',
    },
    {
      icon: FileText,
      label: 'All Call Sheets',
      desc: 'All daily call sheets in a single workbook, one tab per day',
      filename: `${safeName}_callsheets.xlsx`,
      url: exportApi.callSheetsUrl(id!),
      colour: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Export</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {exports.map(({ icon: Icon, label, desc, filename, url, colour }) => (
          <div key={label} className={`flex flex-col p-5 rounded-xl border ${colour}`}>
            <Icon className="w-8 h-8 mb-3 opacity-80" />
            <h3 className="font-semibold text-base mb-1">{label}</h3>
            <p className="text-sm opacity-80 flex-1 mb-4">{desc}</p>
            <Button
              onClick={() => downloadFile(url, filename)}
              className="self-start"
              variant="primary"
              size="sm"
            >
              <Download className="w-4 h-4" /> Download
            </Button>
          </div>
        ))}
      </div>

      {/* Individual call sheets */}
      {days.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Individual Call Sheets</h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {days.map((day) => (
              <div key={day.id} className="flex items-center gap-4 px-5 py-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: day.photographyType?.hexColour ?? '#1A1A2E' }}
                >
                  {day.dayNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Day {day.dayNumber} — {format(new Date(day.calendarDate), 'EEEE, dd MMMM yyyy')}
                  </p>
                  {day.label && <p className="text-xs text-gray-500">{day.label}</p>}
                </div>
                <button
                  onClick={() => downloadFile(exportApi.callSheetUrl(id!, day.id), `callsheet_day_${day.dayNumber}.xlsx`)}
                  className="flex items-center gap-1.5 text-xs text-[#1A1A2E] hover:underline font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> .xlsx
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
