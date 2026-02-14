import { useEffect, useMemo, useState } from "react";

import type { DebugMetric, DebugMetricSeverity } from "./types";

const FPS_SAMPLE_WINDOW_MS = 500;
const FPS_SMOOTHING_SAMPLES = 10;

export function useFpsMetric(): DebugMetric {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let animationFrameId = 0;
    let frameCount = 0;
    let windowStart = performance.now();
    const samples: number[] = [];

    const onFrame = (now: number) => {
      frameCount += 1;
      const elapsedMs = now - windowStart;

      if (elapsedMs >= FPS_SAMPLE_WINDOW_MS) {
        const instantFps = (frameCount * 1000) / elapsedMs;
        samples.push(instantFps);
        if (samples.length > FPS_SMOOTHING_SAMPLES) {
          samples.shift();
        }

        const averageFps = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
        setFps(Math.round(averageFps));

        frameCount = 0;
        windowStart = now;
      }

      animationFrameId = window.requestAnimationFrame(onFrame);
    };

    animationFrameId = window.requestAnimationFrame(onFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return useMemo(() => {
    const value = fps === null ? "--" : String(fps);
    let severity: DebugMetricSeverity = "info";

    if (fps !== null && fps < 30) {
      severity = fps < 20 ? "error" : "warn";
    }

    return {
      id: "fps",
      label: "FPS",
      value,
      unit: fps === null ? undefined : "fps",
      severity,
      enabled: true,
    };
  }, [fps]);
}
