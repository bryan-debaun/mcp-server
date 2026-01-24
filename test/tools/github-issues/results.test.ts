import { describe, it, expect } from "vitest";
import { createSuccessResult, createErrorResult } from "../../../src/tools/github-issues/results.js";

describe("results", () => {
    describe("createSuccessResult", () => {
        it("should create result with string content", () => {
            const result = createSuccessResult("Hello world");

            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({
                type: "text",
                text: "Hello world"
            });
            expect(result.isError).toBeUndefined();
        });

        it("should create result with JSON-stringified object", () => {
            const data = { foo: "bar", count: 42 };
            const result = createSuccessResult(data);

            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({
                type: "text",
                text: JSON.stringify(data, null, 2)
            });
        });
    });

    describe("createErrorResult", () => {
        it("should create error result with message", () => {
            const result = createErrorResult("Something went wrong");

            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({
                type: "text",
                text: "Error: Something went wrong"
            });
            expect(result.isError).toBe(true);
        });
    });
});
