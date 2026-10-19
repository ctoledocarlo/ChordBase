"use client";

import Link from "next/link";
import { COURSE, GROUPS, TOOLS } from "./lessons";
import { useProgress } from "./progress";

/** The front page of Practice: where to start or carry on, every lesson, and the tools. */
export function PracticeHome() {
  const { done } = useProgress();
  const next = COURSE.find((l) => !done.has(l.slug));
  const finished = COURSE.filter((l) => done.has(l.slug)).length;

  return (
    <div data-tour="practice-home" className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Practice the keys</h1>
        <p className="mt-2 max-w-xl text-muted">
          Learn the piano from the very first key. Short lessons with a keyboard you can press, to see where the notes are, hear them, and learn which fingers to use. No reading music needed.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {next ? (
            <Link href={`/practice/${next.slug}`} className="btn btn-primary px-4 py-2">
              {finished > 0 ? `Continue: ${next.title}` : "Start with lesson 1"}
            </Link>
          ) : (
            <p className="rounded-lg border border-line px-4 py-2 text-sm">You have finished every lesson. Keep practising with the tools below.</p>
          )}
          <span className="text-sm text-muted">
            {finished > 0 ? `${finished} of ${COURSE.length} lessons done` : `${COURSE.length} lessons, about ${COURSE.reduce((n, l) => n + l.minutes, 0)} minutes in all`}
          </span>
        </div>
      </header>

      {GROUPS.map((group) => (
        <section key={group}>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">{group}</h2>
          <ol className="grid gap-3 sm:grid-cols-2">
            {COURSE.filter((l) => l.group === group).map((lesson) => {
              const ticked = done.has(lesson.slug);
              return (
                <li key={lesson.slug}>
                  <Link href={`/practice/${lesson.slug}`} className="group flex h-full gap-3 rounded-xl border border-line p-4 hover:border-foreground">
                    <span
                      aria-hidden
                      className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border text-sm font-semibold ${
                        ticked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-line text-muted"
                      }`}
                    >
                      {ticked ? "✓" : COURSE.indexOf(lesson) + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium group-hover:underline">{lesson.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{lesson.summary}</span>
                      <span className="mt-1 block text-xs text-muted">
                        About {lesson.minutes} minutes{ticked ? " · done" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">Tools to look things up</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.slug}>
              <Link href={`/practice/${tool.slug}`} className="group block h-full rounded-xl border border-line p-4 hover:border-foreground">
                <span className="block font-medium group-hover:underline">{tool.title}</span>
                <span className="mt-0.5 block text-sm text-muted">{tool.summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
