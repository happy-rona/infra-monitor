import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { HealthStatus, Resource, SearchResponse } from '@/api/types';
import { StatusBadge } from '@/components/common';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { KIND_LABEL, formatNumber } from '@/lib/format';
import { endMeasureAfterPaint, startMeasure } from '@/lib/perf';

interface Props {
  statusFilter: ReadonlySet<HealthStatus>;
  onPick: (resource: Resource) => void;
}

export const SearchBox = ({ statusFilter, onPick }: Props) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SearchResponse>();
  const q = useDebouncedValue(text.trim(), 250);

  useEffect(() => {
    if (q.length === 0) {
      setResult(undefined);
      return;
    }
    const controller = new AbortController();
    startMeasure('검색');
    api
      .search(q, [...statusFilter], controller.signal)
      .then((res) => {
        setResult(res);
        endMeasureAfterPaint('검색');
      })
      .catch(() => {});
    return () => controller.abort();
  }, [q, statusFilter]);

  const pick = (r: Resource) => {
    setText('');
    setResult(undefined);
    onPick(r);
  };

  return (
    <div className="relative">
      <Input
        type="search"
        placeholder="이름으로 검색"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="리소스 검색"
      />
      {result && q && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-[60vh] overflow-y-auto rounded-md border bg-popover shadow-md">
          <div className="border-b px-3 py-2 text-xs text-muted-foreground">
            {result.total === 0
              ? '검색 결과가 없습니다'
              : `${formatNumber(result.total)}${result.totalCapped ? '+' : ''}건 (상위 ${result.items.length}건 표시)`}
          </div>
          <ul>
            {result.items.map((r) => (
              <li key={r.id} className="cursor-pointer border-b px-3 py-2 last:border-b-0 hover:bg-muted" onClick={() => pick(r)}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                  <span className="truncate">{r.name}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="truncate text-xs text-muted-foreground">{r.path}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
