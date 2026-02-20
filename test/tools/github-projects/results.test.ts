import { describe, it, expect } from "vitest";
import {
    createSuccessResult,
    createErrorResult,
    createPermissionError,
    createFieldNotFoundError,
    createOptionNotFoundError
} from "../../../src/tools/github-projects/results.js";

describe("github-projects results", () => {
    describe("createSuccessResult", () => {
        it("should create result with string content", () => {
            const result = createSuccessResult("Operation successful");

            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({
                type: "text",
                text: "Operation successful"
            });
            expect(result.isError).toBeUndefined();
        });

        it("should create result with JSON-stringified object", () => {
            const data = { fieldName: "Priority", value: "High" };
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
            const result = createErrorResult("Field not found");

            expect(result.content).toHaveLength(1);
            expect(result.content[0].text).toContain("Error: Field not found");
            expect(result.isError).toBe(true);
        });

        it("should include context when provided", () => {
            const result = createErrorResult("Invalid field type", {
                fieldName: "Status",
                providedType: "INVALID"
            });

            expect(result.content[0].text).toContain("Error: Invalid field type");
            expect(result.content[0].text).toContain("Context:");
            expect(result.content[0].text).toContain("fieldName");
            expect(result.isError).toBe(true);
        });
    });

    describe("createPermissionError", () => {
        it("should create permission error with suggestions", () => {
            const result = createPermissionError("access project fields");

            expect(result.content[0].text).toContain("Permission denied");
            expect(result.content[0].text).toContain("access project fields");
            expect(result.content[0].text).toContain("project' scope");
            expect(result.content[0].text).toContain("gh auth refresh");
            expect(result.isError).toBe(true);
        });
    });

    describe("createFieldNotFoundError", () => {
        it("should list available fields", () => {
            const result = createFieldNotFoundError("InvalidField", [
                "Priority",
                "Status",
                "Effort"
            ]);

            expect(result.content[0].text).toContain("Field 'InvalidField' not found");
            expect(result.content[0].text).toContain("Priority");
            expect(result.content[0].text).toContain("Status");
            expect(result.content[0].text).toContain("Effort");
            expect(result.isError).toBe(true);
        });

        it("should suggest creating new field", () => {
            const result = createFieldNotFoundError("NewField", ["Existing"]);

            expect(result.content[0].text).toContain("create-project-field");
        });
    });

    describe("createOptionNotFoundError", () => {
        it("should list available options", () => {
            const result = createOptionNotFoundError(
                "Critical",
                "Priority",
                ["High", "Medium", "Low"]
            );

            expect(result.content[0].text).toContain("Option 'Critical' not found");
            expect(result.content[0].text).toContain("field 'Priority'");
            expect(result.content[0].text).toContain("High");
            expect(result.content[0].text).toContain("Medium");
            expect(result.content[0].text).toContain("Low");
            expect(result.isError).toBe(true);
        });
    });
});
