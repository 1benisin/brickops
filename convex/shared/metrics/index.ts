export type MetricEvent = {
  name: string;
  data: Record<string, unknown>;
  timestamp: string;
};

type MetricListener = (event: MetricEvent) => void;

const listeners = new Set<MetricListener>();

export const addMetricListener = (listener: MetricListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearMetricListeners = () => listeners.clear();

export const recordMetric = (name: string, data: Record<string, unknown>): MetricEvent => {
  const event: MetricEvent = {
    name,
    data,
    timestamp: new Date().toISOString(),
  };

  listeners.forEach((listener) => listener(event));

  if (process.env.NODE_ENV !== "test") {
    console.debug(`[metrics] ${name}`, data);
  }

  return event;
};
