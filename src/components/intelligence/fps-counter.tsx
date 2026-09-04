import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";

export const FpsCounter: React.FC = () => {
  const [fps, setFps] = useState<number>(60);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationFrameId: number;

    const tick = (now: number) => {
      frameCount++;
      const elapsed = now - lastTime;

      if (elapsed >= 500) {
        const currentFps = Math.round((frameCount * 1000) / elapsed);
        setFps(currentFps);
        frameCount = 0;
        lastTime = now;
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const isHighFps = fps >= 50;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-colors ${
        isHighFps
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      }`}
      title="Real-time main thread rendering frame rate"
    >
      <Activity className="h-3 w-3 animate-pulse" />
      <span>{fps} FPS</span>
      <span className="text-[10px] opacity-75 font-sans">
        {isHighFps ? "≥50 FPS (Smooth)" : "Caution"}
      </span>
    </div>
  );
};
