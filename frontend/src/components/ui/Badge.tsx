import clsx from 'clsx';

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  ARCHIVED: 'bg-gray-200 text-gray-500',
  OWNER: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-orange-100 text-orange-700',
  EDITOR: 'bg-sky-100 text-sky-700',
  VIEWER: 'bg-gray-100 text-gray-600',
};

export default function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', STATUS_CLASSES[label] ?? 'bg-gray-100 text-gray-700', className)}>
      {label}
    </span>
  );
}
