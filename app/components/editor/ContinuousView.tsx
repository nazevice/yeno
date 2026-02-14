import type { PropsWithChildren } from "react";

export function ContinuousView({ children }: PropsWithChildren) {
  return (
    <section className="editor-surface h-[calc(100vh-9rem)] overflow-auto rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-4xl">{children}</div>
    </section>
  );
}
