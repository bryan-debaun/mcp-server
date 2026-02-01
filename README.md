# @bryan-debaun/mcp-server

An extensible Model Context Protocol (MCP) server for VS Code Copilot with GitHub Issues tools.

## Features

- **GitHub Issues Tools**: List, view, create, update, and close GitHub issues directly through VS Code Copilot chat
- **Extensible Architecture**: Easily add new tool categories without major refactoring
- **Zod Validation**: All tool inputs are validated with zod schemas
- **Error Handling**: Graceful error handling with clear messages
- **HTTP Stream & SSE Transport**: Hosts MCP over `POST /mcp` (NDJSON stream) and SSE fallback at `GET /mcp` with `POST /mcp/events` for event delivery. Protect endpoints with `MCP_API_KEY` using `Authorization: Bearer <MCP_API_KEY>`.

## Available Tools

### GitHub Issues

| Tool | Description | Parameters |
|------|-------------|------------|
| `get-open-issues` | List open issues from a repository | `repo`, `labels?`, `limit?` |
| `get-issue` | Get full details of a specific issue | `repo`, `issueNumber` |
| `create-issue` | Create a new issue | `repo`, `title`, `body?`, `labels?` |
| `update-issue` | Update an issue or add a comment | `repo`, `issueNumber`, `title?`, `body?`, `labels?`, `comment?` |
| `close-issue` | Close an issue with optional comment | `repo`, `issueNumber`, `comment?` |

### Database - Books

| Tool | Description | Parameters |
|------|-------------|------------|
| `list-books` | List books with optional filters | `limit?`, `offset?`, `search?`, `authorId?`, `minRating?` |
| `get-book` | Get book details with authors and ratings | `id` |
| `create-book` | Create a new book (admin) | `title`, `description?`, `isbn?`, `publishedAt?`, `authorIds?`, `createdBy?` |
| `update-book` | Update book details (admin) | `id`, `title?`, `description?`, `isbn?`, `publishedAt?`, `authorIds?` |
| `delete-book` | Delete a book (admin) | `id` |

### Database - Authors

| Tool | Description | Parameters |
|------|-------------|------------|
| `list-authors` | List authors with optional search | `limit?`, `offset?`, `search?` |
| `get-author` | Get author details with books | `id` |
| `create-author` | Create a new author (admin) | `name`, `bio?`, `website?`, `createdBy?` |
| `update-author` | Update author details (admin) | `id`, `name?`, `bio?`, `website?` |
| `delete-author` | Delete an author (admin) | `id` |

### Database - Ratings

| Tool | Description | Parameters |
|------|-------------|------------|
| `list-ratings` | List ratings with optional filters | `limit?`, `offset?`, `bookId?`, `userId?` |
| `create-or-update-rating` | Create or update a book rating (authenticated) | `bookId`, `rating` (1-10), `review?`, `userId` |
| `delete-rating` | Delete a rating (owner or admin) | `id` |

## Prerequisites

- **Node.js 20+**: Required runtime
- **GitHub CLI (`gh`)**: Must be installed and authenticated
- **PostgreSQL Database**: Required for book catalog features (optional for GitHub tools only)

  ```bash
  # Install gh CLI (if not already installed)
  winget install --id GitHub.cli
  
  # Authenticate
  gh auth login
  ```

## Environment Variables

Create a `.env` file in the project root:

```env
# Required for database features
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Optional: For HTTP MCP transport authentication
MCP_API_KEY=your-secret-key

# Optional: For admin endpoints
INTERNAL_ADMIN_KEY=your-admin-key
ADMIN_DEBUG_ENABLED=true
```

## Installation

1. **C

2. **Database Setup** (if using book catalog features):

   ```bash
   # Run migrations
   npx prisma migrate deploy
   
   # Seed initial data (creates admin user and sample books)
   npm run prisma:seed
   ```lone the repository**:

   ```bash
   git clone https://github.com/bryan-debaun/mcp-server.git
   cd mcp-server
   ```

3. **Install dependencies**:

   ```bash
   npm install
   ```

4. **Build**:

   ```bash
   npm run build
   ```

## VS Code Configuration

### Option 1: Workspace Configuration (Recommended)

Create or update `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "bryan-debaun-mcp": {
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
    "bryan-debaun-mcp": {
### VS Code Copilot

Once configured, the MCP tools are available in VS Code Copilot chat:

1. Open Copilot Chat (`Ctrl+Alt+I`)
2. Enable the MCP server from the Tools picker
3. Ask questions like:
   - "List open issues in bryan-debaun/mcp-server"
   - "Show me issue #2 in bryan-debaun/mcp-server"
   - "Create an issue titled 'Bug fix' in owner/repo"
   - "Close issue #5 in owner/repo with comment 'Fixed in PR #10'"
   - "List all books in the catalog"
   - "Show me books by Brandon Sanderson"

### HTTP API

The server also exposes HTTP endpoints for direct access:

#### Books

```bash
# List books
curl http://localhost:8080/api/books?limit=10

# Get book by ID
curl http://localhost:8080/api/books/1

# Create book (requires admin JWT)
curl -X POST http://localhost:8080/api/books \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "X-INTERNAL-KEY: YOUR_ADMIN_KEY" \
  -d '{
    "title": "New Book",
    "description": "A great book",
    "isbn": "978-1234567890",
    ├── db/
│   │   └── index.ts          # Prisma client initialization
│   ├── http/
│   │   ├── server.ts         # HTTP server setup
│   │   ├── books-route.ts    # Book catalog endpoints
│   │   ├── authors-route.ts  # Author endpoints
│   │   └── ratings-route.ts  # Rating endpoints
│   └── tools/
│       ├── index.ts          # Tool registration aggregator
│       ├── local.ts          # Tool dispatcher for HTTP routes
│       ├── github-issues/    # GitHub Issues tool category
│       │   ├── index.ts      # Registers all issue tools
│       │   ├── schemas.ts    # Zod schemas for inputs
│       │   ├── gh-cli.ts     # GitHub CLI wrapper
│       │   ├── results.ts    # Result helpers
│       │   └── *.ts          # Individual tool implementations
│       └── db/               # Database tool categories
│           ├── books/        # Book CRUD tools
│           ├── authors/      # Author CRUD tools
│           └── ratings/      # Rating CRUD tools
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── seed.ts               # Initial data seeding
│   └── migrations/           # Database migr
  -H "X-INTERNAL-KEY: YOUR_ADMIN_KEY" \
  -d '{"title": "Updated Title"}'

# Delete book
curl -X DELETE http://localhost:8080/api/books/1 \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "X-INTERNAL-KEY: YOUR_ADMIN_KEY"
```

#### Authors

```bash
# List authors
curl http://localhost:8080/api/authors?limit=10

# Get author by ID (includes their books)
curl http://localhost:8080/api/authors/1

# Create author (requires admin JWT)
curl -X POST http://localhost:8080/api/authors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "X-INTERNAL-KEY: YOUR_ADMIN_KEY" \
  -d '{
    "name": "New Author",
    "bio": "Author biography",
    "website": "https://example.com"
  }'
```

#### Ratings

```bash
# List all ratings
curl http://localhost:8080/api/ratings?limit=10

# Get my ratings (requires JWT)
curl http://localhost:8080/api/users/me/ratings \
  -H "Authorization: Bearer YOUR_JWT"

# Create or update rating (requires JWT)
curl -X POST http://localhost:8080/api/ratings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{
    "bookId": 1,
    "rating": 8,
    "review": "Great book!"
  }'

# Delete rating (requires JWT, owner or admin)
curl -X DELETE http://localhost:8080/api/ratings/1 \
  -H "Authorization: Bearer YOUR_JWT"
```

Once configured, the MCP tools are available in VS Code Copilot chat:

1. Open Copilot Chat (`Ctrl+Alt+I`)
2. Enable the MCP server from the Tools picker
3. Ask questions like:
   - "List open issues in bryan-debaun/mcp-server"
   - "Show me issue #2 in bryan-debaun/mcp-server"
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
