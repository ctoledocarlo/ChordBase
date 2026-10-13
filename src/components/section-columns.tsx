"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { columnsOf, type DropTarget, type EditorSection } from "@/lib/chords";
import { FitToScreen } from "./fit-to-screen";

type Props = {
  sections: EditorSection[];
  size: number | "fit";
  className?: string;
  /** The lines of a section; the name above them is drawn here. */
  renderLines: (section: EditorSection) => ReactNode;
  /** Pass this to let sections be dragged. Without it the layout is read-only. */
  onMove?: (id: string, target: DropTarget) => void;
};

/**
 * Lays the song's sections out in their saved columns, scaled to fit the
 * screen. When `onMove` is given, each section can be dragged by its name
 * (or moved with Alt + the arrow keys) into another place or column.
 */
export function SectionColumns({ sections, size, className, renderLines, onMove }: Props) {
  const columns = columnsOf(sections);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  /** Where a section would go if dropped over `block`, counting the other sections only. */
  function targetOver(column: EditorSection[], ci: number, blockId: string, after: boolean): DropTarget {
    const others = column.filter((s) => s.id !== dragId);
    return { column: ci, index: others.findIndex((s) => s.id === blockId) + (after ? 1 : 0) };
  }

  function onHandleKey(e: KeyboardEvent, s: EditorSection, ci: number) {
    if (!onMove || !e.altKey) return;
    const column = columns[ci];
    const pos = column.findIndex((x) => x.id === s.id);
    let target: DropTarget | null = null;
    if (e.key === "ArrowUp" && pos > 0) target = { column: ci, index: pos - 1 };
    else if (e.key === "ArrowDown" && pos < column.length - 1) target = { column: ci, index: pos + 1 };
    else if (e.key === "ArrowLeft" && ci > 0) target = { column: ci - 1, index: Math.min(pos, columns[ci - 1].length) };
    else if (e.key === "ArrowRight") {
      if (ci < columns.length - 1) target = { column: ci + 1, index: Math.min(pos, columns[ci + 1].length) };
      else if (column.length > 1) target = { column: columns.length, index: 0 };
    }
    if (target) {
      e.preventDefault();
      onMove(s.id, target);
    }
  }

  return (
    <FitToScreen
      size={size}
      className={className}
      onDragOver={(e) => {
        if (dragId) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
      }}
      onDrop={(e) => {
        if (!dragId) return;
        e.preventDefault();
        if (drop && onMove) onMove(dragId, drop);
        endDrag();
      }}
    >
      {columns.map((column, ci) => {
        const others = column.filter((s) => s.id !== dragId);
        let slot = 0;
        return (
          <div
            key={ci}
            className="flex-none"
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setDrop({ column: ci, index: others.length });
            }}
          >
            {column.map((s) => {
              const isDragged = s.id === dragId;
              const marker = !isDragged && drop?.column === ci && drop.index === slot;
              if (!isDragged) slot++;
              return (
                <div key={s.id}>
                  {marker && <DropLine />}
                  <div
                    data-section-id={s.id}
                    className={`mb-[1.4em] ${isDragged ? "opacity-40" : ""}`}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (isDragged) return;
                      const box = e.currentTarget.getBoundingClientRect();
                      setDrop(targetOver(column, ci, s.id, e.clientY > box.top + box.height / 2));
                    }}
                  >
                    {onMove ? (
                      <h3
                        className="part-label cursor-grab active:cursor-grabbing"
                        draggable
                        tabIndex={0}
                        role="button"
                        aria-label={`Move ${s.label || "Unnamed Section"}. Hold Alt and press the arrow keys.`}
                        onKeyDown={(e) => onHandleKey(e, s, ci)}
                        onDragStart={(e) => {
                          const block = e.currentTarget.closest("[data-section-id]");
                          if (block) e.dataTransfer.setDragImage(block, 12, 12);
                          e.dataTransfer.setData("text/plain", s.id);
                          e.dataTransfer.effectAllowed = "move";
                          // Changing the page inside the dragstart event can cancel the drag.
                          setTimeout(() => setDragId(s.id), 0);
                        }}
                        onDragEnd={endDrag}
                      >
                        <Grip />
                        {s.label || "Unnamed Section"}
                      </h3>
                    ) : (
                      <h3 className="part-label">{s.label || "Unnamed Section"}</h3>
                    )}
                    {renderLines(s)}
                  </div>
                </div>
              );
            })}
            {drop?.column === ci && drop.index === slot && others.length > 0 && <DropLine />}
          </div>
        );
      })}

      {dragId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrop({ column: columns.length, index: 0 });
          }}
          className={`absolute inset-y-0 right-0 flex w-[2.2em] items-center justify-center rounded-[0.4em] border-2 border-dashed text-[0.7em] [writing-mode:vertical-rl] ${
            drop?.column === columns.length ? "border-accent bg-hover text-foreground" : "border-line text-muted"
          }`}
        >
          New column
        </div>
      )}
    </FitToScreen>
  );
}

/** A line showing where the dragged section will land. It takes no space, so the text size doesn't change. */
function DropLine() {
  return (
    <div aria-hidden className="relative h-0">
      <div className="absolute inset-x-0 -top-[0.5em] h-[0.2em] rounded bg-accent" />
    </div>
  );
}

function Grip() {
  return (
    <svg aria-hidden width="0.8em" height="0.8em" viewBox="0 0 8 12" fill="currentColor" className="flex-none text-muted">
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="2" cy="6" r="1" />
      <circle cx="6" cy="6" r="1" />
      <circle cx="2" cy="10" r="1" />
      <circle cx="6" cy="10" r="1" />
    </svg>
  );
}
