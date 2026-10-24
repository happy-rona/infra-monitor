import type { HealthStatus } from '@/api/types';
import { STATUSES } from '@/api/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { STATUS_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  value: ReadonlySet<HealthStatus>;
  onChange: (next: Set<HealthStatus>) => void;
  className?: string;
}

export const FilterBar = ({ value, onChange, className }: Props) => {
  const toggle = (status: HealthStatus) => {
    const next = new Set(value);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onChange(next);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-4 text-sm', className)}>
      <span className="text-muted-foreground">상태</span>
      {STATUSES.map((status) => (
        <Label key={status} className="cursor-pointer font-normal has-disabled:cursor-not-allowed">
          <Checkbox
            className="cursor-pointer"
            checked={value.has(status)}
            disabled={value.size === 1 && value.has(status)}
            onCheckedChange={() => toggle(status)}
          />
          {STATUS_LABEL[status]}
        </Label>
      ))}
    </div>
  );
};
