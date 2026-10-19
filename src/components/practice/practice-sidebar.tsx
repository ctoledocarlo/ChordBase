"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarPortal } from "../sidebar-portal";
import { COURSE, GROUPS, TOOLS, type Lesson } from "./lessons";
import { useProgress } from "./progress";

/** The lesson list in the sidebar: ticks for what is done, and the tools underneath. */
export function PracticeSidebar() {
  const pathname = usePathname();
  const { done } = useProgress();
  const current = pathname.split("/")[2] ?? "";
  const finished = COURSE.filter((l) => done.has(l.slug)).length;

  const row = (lesson: Lesson, label: string) => {
    const here = lesson.slug === current;
    const ticked = done.has(lesson.slug);
    return (
      <li key={lesson.slug}>
        <Link
          href={`/practice/${lesson.slug}`}
          aria-current={here ? "page" : undefined}
          className={`flex items-start gap-2.5 border-l-2 px-3 py-1.5 text-sm ${
            here ? "border-accent bg-hover font-medium" : "border-transparent text-muted hover:bg-hover hover:text-foreground"
          }`}
        >
          <span
            aria-hidden
            className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[0.6875rem] ${
              ticked ? "border-[#16a34a] bg-[#16a34a] text-white" : "border-line"
            }`}
          >
            {ticked ? "✓" : label}
          </span>
          <span className="min-w-0 flex-1">
            {lesson.title}
            {ticked && <span className="sr-only"> (done)</span>}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <SidebarPortal>
      <nav aria-label="Practice lessons" data-tour="practice-lessons" className="-mx-1 space-y-5">
        <div className="px-3">
          <Link href="/practice" aria-current={pathname === "/practice" ? "page" : undefined} className="text-sm font-medium hover:underline">
            Practice the keys
          </Link>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={COURSE.length}
            aria-valuenow={finished}
            aria-label="Lessons done"
          >
            <div className="h-full rounded-full bg-[#16a34a] transition-[width]" style={{ width: `${(finished / COURSE.length) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {finished} of {COURSE.length} lessons done
          </p>
        </div>

        {GROUPS.map((group) => (
          <section key={group}>
            <h2 className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">{group}</h2>
            <ul>{COURSE.filter((l) => l.group === group).map((l) => row(l, String(COURSE.indexOf(l) + 1)))}</ul>
          </section>
        ))}

        <section>
          <h2 className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Tools</h2>
          <ul>{TOOLS.map((t) => row(t, "•"))}</ul>
        </section>
      </nav>
    </SidebarPortal>
  );
}
