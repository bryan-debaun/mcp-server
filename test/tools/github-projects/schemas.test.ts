import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
    OwnerSchema,
    ProjectNumberSchema,
    ProjectFieldTypeSchema,
    GetProjectFieldsInputSchema,
    CreateProjectFieldInputSchema,
    UpdateProjectFieldInputSchema,
    DeleteProjectFieldInputSchema,
    SetProjectFieldValueInputSchema,
    BulkSetProjectFieldValuesInputSchema
} from "../../../src/tools/github-projects/schemas.js";

describe("github-projects schemas", () => {
    describe("OwnerSchema", () => {
        it("should accept valid owner names", () => {
            expect(OwnerSchema.parse("bryan-debaun")).toBe("bryan-debaun");
            expect(OwnerSchema.parse("my-org")).toBe("my-org");
            expect(OwnerSchema.parse("user123")).toBe("user123");
        });

        it("should reject empty strings", () => {
            expect(() => OwnerSchema.parse("")).toThrow();
        });
    });

    describe("ProjectNumberSchema", () => {
        it("should accept positive integers", () => {
            expect(ProjectNumberSchema.parse(1)).toBe(1);
            expect(ProjectNumberSchema.parse(100)).toBe(100);
        });

        it("should reject non-positive numbers", () => {
            expect(() => ProjectNumberSchema.parse(0)).toThrow();
            expect(() => ProjectNumberSchema.parse(-1)).toThrow();
        });

        it("should reject non-integers", () => {
            expect(() => ProjectNumberSchema.parse(1.5)).toThrow();
        });
    });

    describe("ProjectFieldTypeSchema", () => {
        it("should accept valid field types", () => {
            expect(ProjectFieldTypeSchema.parse("TEXT")).toBe("TEXT");
            expect(ProjectFieldTypeSchema.parse("NUMBER")).toBe("NUMBER");
            expect(ProjectFieldTypeSchema.parse("DATE")).toBe("DATE");
            expect(ProjectFieldTypeSchema.parse("SINGLE_SELECT")).toBe("SINGLE_SELECT");
            expect(ProjectFieldTypeSchema.parse("ITERATION")).toBe("ITERATION");
        });

        it("should reject invalid field types", () => {
            expect(() => ProjectFieldTypeSchema.parse("INVALID")).toThrow();
            expect(() => ProjectFieldTypeSchema.parse("text")).toThrow();
            expect(() => ProjectFieldTypeSchema.parse("")).toThrow();
        });
    });

    describe("GetProjectFieldsInputSchema", () => {
        const schema = z.object(GetProjectFieldsInputSchema);

        it("should accept valid input", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2
            });
            expect(result.owner).toBe("bryan-debaun");
            expect(result.projectNumber).toBe(2);
        });

        it("should reject missing fields", () => {
            expect(() => schema.parse({ owner: "bryan-debaun" })).toThrow();
            expect(() => schema.parse({ projectNumber: 2 })).toThrow();
        });
    });

    describe("CreateProjectFieldInputSchema", () => {
        const schema = z.object(CreateProjectFieldInputSchema);

        it("should accept valid TEXT field creation", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                name: "Status",
                dataType: "TEXT"
            });
            expect(result.name).toBe("Status");
            expect(result.dataType).toBe("TEXT");
        });

        it("should accept SINGLE_SELECT field with options", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                name: "Priority",
                dataType: "SINGLE_SELECT",
                options: ["High", "Medium", "Low"]
            });
            expect(result.options).toEqual(["High", "Medium", "Low"]);
        });

        it("should accept NUMBER field", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                name: "Effort",
                dataType: "NUMBER"
            });
            expect(result.dataType).toBe("NUMBER");
        });
    });

    describe("UpdateProjectFieldInputSchema", () => {
        const schema = z.object(UpdateProjectFieldInputSchema);

        it("should accept field rename", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                fieldName: "OldName",
                newName: "NewName"
            });
            expect(result.newName).toBe("NewName");
        });

        it("should accept adding options", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                fieldName: "Priority",
                addOptions: ["Critical"]
            });
            expect(result.addOptions).toEqual(["Critical"]);
        });

        it("should accept removing options", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                fieldName: "Priority",
                removeOptions: ["Low"]
            });
            expect(result.removeOptions).toEqual(["Low"]);
        });
    });

    describe("DeleteProjectFieldInputSchema", () => {
        const schema = z.object(DeleteProjectFieldInputSchema);

        it("should accept valid input", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                projectNumber: 2,
                fieldName: "Status"
            });
            expect(result.fieldName).toBe("Status");
        });
    });

    describe("SetProjectFieldValueInputSchema", () => {
        const schema = z.object(SetProjectFieldValueInputSchema);

        it("should accept string value", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                repo: "mcp-server",
                projectNumber: 2,
                issueNumber: 73,
                fieldName: "Status",
                value: "In Progress"
            });
            expect(result.value).toBe("In Progress");
        });

        it("should accept number value", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                repo: "mcp-server",
                projectNumber: 2,
                issueNumber: 73,
                fieldName: "Effort",
                value: 5
            });
            expect(result.value).toBe(5);
        });
    });

    describe("BulkSetProjectFieldValuesInputSchema", () => {
        const schema = z.object(BulkSetProjectFieldValuesInputSchema);

        it("should accept bulk updates", () => {
            const result = schema.parse({
                owner: "bryan-debaun",
                repo: "mcp-server",
                projectNumber: 2,
                updates: [
                    {
                        issueNumber: 47,
                        fields: {
                            Priority: "High",
                            Effort: 5
                        }
                    },
                    {
                        issueNumber: 48,
                        fields: {
                            Priority: "Medium",
                            Effort: 3
                        }
                    }
                ]
            });
            expect(result.updates).toHaveLength(2);
            expect(result.updates[0].fields.Priority).toBe("High");
        });

        it("should reject empty updates array", () => {
            expect(() =>
                schema.parse({
                    owner: "bryan-debaun",
                    repo: "mcp-server",
                    projectNumber: 2,
                    updates: []
                })
            ).toThrow();
        });
    });
});
