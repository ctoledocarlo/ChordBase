/** A few lines of an imaginary chart: chords sitting over where the words would be. */
const SHEET = [
  { chords: [["G", 0], ["D/F#", 38], ["Em7", 66]], words: [34, 22, 28] },
  { chords: [["C", 0], ["G", 44]], words: [40, 36] },
  { chords: [["Am7", 0], ["D", 30], ["G", 62]], words: [26, 28, 24] },
  { chords: [["C", 0], ["D", 52]], words: [48, 20] },
] as const;

/** Decoration for the dark brand panels (login and landing). Always dark, in both themes. */
export function ChordSheetArt({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-xl border border-white/10 bg-white/[0.04] p-6 text-zinc-100 shadow-2xl backdrop-blur-sm ${className}`}
    >
      <div className="mb-5 flex items-center justify-between text-xs text-zinc-400">
        <span className="font-mono">Key of G</span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono">Capo 2</span>
      </div>
      <div className="space-y-5">
        {SHEET.map((line, i) => (
          <div key={i} className="anim-rise" style={{ animationDelay: `${350 + i * 110}ms` }}>
            <div className="relative h-5">
              {line.chords.map(([chord, left]) => (
                <span key={chord + left} className="absolute font-mono text-sm font-bold text-blue-400" style={{ left: `${left}%` }}>
                  {chord}
                </span>
              ))}
            </div>
            <div className="mt-1 flex gap-3">
              {line.words.map((w, j) => (
                <span key={j} className="h-2.5 rounded-full bg-white/15" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
