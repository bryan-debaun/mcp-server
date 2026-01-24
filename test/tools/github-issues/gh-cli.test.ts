import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as ghCli from "../../../src/tools/github-issues/gh-cli.js";

// Mock the gh CLI module
vi.mock("child_process", () => ({
    exec: vi.fn()
}));

describe("gh-cli", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("parseGhJson", () => {
        it("should parse valid JSON", () => {
            const result = ghCli.parseGhJson<{ foo: string }>('{"foo": "bar"}');
            expect(result).toEqual({ foo: "bar" });
        });

        it("should throw on invalid JSON", () => {
            expect(() => ghCli.parseGhJson("not json")).toThrow("Failed to parse GitHub CLI response");
        });
    });
});
