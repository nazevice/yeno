import { useEffect, useState } from "react";
import { EditorService } from "~/lib/application/EditorService";
import type { Document } from "~/lib/domain/document/Document";
import type { BlockId as BlockIdType } from "~/lib/domain/shared/NodeId";
import type { BlockId } from "~/lib/domain/shared/NodeId";

interface DebugPanelProps {
  service: EditorService;
}

interface SerializableBlock {
  id: string;
  type: string;
  level?: number;
  textRange: { start: number; end: number; length: number };
  marks: number;
  text?: string;
  children?: SerializableBlock[];
}

interface SerializableSection {
  id: string;
  children: SerializableBlock[];
}

function serializeBlock(block: unknown, doc: Document): SerializableBlock {
  const b = block as { id: BlockIdType; type: string; level?: number; textRange?: { start: number; end: number; length: number }; marks: unknown[] };
  const result: SerializableBlock = {
    id: b.id as string,
    type: b.type,
    textRange: b.textRange
      ? {
          start: b.textRange.start,
          end: b.textRange.end,
          length: b.textRange.length,
        }
      : { start: 0, end: 0, length: 0 },
    marks: b.marks?.length ?? 0,
  };
  if (b.level !== undefined) {
    result.level = b.level;
  }

  if (b.type === "image") {
    const imgBlock = block as { assetRef: { name: string }; alt: string; size: [number, number] };
    result.text = `Image: ${imgBlock.assetRef?.name ?? "unknown"} (${imgBlock.size?.[0] ?? 0}x${imgBlock.size?.[1] ?? 0})`;
  } else if (b.type === "table") {
    const tableBlock = block as { rows: unknown[] };
    result.children = tableBlock.rows.map((row: unknown) => {
      const r = row as { cells: unknown[] };
      return {
        id: "row",
        type: "tr",
        textRange: { start: 0, end: 0, length: 0 },
        marks: 0,
        children: r.cells.map((cell: unknown) => {
          const c = cell as { id: BlockIdType; children: unknown[]; textRange: { start: number; end: number; length: number } };
          const cellText = doc.getBuffer().getRange(c.textRange.start, c.textRange.end);
          return {
            id: c.id as string,
            type: "td",
            textRange: {
              start: c.textRange.start,
              end: c.textRange.end,
              length: c.textRange.length,
            },
            marks: 0,
            text: cellText || "(empty)",
            children: c.children.map((child: unknown) => serializeBlock(child, doc)),
          };
        }),
      };
    });
  } else if (b.type === "blockquote") {
    const bqBlock = block as { children: unknown[] };
    result.children = bqBlock.children.map((child: unknown) => serializeBlock(child, doc));
  } else if (b.type === "list") {
    const listBlock = block as { items: unknown[] };
    result.children = listBlock.items.map((item: unknown) => {
      const i = item as { content: unknown };
      return serializeBlock(i.content, doc);
    });
  } else if (b.type === "paragraph" || b.type === "heading") {
    const textBlock = block as { textRange: { start: number; end: number } };
    const text = doc.getBuffer().getRange(textBlock.textRange.start, textBlock.textRange.end);
    result.text = text || "(empty)";
  }

  return result;
}

function serializeDocument(doc: Document) {
  const sections: SerializableSection[] = doc.sections.map((section: unknown) => {
    const s = section as { id: BlockIdType; children: unknown[] };
    return {
      id: s.id as string,
      children: s.children.map((child: unknown) => serializeBlock(child, doc)),
    };
  });

  return sections;
}

export function DebugPanel({ service }: DebugPanelProps) {
  const [docData, setDocData] = useState<{
    sections: SerializableSection[];
    buffer: string;
    selection: { anchor: { blockId: string; offset: number }; focus: { blockId: string; offset: number } } | null;
    activeMarks: { bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; font?: string | undefined; fontSize?: number | undefined } | null;
  } | null>(null);

  useEffect(() => {
    const update = () => {
      const doc = service.getDocument();
      if (!doc) return;

      const buffer = doc.getBuffer().getText();
      const selection = service.selection;
      const activeMarks = service.activeMarks;

      setDocData({
        sections: serializeDocument(doc),
        buffer: buffer.length > 500 ? buffer.slice(0, 500) + "..." : buffer,
        selection: selection
          ? {
              anchor: { blockId: selection.anchor.blockId as string, offset: selection.anchor.offset },
              focus: { blockId: selection.focus.blockId as string, offset: selection.focus.offset },
            }
          : null,
        activeMarks: activeMarks ? { ...activeMarks.toJSON() } : null,
      });
    };

    update();
    const unsub = service.subscribe(update);
    return unsub;
  }, [service]);

  if (!docData) return null;

  return (
    <div className="flex h-full w-[350px] flex-col bg-zinc-900 border-l border-zinc-700">
      <div className="border-b border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">
        Document Debug
      </div>
      <div className="flex-1 overflow-auto p-3">
        <CollapsibleSection title="Buffer" defaultOpen>
          <pre className="whitespace-pre-wrap break-all text-[10px] text-zinc-400 font-mono">
{JSON.stringify(docData.buffer, null, 2)}
          </pre>
        </CollapsibleSection>

        <CollapsibleSection title="Selection" defaultOpen>
          <pre className="text-[10px] text-zinc-400 font-mono">
{JSON.stringify(docData.selection, null, 2)}
          </pre>
        </CollapsibleSection>

        <CollapsibleSection title="Active Marks" defaultOpen>
          <div className="text-[10px] text-zinc-400 font-mono space-y-1">
            {docData.activeMarks && Object.keys(docData.activeMarks).length > 0 ? (
              Object.entries(docData.activeMarks).map(([key, value]) => (
                value !== undefined && (
                  <div key={key} className="flex gap-2">
                    <span className="text-cyan-400">{key}:</span>
                    <span className="text-yellow-400">{String(value)}</span>
                  </div>
                )
              ))
            ) : (
              <span className="text-zinc-500">No active marks</span>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Sections & Blocks" defaultOpen>
          <div className="space-y-2">
            {docData.sections.map((section, si) => (
              <div key={section.id} className="border border-zinc-700 rounded">
                <div className="bg-zinc-800 px-2 py-1 text-[10px] text-zinc-500 font-mono">
                  Section: {section.id}
                </div>
                <div className="p-2 space-y-1">
                  {section.children.map((block, bi) => (
                    <BlockView key={block.id} block={block} depth={0} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold text-zinc-300 hover:text-white"
      >
        <span className="text-zinc-500">{isOpen ? "▼" : "▶"}</span>
        {title}
      </button>
      {isOpen && <div className="mt-1">{children}</div>}
    </div>
  );
}

function BlockView({ block, depth }: { block: SerializableBlock; depth: number }) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  const indent = depth * 12;
  const bgColor = depth === 0 ? "bg-zinc-800" : depth === 1 ? "bg-zinc-750" : "bg-zinc-700";
  const textColor = depth === 0 ? "text-yellow-400" : depth === 1 ? "text-green-400" : "text-blue-400";

  return (
    <div style={{ marginLeft: indent }}>
      <div
        className={`flex items-center gap-1 px-2 py-1 ${bgColor} rounded cursor-pointer`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-zinc-500 text-[9px]">{isOpen ? "▼" : "▶"}</span>
        <span className={`text-[10px] font-mono ${textColor}`}>{block.type}</span>
        <span className="text-[9px] text-zinc-500 font-mono truncate max-w-[100px]">{block.id}</span>
      </div>
      {isOpen && (
        <div className="ml-2 mt-1 space-y-1">
          <div className="text-[9px] text-zinc-500 font-mono pl-2">
            range: [{block.textRange.start}, {block.textRange.end}] ({block.textRange.length})
          </div>
          {block.text !== undefined && (
            <div className="text-[9px] text-zinc-400 font-mono pl-2 truncate max-w-[200px]">
              "{block.text}"
            </div>
          )}
          {block.children?.map((child, i) => (
            <BlockView key={child.id + i} block={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
