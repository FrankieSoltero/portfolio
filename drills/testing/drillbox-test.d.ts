// Types for the `drillbox:test` module that drill check files import: the five
// test functions a check may use, typed exactly as vitest's.
declare module "drillbox:test" {
  export { describe, it, expect, beforeEach, afterEach } from "vitest";
}
