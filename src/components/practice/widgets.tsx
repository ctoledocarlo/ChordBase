"use client";

import { PracticeChecklist } from "./checklist";
import type { WidgetBlock } from "./lessons";
import { ChordQuiz, HandPosition, NoteNamesBoard, NoteQuiz, StepExplorer } from "./widgets-basic";
import { ChordBuilder, CircleOfFifths, IntervalExplorer, InversionsDemo, KeyChordsLab, ScaleExplorer } from "./widgets-theory";

/** Puts the right interactive piece into a lesson. The lesson text only names it; this is where it is built. */
export function Widget({ widget }: { widget: WidgetBlock }) {
  switch (widget.id) {
    case "note-names":
      return <NoteNamesBoard />;
    case "step-explorer":
      return <StepExplorer />;
    case "hand-position":
      return <HandPosition />;
    case "note-quiz":
      return <NoteQuiz />;
    case "chord-quiz":
      return <ChordQuiz />;
    case "scale-explorer":
      return <ScaleExplorer types={widget.types} initialRoot={widget.root} initialType={widget.type} />;
    case "circle":
      return <CircleOfFifths />;
    case "intervals":
      return <IntervalExplorer />;
    case "chord-builder":
      return <ChordBuilder kinds={widget.kinds} initialRoot={widget.root} initialQuality={widget.quality} />;
    case "inversions":
      return <InversionsDemo initialRoot={widget.root} />;
    case "key-chords":
      return <KeyChordsLab initialRoot={widget.root} initialMode={widget.mode} />;
    case "checklist":
      return <PracticeChecklist />;
  }
}
