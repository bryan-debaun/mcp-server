import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetProjectFieldsTool } from "../../../src/tools/github-projects/get-project-fields.js";
import * as graphql from "../../../src/tools/github-projects/graphql.js";

vi.mock("../../../src/tools/github-projects/graphql.js");

describe("get-project-fields tool", () => {
    let mockServer: any;
    let registeredHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredHandler = handler;
            })
        } as any;

        registerGetProjectFieldsTool(mockServer as McpServer);
    });

    it("should register the tool with correct name and config", () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            "get-project-fields",
            expect.objectContaining({
                title: "Get Project Fields",
                description: expect.stringContaining("custom fields")
            }),
            expect.any(Function)
        );
    });

    it("should return formatted fields successfully", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_1",
                    name: "Status",
                    dataType: "TEXT"
                },
                {
                    id: "PVTF_2",
                    name: "Priority",
                    dataType: "SINGLE_SELECT",
                    options: [
                        { id: "opt1", name: "High" },
                        { id: "opt2", name: "Low" }
                    ]
                },
                {
                    id: "PVTF_3",
                    name: "Effort",
                    dataType: "NUMBER"
                }
            ]
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2
        });

        expect(result.content[0].text).toContain("PVT_test123");
        expect(result.content[0].text).toContain("Status");
        expect(result.content[0].text).toContain("Priority");
        expect(result.content[0].text).toContain("High");
        expect(result.content[0].text).toContain("Low");
        expect(result.content[0].text).toContain("Effort");
        expect(result.content[0].text).toContain("totalFields");
        expect(result.isError).toBeUndefined();
    });

    it("should handle permission errors gracefully", async () => {
        vi.mocked(graphql.getProjectFields).mockRejectedValue(
            new Error("Could not resolve to a ProjectV2 with the number 2")
        );

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2
        });

        expect(result.content[0].text).toContain("Permission denied");
        expect(result.content[0].text).toContain("gh auth refresh");
        expect(result.isError).toBe(true);
    });

    it("should handle generic errors", async () => {
        vi.mocked(graphql.getProjectFields).mockRejectedValue(
            new Error("Network timeout")
        );

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2
        });

        expect(result.content[0].text).toContain("Error: Network timeout");
        expect(result.isError).toBe(true);
    });
});
