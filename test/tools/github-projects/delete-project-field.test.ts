import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as graphql from "../../../src/tools/github-projects/graphql.js";
import { registerDeleteProjectFieldTool } from "../../../src/tools/github-projects/delete-project-field.js";

// Mock the graphql module
vi.mock("../../../src/tools/github-projects/graphql.js");

describe("delete-project-field tool", () => {
    let mockServer: any;
    let registeredHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredHandler = handler;
            })
        } as any;

        registerDeleteProjectFieldTool(mockServer as McpServer);
    });

    it("should register tool with correct name and schema", () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            "delete-project-field",
            expect.objectContaining({
                title: expect.any(String),
                description: expect.stringContaining("Delete")
            }),
            expect.any(Function)
        );
    });

    it("should delete field successfully", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" },
                { id: "PVTF_field2", name: "Priority", dataType: "SINGLE_SELECT" }
            ]
        });

        vi.mocked(graphql.deleteProjectField).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Status"
        });

        expect(graphql.deleteProjectField).toHaveBeenCalledWith("PVTF_field1");
        expect(graphql.clearProjectCache).toHaveBeenCalledWith("bryan-debaun", 2);
        expect(result.content[0].text).toContain("Status");
        expect(result.content[0].text).toContain("deleted");
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
            fieldName: "NonExistent"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("not found");
        expect(result.content[0].text).toContain("Status");
    });

    it("should handle GraphQL errors", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" }
            ]
        });

        vi.mocked(graphql.deleteProjectField).mockRejectedValue(
            new Error("Insufficient permissions")
        );

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Status"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Insufficient permissions");
    });
});
