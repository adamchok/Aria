import { formatBytes } from '@/lib/format';
import { Button } from '@/components/ui/Button';

interface FileListProps {
  files: File[];
  onRemove?: (name: string) => void;
  emptyLabel?: string;
}

function fileTypeIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.xlsx') || lower.endsWith('.csv')) return 'SHEET';
  return 'IMG';
}

export function FileList({ files, onRemove, emptyLabel }: FileListProps) {
  if (files.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel ?? 'No files selected.'}</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
      {files.map((file) => (
        <li
          key={file.name}
          className="flex items-center justify-between gap-3 px-4 py-3"
          data-testid="file-list-item"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="inline-flex h-8 w-12 items-center justify-center rounded bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {fileTypeIcon(file.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
              <p className="text-xs text-slate-500 tabular-nums">{formatBytes(file.size)}</p>
            </div>
          </div>
          {onRemove ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(file.name)}
              aria-label={`Remove ${file.name}`}
            >
              Remove
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
