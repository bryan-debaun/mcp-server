import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as graphql from "../../../src/tools/github-projects/graphql.js";
import { registerBulkSetProjectFieldValuesTool } from "../../../src/tools/github-projects/bulk-set-project-field-values.js";

// Mock the graphql module
vi.mock("../../../src/tools/github-projects/graphql.js");

describe("bulk-set-project-field-values tool", () => {
    let mockServer: any;
    let registeredHandler: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockServer = {
            registerTool: vi.fn((name, config, handler) => {
                registeredHandler = handler;
            })
        } as any;

        registerBulkSetProjectFieldValuesTool(mockServer as McpServer);
    });

    it("should register tool with correct name and schema", () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            "bulk-set-project-field-values",
            expect.objectContaining({
                title: expect.any(String),
                description: expect.stringContaining("bulk")
            }),
            expect.any(Function)
        );
    });

    it("should handle multiple successful updates", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" },
                { id: "PVTF_field2", name: "Priority", dataType: "SINGLE_SELECT", options: [
                    { id: "opt1", name: "High" }
                ]}
            ]
        });

        vi.mocked(graphql.getIssueNodeId).mockResolvedValue("ISSUE_node123");
        vi.mocked(graphql.addIssueToProject).mockResolvedValue("PVTI_item123");
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            updates: [
                {
                    repo: "mcp-server",
                    issueNumber: 73,
                    fieldValues: {
                        "Status": "In Progress",
                        "Priority": "High"
                    }
                },
                {
                    repo: "website",
                    issueNumber: 42,
                    fieldValues: {
                        "Status": "Done"
                    }
                }
            ]
        });

        expect(result.content[0].text).toContain("2 succeeded");
        expect(result.content[0].text).toContain("0 failed");
        expect(result.content[0].text).toContain("mcp-server#73");
        expect(result.content[0].text).toContain("website#42");
    });

    it("should handle mixed success and failure", async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: "PVT_test123",
            fields: [
                { id: "PVTF_field1", name: "Status", dataType: "TEXT" }
            ]
        });

        vi.mocked(graphql.getIssueNodeId)
            .mockResolvedValueOnce("ISSUE_node1")
            .mockRejectedValueOnce(new Error("Issue not found"));

        vi.mocked(graphql.addIssueToProject).mockResolvedValue("PVTI_item123");
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined);

        const result = await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            updates: [
                {
                    repo: "mcp-server",
                    issueNumber: 73,
                    fieldValues: { "Status": "Done" }
                },
                {
                    repo: "website",
                    issueNumber: 999,
                    fieldValues: { "Status": "Done" }
                }
            ]
        });

        expect(result.content[0].text).toContain("1 succeeded");
        expect(result.content[0].text).toContain("1 failed");
        expect(result.content[0].text).toContain("✓ mcp-server#73");
        expect(result.content[0].text).toContain("✗ website#999");
        expect(result.content[0].text).toContain("Issue not found");
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
            updates: [
                {
                    repo: "mcp-server",
                    issueNumber: 73,
                    fieldValues: { "NonExistent": "Value" }
                }
            ]
        });

        expect(result.content[0].text).toContain("0 succeeded");
        expect(result.content[0].text).toContain("1 failed");
        expect(result.content[0].text).toContain("not found");
    });

    it("should handle SINGLE_SELECT option resolution", async () => {
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

        vi.mocked(graphql.getIssueNodeId).mockResolvedValue("ISSUE_node123");
        vi.mocked(graphql.addIssueToProject).mockResolvedValue("PVTI_item123");
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined);

        await registeredHandler({
            owner: "bryan-debaun",
            projectNumber: 2,
            updates: [
                {
                    repo: "mcp-server",
                    issueNumber: 73,
                    fieldValues: { "Priority": "High" }
                }
            ]
        });

        // Verify that the option ID was passed, not the name
        expect(graphql.updateProjectFieldValue).toHaveBeenCalledWith(
            "PVT_test123",
            "PVTI_item123",
            "PVTF_field1",
            "opt1"
        );
    });
});
