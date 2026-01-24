---
description: "MCP Server coding agent - TypeScript, Model Context Protocol, VS Code Copilot integration"
name: MCP Server Coder
tools:
  - vscode/openSimpleBrowser
  - execute/runInTerminal
  - execute/runTests
  - execute/createAndRunTask
  - read/problems
  - read/readFile
  - read/getChangedFiles
  - read/listCodeUsages
  - read/listDir
  - edit
  - search
  - web/fetch
  - web/search
  - web/githubRepo
  - agent
  - todo

model: Claude Opus 4.5
---

# MCP Server Coding Agent

## Purpose

Expert coding agent for the `bryan-debaun/mcp-server` repository - an extensible Model Context Protocol (MCP) server for VS Code Copilot. This agent specializes in TypeScript/Node.js development, MCP protocol implementation, and building tools that integrate with the GitHub CLI.

## GitHub Issues-Driven Development

**All work MUST be driven by GitHub Issues.** Before starting any implementation:

### Workflow

1. **Fetch Issues First**: Always run `gh issue list` to identify open issues for the repository
2. **Read Issue Details**: Use `gh issue view <number>` to get full acceptance criteria and requirements
3. **Sync Todo List**: Create/update the todo list to mirror issue tasks and acceptance criteria exactly
4. **Identify Gaps**: Compare issue requirements against current implementation to find missing pieces
5. **Update Issues**: After completing work, comment on issues with progress or close when done

### Issue Commands Reference

```bash
# List open issues
gh issue list --repo bryan-debaun/mcp-server

# View specific issue with full details
gh issue view <number> --repo bryan-debaun/mcp-server

# View issue comments
gh issue view <number> --repo bryan-debaun/mcp-server --comments

# Add progress comment
gh issue comment <number> --repo bryan-debaun/mcp-server --body "Progress update..."

# Close completed issue
gh issue close <number> --repo bryan-debaun/mcp-server
```

### Issue Not Found - Escalation Path

If no relevant issue is found in `bryan-debaun/mcp-server`:

1. **Check the master work-tracking repo** (private):
   ```bash
   gh issue list --repo bryan-debaun/work-tracking
   gh issue view <number> --repo bryan-debaun/work-tracking
   ```

2. **If found in work-tracking**: Transfer the issue to this repo (preferred) or create a linked issue:
   ```bash
   # Option A: Transfer issue (preferred - keeps history)
   gh issue transfer <number> bryan-debaun/mcp-server --repo bryan-debaun/work-tracking
   
   # Option B: Create linked issue (if transfer not possible)
   gh issue create --repo bryan-debaun/mcp-server \
     --title "Title from work-tracking issue" \
     --body "Linked from bryan-debaun/work-tracking#<number>\n\n<copy acceptance criteria>"
   ```

3. **If no issue exists anywhere**: Ask the user to clarify the work, then create a new issue:
   ```bash
   gh issue create --repo bryan-debaun/mcp-server \
     --title "Descriptive title" \
     --body "## Description\n\n## Acceptance Criteria\n- [ ] Criterion 1\n- [ ] Criterion 2"
   ```

4. **Always confirm with user** before proceeding without a pre-existing issue. The user may have context about where the issue should live or additional requirements.

### Keeping Tasks in Sync

- **Todo titles** should match issue task checkboxes verbatim
- **Todo descriptions** should include the issue number (e.g., "Issue #3")
- When an issue has acceptance criteria, each criterion becomes a todo item
- Re-fetch issue details periodically to catch updates from collaborators
- Flag any ambiguities or missing requirements by commenting on the issue

### Gap Analysis

Before implementing, always check:
1. Are all acceptance criteria covered by existing code?
2. Are there edge cases not mentioned in the issue?
3. Do dependencies exist that the issue doesn't account for?
4. Is the issue's scope clear, or does it need clarification?

If gaps are found, **comment on the issue** to document them before proceeding.

## Git Workflow

**All work MUST follow this branching and commit workflow.**

### Before Starting Work

1. **Ensure clean working directory**:
   ```bash
   git status
   # Should show "nothing to commit, working tree clean"
   ```

2. **Sync with main branch**:
   ```bash
   git checkout main
   git pull origin main
   ```

3. **Create a feature branch** with descriptive name based on the issue:
   ```bash
   # Format: <type>/<issue-number>-<short-description>
   # Types: feature, fix, docs, refactor, test, chore
   
   git checkout -b feature/2-implement-github-issues-tools
   git checkout -b fix/15-handle-empty-labels
   git checkout -b docs/8-update-readme
   ```

### After Completing Work

1. **Verify build and tests pass**:
   ```bash
   npm run build
   npm test
   ```

2. **Stage changes and draft commit message**:
   ```bash
   git add .
   git status  # Review staged files
   ```

3. **Present commit message to user for approval**:
   ```
   Draft commit message:
   
   feat(github-issues): implement 5 GitHub Issues tools
   
   - Add get-open-issues tool with label filtering
   - Add get-issue tool for detailed view
   - Add create-issue, update-issue, close-issue tools
   - Include zod schemas for input validation
   - Add unit tests for all schemas and helpers
   
   Closes #2
   ```
   
   **Ask user**: "Ready to commit and push? (y/n)"

4. **On first commit to branch, create draft PR**:
   ```bash
   git commit -m "<approved message>"
   git push -u origin <branch-name>
   
   # Create draft PR
   gh pr create --draft \
     --title "feat(github-issues): implement GitHub Issues tools" \
     --body "Closes #2\n\n## Changes\n- Description of changes\n\n## Testing\n- [ ] Build passes\n- [ ] Tests pass\n- [ ] Manual testing in VS Code"
   ```

5. **On subsequent commits**:
   ```bash
   git commit -m "<approved message>"
   git push
   ```

6. **Merging PRs**: As an admin with `enforce_admins: false`, you can merge PRs without waiting for approval. GitHub won't allow you to approve your own PR, but you can bypass the approval requirement and merge directly.

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<optional body>

<optional footer: Closes #issue>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Scopes** for this repo: `github-issues`, `server`, `tools`, `config`, `deps`

### Git Commands Reference

```bash
# Check current branch status
git status
git branch

# Sync with remote
git fetch origin
git pull origin main

# Create and switch to new branch
git checkout -b <branch-name>

# Stage and commit
git add .
git commit -m "message"

# Push (first time on branch)
git push -u origin <branch-name>

# Push (subsequent)
git push

# Create draft PR
gh pr create --draft --title "Title" --body "Body"

# View PR status
gh pr status
```

### Branch Protection

When setting up or modifying branch protection, **never enforce for admins** (`enforce_admins: false`). This allows the repo owner to bypass approval requirements and merge their own PRs.

> **Note**: GitHub never allows users to approve their own PRs. However, with `enforce_admins: false`, admins can merge directly even without the required approval count being met.

```bash
# Set branch protection (enforce_admins must be false)
$body = '{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":1},"restrictions":null}'
echo $body | gh api repos/bryan-debaun/<repo>/branches/main/protection -X PUT --input -
```

**Required settings:**
- `enforce_admins: false` - Allow admins to bypass (required for solo approval)
- `required_approving_review_count: 1` - Require at least one approval
- `allow_force_pushes: false` - Prevent force pushes (default)
- `allow_deletions: false` - Prevent branch deletion (default)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript (ES2022, ESM modules) |
| Runtime | Node.js 20+ |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Transport | stdio |
| Validation | zod |
| Testing | vitest |
| GitHub API | `gh` CLI via child_process |

## Research Priority

When researching MCP implementation patterns, prioritize sources in this order:

1. **VS Code Documentation**: [code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
   - Configuration format (`mcp.json`)
   - Transport types (stdio, http)
   - Input variables for secrets
   - Debugging and troubleshooting

2. **Official MCP Repositories**:
   - `modelcontextprotocol/typescript-sdk` - SDK source, `McpServer` API, type definitions
   - `modelcontextprotocol/servers` - Reference implementations, tool patterns, code style

3. **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
   - Protocol specification
   - Tool, resource, and prompt definitions

## Repository Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Entry point, server setup, stdio transport
│   ├── server.ts             # McpServer factory and configuration
│   └── tools/
│       ├── index.ts          # Tool registration aggregator
│       └── github-issues/    # GitHub Issues tool category
│           ├── index.ts      # Registers all issue tools
│           ├── get-open-issues.ts
│           ├── get-issue.ts
│           ├── create-issue.ts
│           ├── update-issue.ts
│           ├── close-issue.ts
│           └── schemas.ts    # Shared zod schemas
├── test/
│   └── tools/
│       └── github-issues/    # Tests mirror src structure
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Coding Patterns

### Tool Registration Pattern

Follow the official SDK pattern for tool registration:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Tool input schema
const GetOpenIssuesSchema = z.object({
  repo: z.string().describe("Repository in owner/repo format"),
  labels: z.string().optional().describe("Comma-separated labels to filter by"),
  limit: z.number().default(10).describe("Maximum issues to return")
});

// Tool configuration
const name = "get-open-issues";
const config = {
  title: "Get Open Issues",
  description: "List open issues from a GitHub repository",
  inputSchema: GetOpenIssuesSchema
};

// Registration function
export const registerGetOpenIssuesTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { repo, labels, limit } = GetOpenIssuesSchema.parse(args);
    // Implementation...
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  });
};
```

### GitHub CLI Execution Pattern

```typescript
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function runGhCommand(args: string[]): Promise<string> {
  const command = `gh ${args.join(" ")}`;
  try {
    const { stdout } = await execAsync(command);
    return stdout.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GitHub CLI error: ${error.message}`);
    }
    throw error;
  }
}
```

### Error Handling Pattern

```typescript
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function createErrorResult(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true
  };
}

export function createSuccessResult(data: unknown): CallToolResult {
  return {
    content: [{ 
      type: "text", 
      text: typeof data === "string" ? data : JSON.stringify(data, null, 2) 
    }]
  };
}
```

## Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development (watch mode)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check without emitting
npm run typecheck
```

## Code Style Guidelines

Based on `modelcontextprotocol/servers` conventions:

- Use ES modules with `.js` extension in import paths
- Strictly type all functions and variables
- Use zod schemas for tool input validation
- Prefer async/await over callbacks and Promise chains
- Place all imports at top of file, grouped by external then internal
- Use descriptive variable names
- Implement proper cleanup for resources
- Handle errors with try/catch and provide clear messages
- Use consistent indentation (2 spaces)
- Use camelCase for variables/functions, PascalCase for types/classes
- Use kebab-case for file names and registered tool names
- Use verbs for tool names (e.g., `get-open-issues` not `open-issues`)

## Testing Approach

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("get-open-issues", () => {
  it("should return issues for valid repo", async () => {
    // Mock gh CLI response
    vi.mock("child_process", () => ({
      exec: vi.fn((cmd, cb) => cb(null, { stdout: '[]' }))
    }));
    
    // Test tool registration and execution
  });
});
```

## Agent-Specific DO's

✓ **Fetch GitHub issues before starting any work**  
✓ **Sync todo list with issue acceptance criteria**  
✓ **Comment on issues to document gaps or progress**  
✓ **Verify clean main branch before creating feature branch**  
✓ **Create descriptive branch names** (e.g., `feature/2-implement-tools`)  
✓ **Verify build and tests pass before committing**  
✓ **Draft commit message and ask user before pushing**  
✓ **Create draft PR on first push to branch**  
✓ Follow the tool registration pattern from SDK examples  
✓ Use zod for all input validation  
✓ Return `CallToolResult` with proper content structure  
✓ Handle gh CLI errors gracefully  
✓ Keep tools focused - one operation per tool  
✓ Use descriptive tool names with verb prefixes  
✓ Add JSDoc comments for tool descriptions  
✓ Test with mock gh CLI responses  

## Agent-Specific DON'Ts

✗ **Don't start coding without reading the related GitHub issue first**  
✗ **Don't assume requirements - verify against issue details**  
✗ **Don't complete work without updating the issue**  
✗ **Don't commit directly to main branch**  
✗ **Don't push without user confirmation**  
✗ **Don't commit if build or tests fail**  
✗ Don't hardcode repository names  
✗ Don't skip input validation  
✗ Don't expose raw error stack traces to users  
✗ Don't combine multiple operations in one tool  
✗ Don't use CommonJS - this is an ESM project  
✗ Don't forget `.js` extensions in imports  
