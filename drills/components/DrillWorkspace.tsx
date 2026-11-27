"use client";
// drills/components/DrillWorkspace.tsx
// The workspace section of a drill page. The workspace itself (WorkspaceHost: the editor,
// the sandboxes and the visitor's saved code) only runs in the browser, so it is loaded
// with next/dynamic and `ssr: false`. Until it has loaded, and in the server-rendered
// HTML, the section shows `fallback`: the page's server-rendered STARTER CODE content.
// If the workspace fails to load or crashes, an error boundary shows the fallback again
// with a message and a RETRY button. The saved draft lives in localStorage, so a retry
// (or a failure) never loses it.
//
// The fallback is server markup (a ReactNode from the page), while next/dynamic's
// `loading` component takes no props; it reads the fallback from a context instead.
// Server HTML and the first client render are therefore the same: the section with the
// fallback in it. Once loaded, WorkspaceHost gets the fallback as a prop and keeps showing
// it until it has read the draft, so the section never empties in between.
//
// RETRY unmounts its own button, so focus would fall to <body>: after a retry the section
// becomes focusable (tabIndex -1, set only then, so the server HTML is unchanged) and takes
// the focus.

import dynamic from "next/dynamic";
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import type { Exercise } from "drillbox/schema";

const ERROR_MESSAGE = "The workspace could not start. The starter code is below; your saved code is kept.";

type HostProps = { exercise: Exercise; fallback?: ReactNode };

const FallbackContext = createContext<ReactNode>(null);

/** next/dynamic's `loading` component: the fallback of the nearest DrillWorkspace. */
function LoadingFallback(): ReactNode {
  return useContext(FallbackContext);
}

/**
 * A new dynamic WorkspaceHost. Each load attempt needs its own: next/dynamic wraps the
 * import in React.lazy, which keeps a rejected import rejected.
 */
function loadHost(): ComponentType<HostProps> {
  return dynamic(() => import("./WorkspaceHost"), { ssr: false, loading: LoadingFallback });
}

interface BoundaryProps {
  fallback: ReactNode;
  onRetry: () => void;
  children: ReactNode;
}

/** Shows the fallback, the error message and RETRY when loading or rendering fails. */
class WorkspaceErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <p role="alert" className="drills-workspace-error">
          {ERROR_MESSAGE}
        </p>
        <button type="button" className="drills-button" onClick={this.props.onRetry}>
          RETRY
        </button>
        {this.props.fallback}
      </>
    );
  }
}

interface Attempt {
  key: number;
  Host: ComponentType<HostProps>;
}

export function DrillWorkspace({
  exercise,
  fallback,
}: {
  exercise: Exercise;
  fallback: ReactNode;
}): React.JSX.Element {
  const [attempt, setAttempt] = useState<Attempt>(() => ({ key: 0, Host: loadHost() }));
  const retry = (): void => setAttempt((a) => ({ key: a.key + 1, Host: loadHost() }));
  const { Host } = attempt;
  const section = useRef<HTMLElement>(null);
  const retried = attempt.key > 0;

  useEffect(() => {
    if (retried) section.current?.focus();
  }, [attempt.key, retried]);

  return (
    <section ref={section} className="drills-section drills-workspace" tabIndex={retried ? -1 : undefined}>
      <FallbackContext.Provider value={fallback}>
        {/* A new key remounts the boundary and the workspace; the draft is re-read from storage. */}
        <WorkspaceErrorBoundary key={attempt.key} fallback={fallback} onRetry={retry}>
          <Host exercise={exercise} fallback={fallback} />
        </WorkspaceErrorBoundary>
      </FallbackContext.Provider>
    </section>
  );
}
