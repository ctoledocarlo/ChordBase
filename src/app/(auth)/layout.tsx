import { ChordSheetArt } from "@/components/chord-sheet-art";
import { ThemeToggle } from "@/components/theme-toggle";

const POINTS = [
  { title: "Any key, one tap", text: "Transpose a song and its capo shapes together." },
  { title: "Setlists that remember", text: "Each song keeps its own key and size for the service." },
  { title: "Live mode", text: "Full screen for the band, with what's next beside it." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      {/* The brand side. It stays dark in both themes so the chords always stand out. */}
      <aside className="relative hidden w-[44%] max-w-[44rem] flex-none flex-col justify-between overflow-hidden bg-[#0c0c0e] p-12 text-zinc-100 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_0%_0%,rgba(96,165,250,0.18),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,rgba(96,165,250,0.08),transparent_60%)]"
        />
        <p className="relative text-lg font-semibold tracking-tight">ChordBase</p>

        <div className="relative">
          <h2 className="anim-rise max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Every song, in the key your band needs.
          </h2>
          <ChordSheetArt className="mt-10 max-w-md" />
        </div>

        <ul className="anim-rise relative grid gap-4 text-sm" style={{ animationDelay: "500ms" }}>
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-blue-400" />
              <span>
                <span className="font-medium">{p.title}.</span> <span className="text-zinc-400">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* A soft tint rather than flat white, with the form on a frosted card. */}
      <main className="relative flex flex-1 items-center justify-center bg-[radial-gradient(40rem_30rem_at_80%_0%,rgba(147,170,255,0.35),transparent_60%),linear-gradient(160deg,#e9eefc_0%,#dfe6f7_55%,#e8e4f6_100%)] px-5 py-12 dark:bg-[radial-gradient(40rem_30rem_at_80%_0%,rgba(96,165,250,0.12),transparent_60%),linear-gradient(160deg,#101216_0%,#0b0c0f_100%)]">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <p className="mb-6 text-xl font-semibold tracking-tight lg:hidden">ChordBase</p>
          <div className="anim-rise rounded-2xl border border-white/70 bg-white/55 p-8 shadow-[0_10px_40px_-12px_rgba(30,50,120,0.25)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
