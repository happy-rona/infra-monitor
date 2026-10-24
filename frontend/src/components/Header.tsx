import { Button } from '@/components/ui/button';

export const Header = ({ onRefresh }: { onRefresh: () => void }) => {
  return (
    <header className="flex items-center justify-between border-b px-4 py-2">
      <h1 className="text-base font-semibold">Infrastructure Monitoring Service</h1>
      <Button variant="outline" size="sm" className="cursor-pointer" onClick={onRefresh}>
        새로고침
      </Button>
    </header>
  );
};
