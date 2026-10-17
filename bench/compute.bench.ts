// Speed of the code that runs on every song view, search and sync:
//   npm run bench
// Songs are made up (generic words), and the same ones are used every run.

import { readFileSync } from "node:fs";
import { bench, describe } from "vitest";
import {
  chordsInKey,
  parseSections,
  restyleSections,
  serializeSections,
  transposeChordPro,
} from "@/lib/chords";
import { importDeck } from "@/lib/import/song";
import { lyricSnippet, normalizeText, searchTokens } from "@/lib/lyric-search";
import { effectiveBody } from "@/lib/setlist-body";
import { deriveSong } from "@/lib/setlist-derive";
import { defaultSettings } from "@/lib/setlist-settings";
import { mergeRemote } from "@/lib/setlist-sync";
import { autoTransition, transitionDisplay } from "@/lib/setlist-transition";
import type { SetlistItem } from "@/lib/setlists";

let seed = 7;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const WORDS = "light love grace mercy river mountain fire water heaven earth king lord praise worship glory holy hope faith peace joy".split(" ");
const CHORDS = ["G", "C", "D", "Em", "Am", "F", "Bm", "A", "D/F#", "Cmaj7", "G/B"];
const pick = <T,>(l: T[]) => l[Math.floor(rand() * l.length)];

function song(): string {
  const out: string[] = [];
  for (let s = 0; s < 5; s++) {
    out.push(`{start_of_verse: Verse ${s + 1}}`);
    for (let l = 0; l < 6; l++) {
      const words = Array.from({ length: 7 }, () => pick(WORDS));
      out.push(words.map((w, i) => (i % 3 === 0 ? `[${pick(CHORDS)}]${w}` : w)).join(" "));
    }
    out.push("{end_of_verse}", "");
  }
  return out.join("\n");
}

const body = song();
const sections = parseSections(body);
const bodies = Array.from({ length: 25 }, song);

const item = (id: number): SetlistItem => ({
  id: `i${id}`,
  song_id: `s${id}`,
  settings: { ...defaultSettings(0), semitones: id % 12 },
  body_override: null,
  transition: { mode: "auto", chords: "" },
  song: { title: `Song ${id}`, artist: "", original_key: pick(["G", "C", "D", "Em"]), default_capo: 0, tempo: 90, body: song() },
});
const setlist = Array.from({ length: 14 }, (_, i) => item(i));
const remote = setlist.map((i, n) => (n === 5 ? { ...i, settings: { ...i.settings, capo: 2 } } : i));
const none = { pendingIds: new Set<string>(), editingId: null };

describe("a song on screen", () => {
  bench("parse a song (5 verses)", () => {
    parseSections(body);
  });
  bench("write a song back out", () => {
    serializeSections(sections);
  });
  bench("move a song to another key", () => {
    transposeChordPro(body, 2, "sharp");
  });
  bench("dress the chords as jazzy", () => {
    restyleSections(sections, "jazzy", "G");
  });
  bench("what the screen does per change: parse + move + dress", () => {
    restyleSections(parseSections(transposeChordPro(body, 2, "sharp")), "jazzy", "G");
  });
  bench("work out key, capo and spelling", () => {
    deriveSong("G", { ...defaultSettings(2), semitones: 2 });
  });
  bench("chords in a key", () => {
    chordsInKey("G");
  });
});

describe("search", () => {
  bench("turn a typed search into words", () => {
    searchTokens("Amazing grace how sweet the sound");
  });
  bench("flatten a song's text (the database does this too)", () => {
    normalizeText(body);
  });
  bench("find the matching line in 25 results", () => {
    for (const b of bodies) lyricSnippet(b, ["grace", "love"]);
  });
});

describe("a setlist of 14 songs", () => {
  bench("fold in changes from another screen (nothing changed)", () => {
    mergeRemote(setlist, setlist.map((i) => ({ ...i })), none);
  });
  bench("fold in changes from another screen (one song changed)", () => {
    mergeRemote(setlist, remote, none);
  });
  bench("suggest a transition between two songs", () => {
    autoTransition(setlist[0], setlist[1]);
  });
  bench("the bridge line, as the right-hand panel works it out", () => {
    transitionDisplay(setlist[0], setlist[1]);
  });
  bench("pick the text a song shows (own chords or the song's)", () => {
    for (const i of setlist) effectiveBody(i);
  });
});

describe("importing PowerPoint files", () => {
  for (const file of ["Alive.pptx", "The Blood.ppt", "A King is Born.ppt"]) {
    let data: Uint8Array | null = null;
    try {
      data = new Uint8Array(readFileSync(new URL(`../SamplePPTs/${file}`, import.meta.url)));
    } catch {
      // The sample files aren't in every checkout.
    }
    if (data) {
      const bytes = data;
      bench(`read ${file}`, () => {
        importDeck(file, bytes);
      });
    }
  }
});
