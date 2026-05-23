import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { cn } from '@/lib/cn';

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.xlsx', '.csv'] as const;
const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
]);

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIME.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface UploadDropzoneProps {
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  helperText?: string;
  testId?: string;
}

export function UploadDropzone({
  label,
  multiple = false,
  onFiles,
  helperText,
  testId,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const rejected = files.filter((f) => !isAccepted(f));
      if (rejected.length) {
        setError(
          `Unsupported file type: ${rejected.map((f) => f.name).join(', ')}. ` +
            `Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}.`,
        );
        return;
      }
      setError(null);
      onFiles(multiple ? files : [files[0]!]);
    },
    [multiple, onFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFiles],
  );

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragging
            ? 'border-slate-900 bg-slate-50'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50',
        )}
      >
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">
          {helperText ?? `Drop files here or click to browse. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="sr-only"
          onChange={onChange}
          aria-label={`${label} file input`}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
