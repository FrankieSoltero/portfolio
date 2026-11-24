"use client";
// drills/components/WorkspaceHost.tsx
// The Drillbox workspace for one drill, wired to the browser: the visitor's saved draft
// becomes the workspace's initial code, every edit is saved, and a checks run where every
// check passes marks the drill done.
//
// The workspace reads `initialFiles` only when it mounts, and storage only exists in the
// browser, so the draft is read in an effect and the workspace is rendered only after
// that (the first render is empty). Loaded on the client only, through DrillWorkspace.

import "drillbox/workspace.css";
import { useEffect, useMemo, useState } from "react";
import type { Exercise } from "drillbox/schema";
import { Workspace, type WorkspaceProps } from "drillbox/workspace";
import { loadDraft, saveDraft, type DraftFiles } from "@/drills/draft";
import { FRAME_URL } from "@/drills/frame";
import { useProgress } from "@/drills/useProgress";

type RunSummary = Parameters<NonNullable<WorkspaceProps["onResult"]>>[0];

/** The draft as read for one drill; `files` is undefined when nothing valid is saved. */
interface LoadedDraft {
  id: string;
  files: DraftFiles | undefined;
}

/** The exercise's code for the files the visitor can edit (neither read-only nor hidden). */
function editableStarter(exercise: Exercise): DraftFiles {
  const starter: DraftFiles = {};
  for (const [path, file] of Object.entries(exercise.files)) {
    if (!file.readOnly && !file.hidden) starter[path] = file.code;
  }
  return starter;
}

/** True only for a finished checks run in which every one of at least one check passed. */
function allChecksPassed({ status, passed, failed, total }: RunSummary): boolean {
  return status === "completed" && total > 0 && failed === 0 && passed === total;
}

export function WorkspaceHost({ exercise }: { exercise: Exercise }): React.JSX.Element | null {
  const { complete } = useProgress();
  const starter = useMemo(() => editableStarter(exercise), [exercise]);
  const [draft, setDraft] = useState<LoadedDraft | null>(null);

  useEffect(() => {
    // Storage is read like any external source, asynchronously after mount. A read that
    // arrives after unmount or after the drill changed does nothing.
    let active = true;
    const id = exercise.id;
    void Promise.resolve().then(() => {
      if (active) setDraft({ id, files: loadDraft(id, Object.keys(starter)) ?? undefined });
    });
    return () => {
      active = false;
    };
  }, [exercise.id, starter]);

  // Storage not read yet for this drill: render nothing rather than another drill's code.
  if (draft?.id !== exercise.id) return null;

  return (
    <Workspace
      key={exercise.id}
      exercise={exercise}
      frameUrl={FRAME_URL}
      initialFiles={draft.files}
      onChange={(files) => saveDraft(exercise.id, files, starter)}
      onResult={(summary) => {
        if (allChecksPassed(summary)) complete(exercise.id);
      }}
    />
  );
}

export default WorkspaceHost;
