import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LessonView } from "@/components/practice/lesson-view";
import { LESSONS, lessonBySlug } from "@/components/practice/lessons";
import { SongSkeleton } from "@/components/skeletons";

export function generateStaticParams() {
  return LESSONS.map((lesson) => ({ lesson: lesson.slug }));
}

export default function LessonPage({ params }: PageProps<"/practice/[lesson]">) {
  return (
    <Suspense fallback={<SongSkeleton />}>
      <Lesson params={params} />
    </Suspense>
  );
}

async function Lesson({ params }: { params: PageProps<"/practice/[lesson]">["params"] }) {
  const { lesson: slug } = await params;
  const lesson = lessonBySlug(slug);
  if (!lesson) notFound();
  return <LessonView lesson={lesson} />;
}
