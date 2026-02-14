import { useMemo } from "react";

import type { DebugMetric } from "./types";
import { useFpsMetric } from "./useFpsMetric";

export function DebugBar() {
  const fpsMetric = useFpsMetric();
  const metrics = useMemo<DebugMetric[]>(() => [fpsMetric], [fpsMetric]);
  const enabledMetrics = metrics.filter((metric) => metric.enabled !== false);

  if (enabledMetrics.length === 0) {
    return null;
  }

  return (
    <aside className="debug-bar" aria-label="Developer debug bar">
      {enabledMetrics.map((metric) => (
        <div key={metric.id} className={`debug-pill debug-pill--${metric.severity ?? "info"}`}>
          <span className="debug-pill__label">{metric.label}</span>
          <span className="debug-pill__value">
            {metric.value}
            {metric.unit ? ` ${metric.unit}` : ""}
          </span>
        </div>
      ))}
    </aside>
  );
}
