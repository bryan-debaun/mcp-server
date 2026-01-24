# @omega575/mcp-server

An extensible Model Context Protocol (MCP) server for VS Code Copilot with GitHub Issues tools.

## Features

- **GitHub Issues Tools**: List, view, create, update, and close GitHub issues directly through VS Code Copilot chat
- **Extensible Architecture**: Easily add new tool categories without major refactoring
- **Zod Validation**: All tool inputs are validated with zod schemas
- **Error Handling**: Graceful error handling with clear messages

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `get-open-issues` | List open issues from a repository | `repo`, `labels?`, `limit?` |
| `get-issue` | Get full details of a specific issue | `repo`, `issueNumber` |
| `create-issue` | Create a new issue | `repo`, `title`, `body?`, `labels?` |
| `update-issue` | Update an issue or add a comment | `repo`, `issueNumber`, `title?`, `body?`, `labels?`, `comment?` |
| `close-issue` | Close an issue with optional comment | `repo`, `issueNumber`, `comment?` |

## Prerequisites

- **Node.js 20+**: Required runtime
- **GitHub CLI (`gh`)**: Must be installed and authenticated

  ```bash
  # Install gh CLI (if not already installed)
  winget install --id GitHub.cli
  
  # Authenticate
  gh auth login
  ```

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/omega575/mcp-server.git
   cd mcp-server
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build**:

   ```bash
   npm run build
   ```

## VS Code Configuration

### Option 1: Workspace Configuration (Recommended)

Create or update `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "omega575-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/brndb/mcp-server/dist/index.js"]
    }
  }
}
```

### Option 2: User Configuration

Add to your VS Code user settings (use Command Palette → "MCP: Open User Configuration"):

```json
{
  "servers": {
    "omega575-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/brndb/mcp-server/dist/index.js"]
    }
  }
}
```

## Usage

Once configured, the MCP tools are available in VS Code Copilot chat:

1. Open Copilot Chat (`Ctrl+Alt+I`)
2. Enable the MCP server from the Tools picker
3. Ask questions like:
   - "List open issues in omega575/mcp-server"
   - "Show me issue #2 in omega575/mcp-server"
   - "Create an issue titled 'Bug fix' in owner/repo"
   - "Close issue #5 in owner/repo with comment 'Fixed in PR #10'"

## Development

```bash
# Build
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run typecheck
```

## Project Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Entry point, stdio transport setup
│   ├── server.ts             # McpServer factory
│   └── tools/
│       ├── index.ts          # Tool registration aggregator
│       └── github-issues/    # GitHub Issues tool category
│           ├── index.ts      # Registers all issue tools
│           ├── schemas.ts    # Zod schemas for inputs
│           ├── gh-cli.ts     # GitHub CLI wrapper
│           ├── results.ts    # Result helpers
│           └── *.ts          # Individual tool implementations
├── test/                     # Tests mirror src structure
├── dist/                     # Compiled output
└── .vscode/
    └── mcp.json              # VS Code MCP configuration
```

## Adding New Tools

To add a new tool category (e.g., Git operations):

1. Create a new folder: `src/tools/git/`
2. Implement tools following the pattern in `github-issues/`
3. Create a registration function: `registerGitTools(server)`
4. Import and call it in `src/tools/index.ts`

## License

MIT
