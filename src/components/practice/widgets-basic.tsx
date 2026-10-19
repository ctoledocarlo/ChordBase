"use client";

import { useEffect, useRef, useState } from "react";
import { QUALITIES, TRIAD_QUALITIES, chordNotes, chordSymbol, type ChordQuality } from "@/lib/theory/chords";
import { isBlack, keyName, parseNote, pretty } from "@/lib/theory/notes";
import { useSound } from "./audio";
import { Keyboard, type KeyMark } from "./keyboard";
import { ActionButton, Panel, Pills, SoundSwitch } from "./ui";

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const WHITE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];
const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** A key's name for people: white keys have one, black keys two ("C♯ / D♭"). */
function bothNames(midi: number): string {
  const sharp = keyName(midi).replace(/\d+$/, "");
  const flat = keyName(midi, true).replace(/\d+$/, "");
  return sharp === flat ? sharp : `${pretty(sharp)} / ${pretty(flat)}`;
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** Two octaves with names on the keys, to press and hear. The first thing a beginner sees. */
export function NoteNamesBoard() {
  const { sound, setSound, play } = useSound();
  const [names, setNames] = useState<"none" | "white" | "all">("white");
  const [flats, setFlats] = useState(false);
  const [last, setLast] = useState<number | null>(null);

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Show names"
          value={names}
          onChange={setNames}
          options={[
            { value: "none", label: "Hide" },
            { value: "white", label: "White keys" },
            { value: "all", label: "All keys" },
          ]}
        />
        {names === "all" && (
          <Pills
            label="Black keys"
            value={flats ? "flat" : "sharp"}
            onChange={(v) => setFlats(v === "flat")}
            options={[
              { value: "sharp", label: "Sharps ♯" },
              { value: "flat", label: "Flats ♭" },
            ]}
          />
        )}
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Keyboard
        from={48}
        to={72}
        names={names}
        flats={flats}
        ariaLabel="Keyboard with note names"
        onPress={(m) => {
          setLast(m);
          play([m]);
        }}
      />
      <p className="min-h-6 text-sm text-muted" aria-live="polite">
        {last === null ? "Press any key to hear it." : `You pressed ${bothNames(last)} (${isBlack(last) ? "a black key" : "a white key"}).`}
      </p>
    </Panel>
  );
}

/** Half steps and whole steps: move a note up and down the keys and watch what changes. */
export function StepExplorer() {
  const { sound, setSound, play } = useSound();
  const [pos, setPos] = useState(60);
  const [before, setBefore] = useState<number | null>(null);
  const [note, setNote] = useState("Press a key, or use the buttons, to move one step at a time.");

  function go(delta: number) {
    const next = pos + delta;
    if (next < 60 || next > 72) {
      setNote("That's off the end of this little keyboard. Try going the other way.");
      return;
    }
    move(next);
  }

  function move(next: number) {
    const from = pos;
    const diff = next - from;
    setBefore(from);
    setPos(next);
    play([next]);
    if (Math.abs(diff) === 1) {
      const white = !isBlack(from) && !isBlack(next);
      setNote(
        `${bothNames(from)} to ${bothNames(next)} is a half step ${diff > 0 ? "up" : "down"}.${white ? " Notice there is no black key between them: E to F and B to C are already half steps." : ""}`,
      );
    } else if (Math.abs(diff) === 2) {
      setNote(`${bothNames(from)} to ${bothNames(next)} is a whole step ${diff > 0 ? "up" : "down"}: two half steps, so one key is skipped.`);
    } else {
      setNote(`${bothNames(from)} to ${bothNames(next)} is ${Math.abs(diff)} half steps ${diff > 0 ? "up" : "down"}.`);
    }
  }

  const marks: Record<number, KeyMark> = {};
  if (before !== null && before !== pos) marks[before] = { tone: "soft" };
  marks[pos] = { tone: "root" };

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton onClick={() => go(-2)}>Whole step ↓</ActionButton>
        <ActionButton onClick={() => go(-1)}>Half step ↓</ActionButton>
        <ActionButton onClick={() => go(1)}>Half step ↑</ActionButton>
        <ActionButton onClick={() => go(2)}>Whole step ↑</ActionButton>
        <span className="ml-auto">
          <SoundSwitch sound={sound} onChange={setSound} />
        </span>
      </div>
      <Keyboard from={60} to={72} marks={marks} names="all" ariaLabel="One octave, to move along" onPress={(m) => move(m)} />
      <p className="text-sm" aria-live="polite">
        <span className="font-semibold">Now on {bothNames(pos)}. </span>
        <span className="text-muted">{note}</span>
      </p>
    </Panel>
  );
}

/** Where the five fingers of each hand go on the keys, and how to number them. */
export function HandPosition() {
  const { sound, setSound, play, sequence } = useSound();
  const [hand, setHand] = useState<"both" | "R" | "L">("both");
  const [start, setStart] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const whites = (base: number) => {
    const out: number[] = [];
    let i = WHITE_PCS.indexOf(((base % 12) + 12) % 12);
    let octave = Math.floor(base / 12);
    while (out.length < 5) {
      out.push(octave * 12 + WHITE_PCS[i]);
      i++;
      if (i === 7) {
        i = 0;
        octave++;
      }
    }
    return out;
  };

  const right = whites(60 + WHITE_PCS[start]);
  const left = whites(48 + WHITE_PCS[start]);
  const marks: Record<number, KeyMark> = {};
  if (hand !== "L") right.forEach((m, i) => (marks[m] = { tone: "note", finger: i + 1, label: keyName(m).replace(/\d+$/, "") }));
  if (hand !== "R") left.forEach((m, i) => (marks[m] = { tone: "root", finger: 5 - i, label: keyName(m).replace(/\d+$/, "") }));
  const shown = hand === "L" ? left : right;
  const fingers = hand === "L" ? [5, 4, 3, 2, 1] : [1, 2, 3, 4, 5];
  if (now !== null) marks[shown[now]] = { ...marks[shown[now]], tone: "good" };

  function playUp() {
    const order = [0, 1, 2, 3, 4, 3, 2, 1, 0];
    setPlaying(true);
    sequence(
      order.map((n, i) => ({ midis: [shown[n]], at: i * 420 })),
      (i) => setNow(order[i]),
      () => {
        setNow(null);
        setPlaying(false);
      },
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Hand"
          value={hand}
          onChange={setHand}
          options={[
            { value: "both", label: "Both" },
            { value: "R", label: "Right" },
            { value: "L", label: "Left" },
          ]}
        />
        <Pills
          label="Thumb (right) or little finger (left) starts on"
          value={start}
          onChange={setStart}
          options={WHITE_NAMES.map((n, i) => ({ value: i, label: n }))}
        />
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <Keyboard from={48} to={79} marks={marks} ariaLabel="Keyboard showing finger numbers" onPress={(m) => play([m])} />
      <p className="text-sm text-muted">
        {hand === "L"
          ? `Left hand: your little finger (5) is on ${WHITE_NAMES[start]}, your thumb (1) on ${keyName(left[4]).replace(/\d+$/, "")}.`
          : hand === "R"
            ? `Right hand: your thumb (1) is on ${WHITE_NAMES[start]}, your little finger (5) on ${keyName(right[4]).replace(/\d+$/, "")}.`
            : "Blue is the right hand and orange is the left. Each hand has one finger on each of five neighbouring white keys."}
      </p>
      {hand !== "both" && (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton primary onClick={playUp} disabled={playing || !sound}>
            ▶ Play {fingers.join("-")}…and back
          </ActionButton>
          {!sound && <span className="text-xs text-muted">Turn Sound on to hear it.</span>}
        </div>
      )}
    </Panel>
  );
}

type Level = "white" | "all";

const QUIZ_NAMES: Record<Level, string[]> = {
  white: WHITE_NAMES,
  all: ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"],
};

/** "Find the note": a name appears, press that key anywhere on the keyboard. */
export function NoteQuiz() {
  const { sound, setSound, play } = useSound();
  const [level, setLevel] = useState<Level>("white");
  const [target, setTarget] = useState("C");
  const [score, setScore] = useState({ right: 0, tries: 0, streak: 0, best: 0 });
  const [feedback, setFeedback] = useState<{ midi: number; ok: boolean; text: string } | null>(null);
  const [help, setHelp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function press(midi: number) {
    play([midi]);
    if (feedback?.ok) return;
    const wanted = parseNote(target)?.pc;
    const ok = midi % 12 === wanted;
    setScore((s) => {
      const streak = ok ? s.streak + 1 : 0;
      return { right: s.right + (ok ? 1 : 0), tries: s.tries + 1, streak, best: Math.max(s.best, streak) };
    });
    setFeedback({ midi, ok, text: ok ? "Yes!" : `That's ${bothNames(midi)}. Try again.` });
    if (ok) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setFeedback(null);
        setTarget((t) => pick(QUIZ_NAMES[level].filter((n) => n !== t)));
      }, 900);
    }
  }

  const marks: Record<number, KeyMark> = {};
  if (feedback) marks[feedback.midi] = { tone: feedback.ok ? "good" : "bad" };

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Level"
          value={level}
          onChange={(v) => {
            setLevel(v);
            setTarget(v === "white" ? "C" : "F#");
            setFeedback(null);
          }}
          options={[
            { value: "white", label: "White keys" },
            { value: "all", label: "All keys" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} />
          Show note names
        </label>
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-lg">
          Press <span className="rounded-md border border-line px-2 py-0.5 font-mono text-2xl font-bold">{pretty(target)}</span> on the keyboard
        </p>
        <p role="status" aria-live="polite" className={`text-sm font-medium ${feedback?.ok ? "text-[#16a34a]" : "text-danger"}`}>
          {feedback?.text ?? ""}
        </p>
      </div>
      <Keyboard from={48} to={72} marks={marks} names={help ? "white" : "none"} ariaLabel="Find the note" onPress={press} />
      <p className="text-sm text-muted">
        {score.right} right out of {score.tries} · streak {score.streak} · best streak {score.best}. Any {pretty(target)} counts, high or low.
      </p>
    </Panel>
  );
}

type ChordLevel = "basic" | "triads" | "sevenths";

const CHORD_LEVELS: Record<ChordLevel, { label: string; roots: string[]; kinds: ChordQuality[] }> = {
  basic: { label: "Major and minor (white-key roots)", roots: WHITE_NAMES, kinds: ["major", "minor"] },
  triads: { label: "Any root, all triads", roots: ROOTS, kinds: TRIAD_QUALITIES },
  sevenths: { label: "Seventh chords", roots: ROOTS, kinds: ["dom7", "maj7", "min7"] },
};

/** "Build the chord": a chord name appears, press the keys that make it, then check. */
export function ChordQuiz() {
  const { sound, setSound, play } = useSound();
  const [level, setLevel] = useState<ChordLevel>("basic");
  const [target, setTarget] = useState<{ root: string; quality: ChordQuality }>({ root: "C", quality: "major" });
  const [chosen, setChosen] = useState<number[]>([]);
  const [result, setResult] = useState<{ ok: boolean } | null>(null);
  const [score, setScore] = useState({ right: 0, tries: 0 });

  const answer = chordNotes(target.root, target.quality);
  const answerPcs = new Set(answer.map((n) => n.pc));

  function press(midi: number) {
    play([midi]);
    if (result) return;
    setChosen((c) => (c.includes(midi) ? c.filter((m) => m !== midi) : [...c, midi]));
  }

  function check() {
    const pcs = new Set(chosen.map((m) => m % 12));
    const ok = pcs.size === answerPcs.size && [...pcs].every((p) => answerPcs.has(p));
    setResult({ ok });
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), tries: s.tries + 1 }));
    if (ok) play(chosen, { spread: 0 });
  }

  function next(l: ChordLevel = level) {
    const set = CHORD_LEVELS[l];
    setTarget({ root: pick(set.roots), quality: pick(set.kinds) });
    setChosen([]);
    setResult(null);
  }

  const marks: Record<number, KeyMark> = {};
  for (const m of chosen) {
    marks[m] = { tone: result ? (answerPcs.has(m % 12) ? "good" : "bad") : "note" };
  }
  if (result && !result.ok) {
    // Show the keys that were missed, on the first octave they appear in.
    for (const n of answer) {
      if (!chosen.some((m) => m % 12 === n.pc)) {
        const midi = 60 + ((n.pc + 12) % 12);
        marks[midi] = { tone: "soft", label: pretty(n.name) };
      }
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Pills
          label="Level"
          value={level}
          onChange={(v) => {
            setLevel(v);
            next(v);
          }}
          options={(Object.keys(CHORD_LEVELS) as ChordLevel[]).map((v) => ({ value: v, label: CHORD_LEVELS[v].label }))}
        />
        <SoundSwitch sound={sound} onChange={setSound} />
      </div>
      <p className="text-lg">
        Build <span className="rounded-md border border-line px-2 py-0.5 text-2xl font-bold">{chordSymbol(target.root, target.quality)}</span>
        <span className="ml-2 text-sm text-muted">({QUALITIES[target.quality].label})</span>
      </p>
      <Keyboard from={60} to={83} marks={marks} ariaLabel="Build the chord" onPress={press} />
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton primary onClick={check} disabled={chosen.length === 0 || result !== null}>
          Check
        </ActionButton>
        <ActionButton onClick={() => next()}>{result ? "Next chord" : "Skip"}</ActionButton>
        <ActionButton onClick={() => setChosen([])} disabled={chosen.length === 0 || result !== null}>
          Clear
        </ActionButton>
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-sm">
        {result === null ? (
          <span className="text-muted">Press the keys, then Check. Any octave counts.</span>
        ) : result.ok ? (
          <span className="font-medium text-[#16a34a]">Correct! {chordSymbol(target.root, target.quality)} is {answer.map((n) => pretty(n.name)).join(" – ")}.</span>
        ) : (
          <span className="font-medium text-danger">
            Not quite. {chordSymbol(target.root, target.quality)} is {answer.map((n) => pretty(n.name)).join(" – ")}. {QUALITIES[target.quality].recipe}
          </span>
        )}
      </p>
      <p className="text-sm text-muted">
        {score.right} right out of {score.tries}.
      </p>
    </Panel>
  );
}
