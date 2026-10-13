import { autoColumnCount, balanceColumns, chordsOf, serializeSections, type EditorSection } from "@/lib/chords";
import { normalize, parseChart, UNNAMED, type ParsedChart } from "./chart";
import { readDeck } from "./deck";
import { detectKey } from "./key";
import { readingLines } from "./layout";

/** One way the song is written in the file. A file with several near-identical slides has several. */
export interface ImportVersion {
  /** For the person choosing, e.g. "Slide 2" or "Slides 1 to 3". */
  label: string;
  slides: number[];
  sections: EditorSection[];
  /** The song text the app stores, with the layout included. */
  body: string;
  key: string;
  keySource: "written" | "guessed" | "none";
  tempo: number | null;
  capo: number;
  chordCount: number;
}

export interface ImportedSong {
  fileName: string;
  title: string;
  artist: string;
  timeSignature: string;
  versions: ImportVersion[];
  /** Things the person should look at before importing. */
  warnings: string[];
}

interface SlideChart {
  slide: number;
  chart: ParsedChart;
}

/** A file name made readable: no extension, underscores as spaces, no "(1)" copy marks. */
export function stemOf(fileName: string): string {
  return fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.[^.]*$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const lyricKeys = (charts: ParsedChart[]) =>
  new Set(
    charts
      .flatMap((c) => c.sections)
      .flatMap((s) => s.lines)
      .map((l) => normalize(l.text))
      .filter((t) => t.length > 0),
  );

/** True when a slide carries (nearly) the same words as a song already seen: another version, not more of the song. */
function isVariant(chart: ParsedChart, earlier: ParsedChart[]): boolean {
  const mine = lyricKeys([chart]);
  const theirs = lyricKeys(earlier);
  if (mine.size < 6 || theirs.size < 6) return false;
  let shared = 0;
  for (const line of mine) if (theirs.has(line)) shared++;
  return shared / Math.min(mine.size, theirs.size) >= 0.7;
}

const kindOf = (label: string) => normalize(label.replace(/\d+|\(.*?\)/g, ""));

/** Drops a section whose words were already written out earlier (a chorus slide that repeats). */
function dropRepeats(sections: EditorSection[]): EditorSection[] {
  const seen: { text: string; kind: string }[] = [];
  const kept: EditorSection[] = [];
  for (const s of sections) {
    const text = normalize(s.lines.map((l) => l.text).join(""));
    const kind = kindOf(s.label);
    const repeat = text.length > 0 && seen.some((o) => o.text === text && (o.kind === kind || o.kind === normalize(UNNAMED) || kind === normalize(UNNAMED)));
    if (repeat) continue;
    seen.push({ text, kind });
    kept.push(s);
  }
  return kept;
}

function buildVersion(slideCharts: SlideChart[], label: string): ImportVersion {
  const charts = slideCharts.map((s) => s.chart);
  const merged = dropRepeats(
    charts.flatMap((c) =>
      c.sections.map((s, i) => ({ id: "", label: s.label, column: 0, lines: s.lines, _n: i }) as EditorSection),
    ),
  ).map((s, i) => ({ id: `s${i + 1}`, label: s.label, column: 0, lines: s.lines }));
  const sections = balanceColumns(merged, autoColumnCount(merged));

  const written = charts.find((c) => c.key)?.key;
  const guess = written ? null : detectKey(chordsOf(sections));
  return {
    label,
    slides: slideCharts.map((s) => s.slide),
    sections,
    body: serializeSections(sections),
    key: written ?? guess?.key ?? "",
    keySource: written ? "written" : guess ? "guessed" : "none",
    tempo: charts.find((c) => c.tempo)?.tempo ?? null,
    capo: charts.find((c) => c.capo !== undefined)?.capo ?? 0,
    chordCount: chordsOf(sections).length,
  };
}

const slideLabel = (slides: number[]) =>
  slides.length === 1 ? `Slide ${slides[0]}` : `Slides ${slides[0]} to ${slides[slides.length - 1]}`;

/**
 * Reads a PowerPoint file into songs. Usually that is one song; a file with
 * several songs gives several, and a song written out more than once on
 * different slides gives one song with several versions to choose from.
 */
export function importDeck(fileName: string, data: Uint8Array): ImportedSong[] {
  const deck = readDeck(data);
  const stem = stemOf(fileName);

  // Read every slide, passing the title on so later slides can recognise it.
  const slideCharts: SlideChart[] = [];
  let knownTitle: string | undefined;
  for (const slide of deck.slides) {
    const chart = parseChart(readingLines(slide), { fileStem: slideCharts.length === 0 ? stem : undefined, knownTitle });
    if (chart.title) knownTitle = chart.title;
    slideCharts.push({ slide: slide.number, chart });
  }

  // A new title starts a new song; slides without one carry on the song before.
  const groups: { title?: string; artist?: string; slides: SlideChart[] }[] = [];
  for (const sc of slideCharts) {
    const last = groups[groups.length - 1];
    const title = sc.chart.title;
    if (!last || (title && last.title && normalize(title) !== normalize(last.title))) {
      groups.push({ title, artist: sc.chart.artist, slides: [sc] });
    } else {
      last.title ??= title;
      last.artist ??= sc.chart.artist;
      last.slides.push(sc);
    }
  }

  const songs: ImportedSong[] = [];
  for (const group of groups) {
    // Split into versions: a slide that repeats the song so far starts another version.
    const versions: SlideChart[][] = [];
    for (const sc of group.slides) {
      if (versions.length === 0) versions.push([sc]);
      else if (isVariant(sc.chart, versions[0].map((v) => v.chart))) versions.push([sc]);
      else versions[versions.length - 1].push(sc);
    }

    const built = versions
      .map((v) => buildVersion(v, slideLabel(v.map((s) => s.slide))))
      .filter((v) => v.sections.length > 0);
    if (built.length === 0) continue;

    const warnings: string[] = [];
    const title = group.title ?? stem;
    if (!group.title) warnings.push("No title was found on the slides, so the file name is used.");
    if (built.length > 1) {
      warnings.push(`This file has ${built.length} versions of the song (${built.map((v) => v.label).join(", ")}). The first is selected.`);
    }
    const first = built[0];
    const notes = [...new Set(group.slides.flatMap((s) => s.chart.notes))];
    for (const note of notes.slice(0, 3)) {
      warnings.push(`A note on the slide was not imported: ${note}`);
    }
    if (first.chordCount === 0) warnings.push("No chords were found. It will be imported as lyrics only.");
    if (first.keySource === "guessed") warnings.push(`The key (${first.key}) was guessed from the chords. Check it.`);
    const unnamed = first.sections.filter((s) => s.label === UNNAMED).length;
    if (unnamed > 0) {
      warnings.push(`${unnamed} ${unnamed === 1 ? "section has" : "sections have"} no name on the slide.`);
    }

    songs.push({
      fileName,
      title,
      artist: group.artist ?? "",
      timeSignature: group.slides.map((s) => s.chart.timeSignature).find(Boolean) ?? "4/4",
      versions: built,
      warnings,
    });
  }
  return songs;
}
