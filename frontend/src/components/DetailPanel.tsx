import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { ResourceDetail } from '@/api/types';
import { RetryButton, StatusBadge } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { KIND_LABEL, attrLabel, formatDateTime, formatNumber, formatPct } from '@/lib/format';
import { useResource } from '@/store/hooks';
import { store } from '@/store/resourceStore';

export const DetailPanel = ({ selectedId }: { selectedId?: number }) => {
  const [detail, setDetail] = useState<ResourceDetail>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const live = useResource(selectedId);

  useEffect(() => {
    if (selectedId === undefined) {
      setDetail(undefined);
      return;
    }
    const controller = new AbortController();
    setError(undefined);
    api
      .detail(selectedId, controller.signal)
      .then((d) => {
        store.upsert([d.resource]);
        setDetail(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [selectedId, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  const r = selectedId === undefined ? undefined : (live ?? (detail?.resource.id === selectedId ? detail.resource : undefined));
  if (!r) {
    const message =
      selectedId === undefined ? '리소스를 선택하면 상세 정보가 표시됩니다.' : error ? `불러오지 못했습니다: ${error}` : '불러오는 중...';
    return (
      <Card className="min-h-0">
        <CardContent className="flex items-center gap-1 text-muted-foreground">
          {message}
          {error && <RetryButton onClick={retry} />}
        </CardContent>
      </Card>
    );
  }
  const attrs = detail?.resource.id === r.id ? detail.attrs : undefined;

  const rows: [string, React.ReactNode][] = [
    ['종류', KIND_LABEL[r.kind]],
    ['이름', r.name],
    ['상태', <StatusBadge status={r.status} />],
    ['마지막 갱신', formatDateTime(r.updatedAt)],
    ['경로', r.path],
    ['CPU 사용률', formatPct(r.cpuPct)],
    ['메모리 사용률', formatPct(r.memPct)],
  ];
  if (r.gpuPct !== undefined) rows.push(['GPU 사용률', formatPct(r.gpuPct)]);
  if (r.kind === 'POD') {
    rows.push(['Phase', r.phase], ['재시작 횟수', r.restarts ?? 0]);
  } else {
    rows.push(['하위 리소스 수', formatNumber(r.childCount)]);
  }
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== null && value !== undefined) rows.push([attrLabel(key), String(value)]);
    }
  }

  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>상세 정보</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="flex items-center gap-1 pb-2 text-muted-foreground">
            속성을 불러오지 못했습니다: {error}
            <RetryButton onClick={retry} />
          </div>
        )}
        <Table>
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label}>
                <TableHead className="w-40 text-muted-foreground">{label}</TableHead>
                <TableCell className="whitespace-normal break-all">{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
