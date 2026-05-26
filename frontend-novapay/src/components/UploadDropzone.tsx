import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { cn } from '@/lib/cn';

const DEFAULT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.xlsx', '.csv'] as const;
const DEFAULT_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
]);

function isAccepted(
  file: File,
  extensions: readonly string[],
  mimeTypes: Set<string>,
): boolean {
  if (mimeTypes.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function collectFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const fromFiles = Array.from(dataTransfer.files ?? []);
  if (fromFiles.length > 0) return fromFiles;

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

interface UploadDropzoneProps {
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  helperText?: string;
  testId?: string;
  acceptedExtensions?: readonly string[];
  acceptedMimeTypes?: Set<string>;
}

export function UploadDropzone({
  label,
  multiple = false,
  onFiles,
  helperText,
  testId,
  acceptedExtensions = DEFAULT_EXTENSIONS,
  acceptedMimeTypes = DEFAULT_MIME,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const handleFiles = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      const rejected = files.filter((f) => !isAccepted(f, acceptedExtensions, acceptedMimeTypes));
      if (rejected.length) {
        setError(
          `Unsupported file type: ${rejected.map((f) => f.name).join(', ')}. ` +
            `Accepted: ${acceptedExtensions.join(', ')}.`,
        );
        return;
      }
      setError(null);
      onFiles(multiple ? files : [files[0]!]);
    },
    [acceptedExtensions, acceptedMimeTypes, multiple, onFiles],
  );

  const onDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);
      handleFiles(collectFilesFromDataTransfer(e.dataTransfer));
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
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
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
          {helperText ??
            `Drop files here or click to browse. Accepted: ${acceptedExtensions.join(', ')}`}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={acceptedExtensions.join(',')}
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
