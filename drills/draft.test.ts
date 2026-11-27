import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  DRAFT_KEY_PREFIX,
  loadDraft,
  MAX_DRAFT_FILE_CHARS,
  parseDraft,
  saveDraft,
} from "./draft";

const SLUG = "like-button";
const KEY = "drills:code:v1:like-button";
const EDITABLE = ["App.tsx", "styles.css"] as const;

function stored(): string | null {
  return window.localStorage.getItem(KEY);
}

function storeRaw(value: unknown): void {
  window.localStorage.setItem(KEY, typeof value === "string" ? value : JSON.stringify(value));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("constants", () => {
  it("uses the exact key prefix and file limit", () => {
    expect(DRAFT_KEY_PREFIX).toBe("drills:code:v1:");
    expect(MAX_DRAFT_FILE_CHARS).toBe(200_000);
  });
});

describe("saveDraft", () => {
  it("stores exactly the version and the files, in that order", () => {
    saveDraft(SLUG, { "App.tsx": "x" }, { "App.tsx": "y" });
    expect(stored()).toBe('{"version":1,"files":{"App.tsx":"x"}}');
  });

  it("removes the key when every file equals the starter", () => {
    storeRaw({ version: 1, files: { "App.tsx": "x" } });
    saveDraft(SLUG, { "App.tsx": "y", "styles.css": "s" }, { "App.tsx": "y", "styles.css": "s" });
    expect(stored()).toBeNull();
  });

  it("stores the draft when only one of several files differs from the starter", () => {
    saveDraft(SLUG, { "App.tsx": "y", "styles.css": "changed" }, { "App.tsx": "y", "styles.css": "s" });
    expect(stored()).toBe('{"version":1,"files":{"App.tsx":"y","styles.css":"changed"}}');
  });

  it("writes nothing and keeps the existing key when a file is too long", () => {
    storeRaw({ version: 1, files: { "App.tsx": "old" } });
    const before = stored();
    saveDraft(
      SLUG,
      { "App.tsx": "fine", "styles.css": "a".repeat(MAX_DRAFT_FILE_CHARS + 1) },
      { "App.tsx": "y", "styles.css": "s" },
    );
    expect(stored()).toBe(before);
  });

  it("accepts a file of exactly the maximum length", () => {
    const longest = "a".repeat(MAX_DRAFT_FILE_CHARS);
    saveDraft(SLUG, { "App.tsx": longest }, { "App.tsx": "y" });
    expect(loadDraft(SLUG, EDITABLE)).toEqual({ "App.tsx": longest });
  });
});

describe("loadDraft", () => {
  it("returns the saved files after saveDraft (round trip)", () => {
    const files = { "App.tsx": "export default function App() {}", "styles.css": ".a{}" };
    saveDraft(SLUG, files, { "App.tsx": "", "styles.css": "" });
    expect(loadDraft(SLUG, EDITABLE)).toEqual(files);
  });

  it("returns null when nothing is stored", () => {
    expect(loadDraft(SLUG, EDITABLE)).toBeNull();
  });

  it("returns null for a stored file that is too long", () => {
    storeRaw({ version: 1, files: { "App.tsx": "a".repeat(MAX_DRAFT_FILE_CHARS + 1) } });
    expect(loadDraft(SLUG, EDITABLE)).toBeNull();
  });

  it("reads only the key of its own slug", () => {
    window.localStorage.setItem(
      "drills:code:v1:other-drill",
      JSON.stringify({ version: 1, files: { "App.tsx": "x" } }),
    );
    expect(loadDraft(SLUG, EDITABLE)).toBeNull();
  });
});

describe("parseDraft", () => {
  it.each([
    ["null", null],
    ["not JSON", "{not json"],
    ["the wrong version", JSON.stringify({ version: 2, files: { "App.tsx": "x" } })],
    ["files not an object", JSON.stringify({ version: 1, files: ["x"] })],
    ["files a string", JSON.stringify({ version: 1, files: "x" })],
    ["a non-string value", JSON.stringify({ version: 1, files: { "App.tsx": "x", "styles.css": 3 } })],
    ["an unknown top-level key", JSON.stringify({ version: 1, files: { "App.tsx": "x" }, extra: true })],
    ["a JSON array", JSON.stringify([1, 2])],
  ])("discards the whole draft for %s", (_label, raw) => {
    expect(parseDraft(raw, EDITABLE)).toBeNull();
  });

  it("drops paths that are not editable and keeps the rest", () => {
    const raw = '{"version":1,"files":{"App.tsx":"x","secret.ts":"y","__proto__":"p","constructor":"c"}}';
    const result = parseDraft(raw, EDITABLE);
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {})).toEqual(["App.tsx"]);
    expect(result?.["App.tsx"]).toBe("x");
  });

  it("returns a result with no inherited keys", () => {
    const result = parseDraft('{"version":1,"files":{"App.tsx":"x"}}', [
      "App.tsx",
      "constructor",
      "toString",
      "__proto__",
    ]);
    expect(result).not.toBeNull();
    const files = result ?? {};
    expect("constructor" in files).toBe(false);
    expect("toString" in files).toBe(false);
    expect("hasOwnProperty" in files).toBe(false);
    expect(Object.keys(files)).toEqual(["App.tsx"]);
  });

  it.each([
    ["a non-string value", '{"version":1,"files":{"App.tsx":"x","__proto__":5}}'],
    ["an object value", '{"version":1,"files":{"App.tsx":"x","__proto__":{"a":"b"}}}'],
    [
      "a value that is too long",
      `{"version":1,"files":{"App.tsx":"x","__proto__":"${"a".repeat(MAX_DRAFT_FILE_CHARS + 1)}"}}`,
    ],
  ])("discards the whole draft for %s under __proto__", (_label, raw) => {
    expect(parseDraft(raw, EDITABLE)).toBeNull();
  });

  it("returns null when no editable path is present", () => {
    expect(parseDraft('{"version":1,"files":{"other.ts":"x"}}', EDITABLE)).toBeNull();
    expect(parseDraft('{"version":1,"files":{}}', EDITABLE)).toBeNull();
  });

  it("keeps an editable file whose content is empty", () => {
    expect(parseDraft('{"version":1,"files":{"App.tsx":""}}', EDITABLE)).toEqual({ "App.tsx": "" });
  });
});

describe("clearDraft", () => {
  it("removes the stored draft", () => {
    storeRaw({ version: 1, files: { "App.tsx": "x" } });
    clearDraft(SLUG);
    expect(stored()).toBeNull();
  });
});

describe("bad slugs", () => {
  it.each(["", "Like-Button", "like--button", "-like", "like-", "like_button", "../x", "like button"])(
    "ignores %j",
    (slug) => {
      const key = `${DRAFT_KEY_PREFIX}${slug}`;
      window.localStorage.setItem(key, JSON.stringify({ version: 1, files: { "App.tsx": "x" } }));
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const removeItem = vi.spyOn(Storage.prototype, "removeItem");
      const getItem = vi.spyOn(Storage.prototype, "getItem");

      expect(loadDraft(slug, EDITABLE)).toBeNull();
      saveDraft(slug, { "App.tsx": "changed" }, { "App.tsx": "y" });
      saveDraft(slug, { "App.tsx": "y" }, { "App.tsx": "y" });
      clearDraft(slug);

      expect(getItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      expect(window.localStorage.getItem(key)).toBe('{"version":1,"files":{"App.tsx":"x"}}');
    },
  );
});

describe("storage that throws", () => {
  function blocked(): never {
    throw new DOMException("blocked", "SecurityError");
  }

  it("loadDraft returns null when getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    expect(loadDraft(SLUG, EDITABLE)).toBeNull();
  });

  it("saveDraft does not throw when setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    expect(() => saveDraft(SLUG, { "App.tsx": "x" }, { "App.tsx": "y" })).not.toThrow();
  });

  it("saveDraft does not throw when removeItem throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
    expect(() => saveDraft(SLUG, { "App.tsx": "y" }, { "App.tsx": "y" })).not.toThrow();
  });

  it("clearDraft does not throw when removeItem throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(blocked);
    expect(() => clearDraft(SLUG)).not.toThrow();
  });

  it("nothing throws when reading window.localStorage itself throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(blocked);
    expect(loadDraft(SLUG, EDITABLE)).toBeNull();
    expect(() => saveDraft(SLUG, { "App.tsx": "x" }, { "App.tsx": "y" })).not.toThrow();
    expect(() => saveDraft(SLUG, { "App.tsx": "y" }, { "App.tsx": "y" })).not.toThrow();
    expect(() => clearDraft(SLUG)).not.toThrow();
  });
});
