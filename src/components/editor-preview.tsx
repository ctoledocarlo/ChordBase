import type { ReactNode } from "react";
import { lineCells, type DropTarget, type EditorLine, type EditorSection } from "@/lib/chords";
import { SectionColumns } from "./section-columns";
import { SCREEN_HEIGHT, type SongInfo } from "./song-editor-shared";

/**
 * The full-screen layout shared by the Chords and Preview tabs: the song's
 * title, key and BPM, then every section in its saved column. Both tabs use it so
 * their text size matches. Pass `onMove` to let the sections be dragged around.
 */
export function SongScreen({
  info,
  size,
  sections,
  renderLines,
  onMove,
  fill = false,
}: {
  info: Pick<SongInfo, "title" | "key" | "tempo">;
  size: number | "fit";
  sections: EditorSection[];
  renderLines: (section: EditorSection) => ReactNode;
  onMove?: (id: string, target: DropTarget) => void;
  /** Take the height of the parent instead of the page minus the navbar (live mode). */
  fill?: boolean;
}) {
  const meta = [info.key && `Key of ${info.key}`, info.tempo && `${info.tempo} BPM`].filter(Boolean);
  return (
    <div className={`flex flex-col ${fill ? "h-full" : SCREEN_HEIGHT}`}>
      <header className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">{info.title || "Untitled song"}</h1>
        {meta.length > 0 && <p className="text-muted">{meta.join("   ·   ")}</p>}
      </header>
      <SectionColumns
        sections={sections}
        size={size}
        className="min-h-0 flex-1"
        renderLines={renderLines}
        onMove={onMove}
      />
    </div>
  );
}

/** What the musicians see during the service. */
export function PreviewTab({
  info,
  sections,
  size,
  showChords = true,
  onMove,
  fill,
}: {
  info: Pick<SongInfo, "title" | "key" | "tempo">;
  sections: EditorSection[];
  size: number | "fit";
  showChords?: boolean;
  /** Makes the sections draggable; leave it out for a read-only screen. */
  onMove?: (id: string, target: DropTarget) => void;
  fill?: boolean;
}) {
  return (
    <SongScreen
      fill={fill}
      info={info}
      size={size}
      sections={sections}
      onMove={onMove}
      renderLines={(s) =>
        s.lines.map((line, i) => <ReadOnlyLine key={i} line={line} showChords={showChords} />)
      }
    />
  );
}

/** Laid out exactly like the editable line in the Chords tab, so both screens fit the same way. */
function ReadOnlyLine({ line, showChords }: { line: EditorLine; showChords: boolean }) {
  const hasEndChord = line.text.length > 0 && line.chords.some((c) => c.pos === line.text.length);
  return (
    <div className="leading-tight">
      {lineCells(line).map((cell) => (
        <span key={cell.start} className="inline-flex flex-col align-top">
          {showChords && (
            <span className="min-h-[1.5em] pr-[0.25em] font-mono text-[0.9em] font-bold text-chord">
              {cell.chord ?? " "}
            </span>
          )}
          <span className="whitespace-pre-wrap">{cell.text}</span>
        </span>
      ))}
      {showChords && !hasEndChord && (
        <span aria-hidden className="ml-[0.3em] inline-block min-w-[1.4em] align-top opacity-0">
          +
        </span>
      )}
    </div>
  );
}
