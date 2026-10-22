import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChordSheetArt } from "@/components/chord-sheet-art";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "ChordBase · Lyrics and chords for your church",
  description:
    "Lyrics and chords for your church, in any key. Search by lyrics, plan setlists, and run the service live across Stage, Media and Viewer screens.",
};

const FEATURES = [
  { chord: "G", title: "Any key, one tap", text: "Move a song up or down and every chord follows. Add a capo and the shapes to play are worked out for you." },
  { chord: "Am", title: "Easy to write", text: "Type chords straight onto the words and drag song sections around. No code, no special format." },
  { chord: "D/F#", title: "Bring your slides", text: "Import songs from PowerPoint files. Chords, sections and keys are read for you, hundreds at a time." },
  { chord: "Cmaj7", title: "Chords in the key", text: "Every chord that belongs to the key sits beside the song, with the ones the song uses marked." },
  { chord: "Em7", title: "Live key changes", text: "Singer needs it a step higher? Change the key from the live screen and everyone follows." },
  { chord: "F", title: "Tidy by itself", text: "Setlists keep for a month by default, up to a year, then clear themselves. Your songs always stay." },
] as const;

/** A card or panel in the dark style used across this page. */
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-white/[0.04] ${className}`}>{children}</div>;
}

function Section({ eyebrow, title, text, children, flip = false }: { eyebrow: string; title: string; text: ReactNode; children: ReactNode; flip?: boolean }) {
  return (
    <section className="reveal mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-20 lg:grid-cols-2 lg:gap-14 lg:pb-28">
      <div className={flip ? "lg:order-2" : ""}>
        <p className="text-sm font-medium text-blue-400">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        <div className="mt-5 max-w-lg space-y-3 text-lg leading-relaxed text-zinc-400">{text}</div>
      </div>
      <div className={flip ? "lg:order-1" : ""}>{children}</div>
    </section>
  );
}

const Bar = ({ w, strong = false }: { w: number; strong?: boolean }) => (
  <span className={`block h-2.5 rounded-full ${strong ? "bg-white/25" : "bg-white/12"}`} style={{ width: `${w}%` }} />
);

const Chip = ({ children, on = false }: { children: ReactNode; on?: boolean }) => (
  <span
    className={`rounded-md border px-2.5 py-1 font-mono text-xs ${
      on ? "border-blue-400 bg-blue-400/15 font-bold text-blue-300" : "border-white/10 text-zinc-400"
    }`}
  >
    {children}
  </span>
);

export default function WelcomePage() {
  return (
    <div className="relative flex-1 overflow-hidden bg-[#0c0c0e] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70rem_40rem_at_10%_-5%,rgba(96,165,250,0.20),transparent_60%),radial-gradient(50rem_35rem_at_100%_30%,rgba(129,140,248,0.12),transparent_60%),radial-gradient(50rem_30rem_at_0%_100%,rgba(96,165,250,0.10),transparent_60%)]"
      />

      <header className="page-enter relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Logo size={30} className="text-lg" />
        <Link
          href="/login"
          className="rounded-md border border-white/20 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-white/10"
        >
          Log in
        </Link>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-24 pt-12 lg:grid-cols-2 lg:pb-32 lg:pt-20">
          <div>
            <p className="anim-rise inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
              For church worship teams
            </p>
            <h1 className="anim-rise mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Lyrics and chords, in <span className="text-blue-400">any key</span>.
            </h1>
            <p className="anim-rise mt-6 max-w-xl text-lg leading-relaxed text-zinc-400" style={{ animationDelay: "90ms" }}>
              Keep every song your church plays in one place. Find it by a line you remember, change the key for your
              singer, plan Sunday&apos;s setlist, and run the whole service live across every screen.
            </p>
            <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "180ms" }}>
              <Link
                href="/login?as=church&mode=signup"
                className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                Register your church
              </Link>
              <Link
                href="/login?mode=signup"
                className="rounded-md border border-white/20 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Join as a team member
              </Link>
              <a href="#features" className="rounded-md px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-white">
                See what&apos;s inside ↓
              </a>
            </div>
          </div>

          <div className="anim-rise relative mx-auto w-full max-w-md pb-12 lg:max-w-none" style={{ animationDelay: "200ms" }}>
            <ChordSheetArt className="p-7" />
            <div
              aria-hidden
              className="absolute bottom-0 left-6 rounded-xl border border-white/10 bg-[#15161a]/90 px-4 py-3 shadow-xl backdrop-blur"
            >
              <p className="text-xs text-zinc-400">Singer wants it higher</p>
              <p className="mt-1 flex items-center gap-2 font-mono text-sm">
                <span className="text-zinc-400">G</span>
                <span aria-hidden className="text-blue-400">→</span>
                <span className="font-bold text-blue-400">A</span>
                <span className="text-xs text-zinc-500">every chord moves</span>
              </p>
            </div>
          </div>
        </section>

        {/* Find a song */}
        <Section
          eyebrow="Find any song"
          title="Remember a line? That's enough."
          text={
            <>
              <p>Search by title, artist or the words themselves. The songs closest to what you typed come first, so a phrase you half remember lands on the right song.</p>
              <p>Narrow the list by key, major or minor, artist, tempo and more, a page at a time, however big the library grows.</p>
            </>
          }
        >
          <Panel className="p-5" >
            <div aria-hidden className="space-y-4">
              <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                down the road to the river<span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-blue-400" />
              </div>
              <ul className="divide-y divide-white/10 rounded-lg border border-white/10 text-sm">
                {[
                  ["Down to the River", "Closest: the title and the words together", "G"],
                  ["Walk With Me", "“…down the road to the river we go…”", "D"],
                  ["Morning Song", "“…the road runs down to a quiet river…”", "A"],
                ].map(([title, line, key], i) => (
                  <li key={title} className={`flex items-center gap-3 px-3 py-2.5 ${i === 0 ? "bg-white/[0.05]" : ""}`}>
                    <span className="flex h-9 w-11 flex-none items-center justify-center rounded-md border border-white/10 font-mono text-sm font-bold text-blue-400">{key}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{title}</span>
                      <span className="block truncate text-xs italic text-zinc-500">{line}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                <Chip on>G</Chip>
                <Chip>D</Chip>
                <Chip>Em</Chip>
                <Chip>Minor</Chip>
                <Chip>60–90 BPM</Chip>
              </div>
            </div>
          </Panel>
        </Section>

        {/* Setlists */}
        <Section
          flip
          eyebrow="Plan Sunday"
          title="Setlists that remember everything."
          text={
            <>
              <p>Put songs in order, drag to rearrange, and give each song its own key, capo, text size and chord style, just for that setlist.</p>
              <p>Need a chord changed for Sunday only? Edit it right in the setlist. The song in your library stays as it was.</p>
              <p>Between songs, a bridge shows the chords to get from the end of one into the start of the next, suggested for you or written by hand.</p>
            </>
          }
        >
          <Panel className="p-5">
            <div aria-hidden>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">On stage</p>
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-white/10 p-3">
                <span className="flex h-9 w-11 items-center justify-center rounded-md bg-white/5 font-mono text-sm font-bold text-blue-400">G</span>
                <span className="w-40 max-w-full"><Bar w={100} strong /></span>
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs">
                <span className="font-medium uppercase tracking-wide text-zinc-500">Bridge</span>
                <span className="font-mono text-sm font-semibold text-blue-300">G → E7 → A</span>
              </p>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">Setlist · 4 songs</p>
              <ul className="mt-2 space-y-1.5">
                {[
                  ["G", 60, ""],
                  ["A", 52, "edited"],
                  ["C", 44, ""],
                  ["D", 36, ""],
                ].map(([k, w, tag], i) => (
                  <li key={k as string} className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2 ${i === 0 ? "border-blue-400 bg-white/[0.06]" : "border-transparent"}`}>
                    <span className="w-4 text-right text-xs text-zinc-500">{i + 1}</span>
                    <span className="min-w-0 flex-1"><Bar w={w as number} /></span>
                    {tag && <span className="text-xs text-zinc-500">{tag}</span>}
                    <span className="font-mono text-xs text-zinc-400">{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </Section>

        {/* Screens */}
        <Section
          eyebrow="Run it live"
          title="The right screen for everyone."
          text={
            <>
              <p>Open the setlist on as many screens as you need. Every change shows up on all of them within a moment: a song added, a key changed, a chord fixed.</p>
              <p>Pick what each screen is. <strong className="font-medium text-zinc-200">Media</strong> runs the setlist and chooses the song on stage. <strong className="font-medium text-zinc-200">Stage</strong> is the band&apos;s full-screen view, with key and size in reach. <strong className="font-medium text-zinc-200">Viewer</strong> just watches.</p>
              <p>A built-in chat lets the media team tell the band what&apos;s coming without talking over the music.</p>
            </>
          }
        >
          <div aria-hidden className="grid gap-3 sm:grid-cols-3">
            {[
              { name: "Media", note: "Runs the setlist", body: "controls" },
              { name: "Stage", note: "Full-screen song", body: "song" },
              { name: "Viewer", note: "Watches", body: "song" },
            ].map((s) => (
              <Panel key={s.name} className="flex flex-col p-3">
                <div className="flex-1 space-y-2 rounded-md border border-white/10 bg-black/25 p-2.5">
                  {s.body === "controls" ? (
                    <>
                      <div className="flex gap-1.5"><Chip on>Next</Chip><Chip>Add</Chip></div>
                      <Bar w={80} strong />
                      <Bar w={60} />
                      <Bar w={70} />
                      <div className="mt-1 rounded border border-white/10 px-2 py-1 text-[0.6875rem] text-zinc-400">Capo up one →</div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-xs font-bold text-blue-400">G&nbsp;&nbsp;&nbsp;D&nbsp;&nbsp;Em</div>
                      <Bar w={85} strong />
                      <div className="font-mono text-xs font-bold text-blue-400">C&nbsp;&nbsp;&nbsp;&nbsp;G</div>
                      <Bar w={65} strong />
                      {s.name === "Stage" && <div className="flex gap-1.5 pt-1"><Chip>Key −</Chip><Chip>Key +</Chip></div>}
                    </>
                  )}
                </div>
                <p className="mt-3 text-sm font-medium">{s.name}</p>
                <p className="text-xs text-zinc-500">{s.note}</p>
              </Panel>
            ))}
          </div>
        </Section>

        {/* Chord styles */}
        <Section
          flip
          eyebrow="Make it yours"
          title="Same song, played your way."
          text={
            <>
              <p>Switch a song between Classic, Jazzy and Gospel and the chords are re-dressed by simple rules: plain triads, sevenths and ninths, or added ninths and minor sevenths.</p>
              <p>It&apos;s a starting point to play from, set per song in each setlist, with the original always one tap away.</p>
            </>
          }
        >
          <Panel className="p-5">
            <div aria-hidden className="space-y-3">
              {[
                ["Original", ["G", "Em", "C", "D"]],
                ["Classic", ["G", "Em", "C", "D7"]],
                ["Jazzy", ["Gmaj7", "Em7", "Cmaj7", "D9"]],
                ["Gospel", ["Gadd9", "Em7", "Cadd9", "D9"]],
              ].map(([name, chords], i) => (
                <div key={name as string} className={`flex items-center gap-4 rounded-lg border px-3 py-2.5 ${i === 2 ? "border-blue-400/50 bg-blue-400/[0.06]" : "border-white/10"}`}>
                  <span className="w-16 flex-none text-sm text-zinc-400">{name as string}</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm font-bold text-blue-400">
                    {(chords as string[]).map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </Section>

        {/* Everything else */}
        <section id="features" className="reveal mx-auto w-full max-w-6xl scroll-mt-8 px-6 pb-20 lg:pb-28">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">And the little things that add up.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
                <span className="inline-flex h-10 min-w-12 items-center justify-center rounded-md border border-white/10 bg-white/5 px-2 font-mono text-sm font-bold text-blue-400">
                  {f.chord}
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-zinc-400">{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Closing call to action */}
        <section className="reveal mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/15 via-white/[0.03] to-transparent px-8 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready for Sunday?</h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-400">
              A church registers once. Band and media team members make their own account and apply to join it.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login?as=church&mode=signup"
                className="inline-flex rounded-md bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                Register your church
              </Link>
              <Link
                href="/login"
                className="inline-flex rounded-md border border-white/20 px-6 py-2.5 text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-zinc-500">
          <Logo size={20} className="text-sm" />
          <span>Lyrics and chords for your church.</span>
        </div>
      </footer>
    </div>
  );
}
