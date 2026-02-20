import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSetProjectFieldValueTool } from "../../../src/tools/github-projects/set-project-field-value.js";
import * as graphql from "../../../src/tools/github-projects/graphql.js";

vi.mock("../../../src/tools/github-projects/graphql.js");

describe("set-project-field-value tool", () => {
    let mockServer: any;
    let registeredHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredHandler = handler;
            })
        } as any;

        registerSetProjectFieldValueTool(mockServer as McpServer);
    });

    it("should register the tool with correct name", () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            "set-project-field-value",
            expect.objectContaining({
                title: "Set Project Field Value"
            }),
            expect.any(Function)
        );
    });

    it("should set TEXT field value successfully", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_1",
                    name: "Status",
                    dataType: "TEXT"
                }
            ]
        });

        vi.mocked(graphql.getIssueNodeId).mockResolvedValue("ISSUE_node123");
        vi.mocked(graphql.addIssueToProject).mockResolvedValue("PVTI_item123");
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            repo: "mcp-server",
            projectNumber: 2,
            issueNumber: 73,
            fieldName: "Status",
            value: "In Progress"
        });

        expect(result.content[0].text).toContain("Successfully set field");
        expect(result.content[0].text).toContain("Status");
        expect(result.content[0].text).toContain("In Progress");
        expect(result.isError).toBeUndefined();

        expect(graphql.updateProjectFieldValue).toHaveBeenCalledWith(
            "PVT_test123",
            "PVTI_item123",
            "PVTF_1",
            "In Progress",
            "TEXT"
        );
    });

    it("should set NUMBER field value successfully", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_2",
                    name: "Effort",
                    dataType: "NUMBER"
                }
            ]
        });

        vi.mocked(graphql.getIssueNodeId).mockResolvedValue("ISSUE_node123");
        vi.mocked(graphql.addIssueToProject).mockResolvedValue("PVTI_item123");
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            repo: "mcp-server",
            projectNumber: 2,
            issueNumber: 73,
            fieldName: "Effort",
            value: 5
        });

        expect(result.content[0].text).toContain("Successfully set field");
        expect(result.isError).toBeUndefined();

        expect(graphql.updateProjectFieldValue).toHaveBeenCalledWith(
            "PVT_test123",
            "PVTI_item123",
            "PVTF_2",
            5,
            "NUMBER"
        );
    });

    it("should resolve SINGLE_SELECT option ID", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_3",
                    name: "Priority",
                    dataType: "SINGLE_SELECT",
                    options: [
                        { id: "opt1", name: "High" },
                        { id: "opt2", name: "Medium" },
                        { id: "opt3", name: "Low" }
                    ]
                }
            ]
        });

        vi.mocked(graphql.getIssueNodeId).mockResolvedValue("ISSUE_node123");
        vi.mocked(graphql.addIssueToProject).mockResolvedValue("PVTI_item123");
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            repo: "mcp-server",
            projectNumber: 2,
            issueNumber: 73,
            fieldName: "Priority",
            value: "High"
        });

        expect(result.isError).toBeUndefined();

        // Should pass option ID, not the name
        expect(graphql.updateProjectFieldValue).toHaveBeenCalledWith(
            "PVT_test123",
            "PVTI_item123",
            "PVTF_3",
            "opt1", // Option ID, not "High"
            "SINGLE_SELECT"
        );
    });

    it("should return error if field not found", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_1",
                    name: "Status",
                    dataType: "TEXT"
                }
            ]
        });

        const result = await registeredHandler({
            owner: "bryan-debaun",
            repo: "mcp-server",
            projectNumber: 2,
            issueNumber: 73,
            fieldName: "NonexistentField",
            value: "value"
        });

        expect(result.content[0].text).toContain("Field 'NonexistentField' not found");
        expect(result.content[0].text).toContain("Status");
        expect(result.isError).toBe(true);
    });

    it("should return error if SINGLE_SELECT option not found", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                {
                    id: "PVTF_3",
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
            repo: "mcp-server",
            projectNumber: 2,
            issueNumber: 73,
            fieldName: "Priority",
            value: "Medium"
        });

        expect(result.content[0].text).toContain("Option 'Medium' not found");
        expect(result.content[0].text).toContain("High");
        expect(result.content[0].text).toContain("Low");
        expect(result.isError).toBe(true);
    });

    it("should handle permission errors", async () => {
        vi.mocked(graphql.getProjectFields).mockRejectedValue(
            new Error("403 Forbidden")
        );

        const result = await registeredHandler({
            owner: "bryan-debaun",
            repo: "mcp-server",
            projectNumber: 2,
            issueNumber: 73,
            fieldName: "Status",
            value: "value"
        });

        expect(result.content[0].text).toContain("Permission denied");
        expect(result.isError).toBe(true);
    });
});
