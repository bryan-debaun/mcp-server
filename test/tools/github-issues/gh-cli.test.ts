import { describe, it, expect } from "vitest";
import { parseGhJson } from "../../../src/tools/github-issues/gh-cli.js";

/**
 * gh-cli.ts is retained as a legacy module but no longer used by issue tools.
 * Only parseGhJson is tested here since runGhCommand is not invoked at runtime.
 */
describe("gh-cli (legacy)", () => {
    describe("parseGhJson", () => {
        it("should parse valid JSON", () => {
            const result = parseGhJson<{ foo: string }>('{"foo": "bar"}');
            expect(result).toEqual({ foo: "bar" });
        });

        it("should throw on invalid JSON", () => {
            expect(() => parseGhJson("not json")).toThrow("Failed to parse GitHub CLI response");
        });
    });
});
