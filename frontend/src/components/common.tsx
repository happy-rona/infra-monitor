import { memo } from 'react';
import { RotateCwIcon } from 'lucide-react';
import type { HealthStatus } from '@/api/types';
import { Button } from '@/components/ui/button';
import { STATUS_LABEL } from '@/lib/format';

const STATUS_CLASS: Record<HealthStatus, string> = {
  HEALTHY: 'text-green-700',
  WARNING: 'text-amber-700',
  CRITICAL: 'text-red-600',
  UNKNOWN: 'text-muted-foreground',
};

const BADGE = 'inline-flex h-5 w-fit shrink-0 items-center justify-center rounded-4xl border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap';
const BADGE_CLASS = Object.fromEntries(
  Object.entries(STATUS_CLASS).map(([status, color]) => [status, `${BADGE} ${color}`]),
) as Record<HealthStatus, string>;

export const StatusBadge = memo(({ status }: { status: HealthStatus }) => {
  return (
    <span data-slot="badge" className={BADGE_CLASS[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
});

export const RetryButton = ({ onClick }: { onClick: () => void }) => {
  return (
    <Button variant="ghost" size="icon-sm" className="cursor-pointer text-foreground" aria-label="다시 시도" title="다시 시도" onClick={onClick}>
      <RotateCwIcon />
    </Button>
  );
};
