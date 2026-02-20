import { graphql } from "@octokit/graphql";
import type {
    ProjectField,
    ProjectMetadata,
    ProjectQueryResponse,
    IssueNodeIdResponse,
    AddProjectItemResponse,
    UpdateFieldValueResponse
} from "./types.js";

/**
 * In-memory cache for project metadata
 * Key: "owner/projectNumber"
 * Value: ProjectMetadata with timestamp
 */
const projectCache = new Map<string, ProjectMetadata>();

/**
 * Cache TTL in milliseconds (5 minutes)
 */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get GitHub token from environment or gh CLI
 */
function getGitHubToken(): string {
    // First try environment variable (for CI/staging)
    if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
    }

    // Fall back to gh CLI auth (for local development)
    // Note: @octokit/graphql will use gh CLI auth automatically if no token provided
    return "";
}

/**
 * Create authenticated graphql client
 */
function createGraphqlClient() {
    const token = getGitHubToken();
    if (token) {
        return graphql.defaults({
            headers: {
                authorization: `token ${token}`
            }
        });
    }
    // If no token, @octokit/graphql will use gh CLI auth
    return graphql;
}

/**
 * Query project fields with caching
 */
export async function getProjectFields(
    owner: string,
    projectNumber: number,
    forceRefresh = false
): Promise<{ projectId: string; fields: ProjectField[] }> {
    const cacheKey = `${owner}/${projectNumber}`;
    const now = Date.now();

    // Check cache unless force refresh
    if (!forceRefresh && projectCache.has(cacheKey)) {
        const cached = projectCache.get(cacheKey)!;
        if (now - cached.fetchedAt < CACHE_TTL) {
            return {
                projectId: cached.projectId,
                fields: cached.fields
            };
        }
    }

    // Query GitHub for project fields
    const client = createGraphqlClient();

    // First try as user account
    const userQuery = `
        query($owner: String!, $projectNumber: Int!) {
            user(login: $owner) {
                projectV2(number: $projectNumber) {
                    id
                    fields(first: 50) {
                        nodes {
                            __typename
                            ... on ProjectV2Field {
                                id
                                name
                                dataType
                            }
                            ... on ProjectV2SingleSelectField {
                                id
                                name
                                dataType
                                options {
                                    id
                                    name
                                }
                            }
                            ... on ProjectV2IterationField {
                                id
                                name
                                dataType
                            }
                        }
                    }
                }
            }
        }
    `;

    // Try user project first
    let response: ProjectQueryResponse;
    try {
        response = await client<ProjectQueryResponse>(userQuery, {
            owner,
            projectNumber
        });
    } catch (error) {
        // If user query fails, try as organization
        const orgQuery = `
            query($owner: String!, $projectNumber: Int!) {
                organization(login: $owner) {
                    projectV2(number: $projectNumber) {
                        id
                        fields(first: 50) {
                            nodes {
                                __typename
                                ... on ProjectV2Field {
                                    id
                                    name
                                    dataType
                                }
                                ... on ProjectV2SingleSelectField {
                                    id
                                    name
                                    dataType
                                    options {
                                        id
                                        name
                                    }
                                }
                                ... on ProjectV2IterationField {
                                    id
                                    name
                                    dataType
                                }
                            }
                        }
                    }
                }
            }
        `;

        response = await client<ProjectQueryResponse>(orgQuery, {
            owner,
            projectNumber
        });
    }

    const projectData = response.user?.projectV2 || response.organization?.projectV2;

    if (!projectData) {
        throw new Error(
            `Project #${projectNumber} not found for owner '${owner}'. ` +
            `Ensure the project exists and you have permission to access it.`
        );
    }

    // Transform GraphQL response to ProjectField[]
    const fields: ProjectField[] = projectData.fields.nodes.map((node) => {
        const field: ProjectField = {
            id: node.id,
            name: node.name,
            dataType: (node.dataType || "TEXT") as ProjectField["dataType"]
        };

        if (node.options) {
            field.options = node.options;
        }

        return field;
    });

    // Cache the result
    projectCache.set(cacheKey, {
        projectId: projectData.id,
        fields,
        fetchedAt: now
    });

    return {
        projectId: projectData.id,
        fields
    };
}

/**
 * Get issue node ID from repository
 */
export async function getIssueNodeId(
    owner: string,
    repo: string,
    issueNumber: number
): Promise<string> {
    const client = createGraphqlClient();

    const query = `
        query($owner: String!, $repo: String!, $issueNumber: Int!) {
            repository(owner: $owner, name: $repo) {
                issue(number: $issueNumber) {
                    id
                }
            }
        }
    `;

    const response = await client<IssueNodeIdResponse>(query, {
        owner,
        repo,
        issueNumber
    });

    if (!response.repository?.issue) {
        throw new Error(
            `Issue #${issueNumber} not found in ${owner}/${repo}`
        );
    }

    return response.repository.issue.id;
}

/**
 * Add issue to project and return project item ID
 */
export async function addIssueToProject(
    projectId: string,
    contentId: string
): Promise<string> {
    const client = createGraphqlClient();

    const mutation = `
        mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {
                projectId: $projectId
                contentId: $contentId
            }) {
                item {
                    id
                }
            }
        }
    `;

    const response = await client<AddProjectItemResponse>(mutation, {
        projectId,
        contentId
    });

    return response.addProjectV2ItemById.item.id;
}

/**
 * Update project field value
 */
export async function updateProjectFieldValue(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: string | number,
    fieldType: ProjectField["dataType"]
): Promise<void> {
    const client = createGraphqlClient();

    // Build value object based on field type
    let valueObject: any;

    switch (fieldType) {
        case "TEXT":
            valueObject = { text: String(value) };
            break;
        case "NUMBER":
            valueObject = { number: Number(value) };
            break;
        case "DATE":
            // Expect ISO 8601 format string
            valueObject = { date: String(value) };
            break;
        case "SINGLE_SELECT":
            // Value should be option ID (resolved by caller)
            valueObject = { singleSelectOptionId: String(value) };
            break;
        case "ITERATION":
            // Value should be iteration ID
            valueObject = { iterationId: String(value) };
            break;
        default:
            throw new Error(`Unsupported field type: ${fieldType}`);
    }

    const mutation = `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
            updateProjectV2ItemFieldValue(input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: $value
            }) {
                projectV2Item {
                    id
                }
            }
        }
    `;

    await client<UpdateFieldValueResponse>(mutation, {
        projectId,
        itemId,
        fieldId,
        value: valueObject
    });
}

/**
 * Create a new project field
 */
export async function createProjectField(
    projectId: string,
    name: string,
    dataType: ProjectField["dataType"],
    options?: string[]
): Promise<{ fieldId: string }> {
    const client = createGraphqlClient();

    // For SINGLE_SELECT fields, create with options
    if (dataType === "SINGLE_SELECT") {
        if (!options || options.length === 0) {
            throw new Error("SINGLE_SELECT fields require at least one option");
        }

        const mutation = `
            mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
                createProjectV2Field(input: {
                    projectId: $projectId
                    dataType: SINGLE_SELECT
                    name: $name
                    singleSelectOptions: $options
                }) {
                    projectV2Field {
                        ... on ProjectV2SingleSelectField {
                            id
                        }
                    }
                }
            }
        `;

        const optionInputs = options.map((opt) => ({
            name: opt,
            color: "GRAY",  // Default color, can be customized later
            description: ""  // Required by GitHub API, can be empty
        }));

        const response = await client<any>(mutation, {
            projectId,
            name,
            options: optionInputs
        });

        return { fieldId: response.createProjectV2Field.projectV2Field.id };
    }

    // For other field types
    const mutation = `
        mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
            createProjectV2Field(input: {
                projectId: $projectId
                dataType: $dataType
                name: $name
            }) {
                projectV2Field {
                    ... on ProjectV2Field {
                        id
                    }
                }
            }
        }
    `;

    const response = await client<any>(mutation, {
        projectId,
        name,
        dataType
    });

    return { fieldId: response.createProjectV2Field.projectV2Field.id };
}

/**
 * Delete a project field
 */
export async function deleteProjectField(
    projectId: string,
    fieldId: string
): Promise<void> {
    const client = createGraphqlClient();

    const mutation = `
        mutation($fieldId: ID!) {
            deleteProjectV2Field(input: {
                fieldId: $fieldId
            }) {
                clientMutationId
            }
        }
    `;

    await client<any>(mutation, {
        fieldId
    });
}

/**
 * Update project field (rename)
 */
export async function updateProjectFieldName(
    projectId: string,
    fieldId: string,
    newName: string
): Promise<void> {
    const client = createGraphqlClient();

    const mutation = `
        mutation($fieldId: ID!, $name: String!) {
            updateProjectV2Field(input: {
                fieldId: $fieldId
                name: $name
            }) {
                projectV2Field {
                    ... on ProjectV2Field {
                        id
                    }
                }
            }
        }
    `;

    await client<any>(mutation, {
        fieldId,
        name: newName
    });
}

/**
 * Add options to a SINGLE_SELECT field
 */
export async function addFieldOptions(
    projectId: string,
    fieldId: string,
    options: string[]
): Promise<void> {
    const client = createGraphqlClient();

    for (const optionName of options) {
        const mutation = `
            mutation($projectId: ID!, $fieldId: ID!, $name: String!) {
                createProjectV2FieldOption(input: {
                    projectId: $projectId
                    fieldId: $fieldId
                    name: $name
                    color: GRAY
                }) {
                    projectV2FieldOption {
                        id
                    }
                }
            }
        `;

        await client<any>(mutation, {
            projectId,
            fieldId,
            name: optionName
        });
    }
}

/**
 * Remove options from a SINGLE_SELECT field
 */
export async function removeFieldOptions(
    projectId: string,
    optionIds: string[]
): Promise<void> {
    const client = createGraphqlClient();

    for (const optionId of optionIds) {
        const mutation = `
            mutation($projectId: ID!, $optionId: ID!) {
                deleteProjectV2FieldOption(input: {
                    projectId: $projectId
                    optionId: $optionId
                }) {
                    projectV2FieldOption {
                        id
                    }
                }
            }
        `;

        await client<any>(mutation, {
            projectId,
            optionId
        });
    }
}

/**
 * Clear project cache (useful for testing or force refresh)
 */
export function clearProjectCache(owner?: string, projectNumber?: number): void {
    if (owner && projectNumber) {
        const cacheKey = `${owner}/${projectNumber}`;
        projectCache.delete(cacheKey);
    } else {
        projectCache.clear();
    }
}
