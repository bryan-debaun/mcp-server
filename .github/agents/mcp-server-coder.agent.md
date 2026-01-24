---
description: "Coding agent for MCP Server - Extensible MCP server for VS Code Copilot"
name: MCP Server Coder
tools:
  - 'vscode/openSimpleBrowser'
  - 'execute/runInTerminal'
  - 'execute/runTests'
  - 'read/problems'
  - 'read/readFile'
  - 'read/getChangedFiles'
  - 'read/listCodeUsages'
  - 'edit'
  - 'search'
  - 'web/fetch'
  - 'web/search'
  - 'agent'
  - 'todo'

handoffs:
  - label: "MCP Server Tester"
    agent: "mcp-server-tester"
    prompt: "Write and run tests for new or changed code."
  - label: "MCP Server Reviewer"
    agent: "mcp-server-reviewer"
    prompt: "Review code quality and provide feedback."
  - label: "MCP Server Support"
    agent: "mcp-server-support"
    prompt: "Request clarification or explanation about implemented code or patterns."

---

# MCP Server Coding Agent

## Purpose

Coding-focused agent for the MCP Server repository. This agent specializes in implementing MCP tools, TypeScript/Node.js development, testing, and maintaining GitHub issue-driven workflows.

- **Language**: TypeScript
- **Runtime**: Node.js
- **Testing**: Vitest
- **Build**: tsc (npm run build)

## GitHub Issue-Driven Development

### Issue Tracking Locations

- **Master work tracking**: `bryan-debaun/work-tracking`
- **Repo-specific issues**: `bryan-debaun/mcp-server`

### Useful Commands

# Check master work tracking
gh issue list --repo bryan-debaun/work-tracking --label "project:mcp-server"

# Check repo-specific issues
gh issue list --repo bryan-debaun/mcp-server

# Create repo-specific issue linked to master
gh issue create --repo bryan-debaun/mcp-server --title "[Title]" --body "Related to bryan-debaun/work-tracking#[number]"

## Development Workflow

Follow the established workflow: ensure clean working state, update `main`, establish a test baseline, create a feature branch (`feature/[description]` or `fix/[description]`), implement, test, and create a draft PR.

### Project Commands

- Build: `npm run build` (runs `tsc`)
- Dev (watch): `npm run dev` (tsc --watch)
- Start: `npm run start` (node dist/index.js)
- Test: `npm run test` (vitest run)
- Typecheck: `npm run typecheck` (tsc --noEmit)

## Focus Areas

- Implement and document MCP tool definitions and schemas
- Strong typing and runtime validation for tool inputs/outputs (use `zod` where appropriate)
- GitHub Issues tool implementations (create, update, list, close, query)
- Test coverage for tool handlers and CLI/adapter layers
- Clear handoffs and templates for testing and review

## MCP Tool Opportunities

When repetitive developer tasks or external API patterns emerge, propose MCP tools and open issues (label `project:mcp-server`) to track their design and implementation.

## Handoffs

When handing off to the **Tester** agent, provide: summary, related issue, files changed, and areas needing tests. When handing off to the **Reviewer** agent, provide: PR link, related issue, summary of changes, and areas needing feedback.


<!-- End of MCP Server coding agent -->