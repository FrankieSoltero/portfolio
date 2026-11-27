// A fake network layer. Each request answers with canned data after a short random
// delay (200–1200 ms). Checks switch it to manual mode and decide, call by call,
// when a request succeeds or fails.

export interface ApiControl {
  /** Hold every new request until release() or fail() settles it. */
  setManual(): void;
  /** Back to automatic mode; forgets every call. Calls still waiting never settle. */
  reset(): void;
  /** Labels of the requests waiting to be settled, oldest first. */
  pending(): string[];
  /** Labels of every request made since the last reset, in order. */
  calls(): string[];
  /** Resolve the oldest waiting request with this label. */
  release(label: string): void;
  /** Reject the oldest waiting request with this label. */
  fail(label: string, message?: string): void;
}

interface WaitingCall {
  label: string;
  settle: () => void;
  reject: (error: Error) => void;
}

export function createApi(): {
  control: ApiControl;
  request<T>(label: string, value: T): Promise<T>;
} {
  let manual = false;
  let generation = 0;
  let waiting: WaitingCall[] = [];
  let made: string[] = [];

  function take(label: string): WaitingCall {
    const i = waiting.findIndex((call) => call.label === label);
    if (i === -1) throw new Error(`No pending call: ${label}`);
    return waiting.splice(i, 1)[0];
  }

  const control: ApiControl = {
    setManual() {
      manual = true;
    },
    reset() {
      manual = false;
      generation += 1;
      waiting = [];
      made = [];
    },
    pending() {
      return waiting.map((call) => call.label);
    },
    calls() {
      return [...made];
    },
    release(label) {
      take(label).settle();
    },
    fail(label, message = "Request failed") {
      take(label).reject(new Error(message));
    },
  };

  function request<T>(label: string, value: T): Promise<T> {
    made.push(label);
    return new Promise<T>((resolve, reject) => {
      if (manual) {
        waiting.push({ label, settle: () => resolve(value), reject });
        return;
      }
      const started = generation;
      const delay = 200 + Math.random() * 1000;
      setTimeout(() => {
        if (generation === started) resolve(value);
      }, delay);
    });
  }

  return { control, request };
}

const { control, request } = createApi();
export const apiControl = control;

export type Post = { id: number; title: string; userId: number };
export type User = { id: number; name: string };
export type Comment = { id: number; postId: number; body: string };

const TITLES: Record<number, string> = { 1: "Alpha", 2: "Beta", 3: "Gamma" };

/** Loads every post in the feed. */
export function fetchPosts(): Promise<Post[]> {
  return request<Post[]>("posts", [
    { id: 1, title: "Alpha", userId: 1 },
    { id: 2, title: "Beta", userId: 2 },
    { id: 3, title: "Gamma", userId: 1 },
  ]);
}

/** Loads every author. */
export function fetchUsers(): Promise<User[]> {
  return request<User[]>("users", [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ]);
}

/** Loads the comments of one post. */
export function fetchComments(postId: number): Promise<Comment[]> {
  const title = TITLES[postId];
  return request<Comment[]>(`comments:${postId}`, [
    { id: postId * 10 + 1, postId, body: `${title} comment 1` },
    { id: postId * 10 + 2, postId, body: `${title} comment 2` },
  ]);
}
