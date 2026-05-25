import { cn } from '@/lib/cn';
import type { JobStatus } from '@/types/api';

const AGENTS = [
  { id: 'ingestion', label: 'Ingestion' },
  { id: 'normalisation', label: 'Normalisation' },
  { id: 'matching', label: 'Matching' },
  { id: 'report', label: 'Report' },
] as const;

type AgentId = (typeof AGENTS)[number]['id'];

interface JobStepperProps {
  status: JobStatus;
  agentsCompleted: string[];
  error?: string | null;
}

function activeAgent(status: JobStatus): AgentId | null {
  switch (status) {
    case 'INGESTING':
      return 'ingestion';
    case 'NORMALISING':
      return 'normalisation';
    case 'MATCHING':
      return 'matching';
    case 'REPORTING':
      return 'report';
    default:
      return null;
  }
}

export function JobStepper({ status, agentsCompleted, error }: JobStepperProps) {
  const completedSet = new Set(agentsCompleted);
  const active = activeAgent(status);
  const failed = status === 'FAILED';

  return (
    <ol
      role="list"
      aria-label="Pipeline progress"
      className="grid grid-cols-1 gap-3 md:grid-cols-4"
    >
      {AGENTS.map((agent, idx) => {
        const isCompleted = completedSet.has(agent.id);
        const isActive = active === agent.id;
        const state: 'pending' | 'active' | 'complete' | 'failed' = failed && isActive
          ? 'failed'
          : isCompleted
          ? 'complete'
          : isActive
          ? 'active'
          : 'pending';
        return (
          <li
            key={agent.id}
            data-state={state}
            className={cn(
              'flex items-center gap-3 rounded-md border bg-white px-4 py-3',
              state === 'complete' && 'border-emerald-200 bg-emerald-50',
              state === 'active' && 'border-blue-200 bg-blue-50',
              state === 'failed' && 'border-rose-200 bg-rose-50',
              state === 'pending' && 'border-slate-200',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                state === 'complete' && 'bg-emerald-600 text-white',
                state === 'active' && 'bg-blue-600 text-white',
                state === 'failed' && 'bg-rose-600 text-white',
                state === 'pending' && 'bg-slate-200 text-slate-600',
              )}
              aria-hidden
            >
              {state === 'complete' ? '✓' : idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{agent.label}</p>
              <p className="text-xs text-slate-500 capitalize">
                {state === 'failed' ? error ?? 'failed' : state}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
