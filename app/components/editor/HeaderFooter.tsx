import { useCallback, useEffect, useRef, useState } from "react";
import type { HeaderFooterContent } from "~/lib/domain/document/value-objects/SectionLayout";
import { SectionLayout } from "~/lib/domain/document/value-objects/SectionLayout";

interface HeaderFooterProps {
  type: "header" | "footer";
  content: HeaderFooterContent | undefined;
  pageNumber: number;
  totalPages: number;
  pageWidth: number;
  onContentChange: (content: HeaderFooterContent) => void;
}

type Zone = "left" | "center" | "right";

const TEMPLATE_VARIABLES = [
  { value: "{page}", label: "Page number" },
  { value: "{total}", label: "Total pages" },
];

export function HeaderFooter({
  type,
  content,
  pageNumber,
  totalPages,
  pageWidth,
  onContentChange,
}: HeaderFooterProps) {
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [showVariables, setShowVariables] = useState(false);
  const leftRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const zoneRefs = {
    left: leftRef,
    center: centerRef,
    right: rightRef,
  } as const;

  const getDisplayText = useCallback(
    (text: string | undefined): string => {
      if (!text) return "";
      return SectionLayout.resolveTemplate(text, pageNumber, totalPages);
    },
    [pageNumber, totalPages]
  );

  const handleDoubleClick = (zone: Zone) => {
    setEditingZone(zone);
    setShowVariables(true);
  };

  const insertVariable = (variable: string) => {
    const ref = editingZone ? zoneRefs[editingZone].current : null;
    if (!ref) return;
    
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    const textNode = document.createTextNode(variable);
    range.insertNode(textNode);
    
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    
    ref.focus();
  };

  const handleBlur = (zone: Zone) => {
    if (toolbarRef.current?.contains(document.activeElement)) return;
    
    const ref = zoneRefs[zone].current;
    if (!ref) return;

    const html = ref.innerHTML;
    const newContent: HeaderFooterContent = {
      ...content,
      [zone]: html || undefined,
    };

    const hasAnyContent = newContent.left || newContent.center || newContent.right;
    if (!hasAnyContent) {
      onContentChange({});
    } else {
      onContentChange(newContent);
    }

    setEditingZone(null);
    setShowVariables(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, zone: Zone) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      const ref = zoneRefs[zone].current;
      if (ref) {
        ref.innerHTML = content?.[zone] || "";
        setEditingZone(null);
        setShowVariables(false);
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      e.preventDefault();
      document.execCommand("bold", false);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "i") {
      e.preventDefault();
      document.execCommand("italic", false);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "u") {
      e.preventDefault();
      document.execCommand("underline", false);
    }
  };

  useEffect(() => {
    if (editingZone) {
      const ref = zoneRefs[editingZone].current;
      if (ref) {
        ref.focus();
        const range = document.createRange();
        range.selectNodeContents(ref);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [editingZone, zoneRefs]);

  const isEditing = editingZone !== null;
  const hasContent = content?.left || content?.center || content?.right;

  if (!hasContent && !isEditing) {
    return (
      <div
        className="absolute left-0 right-0 flex items-center justify-between px-12 text-[10px] text-zinc-300 cursor-pointer select-none hover:text-zinc-400"
        style={{
          top: type === "header" ? 12 : undefined,
          bottom: type === "footer" ? 12 : undefined,
          height: 20,
        }}
        onDoubleClick={() => handleDoubleClick("center")}
        title={`Double-click to add ${type}`}
      >
        <span className="mx-auto">Double-click to add {type}</span>
      </div>
    );
  }

  const paddingX = 48;

  return (
    <div
      className="absolute left-0 right-0 flex items-start justify-between text-[10px] text-zinc-500"
      style={{
        top: type === "header" ? 12 : undefined,
        bottom: type === "footer" ? 12 : undefined,
        paddingLeft: paddingX,
        paddingRight: paddingX,
      }}
    >
      {showVariables && editingZone && (
        <div
          ref={toolbarRef}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white border border-zinc-200 rounded-md shadow-sm px-1 py-0.5 z-10"
          style={{ top: type === "header" ? 24 : undefined, bottom: type === "footer" ? 24 : undefined }}
        >
          <span className="text-[9px] text-zinc-400 px-1">Insert:</span>
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.value}
              type="button"
              className="px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-100 rounded"
              onMouseDown={(e) => {
                e.preventDefault();
                insertVariable(v.value);
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      {(["left", "center", "right"] as const).map((zone) => (
        <div
          key={zone}
          ref={zoneRefs[zone]}
          contentEditable={editingZone === zone}
          suppressContentEditableWarning
          className={`outline-none min-w-[60px] ${
            zone === "center" ? "text-center flex-1" : ""
          } ${zone === "right" ? "text-right" : ""} ${
            editingZone === zone
              ? "bg-white px-1 rounded shadow-sm border border-blue-200"
              : "cursor-default"
          }`}
          style={{ maxWidth: pageWidth / 3 - paddingX }}
          onDoubleClick={() => handleDoubleClick(zone)}
          onBlur={() => handleBlur(zone)}
          onKeyDown={(e) => handleKeyDown(e, zone)}
        >
          {editingZone === zone
            ? content?.[zone] || ""
            : getDisplayText(content?.[zone])}
        </div>
      ))}
    </div>
  );
}
