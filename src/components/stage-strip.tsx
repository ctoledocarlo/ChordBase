"use client";

import type { ScreenRole } from "./use-screen-role";

/**
 * A line above the song saying how this screen relates to the song on stage. Media sees whether what they are
 * looking at is on stage (and how many Stage screens are connected), or is offered to put it there. A Stage
 * screen that wandered off to another song gets a way back.
 */
export function StageStrip({
  role,
  stageTitle,
  viewingStage,
  stageScreens,
  onPut,
  onGoToStage,
}: {
  role: ScreenRole;
  /** The song on stage, or null when nothing is. */
  stageTitle: string | null;
  /** Whether the song this screen shows is the one on stage. */
  viewingStage: boolean;
  /** How many Stage screens are connected to this setlist right now. */
  stageScreens: number;
  onPut: () => void;
  onGoToStage: () => void;
}) {
  if (role === "viewer" || !stageTitle) return null;

  if (role === "stage") {
    if (viewingStage) return null;
    return (
      <div data-tour="setlist-stage-strip" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-hover px-3 py-1.5 text-sm">
        <span className="min-w-[12rem] flex-1">
          You&apos;re looking at another song. On stage: <span className="font-medium">{stageTitle}</span>
        </span>
        <button type="button" className="btn btn-primary px-2.5 py-0.5 text-xs" onClick={onGoToStage}>
          Back to stage
        </button>
      </div>
    );
  }

  const screens = stageScreens === 0 ? "No Stage screen connected" : `${stageScreens} Stage ${stageScreens === 1 ? "screen" : "screens"} connected`;

  if (viewingStage) {
    return (
      <p data-tour="setlist-stage-strip" className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span aria-hidden className="beacon h-2.5 w-2.5 flex-none rounded-full bg-[#16a34a]" />
        <span className="font-medium">On stage now</span>
        <span className="text-muted">· {screens}</span>
      </p>
    );
  }

  return (
    <div data-tour="setlist-stage-strip" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#d97706] bg-[#d97706]/10 px-3 py-1.5 text-sm">
      <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full bg-[#d97706]" />
      <span className="min-w-[12rem] flex-1">
        Stage is showing <span className="font-medium">{stageTitle}</span>
        <span className="text-muted"> · {screens}</span>
      </span>
      <button type="button" className="btn px-2.5 py-0.5 text-xs" onClick={onGoToStage}>
        Go to it
      </button>
      <button type="button" className="btn btn-primary px-2.5 py-0.5 text-xs" onClick={onPut}>
        Put this on stage
      </button>
    </div>
  );
}
