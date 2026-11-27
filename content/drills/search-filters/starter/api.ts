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

export type Product = { id: number; name: string; inStock: boolean };

const PRODUCTS: Product[] = [
  { id: 1, name: "Lamp", inStock: true },
  { id: 2, name: "Lantern", inStock: false },
  { id: 3, name: "Desk", inStock: true },
];

/** Searches the catalogue: names containing the query (any case), optionally in stock only. */
export function searchProducts(filters: { query: string; inStock: boolean }): Promise<Product[]> {
  const query = filters.query.toLowerCase();
  const matches = PRODUCTS.filter(
    (product) => product.name.toLowerCase().includes(query) && (!filters.inStock || product.inStock)
  );
  return request<Product[]>(`search:${filters.query}:${filters.inStock}`, matches);
}
