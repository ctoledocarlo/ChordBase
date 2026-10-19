"use client";

import { useState } from "react";
import {
  INVERSION_NAMES,
  PROGRESSIONS,
  QUALITIES,
  TRIAD_QUALITIES,
  chordFingers,
  chordNotes,
  chordSymbol,
  keyChords,
  smoothVoicings,
  voicing,
  type ChordQuality,
} from "@/lib/theory/chords";
import { scaleFingering } from "@/lib/theory/fingering";
import { INTERVALS } from "@/lib/theory/intervals";
import { LETTERS, noteName, parseNote, pretty, spell } from "@/lib/theory/notes";
import { SCALES, keySignature, relativeMinor, scaleNotes, stepPattern, type ScaleType } from "@/lib/theory/scales";
import { useSound } from "./audio";
import { Keyboard, type KeyMark } from "./keyboard";
import { ActionButton, Chips, Control, Panel, Pills, SoundSwitch, type Chip } from "./ui";

const MAJOR_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
const MINOR_TYPES: ScaleType[] = ["natural-minor", "harmonic-minor", "melodic-minor", "minor-pentatonic", "blues"];

const mod = (n: number, m: number) => ((n % m) + m) % m;
/** Where a note with this pitch class sits at or just above `base` (so every key lands in the same part of the keyboard). */
const nearAbove = (pc: number, base: number) => base + mod(pc - base, 12);

const rootOptions = (list: string[]) => list.map((r) => ({ value: r, label: pretty(r) }));

/** The same note from another list of names (Db becomes C♯ in a list that has no Db). */
function sameNote(name: string, list: string[]): string {
  const pc = parseNote(name)?.pc;
  return list.find((r) => parseNote(r)?.pc === pc) ?? list[0];
}

// ---------------------------------------------------------------------------------------------------------------

/** Any scale in any key: its notes, the pattern of steps, the key signature and, for the main ones, the fingering. */
export function ScaleExplorer({
  types = ["major", "natural-minor", "harmonic-minor", "melodic-minor", "major-pentatonic", "minor-pentatonic", "blues"],
  initialRoot = "C",
  initialType,
}: {
  types?: ScaleType[];
  initialRoot?: string;
  initialType?: ScaleType;
}) {
  const { sound, setSound, play, sequence } = useSound();
  const [type, setType] = useState<ScaleType>(initialType ?? types[0]);
  const [rootName, setRootName] = useState(initialRoot);
  const [hand, setHand] = useState<"none" | "R" | "L">("R");
  const [labels, setLabels] = useState<"names" | "numbers">("names");
  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const roots = MINOR_TYPES.includes(type) ? MINOR_ROOTS : MAJOR_ROOTS;
  const root = sameNote(rootName, roots);
  const notes = scaleNotes(root, type);
  const pc = parseNote(root)!.pc;
  const base = (hand === "L" ? 48 : 60) + pc;
  const from = hand === "L" ? 48 : 60;
  const to = from + 24;
  const midis = [...notes.map((n) => base + n.step), base + 12];
  const names = [...notes.map((n) => n.name), notes[0].name];
  const degrees = [...notes.map((n) => n.degree), "1"];
  const fingers = hand === "none" ? null : scaleFingering(root, type, hand);

  const marks: Record<number, KeyMark> = {};
  const inScale = new Set(notes.map((n) => n.pc));
  for (let m = from; m <= to; m++) if (inScale.has(mod(m, 12))) marks[m] = { tone: "soft" };
  midis.forEach((m, i) => {
    marks[m] = {
      tone: now === i ? "good" : i === 0 || i === midis.length - 1 ? "root" : "note",
      label: labels === "names" ? names[i] : degrees[i],
      finger: fingers?.[i],
    };
  });

  const chips: Chip[] = midis.map((_, i) => ({
    top: degrees[i],
    main: pretty(names[i]),
    bottom: fingers ? `finger ${fingers[i]}` : "",
    tone: now === i ? "now" : i === 0 || i === midis.length - 1 ? "root" : "note",
  }));

  const pattern = notes.length === 7 ? stepPattern(type) : null;
  const sig = type === "major" ? keySignature(root, "major") : type === "natural-minor" ? keySignature(root, "minor") : null;

  function playScale() {
    setPlaying(true);
    sequence(
      midis.map((m, i) => ({ midis: [m], at: i * 380 })),
      setNow,
      () => {
        setNow(null);
        setPlaying(false);
      },
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {types.length > 1 && (
          <Control label="Kind of scale">
            <select
              className="field field-sm !w-auto"
              aria-label="Kind of scale"
              value={type}
              onChange={(e) => {
                setType(e.target.value as ScaleType);
                setNow(null);
              }}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {SCALES[t].label}
                </option>
              ))}
            </select>
          </Control>
        )}
        <Pills
          label="Hand"
          value={hand}
          onChange={setHand}
          options={[
            { value: "R", label: "Right" },
            { value: "L", label: "Left" },
            { value: "none", label: "No fingers" },
          ]}
        />
        <Pills
          label="Label keys with"
          value={labels}
          onChange={setLabels}
          options={[
            { value: "names", label: "Note names" },
            { value: "numbers", label: "Scale numbers" },
          ]}
        />
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Pills label="Starting note" value={root} onChange={(r) => setRootName(r)} options={rootOptions(roots)} />

      <Keyboard from={from} to={to} marks={marks} ariaLabel={`${pretty(root)} ${SCALES[type].label} scale`} onPress={(m) => play([m])} />

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton primary onClick={playScale} disabled={playing || !sound}>
          ▶ Play the scale
        </ActionButton>
        {!sound && <span className="text-xs text-muted">Turn Sound on to hear it.</span>}
      </div>

      <Chips items={chips} />

      <div className="space-y-2 text-sm">
        <p>
          <span className="font-semibold">
            {pretty(root)} {SCALES[type].label.toLowerCase()}:
          </span>{" "}
          <span className="text-muted">{SCALES[type].blurb}</span>
        </p>
        {pattern && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted">Steps:</span>
            {pattern.map((s, i) => (
              <span key={i} className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${s === "H" ? "bg-[#ea580c]/15 text-[#c2410c] dark:text-[#fdba74]" : "bg-hover"}`}>
                {s}
              </span>
            ))}
            <span className="text-xs text-muted">(W = whole step, H = half step)</span>
          </p>
        )}
        {sig && (
          <p>
            <span className="text-muted">Key signature: </span>
            {sig.count === 0
              ? "no sharps or flats (all white keys)."
              : `${sig.count} ${sig.sharps.length ? (sig.count === 1 ? "sharp" : "sharps") : sig.count === 1 ? "flat" : "flats"}: ${(sig.sharps.length ? sig.sharps : sig.flats).map((l) => pretty(l + (sig.sharps.length ? "#" : "b"))).join(" ")}.`}
          </p>
        )}
        {type === "major" && (
          <p className="text-muted">
            Its relative minor is {pretty(relativeMinor(root))} minor: the same notes, starting on the 6th note.
          </p>
        )}
        {type === "natural-minor" && (
          <p className="text-muted">Its relative major is {pretty(notes[2].name)} major: the same notes, starting on the 3rd note.</p>
        )}
        {hand !== "none" &&
          (fingers ? (
            <p>
              <span className="text-muted">{hand === "R" ? "Right" : "Left"} hand fingering, going up: </span>
              <span className="font-mono font-semibold">{fingers.join(" ")}</span>
            </p>
          ) : (
            <p className="text-muted">
              There isn&apos;t one standard fingering for this scale here. Keep your thumb off the black keys when you can, and tuck it under after your 3rd finger so the hand keeps moving.
            </p>
          ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------------

const CIRCLE_MAJORS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const CIRCLE_MAJOR_LABELS = ["C", "G", "D", "A", "E", "B", "F♯/G♭", "D♭", "A♭", "E♭", "B♭", "F"];
const CIRCLE_MINOR_LABELS = ["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm"];

function polar(r: number, degrees: number): [number, number] {
  const a = (degrees * Math.PI) / 180;
  return [160 + r * Math.cos(a), 160 + r * Math.sin(a)];
}

/** One slice of a ring, centred `index` steps clockwise from the top. */
function slice(index: number, inner: number, outer: number): string {
  const start = -90 + index * 30 - 15;
  const [x0, y0] = polar(outer, start);
  const [x1, y1] = polar(outer, start + 30);
  const [x2, y2] = polar(inner, start + 30);
  const [x3, y3] = polar(inner, start);
  return `M${x0} ${y0} A${outer} ${outer} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 0 0 ${x3} ${y3}Z`;
}

/** The circle of fifths: pick a key to see its sharps or flats, its notes, its main chords and its neighbours. */
export function CircleOfFifths() {
  const { sound, setSound, play, sequence } = useSound();
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const root = CIRCLE_MAJORS[index];
  const notes = scaleNotes(root, "major");
  const sig = keySignature(root, "major");
  const chords = keyChords(root, "major");
  const base = 60 + parseNote(root)!.pc;
  const midis = [...notes.map((n) => base + n.step), base + 12];

  const marks: Record<number, KeyMark> = {};
  midis.forEach((m, i) => {
    marks[m] = { tone: now === i ? "good" : i === 0 || i === 7 ? "root" : "note", label: [...notes.map((n) => n.name), notes[0].name][i] };
  });

  function playScale() {
    setPlaying(true);
    sequence(
      midis.map((m, i) => ({ midis: [m], at: i * 360 })),
      setNow,
      () => {
        setNow(null);
        setPlaying(false);
      },
    );
  }

  const left = mod(index - 1, 12);
  const right = mod(index + 1, 12);

  return (
    <Panel>
      <div className="grid gap-5 md:grid-cols-[minmax(0,20rem)_1fr] md:items-center">
        <svg viewBox="0 0 320 320" role="group" aria-label="Circle of fifths. Choose a key." className="mx-auto w-full max-w-[20rem] select-none">
          {CIRCLE_MAJORS.map((_, i) => {
            const selected = i === index;
            const neighbour = i === left || i === right;
            const [mx, my] = polar(127, -90 + i * 30);
            const [nx, ny] = polar(83, -90 + i * 30);
            return (
              <g key={i}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${CIRCLE_MAJOR_LABELS[i]} major`}
                  className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[var(--accent)] [&:focus-visible>path]:stroke-[3]"
                  onClick={() => {
                    setIndex(i);
                    setNow(null);
                    play([60 + parseNote(CIRCLE_MAJORS[i])!.pc]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setIndex(i);
                      setNow(null);
                    }
                  }}
                >
                  <path d={slice(i, 100, 150)} fill={selected ? "var(--accent)" : neighbour ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--surface)"} stroke="var(--line)" strokeWidth={1.5} />
                  <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={CIRCLE_MAJOR_LABELS[i].length > 2 ? 12 : 17} fontWeight={700} fill={selected ? "var(--background)" : "var(--foreground)"}>
                    {CIRCLE_MAJOR_LABELS[i]}
                  </text>
                </g>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`${CIRCLE_MINOR_LABELS[i]} (relative minor of ${CIRCLE_MAJOR_LABELS[i]})`}
                  className="cursor-pointer outline-none"
                  onClick={() => {
                    setIndex(i);
                    setNow(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setIndex(i);
                    }
                  }}
                >
                  <path d={slice(i, 58, 100)} fill={selected ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--hover)"} stroke="var(--line)" strokeWidth={1.5} />
                  <text x={nx} y={ny} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600} fill="var(--foreground)">
                    {CIRCLE_MINOR_LABELS[i]}
                  </text>
                </g>
              </g>
            );
          })}
          <circle cx={160} cy={160} r={56} fill="var(--background)" stroke="var(--line)" strokeWidth={1.5} />
          <text x={160} y={150} textAnchor="middle" fontSize={26} fontWeight={700} fill="var(--foreground)">
            {sig.count}
          </text>
          <text x={160} y={174} textAnchor="middle" fontSize={12} fill="var(--muted)">
            {sig.count === 0 ? "no ♯ or ♭" : sig.sharps.length ? (sig.count === 1 ? "sharp" : "sharps") : sig.count === 1 ? "flat" : "flats"}
          </text>
        </svg>

        <div className="space-y-3 text-sm">
          <p className="text-lg font-semibold">{pretty(root)} major</p>
          <p>
            <span className="text-muted">Sharps or flats: </span>
            {sig.count === 0 ? "none" : (sig.sharps.length ? sig.sharps : sig.flats).map((l) => pretty(l + (sig.sharps.length ? "#" : "b"))).join("  ")}
          </p>
          <p>
            <span className="text-muted">Notes: </span>
            <span className="font-mono font-semibold">{notes.map((n) => pretty(n.name)).join("  ")}</span>
          </p>
          <p>
            <span className="text-muted">The big three (I, IV, V): </span>
            <span className="font-semibold">
              {pretty(chords[0].root)}, {pretty(chords[3].root)}, {pretty(chords[4].root)}
            </span>
          </p>
          <p>
            <span className="text-muted">Relative minor: </span>
            <span className="font-semibold">{pretty(relativeMinor(root))}m</span>
          </p>
          <p className="text-muted">
            Next door are {pretty(chords[3].root)} (counter-clockwise, one fewer sharp or one more flat) and {pretty(chords[4].root)} (clockwise, one more sharp or one fewer flat). They share all but one note with {pretty(root)}.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton primary onClick={playScale} disabled={playing || !sound}>
              ▶ Play the scale
            </ActionButton>
            <SoundSwitch sound={sound} onChange={setSound} />
          </div>
        </div>
      </div>
      <Keyboard from={60} to={84} marks={marks} ariaLabel={`${pretty(root)} major scale`} onPress={(m) => play([m])} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** Two notes and the distance between them: count the half steps, hear them apart and together. */
export function IntervalExplorer() {
  const { sound, setSound, play, sequence } = useSound();
  const [rootName, setRootName] = useState("C");
  const [semis, setSemis] = useState(4);
  const [count, setCount] = useState(true);

  const interval = INTERVALS.find((i) => i.semis === semis)!;
  const start = parseNote(rootName)!;
  const low = 60 + start.pc;
  const high = low + semis;
  const top = spell(LETTERS.indexOf(start.letter) + interval.letters, start.pc + semis);

  const marks: Record<number, KeyMark> = {};
  if (count) for (let m = low + 1; m < high; m++) marks[m] = { tone: "soft", label: String(m - low) };
  marks[low] = { tone: "root", label: rootName };
  marks[high] = { tone: "note", label: count ? String(semis) : noteName(top) };

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={count} onChange={(e) => setCount(e.target.checked)} />
          Count the half steps
        </label>
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Pills label="Bottom note" value={rootName} onChange={setRootName} options={rootOptions(MAJOR_ROOTS)} />
      <Pills
        label="Distance (in half steps)"
        value={semis}
        onChange={setSemis}
        options={INTERVALS.filter((i) => i.semis > 0).map((i) => ({ value: i.semis, label: i.short, title: i.name }))}
      />
      <Keyboard from={60} to={84} marks={marks} ariaLabel="Two notes and the distance between them" onPress={(m) => play([m])} />
      <div className="flex flex-wrap gap-2">
        <ActionButton primary onClick={() => play([low, high])} disabled={!sound}>
          ▶ Together
        </ActionButton>
        <ActionButton onClick={() => sequence([{ midis: [low], at: 0 }, { midis: [high], at: 650 }])} disabled={!sound}>
          ▶ One, then the other
        </ActionButton>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-semibold">
            {pretty(rootName)} up to {pretty(noteName(top))}: a {interval.name} ({interval.short}).
          </span>{" "}
          <span className="text-muted">
            {semis} half step{semis === 1 ? "" : "s"}, and the letters are {interval.letters + 1} apart counting both ({rootName[0]} … {top.letter}).
          </span>
        </p>
        <p className="text-muted">{interval.feel}</p>
        {interval.tune && <p className="text-muted">Hear it in: {interval.tune}</p>}
      </div>
      <details className="rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">All the intervals at a glance</summary>
        <table className="mt-3 w-full text-left">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Name</th>
              <th className="py-1 pr-3 font-medium">Half steps</th>
              <th className="py-1 font-medium">Sounds like</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">
            {INTERVALS.filter((i) => i.semis > 0).map((i) => (
              <tr key={i.semis}>
                <td className="py-1.5 pr-3 font-medium">
                  {i.name} <span className="font-mono text-xs text-muted">{i.short}</span>
                </td>
                <td className="py-1.5 pr-3 tabular-nums">{i.semis}</td>
                <td className="py-1.5 text-muted">{i.feel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** Pick any chord, see its keys with finger numbers, and hear it as a block or one note at a time. */
export function ChordBuilder({
  kinds = TRIAD_QUALITIES,
  initialRoot = "C",
  initialQuality = "major",
}: {
  kinds?: ChordQuality[];
  initialRoot?: string;
  initialQuality?: ChordQuality;
}) {
  const { sound, setSound, play } = useSound();
  const [root, setRoot] = useState(initialRoot);
  const [quality, setQuality] = useState<ChordQuality>(kinds.includes(initialQuality) ? initialQuality : kinds[0]);
  const [inversion, setInversion] = useState(0);
  const [hand, setHand] = useState<"R" | "L">("R");
  const [labels, setLabels] = useState<"names" | "numbers">("names");

  const notes = chordNotes(root, quality);
  const inv = Math.min(inversion, notes.length - 1);
  const pc = parseNote(root)!.pc;
  const rootMidi = hand === "R" ? nearAbove(pc, 55) : nearAbove(pc, 43);
  const v = voicing(root, quality, inv, rootMidi);
  const fingers = chordFingers(v.midis.length, inv, hand);
  const from = hand === "R" ? 48 : 36;

  const marks: Record<number, KeyMark> = {};
  v.midis.forEach((m, i) => {
    marks[m] = { tone: v.roles[i] === "1" ? "root" : "note", label: labels === "names" ? v.names[i] : v.roles[i], finger: fingers[i] };
  });

  const def = QUALITIES[quality];

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Hand"
          value={hand}
          onChange={setHand}
          options={[
            { value: "R", label: "Right" },
            { value: "L", label: "Left" },
          ]}
        />
        <Pills
          label="Label keys with"
          value={labels}
          onChange={setLabels}
          options={[
            { value: "names", label: "Note names" },
            { value: "numbers", label: "Chord numbers" },
          ]}
        />
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Pills label="Root (the note it is named after)" value={root} onChange={setRoot} options={rootOptions(MAJOR_ROOTS)} />
      {kinds.length > 1 && (
        <Pills
          label="Kind of chord"
          value={quality}
          onChange={(q) => setQuality(q)}
          options={kinds.map((q) => ({ value: q, label: QUALITIES[q].label.replace(/ \(.*\)/, ""), title: QUALITIES[q].label }))}
        />
      )}
      <Pills
        label="Order of the notes"
        value={inv}
        onChange={setInversion}
        options={notes.map((_, i) => ({ value: i, label: i === 0 ? "Root position" : INVERSION_NAMES[i].replace(" inversion", " inv."), title: INVERSION_NAMES[i] }))}
      />

      <Keyboard from={from} to={from + 36} marks={marks} ariaLabel={`${chordSymbol(root, quality)} chord`} onPress={(m) => play([m])} />

      <div className="flex flex-wrap gap-2">
        <ActionButton primary onClick={() => play(v.midis)} disabled={!sound}>
          ▶ Play the chord
        </ActionButton>
        <ActionButton onClick={() => play(v.midis, { spread: 0.28, seconds: 2.2 })} disabled={!sound}>
          ▶ One note at a time
        </ActionButton>
      </div>

      <div className="space-y-2 text-sm">
        <p>
          <span className="mr-2 text-2xl font-bold">{chordSymbol(root, quality)}</span>
          <span className="font-mono text-base font-semibold">{notes.map((n) => pretty(n.name)).join(" – ")}</span>
          <span className="ml-2 text-muted">({def.formula})</span>
        </p>
        <p>
          <span className="font-semibold">{def.label}.</span> <span className="text-muted">{def.blurb}</span>
        </p>
        <p className="text-muted">Recipe: {def.recipe}</p>
        <p className="text-muted">
          {hand === "R" ? "Right" : "Left"} hand fingers, lowest key first: <span className="font-mono font-semibold text-foreground">{fingers.join(" ")}</span>.
          {inv > 0 && ` ${INVERSION_NAMES[inv]}: the same notes, with the lowest ${inv === 1 ? "one" : inv === 2 ? "two" : "three"} moved up an octave.`}
        </p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** The same chord three ways, side by side, to show that an inversion is only the same notes in a different order. */
export function InversionsDemo({ initialRoot = "C" }: { initialRoot?: string }) {
  const { sound, setSound, play } = useSound();
  const [root, setRoot] = useState(initialRoot);
  const [quality, setQuality] = useState<ChordQuality>("major");
  const pc = parseNote(root)!.pc;
  const rootMidi = nearAbove(pc, 55);

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Kind"
          value={quality}
          onChange={setQuality}
          options={[
            { value: "major", label: "Major" },
            { value: "minor", label: "Minor" },
          ]}
        />
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Pills label="Chord" value={root} onChange={setRoot} options={rootOptions(MAJOR_ROOTS)} />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((inv) => {
          const v = voicing(root, quality, inv, rootMidi);
          const fingers = chordFingers(3, inv, "R");
          const marks: Record<number, KeyMark> = {};
          v.midis.forEach((m, i) => {
            marks[m] = { tone: v.roles[i] === "1" ? "root" : "note", label: v.names[i], finger: fingers[i] };
          });
          return (
            <div key={inv} className="space-y-2">
              <p className="text-sm">
                <span className="font-semibold">{INVERSION_NAMES[inv]}</span>
                <span className="block text-xs text-muted">
                  {v.names.map((n) => pretty(n)).join(" – ")} · lowest note {pretty(v.names[0])}
                </span>
              </p>
              <Keyboard from={55} to={83} marks={marks} minKeyWidth={11} ariaLabel={`${chordSymbol(root, quality)}, ${INVERSION_NAMES[inv]}`} onPress={(m) => play([m])} />
              <ActionButton onClick={() => play(v.midis)} disabled={!sound}>
                ▶ Play
              </ActionButton>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        Same three notes every time. What changes is which one is on the bottom, and which one is on top: that decides how the chord sounds, and how far your hand has to travel to the next one.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------------------

const SPEEDS = [
  { value: 1800, label: "Slow" },
  { value: 1200, label: "Medium" },
  { value: 800, label: "Quick" },
];

/** The seven chords of a key, and common progressions you can hear and watch, with hand movement kept small. */
export function KeyChordsLab({ initialRoot = "C", initialMode = "major" }: { initialRoot?: string; initialMode?: "major" | "minor" }) {
  const { sound, setSound, play, sequence, stop } = useSound();
  const [mode, setMode] = useState<"major" | "minor">(initialMode);
  const [rootName, setRootName] = useState(initialRoot);
  const [selected, setSelected] = useState(0);
  const [progression, setProgression] = useState(0);
  const [smooth, setSmooth] = useState(true);
  const [speed, setSpeed] = useState(1200);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const roots = mode === "major" ? MAJOR_ROOTS : MINOR_ROOTS;
  const root = sameNote(rootName, roots);
  const chords = keyChords(root, mode);
  const options = PROGRESSIONS.filter((p) => p.mode === mode);
  const chosen = options[Math.min(progression, options.length - 1)];
  const sequenceChords = chosen.degrees.map((d) => chords[d]);
  const voicings = smooth
    ? smoothVoicings(sequenceChords)
    : sequenceChords.map((c) => ({ ...voicing(c.root, c.quality, 0, nearAbove(parseNote(c.root)!.pc, 55)), inversion: 0 }));

  // What the keyboard shows: the chord being played in the progression, or the one last chosen.
  const single = chords[selected];
  const singleVoicing = voicing(single.root, single.quality, 0, nearAbove(parseNote(single.root)!.pc, 55));
  const shown = step !== null ? voicings[step] : singleVoicing;
  const fingers = chordFingers(shown.midis.length, step !== null ? voicings[step].inversion : 0, "R");
  const marks: Record<number, KeyMark> = {};
  shown.midis.forEach((m, i) => {
    marks[m] = { tone: shown.roles[i] === "1" ? "root" : "note", label: shown.names[i], finger: fingers[i] };
  });

  function playProgression() {
    setPlaying(true);
    sequence(
      voicings.map((v, i) => ({ midis: v.midis, at: i * speed, seconds: (speed / 1000) * 1.3 })),
      setStep,
      () => {
        setStep(null);
        setPlaying(false);
      },
    );
  }

  function changeMode(next: "major" | "minor") {
    stop();
    setStep(null);
    setPlaying(false);
    setMode(next);
    setRootName(sameNote(root, next === "major" ? MAJOR_ROOTS : MINOR_ROOTS));
    setSelected(0);
    setProgression(0);
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Key type"
          value={mode}
          onChange={changeMode}
          options={[
            { value: "major", label: "Major" },
            { value: "minor", label: "Minor" },
          ]}
        />
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Pills label="Key" value={root} onChange={(r) => setRootName(r)} options={rootOptions(roots)} />

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">The chords in {pretty(root)} {mode} (press one)</p>
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {chords.map((c, i) => (
            <li key={c.numeral}>
              <button
                type="button"
                aria-pressed={step === null && i === selected}
                onClick={() => {
                  stop();
                  setStep(null);
                  setPlaying(false);
                  setSelected(i);
                  play(voicing(c.root, c.quality, 0, nearAbove(parseNote(c.root)!.pc, 55)).midis);
                }}
                className={`btn w-full flex-col gap-0 py-1.5 ${step === null && i === selected ? "btn-primary" : ""}`}
              >
                <span className="text-[0.6875rem] opacity-75">{c.numeral}</span>
                <span className="text-base font-semibold">{chordSymbol(c.root, c.quality)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-foreground">{single.numeral}:</span> {single.function}
        </p>
      </div>

      <Keyboard from={48} to={84} marks={marks} ariaLabel="The chord being played" onPress={(m) => play([m])} />

      <div className="space-y-3 border-t border-line pt-4">
        <Pills
          label="A progression to try"
          value={Math.min(progression, options.length - 1)}
          onChange={(i) => {
            stop();
            setStep(null);
            setPlaying(false);
            setProgression(i);
          }}
          options={options.map((p, i) => ({ value: i, label: p.name }))}
        />
        <p className="text-sm text-muted">{chosen.feel}</p>
        <ol className="flex flex-wrap gap-1.5">
          {sequenceChords.map((c, i) => (
            <li
              key={i}
              className={`flex min-w-14 flex-col items-center rounded-md border px-2 py-1 text-center ${step === i ? "border-[#16a34a] bg-[#16a34a]/15" : "border-line"}`}
            >
              <span className="text-[0.625rem] text-muted">{c.numeral}</span>
              <span className="text-base font-semibold">{chordSymbol(c.root, c.quality)}</span>
              <span className="h-3 text-[0.625rem] text-muted">{smooth && voicings[i].inversion > 0 ? INVERSION_NAMES[voicings[i].inversion].replace(" inversion", " inv.") : ""}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <ActionButton primary onClick={playProgression} disabled={playing || !sound}>
            ▶ Play it
          </ActionButton>
          <Pills label="Speed" value={speed} onChange={setSpeed} options={SPEEDS} />
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
            Keep my hand still (use inversions)
          </label>
        </div>
        {!sound && <p className="text-xs text-muted">Turn Sound on to hear it.</p>}
      </div>
    </Panel>
  );
}
