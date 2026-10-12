import type { ParsedSong } from "@/lib/chords";

/**
 * Renders a parsed song. Each chord sits in a column directly above the
 * lyric fragment it belongs to, so chords stay over their syllables when
 * a line wraps.
 */
export function ChordSheet({
  song,
  showChords = true,
  fontSize = 18,
}: {
  song: ParsedSong;
  showChords?: boolean;
  fontSize?: number;
}) {
  return (
    <div style={{ fontSize }} className="leading-tight">
      {song.lines.map((line, i) => {
        switch (line.type) {
          case "blank":
            return <div key={i} className="h-4" />;
          case "section":
            return (
              <h3 key={i} className="mt-4 mb-1 text-[0.75em] font-bold tracking-wide text-zinc-500 uppercase">
                {line.label}
              </h3>
            );
          case "comment":
            return (
              <p key={i} className="my-1 text-[0.85em] text-zinc-500 italic">
                {line.text}
              </p>
            );
          case "lyrics":
            return (
              <div key={i} className="mb-1">
                {line.segments.map((seg, j) => (
                  <span key={j} className="inline-flex flex-col align-top">
                    {showChords && (
                      <span className="min-h-[1.2em] pr-1 font-mono font-bold text-blue-700 dark:text-blue-400">
                        {seg.chord ?? " "}
                      </span>
                    )}
                    <span className="whitespace-pre-wrap">
                      {seg.lyric === "" ? (seg.chord && showChords ? " " : "") : seg.lyric}
                    </span>
                  </span>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
