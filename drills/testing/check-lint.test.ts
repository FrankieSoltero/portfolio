import { describe, expect, it } from "vitest";
import { lintCheckFile } from "./check-lint";

const CLEAN = `
import { describe, it, expect, beforeEach, afterEach } from "drillbox:test";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { apiControl } from "./api";

describe("Like button", () => {
  beforeEach(() => apiControl.setManual());
  afterEach(() => apiControl.reset());
  it("shows the liked count", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Like First post" }));
    expect(screen.getByText("Liked: 1")).toBeInTheDocument();
  });
});
`;

describe("lintCheckFile", () => {
  it("returns [] for a file that imports only the allowed modules", () => {
    expect(lintCheckFile(CLEAN)).toEqual([]);
  });

  it("reports an import from any other module", () => {
    expect(lintCheckFile(`import { vi } from "vitest";`)).toEqual(["forbidden import: vitest"]);
  });

  it("reports side-effect, dynamic and require imports too", () => {
    const src = `import "./setup";\nconst m = await import("react");\nconst u = require("@testing-library/user-event");`;
    expect(lintCheckFile(src)).toEqual([
      "forbidden import: ./setup",
      "forbidden import: react",
      "forbidden import: @testing-library/user-event",
    ]);
  });

  it("reports vi. and jest. calls", () => {
    expect(lintCheckFile(`const f = vi.fn();`)).toEqual(["forbidden call: vi."]);
    expect(lintCheckFile(`jest.useFakeTimers();`)).toEqual(["forbidden call: jest."]);
  });

  it("does not mistake a longer identifier ending in vi for vi.", () => {
    expect(lintCheckFile(`const navi = { x: 1 }; navi.x;`)).toEqual([]);
  });

  it.each(["stale", "mutat", "closure", "key", "race", "cleanup", "spread", "derive"])(
    "reports a check name containing %s",
    (word) => {
      const name = `works without ${word} things`;
      expect(lintCheckFile(`it("${name}", () => {});`)).toEqual([
        `check name gives away the cause: ${name}`,
      ]);
    }
  );

  it("matches banned words case-insensitively in single-quoted and template names", () => {
    expect(lintCheckFile(`it('does not use a STALE value', () => {});`)).toEqual([
      "check name gives away the cause: does not use a STALE value",
    ]);
    expect(lintCheckFile("it(`Mutates nothing`, () => {});")).toEqual([
      "check name gives away the cause: Mutates nothing",
    ]);
  });

  it("gives the brief's message for a stale-value check name", () => {
    expect(lintCheckFile(`it("does not use a stale value", () => {});`)).toEqual([
      "check name gives away the cause: does not use a stale value",
    ]);
  });

  it("reports several problems in source order", () => {
    const src = `it("keeps the key", () => { vi.fn(); });\nimport x from "vitest";`;
    expect(lintCheckFile(src)).toEqual([
      "check name gives away the cause: keeps the key",
      "forbidden call: vi.",
      "forbidden import: vitest",
    ]);
  });

  it("reports a repeated problem once", () => {
    expect(lintCheckFile(`vi.fn(); vi.fn();`)).toEqual(["forbidden call: vi."]);
  });
});
