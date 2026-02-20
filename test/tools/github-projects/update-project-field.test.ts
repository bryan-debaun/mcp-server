import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as graphql from "../../../src/tools/github-projects/graphql.js";
import { registerUpdateProjectFieldTool } from "../../../src/tools/github-projects/update-project-field.js";

// Mock the graphql module
vi.mock("../../../src/tools/github-projects/graphql.js");

describe("update-project-field tool", () => {
    let mockServer: any;
    let registeredHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredHandler = handler;
            })
        } as any;

        registerUpdateProjectFieldTool(mockServer as McpServer);
    });

    it("should register tool with correct name and schema", () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            "update-project-field",
            expect.objectContaining({
                title: "Update Project Field",
                description: "Update a custom field in a GitHub Project V2 (rename, add/remove options)"
            }),
            expect.any(Function)
        );
    });

    it("should rename field", async () => {

        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" }
            ]
        });

        vi.mocked(graphql.updateProjectFieldName).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Status",
            newName: "Review Status"
        });

        expect(graphql.updateProjectFieldName).toHaveBeenCalledWith("PVT_test123", "PVTF_field1", "Review Status");
        expect(graphql.clearProjectCache).toHaveBeenCalledWith("bryan-debaun", 2);
        expect(result.content[0].text).toContain("Review Status");
    });

    it("should add options to SINGLE_SELECT field", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_field1",
                    name: "Priority",
                    dataType: "SINGLE_SELECT",
                    options: [
                        { id: "opt1", name: "High" },
                        { id: "opt2", name: "Low" }
                    ]
                }
            ]
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Priority",
            addOptions: ["Medium", "Critical"]
        });

        expect(graphql.addFieldOptions).toHaveBeenCalledWith(
            "PVT_test123",
            "PVTF_field1",
            ["Medium", "Critical"]
        );
        expect(result.content[0].text).toContain("added");
    });

    it("should remove options from SINGLE_SELECT field", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_field1",
                    name: "Priority",
                    dataType: "SINGLE_SELECT",
                    options: [
                        { id: "opt1", name: "High" },
                        { id: "opt2", name: "Low" },
                        { id: "opt3", name: "Medium" }
                    ]
                }
            ]
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Priority",
            removeOptions: ["Low"]
        });

        expect(graphql.removeFieldOptions).toHaveBeenCalledWith(
            "PVT_test123",
            ["opt2"]
        );
        expect(result.content[0].text).toContain("removed");
    });

    it("should fail when trying to add options to non-SINGLE_SELECT field", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" }
            ]
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Status",
            addOptions: ["Done"]
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Cannot add options to field");
        expect(result.content[0].text).toContain("Only SINGLE_SELECT fields support options");
    });

    it("should handle field not found", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" }
            ]
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "NonExistent",
            newName: "Something"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("not found");
    });
});
