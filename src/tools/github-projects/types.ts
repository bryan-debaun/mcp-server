/**
 * GitHub Projects V2 field types and interfaces
 */

/**
 * Project field data types supported by GitHub Projects V2
 */
export type ProjectFieldType =
    | "TEXT"
    | "NUMBER"
    | "DATE"
    | "SINGLE_SELECT"
    | "ITERATION";

/**
 * Option for a SINGLE_SELECT field
 */
export interface ProjectFieldOption {
    id: string;
    name: string;
}

/**
 * Project field metadata
 */
export interface ProjectField {
    id: string;
    name: string;
    dataType: ProjectFieldType;
    options?: ProjectFieldOption[];  // Only for SINGLE_SELECT fields
}

/**
 * Cached project metadata
 */
export interface ProjectMetadata {
    projectId: string;
    fields: ProjectField[];
    fetchedAt: number;  // Timestamp for cache invalidation
}

/**
 * Project item (issue or PR linked to project)
 */
export interface ProjectItem {
    id: string;
    contentId: string;  // Issue or PR node ID
}

/**
 * Field value union type
 */
export type FieldValue = string | number | Date;

/**
 * GraphQL response for project query
 */
export interface ProjectQueryResponse {
    user?: {
        projectV2?: {
            id: string;
            fields: {
                nodes: Array<{
                    __typename: string;
                    id: string;
                    name: string;
                    dataType?: string;
                    options?: Array<{
                        id: string;
                        name: string;
                    }>;
                }>;
            };
        };
    };
    organization?: {
        projectV2?: {
            id: string;
            fields: {
                nodes: Array<{
                    __typename: string;
                    id: string;
                    name: string;
                    dataType?: string;
                    options?: Array<{
                        id: string;
                        name: string;
                    }>;
                }>;
            };
        };
    };
}

/**
 * GraphQL response for repository issue query
 */
export interface IssueNodeIdResponse {
    repository: {
        issue: {
            id: string;
        };
    };
}

/**
 * GraphQL response for add project item mutation
 */
export interface AddProjectItemResponse {
    addProjectV2ItemById: {
        item: {
            id: string;
        };
    };
}

/**
 * GraphQL response for update field value mutation
 */
export interface UpdateFieldValueResponse {
    updateProjectV2ItemFieldValue: {
        projectV2Item: {
            id: string;
        };
    };
}
