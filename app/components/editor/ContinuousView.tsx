import type { PropsWithChildren } from "react";

interface ContinuousViewProps extends PropsWithChildren {
  contentWidthPx: number;
}

export function ContinuousView({ children, contentWidthPx }: ContinuousViewProps) {
  return (
    <section className="editor-surface h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mx-auto" style={{ maxWidth: `${contentWidthPx}px` }}>
        {children}
      </div>
    </section>
  );
}
