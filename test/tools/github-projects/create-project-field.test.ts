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
                title: expect.any(String),
                description: expect.stringContaining("custom field")
            }),
            expect.any(Function)
        );
    });

    it("should create TEXT field", async () => {
        vi.mocked(graphql.createProjectField).mockResolvedValue("PVTF_new123");

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Review Status",
            fieldType: "TEXT"
        });

        expect(graphql.createProjectField).toHaveBeenCalledWith(
            "bryan-debaun",
            2,
            "TEXT",
            "Review Status",
            undefined
        );
        expect(graphql.clearProjectCache).toHaveBeenCalledWith("bryan-debaun", 2);
        expect(result.content[0].text).toContain("Review Status");
        expect(result.content[0].text).toContain("PVTF_new123");
    });

    it("should create SINGLE_SELECT field with options", async () => {
        vi.mocked(graphql.createProjectField).mockResolvedValue("PVTF_select123");

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Priority",
            fieldType: "SINGLE_SELECT",
            options: ["High", "Medium", "Low"]
        });

        expect(graphql.createProjectField).toHaveBeenCalledWith(
            "bryan-debaun",
            2,
            "SINGLE_SELECT",
            "Priority",
            ["High", "Medium", "Low"]
        );
        expect(result.content[0].text).toContain("Priority");
        expect(result.content[0].text).toContain("PVTF_select123");
    });

    it("should fail if SINGLE_SELECT has no options", async () => {
        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Status",
            fieldType: "SINGLE_SELECT"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("SINGLE_SELECT fields require options");
    });

    it("should handle GraphQL errors", async () => {
        vi.mocked(graphql.createProjectField).mockRejectedValue(
            new Error("Insufficient permissions")
        );

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            fieldName: "Effort",
            fieldType: "NUMBER"
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Insufficient permissions");
    });
});
