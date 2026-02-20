import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    getProjectFields,
    createProjectField,
    updateProjectFieldName,
    deleteProjectField,
    addFieldOptions,
    removeFieldOptions,
    getIssueNodeId,
    addIssueToProject,
    updateProjectFieldValue,
    clearProjectCache
} from "../../src/tools/github-projects/graphql.js";

const RUN_INTEGRATION = process.env.RUN_GITHUB_PROJECTS_INTEGRATION === "true";

// Test configuration - set these via environment variables or change for your test project
const TEST_OWNER = process.env.GITHUB_TEST_OWNER || "bryan-debaun";
const TEST_REPO = process.env.GITHUB_TEST_REPO || "mcp-server";
const TEST_PROJECT_NUMBER = parseInt(process.env.GITHUB_TEST_PROJECT_NUMBER || "2", 10);
const TEST_ISSUE_NUMBER = parseInt(process.env.GITHUB_TEST_ISSUE_NUMBER || "73", 10);

/**
 * Integration tests for GitHub Projects V2 tools.
 * 
 * Prerequisites:
 * - GitHub token with 'project' scope in GITHUB_TOKEN env var
 * - Test project exists (e.g., Project #2 in bryan-debaun/mcp-server)
 * - Test issue exists for value testing
 * 
 * Run with:
 * RUN_GITHUB_PROJECTS_INTEGRATION=true npm test -- github-projects.test.ts
 */
describe("GitHub Projects V2 Integration", () => {
    if (!RUN_INTEGRATION) {
        it.skip("skipped - requires RUN_GITHUB_PROJECTS_INTEGRATION=true", () => { });
        return;
    }

    let testFieldId: string | null = null;
    let testProjectId: string | null = null;

    beforeAll(() => {
        // Verify required environment variables
        if (!process.env.GITHUB_TOKEN) {
            throw new Error("GITHUB_TOKEN environment variable required for integration tests");
        }

        console.log(`Running integration tests against:`);
        console.log(`  Project: ${TEST_OWNER} Project #${TEST_PROJECT_NUMBER}`);
        console.log(`  Test Issue: ${TEST_OWNER}/${TEST_REPO}#${TEST_ISSUE_NUMBER}`);
    });

    afterAll(async () => {
        // Clean up: delete test field if it was created
        if (testFieldId && testProjectId) {
            try {
                await deleteProjectField(testProjectId, testFieldId);
                console.log(`Cleaned up test field: ${testFieldId}`);
            } catch (error) {
                console.warn(`Failed to clean up test field: ${error}`);
            }
        }

        // Clear cache
        clearProjectCache();
    });

    describe("get-project-fields", () => {
        it("should retrieve project fields from real GitHub project", async () => {
            const result = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);

            expect(result).toBeDefined();
            expect(result.projectId).toMatch(/^PVT_/);
            expect(Array.isArray(result.fields)).toBe(true);

            // Store for later tests
            testProjectId = result.projectId;

            // Verify field structure
            if (result.fields.length > 0) {
                const field = result.fields[0];
                expect(field).toHaveProperty("id");
                expect(field).toHaveProperty("name");
                expect(field).toHaveProperty("dataType");
            }

            console.log(`Retrieved ${result.fields.length} fields from project`);
        }, 30000);
    });

    describe("create-project-field", () => {
        it("should create a TEXT field", async () => {
            if (!testProjectId) {
                throw new Error("testProjectId not set - run get-project-fields test first");
            }

            const testFieldName = `Test_Field_${Date.now()}`;
            const result = await createProjectField(
                testProjectId,
                testFieldName,
                "TEXT"
            );

            expect(result).toBeDefined();
            expect(result.fieldId).toMatch(/^PVTF_/);

            // Store for cleanup
            testFieldId = result.fieldId;

            console.log(`Created TEXT field: ${testFieldName} (${result.fieldId})`);
        }, 30000);

        it("should create a SINGLE_SELECT field with options", async () => {
            if (!testProjectId) {
                throw new Error("testProjectId not set");
            }

            const testFieldName = `Test_Select_${Date.now()}`;
            const result = await createProjectField(
                testProjectId,
                testFieldName,
                "SINGLE_SELECT",
                ["Option1", "Option2", "Option3"]
            );

            expect(result).toBeDefined();
            // SINGLE_SELECT fields have a different ID prefix
            expect(result.fieldId).toMatch(/^PVTSSF_/);

            // Verify it was created (clear cache first to fetch fresh data)
            clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);
            const fields = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const createdField = fields.fields.find((f) => f.id === result.fieldId);

            expect(createdField).toBeDefined();
            expect(createdField?.dataType).toBe("SINGLE_SELECT");
            expect(createdField?.options).toBeDefined();
            expect(createdField?.options?.length).toBe(3);

            // Clean up this field immediately
            await deleteProjectField(testProjectId, result.fieldId);

            console.log(`Created and cleaned up SINGLE_SELECT field: ${testFieldName}`);
        }, 30000);
    });

    describe("update-project-field", () => {
        it("should rename a field", async () => {
            if (!testProjectId) {
                throw new Error("testProjectId not set");
            }

            // Create a field specifically for this test
            const testFieldName = `Test_Rename_${Date.now()}`;
            const createResult = await createProjectField(
                testProjectId,
                testFieldName,
                "TEXT"
            );
            const fieldToRename = createResult.fieldId;

            try {
                // Get current name
                clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);
                const fieldsBefore = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
                const fieldBefore = fieldsBefore.fields.find((f) => f.id === fieldToRename);
                expect(fieldBefore).toBeDefined();

                const newName = `${fieldBefore!.name}_Renamed`;
                await updateProjectFieldName(testProjectId, fieldToRename, newName);

                // Clear cache and verify rename
                clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);
                const fieldsAfter = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
                const fieldAfter = fieldsAfter.fields.find((f) => f.id === fieldToRename);

                expect(fieldAfter).toBeDefined();
                expect(fieldAfter!.name).toBe(newName);

                console.log(`Renamed field to: ${newName}`);
            } finally {
                // Clean up the field we created
                await deleteProjectField(testProjectId, fieldToRename);
            }
        }, 30000);
    });

    describe("add/remove field options", () => {
        let selectFieldId: string | null = null;

        beforeAll(async () => {
            if (!testProjectId) {
                throw new Error("testProjectId not set");
            }

            // Create a SINGLE_SELECT field for option testing
            const testFieldName = `Test_Options_${Date.now()}`;
            const result = await createProjectField(
                testProjectId,
                testFieldName,
                "SINGLE_SELECT",
                ["InitialOption"]
            );

            selectFieldId = result.fieldId;
            console.log(`Created SINGLE_SELECT field for option testing: ${selectFieldId}`);
        });

        afterAll(async () => {
            // Clean up the select field
            if (testProjectId && selectFieldId) {
                await deleteProjectField(testProjectId, selectFieldId);
                console.log(`Cleaned up SINGLE_SELECT test field: ${selectFieldId}`);
            }
        });

        it.skip("should add options to SINGLE_SELECT field", async () => {
            // TODO: GitHub API doesn't support createProjectV2FieldOption mutation
            // Options must be specified when creating the field
            if (!testProjectId || !selectFieldId) {
                throw new Error("Test prerequisites not met");
            }

            await addFieldOptions(testProjectId, selectFieldId, ["NewOption1", "NewOption2"]);

            // Verify options were added
            clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);
            const fields = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const field = fields.fields.find((f) => f.id === selectFieldId);

            expect(field).toBeDefined();
            expect(field!.options?.length).toBeGreaterThanOrEqual(3); // InitialOption + 2 new

            console.log(`Added 2 options. Total options: ${field!.options?.length}`);
        }, 30000);

        it.skip("should remove options from SINGLE_SELECT field", async () => {
            // TODO: GitHub API doesn't support deleteProjectV2FieldOption mutation
            // Need to investigate if this is possible through updateProjectV2Field
            if (!testProjectId || !selectFieldId) {
                throw new Error("Test prerequisites not met");
            }

            // Get current state
            const fieldsBefore = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const fieldBefore = fieldsBefore.fields.find((f) => f.id === selectFieldId);
            const optionToRemove = fieldBefore!.options![0]; // Remove first option

            await removeFieldOptions(testProjectId, [optionToRemove.id]);

            // Verify option was removed
            clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);
            const fieldsAfter = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const fieldAfter = fieldsAfter.fields.find((f) => f.id === selectFieldId);

            expect(fieldAfter!.options?.length).toBe(fieldBefore!.options!.length - 1);

            console.log(`Removed option. Remaining options: ${fieldAfter!.options?.length}`);
        }, 30000);
    });

    describe("set-project-field-value", () => {
        it("should add issue to project and set field value", async () => {
            if (!testProjectId || !testFieldId) {
                throw new Error("Test prerequisites not met");
            }

            // Get issue node ID
            const issueNodeId = await getIssueNodeId(TEST_OWNER, TEST_REPO, TEST_ISSUE_NUMBER);
            expect(issueNodeId).toMatch(/^I_/);

            // Add issue to project
            const projectItemId = await addIssueToProject(testProjectId, issueNodeId);
            expect(projectItemId).toMatch(/^PVTI_/);

            // Set field value
            const testValue = `TestValue_${Date.now()}`;
            await updateProjectFieldValue(
                testProjectId,
                projectItemId,
                testFieldId,
                testValue,
                "TEXT"
            );

            console.log(`Set field value on issue #${TEST_ISSUE_NUMBER}: ${testValue}`);
        }, 30000);
    });

    describe("delete-project-field", () => {
        it("should delete the test field", async () => {
            if (!testProjectId || !testFieldId) {
                throw new Error("Test prerequisites not met");
            }

            // Delete field
            await deleteProjectField(testProjectId, testFieldId);

            // Verify it's gone
            clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);
            const fields = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const deletedField = fields.fields.find((f) => f.id === testFieldId);

            expect(deletedField).toBeUndefined();

            console.log(`Successfully deleted test field: ${testFieldId}`);

            // Clear reference so afterAll doesn't try to delete again
            testFieldId = null;
        }, 30000);
    });

    describe("field caching", () => {
        it("should cache project fields on repeated calls", async () => {
            // First call - will fetch from API
            const start1 = Date.now();
            const result1 = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const duration1 = Date.now() - start1;

            // Second call - should use cache
            const start2 = Date.now();
            const result2 = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);
            const duration2 = Date.now() - start2;

            // Verify same data
            expect(result1.projectId).toBe(result2.projectId);
            expect(result1.fields.length).toBe(result2.fields.length);

            // Cached call should be faster or equal (may both be 0ms if very fast)
            console.log(`First call: ${duration1}ms, Cached call: ${duration2}ms`);
            expect(duration2).toBeLessThanOrEqual(duration1);
        }, 30000);

        it("should refresh cache after clearProjectCache", async () => {
            // Get cached data
            const result1 = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);

            // Clear cache
            clearProjectCache(TEST_OWNER, TEST_PROJECT_NUMBER);

            // Next call should fetch fresh data
            const result2 = await getProjectFields(TEST_OWNER, TEST_PROJECT_NUMBER);

            // Data should still match (but was re-fetched)
            expect(result1.projectId).toBe(result2.projectId);

            console.log("Cache cleared and refreshed successfully");
        }, 30000);
    });
});
