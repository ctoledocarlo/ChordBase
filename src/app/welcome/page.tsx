import type { Metadata } from "next";
import Link from "next/link";
import { ChordSheetArt } from "@/components/chord-sheet-art";

export const metadata: Metadata = {
  title: "ChordBase · Lyrics and chords for your church",
  description: "Lyrics and chords for your church, in any key. Transpose, plan setlists and play live.",
};

const FEATURES = [
  { chord: "G", title: "Any key, one tap", text: "Move a song up or down and every chord follows. Add a capo and the shapes to play are worked out for you." },
  { chord: "Am", title: "Easy to write", text: "Type chords straight onto the words and drag song sections around. No code, no special format." },
  { chord: "D/F#", title: "Bring your slides", text: "Import songs from PowerPoint files. Chords, sections and keys are read for you, hundreds at a time." },
  { chord: "C", title: "Setlists that remember", text: "Each song in a setlist keeps its own key, capo, text size and chords, so Sunday is set up before you start." },
  { chord: "Em7", title: "Live mode", text: "Full screen for the band, with the whole setlist and the next song beside it. Add a song mid-service." },
  { chord: "F", title: "Find it fast", text: "Search and filter by key, artist, tempo and more, a page at a time, however big the library gets." },
] as const;

const KEYS = ["G", "A", "C", "D"] as const;

export default function WelcomePage() {
  return (
    <div className="relative flex-1 overflow-hidden bg-[#0c0c0e] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70rem_40rem_at_10%_-5%,rgba(96,165,250,0.20),transparent_60%),radial-gradient(50rem_35rem_at_100%_30%,rgba(129,140,248,0.12),transparent_60%),radial-gradient(50rem_30rem_at_0%_100%,rgba(96,165,250,0.10),transparent_60%)]"
      />

      <header className="page-enter relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <span className="text-lg font-semibold tracking-tight">ChordBase</span>
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
              Keep every song your church plays in one place. Change the key for your singer, plan Sunday&apos;s setlist,
              and put it on the screen for the whole band.
            </p>
            <div className="anim-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "180ms" }}>
              <Link
                href="/login"
                className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                Log in to your church
              </Link>
              <a href="#features" className="rounded-md px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-white">
                See what&apos;s inside ↓
              </a>
            </div>
          </div>

          <div className="anim-rise relative mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: "200ms" }}>
            <ChordSheetArt className="p-7" />
            <div
              aria-hidden
              className="absolute -bottom-12 left-6 rounded-xl border border-white/10 bg-[#15161a]/90 px-4 py-3 shadow-xl backdrop-blur"
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

        {/* Features */}
        <section id="features" className="reveal mx-auto w-full max-w-6xl scroll-mt-8 px-6 pb-20 lg:pb-28">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything the team needs before the first note.
          </h2>
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

        {/* Setlists */}
        <section className="reveal mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-20 lg:grid-cols-2 lg:pb-28">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Plan Sunday in a few minutes.</h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-400">
              Put songs in order, drag to rearrange, and set each one&apos;s key once. When it&apos;s time, go live: the
              song fills the screen and the setlist waits on the right, with the next song ready.
            </p>
          </div>

          <div aria-hidden className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Up next</p>
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-white/10 p-3">
              <span className="flex h-9 w-11 items-center justify-center rounded-md bg-white/5 font-mono text-sm font-bold text-blue-400">A</span>
              <span className="h-2.5 w-40 rounded-full bg-white/20" />
            </div>
            <p className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500">Setlist · 4 songs</p>
            <ul className="mt-2 space-y-1.5">
              {KEYS.map((k, i) => (
                <li
                  key={k}
                  className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2 ${
                    i === 0 ? "border-blue-400 bg-white/[0.06]" : "border-transparent"
                  }`}
                >
                  <span className="w-4 text-right text-xs text-zinc-500">{i + 1}</span>
                  <span className="h-2.5 rounded-full bg-white/15" style={{ width: `${55 - i * 8}%` }} />
                  <span className="ml-auto font-mono text-xs text-zinc-400">{k}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="reveal mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/15 via-white/[0.03] to-transparent px-8 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready for Sunday?</h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-400">Log in with your church&apos;s shared login to open your songs and setlists.</p>
            <Link
              href="/login"
              className="mt-7 inline-flex rounded-md bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Log in
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-zinc-500">
          <span>ChordBase</span>
          <span>Lyrics and chords for your church.</span>
        </div>
      </footer>
    </div>
  );
}
