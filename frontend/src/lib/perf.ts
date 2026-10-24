const starts = new Map<string, number>();
const channel = new MessageChannel();
const afterPaint: (() => void)[] = [];
channel.port1.onmessage = () => afterPaint.shift()?.();

export const afterNextPaint = (fn: () => void): void => {
  requestAnimationFrame(() => {
    afterPaint.push(fn);
    channel.port2.postMessage(null);
  });
};

export const startMeasure = (name: string): void => {
  starts.set(name, performance.now());
};

export const endMeasureAfterPaint = (name: string): void => {
  const start = starts.get(name);
  if (start === undefined) return;
  starts.delete(name);
  afterNextPaint(() => performance.measure(name, { start, end: performance.now() }));
};
