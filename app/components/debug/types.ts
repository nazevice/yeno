export type DebugMetricSeverity = "info" | "warn" | "error";

export interface DebugMetric {
  id: string;
  label: string;
  value: string;
  unit?: string | undefined;
  severity?: DebugMetricSeverity | undefined;
  enabled?: boolean | undefined;
}
