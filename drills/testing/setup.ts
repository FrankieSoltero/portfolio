// Setup for drill check runs (vitest.drills.config.mts): jest-dom matchers, and
// Testing Library cleanup after each check (vitest globals are off, so Testing Library
// cannot register its own).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
