import { elementScroll, type Virtualizer } from '@tanstack/react-virtual';

export const observeElementRect = (instance: Virtualizer<HTMLDivElement, Element>, cb: (rect: { width: number; height: number }) => void) => {
  const element = instance.scrollElement;
  if (!element) return;
  const observer = new ResizeObserver(([entry]) => {
    cb({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
  });
  observer.observe(element);
  return () => observer.disconnect();
};

const mounted = new WeakSet<Element>();

export const scrollToFn: typeof elementScroll = (offset, options, instance) => {
  const element = instance.scrollElement;
  if (element && !mounted.has(element)) {
    mounted.add(element);
    if (offset + (options.adjustments ?? 0) === 0) return;
  }
  elementScroll(offset, options, instance);
};

export const fixedRowOptions = (rowHeight: number) => ({
  estimateSize: () => rowHeight,
  initialRect: { width: 0, height: window.innerHeight },
  observeElementRect,
  scrollToFn,
  useFlushSync: false,
});
