import Link from "next/link";
import { Fragment } from "react";
import { COURSE, neighbour, type Block, type Lesson } from "./lessons";
import { MarkDone } from "./mark-done";
import { Widget } from "./widgets";

/** Text with **bold** parts. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.t) {
    case "p":
      return (
        <p className="leading-7">
          <Inline text={block.text} />
        </p>
      );
    case "h":
      return <h2 className="pt-4 text-xl font-semibold tracking-tight">{block.text}</h2>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`space-y-2 pl-5 leading-7 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-muted`}>
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "tip":
      return (
        <aside className="rounded-lg border-l-4 border-accent bg-hover px-4 py-3 text-sm leading-6">
          <p className="mb-0.5 font-semibold">{block.title ?? "Tip"}</p>
          <p>
            <Inline text={block.text} />
          </p>
        </aside>
      );
    case "try":
      return (
        <aside className="rounded-lg border border-[#ea580c]/40 bg-[#ea580c]/10 px-4 py-3 text-sm leading-6">
          <p className="mb-0.5 font-semibold text-[#c2410c] dark:text-[#fdba74]">Try it</p>
          <p>
            <Inline text={block.text} />
          </p>
        </aside>
      );
    case "widget":
      return <Widget widget={block.widget} />;
    case "terms":
      return (
        <dl className="divide-y divide-line rounded-xl border border-line">
          {block.items.map((item) => (
            <div key={item.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="font-semibold">{item.term}</dt>
              <dd className="text-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      );
  }
}

/** One lesson or tool: its heading, its text with the keyboards in place, and the way on to the next one. */
export function LessonView({ lesson }: { lesson: Lesson }) {
  const number = COURSE.findIndex((l) => l.slug === lesson.slug) + 1;
  const prev = neighbour(lesson.slug, -1);
  const next = neighbour(lesson.slug, 1);

  return (
    <article data-tour="practice-lesson" className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {lesson.kind === "lesson" ? `Lesson ${number} of ${COURSE.length} · ${lesson.group} · about ${lesson.minutes} minutes` : "Tool"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="mt-2 text-muted">{lesson.summary}</p>
      </header>

      {lesson.blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}

      {lesson.kind === "lesson" && (
        <footer className="mt-10 space-y-5 border-t border-line pt-6">
          <MarkDone slug={lesson.slug} />
          <nav aria-label="Lessons" className="flex flex-wrap items-center justify-between gap-3">
            {prev ? (
              <Link href={`/practice/${prev.slug}`} className="btn">
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/practice/${next.slug}`} className="btn btn-primary">
                Next: {next.title} →
              </Link>
            ) : (
              <Link href="/practice" className="btn btn-primary">
                Back to all lessons
              </Link>
            )}
          </nav>
        </footer>
      )}
    </article>
  );
}
