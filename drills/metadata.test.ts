import { describe, expect, it } from "vitest";
import { drillsMetadata } from "./metadata";

describe("drillsMetadata", () => {
  it("titles pages '%s · Drills · Francisco Soltero', defaulting to 'Drills'", () => {
    expect(drillsMetadata.title).toEqual({
      default: "Drills",
      template: "%s · Drills · Francisco Soltero",
    });
  });

  it("sets no robots key", () => {
    expect(drillsMetadata).not.toHaveProperty("robots");
  });
});
