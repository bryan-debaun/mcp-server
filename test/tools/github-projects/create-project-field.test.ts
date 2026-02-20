import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as graphql from "../../../src/tools/github-projects/graphql.js";
import { registerCreateProjectFieldTool } from "../../../src/tools/github-projects/create-project-field.js";

// Mock the graphql module
vi.mock("../../../src/tools/github-projects/graphql.js");

describe("create-project-field tool", () => {
    let mockServer: any;
    let registeredHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredHandler = handler;
            })
        } as any;

        registerCreateProjectFieldTool(mockServer as McpServer);
    });

    it("should register tool with correct name and schema", () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            "create-project-field",
            expect.objectContaining({
                title: "Create Project Field",
                description: "Create a new custom field in a GitHub Project V2"
            }),
            expect.any(Function)
        );
    });

    it("should create TEXT field", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: []
        });
        vi.mocked(graphql.createProjectField).mockResolvedValue({ fieldId: "PVTF_new123" });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            name: "Review Status",
            dataType: "TEXT"
        });

        expect(graphql.createProjectField).toHaveBeenCalledWith(
            "PVT_test123",
            "Review Status",
            "TEXT",
            undefined
        );
        expect(graphql.clearProjectCache).toHaveBeenCalledWith("bryan-debaun", 2);
        expect(result.content[0].text).toContain("Review Status");
        expect(result.content[0].text).toContain("PVTF_new123");
    });

    it("should create SINGLE_SELECT field with options", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: []
        });
        vi.mocked(graphql.createProjectField).mockResolvedValue({ fieldId: "PVTF_select123" });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            name: "Priority",
            dataType: "SINGLE_SELECT",
            options: ["High", "Medium", "Low"]
        });

        expect(graphql.createProjectField).toHaveBeenCalledWith(
            "PVT_test123",
            "Priority",
            "SINGLE_SELECT",
            ["High", "Medium", "Low"]
        );
        expect(result.content[0].text).toContain("Priority");
        expect(result.content[0].text).toContain("PVTF_select123");
    });

    it("should fail if SINGLE_SELECT has no options", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: []
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            name: "Status",
            dataType: "SINGLE_SELECT"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("SINGLE_SELECT fields require at least one option");
    });

    it("should handle GraphQL errors", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: []
        });
        vi.mocked(graphql.createProjectField).mockRejectedValue(
            new Error("Insufficient permissions")
        );

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            name: "Effort",
            dataType: "NUMBER"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Permission denied");
        expect(result.content[0].text).toContain("create project fields");
    });
});
