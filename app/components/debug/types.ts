export type DebugMetricSeverity = "info" | "warn" | "error";

export interface DebugMetric {
  id: string;
  label: string;
  value: string;
  unit?: string;
  severity?: DebugMetricSeverity;
  enabled?: boolean;
}
