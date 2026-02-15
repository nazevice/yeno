import { useMemo } from 'react';
import type { VersionDiff, DiffLine } from '~/lib/versioning';

interface DiffViewerProps {
  diff: VersionDiff;
  onClose: () => void;
}

/**
 * Renders a structured diff view with syntax highlighting.
 */
export function DiffViewer({ diff, onClose }: DiffViewerProps) {
  const stats = useMemo(() => {
    const total = diff.additions + diff.deletions + diff.unchanged;
    const addedPercent = total > 0 ? (diff.additions / total) * 100 : 0;
    const removedPercent = total > 0 ? (diff.deletions / total) * 100 : 0;

    return {
      total,
      addedPercent,
      removedPercent,
    };
  }, [diff]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Version Comparison</h2>
            <p className="text-sm text-zinc-500">
              Comparing version {diff.fromVersionId.slice(0, 8)}... with {diff.toVersionId.slice(0, 8)}...
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-6 border-b border-zinc-100 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
            <span className="text-sm text-zinc-600">
              {diff.additions} addition{diff.additions !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-500" />
            <span className="text-sm text-zinc-600">
              {diff.deletions} deletion{diff.deletions !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600">
              {(diff.similarity * 100).toFixed(1)}% similar
            </span>
          </div>
          {/* Visual diff bar */}
          <div className="ml-auto flex h-2 w-32 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="bg-emerald-500"
              style={{ width: `${stats.addedPercent}%` }}
            />
            <div
              className="bg-red-500"
              style={{ width: `${stats.removedPercent}%` }}
            />
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="font-mono text-sm">
            {diff.hunks.map((hunk, hunkIdx) => (
              <div key={hunkIdx} className="mb-4">
                {/* Hunk Header */}
                <div className="sticky top-0 bg-zinc-100 py-1 text-xs font-semibold text-zinc-500">
                  {hunk.header}
                </div>
                {/* Hunk Lines */}
                <div className="mt-1">
                  {hunk.lines.map((line, lineIdx) => (
                    <DiffLineView key={lineIdx} line={line} />
                  ))}
                </div>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

function DiffLineView({ line }: { line: DiffLine }) {
  const bgColor = useMemo(() => {
    switch (line.kind) {
      case 'addition':
        return 'bg-emerald-50';
      case 'deletion':
        return 'bg-red-50';
      default:
        return '';
    }
  }, [line.kind]);

  const textColor = useMemo(() => {
    switch (line.kind) {
      case 'addition':
        return 'text-emerald-700';
      case 'deletion':
        return 'text-red-700';
      default:
        return 'text-zinc-700';
    }
  }, [line.kind]);

  const prefix = useMemo(() => {
    switch (line.kind) {
      case 'addition':
        return '+';
      case 'deletion':
        return '-';
      default:
        return ' ';
    }
  }, [line.kind]);

  return (
    <div className={`flex ${bgColor}`}>
      {/* Line Numbers */}
      <div className="flex w-20 shrink-0 select-none border-r border-zinc-200 text-right text-xs text-zinc-400">
        <span className="w-10 px-2 py-0.5">
          {line.oldLine ?? ''}
        </span>
        <span className="w-10 px-2 py-0.5">
          {line.newLine ?? ''}
        </span>
      </div>
      {/* Content */}
      <div className={`flex-1 px-2 py-0.5 ${textColor}`}>
        <span className="select-none opacity-50">{prefix}</span>
        {line.content || '\u00A0'}
      </div>
    </div>
  );
}
