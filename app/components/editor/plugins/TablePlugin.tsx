import { useEffect, useRef } from "react";
import { useEditorContext } from "../core/EditorContext";

const HANDLE_WIDTH = 6;
const MIN_COL_WIDTH = 40;

function attachResizeHandles(root: HTMLElement, table: HTMLTableElement) {
  if (table.closest(".table-resize-wrapper")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "table-resize-wrapper";
  wrapper.style.position = "relative";
  const parent = table.parentNode;
  if (!parent) return;
  parent.insertBefore(wrapper, table);
  wrapper.appendChild(table);

  const handlesContainer = document.createElement("div");
  handlesContainer.className = "table-resize-handles";
  handlesContainer.style.cssText =
    "position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;";
  wrapper.appendChild(handlesContainer);

  const updateHandles = () => {
    handlesContainer.innerHTML = "";
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return;

    const firstRow = rows[0]!;
    const cells = Array.from(firstRow.querySelectorAll("td, th"));
    const colCount = cells.length;
    if (colCount === 0) return;

    const rect = table.getBoundingClientRect();
    let x = 0;
    for (let c = 0; c < colCount; c++) {
      const cell = cells[c] as HTMLElement;
      const w = cell.offsetWidth || 100;
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "table-resize-handle table-resize-handle-col";
      handle.setAttribute("data-col", String(c));
      handle.setAttribute("data-testid", `table-resize-handle-col-${c}`);
      handle.setAttribute("aria-label", `Resize column ${c + 1}`);
      handle.style.cssText = `
        position:absolute;left:${x + w - HANDLE_WIDTH / 2}px;top:0;bottom:0;
        width:${HANDLE_WIDTH}px;border:none;background:transparent;padding:0;
        cursor:col-resize;pointer-events:auto;
      `;
      handle.title = "Drag to resize column";
      handlesContainer.appendChild(handle);

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = cell.offsetWidth;
        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const newW = Math.max(MIN_COL_WIDTH, startW + dx);
          const col = table.querySelector(`col:nth-child(${c + 1})`);
          if (col) {
            (col as HTMLElement).style.width = `${newW}px`;
          }
          for (const r of rows) {
            const ccell = r.querySelector(`td:nth-child(${c + 1}), th:nth-child(${c + 1})`) as HTMLElement;
            if (ccell) ccell.style.width = `${newW}px`;
          }
          updateHandles();
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      });

      x += w;
    }
  };

  if (!table.querySelector("colgroup")) {
    const colgroup = document.createElement("colgroup");
    const firstRow = table.querySelector("tr");
    const cellCount = firstRow ? firstRow.querySelectorAll("td, th").length : 0;
    for (let i = 0; i < cellCount; i++) {
      const col = document.createElement("col");
      colgroup.appendChild(col);
    }
    table.insertBefore(colgroup, table.firstChild);
  }

  updateHandles();

  const resizeObserver = new ResizeObserver(updateHandles);
  resizeObserver.observe(table);

  return () => resizeObserver.disconnect();
}

export function TablePlugin() {
  const { rootRef } = useEditorContext();
  const mountedRef = useRef<Set<HTMLTableElement>>(new Set());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const scan = () => {
      const tables = root.querySelectorAll("table.editor-table");
      for (const table of tables) {
        const el = table as HTMLTableElement;
        if (!mountedRef.current.has(el)) {
          mountedRef.current.add(el);
          attachResizeHandles(root, el);
        }
      }
    };

    scan();
    window.addEventListener("table-resizer-scan", scan);

    const observer = new MutationObserver(() => {
      const tables = root.querySelectorAll("table.editor-table");
      for (const table of tables) {
        const el = table as HTMLTableElement;
        if (!mountedRef.current.has(el)) {
          mountedRef.current.add(el);
          attachResizeHandles(root, el);
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("table-resizer-scan", scan);
      observer.disconnect();
    };
  }, [rootRef]);

  return null;
}
