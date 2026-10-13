import { lineCells, type EditorSection } from "@/lib/chords";

/** A song laid out for reading, one section after another: names, chords above the words. */
export function SongSheet({ sections }: { sections: EditorSection[] }) {
  return (
    <div className="space-y-5 text-[0.9375rem]">
      {sections.map((s) => (
        <div key={s.id}>
          <h4 className="part-label">{s.label || "Unnamed Section"}</h4>
          {s.lines.map((line, i) => (
            <div key={i} className="leading-tight">
              {line.text === "" && line.chords.length === 0 ? (
                <div className="h-[0.8em]" />
              ) : (
                lineCells(line).map((cell) => (
                  <span key={cell.start} className="inline-flex flex-col align-top">
                    <span className="min-h-[1.5em] pr-[0.25em] font-mono text-[0.9em] font-bold text-chord">
                      {cell.chord ?? " "}
                    </span>
                    <span className="whitespace-pre-wrap">{cell.text}</span>
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
