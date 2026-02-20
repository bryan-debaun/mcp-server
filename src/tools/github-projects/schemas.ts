import { z } from "zod";

/**
 * Common schema for owner/repo format
 */
export const OwnerSchema = z
    .string()
    .min(1)
    .describe("GitHub username or organization name");

/**
 * Common schema for project number
 */
export const ProjectNumberSchema = z
    .number()
    .int()
    .positive()
    .describe("Project number (e.g., 2 for Project #2)");

/**
 * Schema for project field types
 */
export const ProjectFieldTypeSchema = z
    .enum(["TEXT", "NUMBER", "DATE", "SINGLE_SELECT", "ITERATION"])
    .describe("Field type: TEXT, NUMBER, DATE, SINGLE_SELECT, or ITERATION");

/**
 * Schema for get-project-fields tool input
 */
export const GetProjectFieldsInputSchema = {
    owner: OwnerSchema,
    projectNumber: ProjectNumberSchema
};

/**
 * Schema for create-project-field tool input
 */
export const CreateProjectFieldInputSchema = {
    owner: OwnerSchema,
    projectNumber: ProjectNumberSchema,
    name: z.string().min(1).describe("Field name"),
    dataType: ProjectFieldTypeSchema,
    options: z
        .array(z.string())
        .optional()
        .describe("Options for SINGLE_SELECT field (required if dataType is SINGLE_SELECT)")
};

/**
 * Schema for update-project-field tool input
 */
export const UpdateProjectFieldInputSchema = {
    owner: OwnerSchema,
    projectNumber: ProjectNumberSchema,
    fieldName: z.string().min(1).describe("Current field name to update"),
    newName: z.string().min(1).optional().describe("New field name"),
    addOptions: z
        .array(z.string())
        .optional()
        .describe("Options to add (for SINGLE_SELECT fields)"),
    removeOptions: z
        .array(z.string())
        .optional()
        .describe("Options to remove (for SINGLE_SELECT fields)")
};

/**
 * Schema for delete-project-field tool input
 */
export const DeleteProjectFieldInputSchema = {
    owner: OwnerSchema,
    projectNumber: ProjectNumberSchema,
    fieldName: z.string().min(1).describe("Field name to delete")
};

/**
 * Schema for set-project-field-value tool input
 */
export const SetProjectFieldValueInputSchema = {
    owner: OwnerSchema,
    repo: z.string().min(1).describe("Repository name (just the name, not owner/repo)"),
    projectNumber: ProjectNumberSchema,
    issueNumber: z.number().int().positive().describe("Issue number"),
    fieldName: z.string().min(1).describe("Field name"),
    value: z.union([z.string(), z.number()]).describe("Field value (string or number)")
};

/**
 * Schema for bulk-set-project-field-values tool input
 */
export const BulkSetProjectFieldValuesInputSchema = {
    owner: OwnerSchema,
    repo: z.string().min(1).describe("Repository name (just the name, not owner/repo)"),
    projectNumber: ProjectNumberSchema,
    updates: z
        .array(
            z.object({
                issueNumber: z.number().int().positive().describe("Issue number"),
                fields: z
                    .record(z.union([z.string(), z.number()]))
                    .describe("Map of field names to values")
            })
        )
        .min(1)
        .describe("Array of updates, each with issueNumber and fields")
};
