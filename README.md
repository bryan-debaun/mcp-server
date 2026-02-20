# @bryan-debaun/mcp-server

An extensible Model Context Protocol (MCP) server for VS Code Copilot with GitHub Issues tools.

## Features

- **GitHub Issues Tools**: List, view, create, update, and close GitHub issues directly through VS Code Copilot chat
- **GitHub Projects V2 Tools**: Manage custom fields and values in GitHub Projects V2 (field CRUD, bulk value updates, dynamic option resolution)
- **Book Catalog REST API**: Manage books, authors, and ratings with full CRUD operations
- **OpenAPI 3.0 Specification**: Auto-generated API documentation with Swagger UI at `/docs`
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

### GitHub Projects V2

Manage GitHub Projects V2 custom fields and values. Supports TEXT, NUMBER, DATE, SINGLE_SELECT, and ITERATION field types.

**Prerequisites**: GitHub token with `project` scope. Run `gh auth refresh -s project` to add the scope.

#### Field Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `get-project-fields` | List all custom fields in a project with types and options | `owner`, `projectNumber` |
| `create-project-field` | Create a new custom field | `owner`, `projectNumber`, `name`, `dataType`, `options?` |
| `update-project-field` | Update field name or SINGLE_SELECT options | `owner`, `projectNumber`, `fieldName`, `newName?`, `addOptions?`, `removeOptions?` |
| `delete-project-field` | Delete a custom field from the project | `owner`, `projectNumber`, `fieldName` |

#### Value Operations

| Tool | Description | Parameters |
|------|-------------|------------|
| `set-project-field-value` | Set a single field value on an issue | `owner`, `repo`, `projectNumber`, `issueNumber`, `fieldName`, `value` |
| `bulk-set-project-field-values` | Set multiple fields on multiple issues (bulk operation) | `owner`, `repo`, `projectNumber`, `updates[]` |

**Supported Field Types**:

- `TEXT` - Free-form text values
- `NUMBER` - Numeric values (e.g., story points, effort estimates)
- `DATE` - ISO 8601 date strings (e.g., "2024-12-31")
- `SINGLE_SELECT` - Choose from predefined options (auto-resolved from field metadata)
- `ITERATION` - Iteration/sprint references

**Features**:

- ✅ Field metadata caching (reduces API calls)
- ✅ Dynamic SINGLE_SELECT option resolution (no hardcoding)
- ✅ Bulk operations with detailed success/failure reporting
- ✅ Actionable error messages for permission issues

**Example Usage**:

```
User: In Project #2, set the "Status" field to "In Progress" and "Priority" to "High" for issues #73 and #42
Copilot: [Uses bulk-set-project-field-values to update both issues]
```

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

## REST API & OpenAPI Documentation

The server exposes a RESTful API for all book catalog operations with auto-generated OpenAPI 3.0 documentation.

### Interactive API Documentation

Access Swagger UI for interactive API exploration:

- **Local**: `http://localhost:3000/docs`
- **Production**: `https://your-server.onrender.com/docs`

### Endpoints

#### Public Endpoints (No Authentication)

- `GET /api/books` - List books with filtering
- `GET /api/books/:id` - Get book details
- `GET /api/authors` - List authors
- `GET /api/authors/:id` - Get author details
- `GET /api/ratings` - List ratings

#### Admin Endpoints (Require JWT Authentication)

- `POST /api/books` - Create book
- `PUT /api/books/:id` - Update book
- `DELETE /api/books/:id` - Delete book
- `POST /api/authors` - Create author
- `PUT /api/authors/:id` - Update author
- `DELETE /api/authors/:id` - Delete author

#### Authenticated User Endpoints (Require JWT)

- `POST /api/ratings` - Create/update rating
- `DELETE /api/ratings/:id` - Delete own rating

### OpenAPI Specification

Download the raw OpenAPI spec:

- **Local**: `http://localhost:3000/docs/swagger.json`
- **Production**: `https://your-server.onrender.com/docs/swagger.json`

Use this spec to generate client SDKs for any language using tools like [OpenAPI Generator](https://openapi-generator.tech/).

## Prerequisites

- **Node.js 20+**: Required runtime
- **GitHub CLI (`gh`)**: Must be installed and authenticated
- **PostgreSQL Database**: Required for book catalog features (optional for GitHub tools only)

  ```bash
  # Install gh CLI (if not already installed)
  winget install --id GitHub.cli
  
  # Authenticate with GitHub
  gh auth login
  
  # For GitHub Projects V2 tools, add project scope
  gh auth refresh -s project
  ```

## Environment Variables

Create a `.env` file in the project root:

```env
# Required for database features
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Optional: For HTTP MCP transport authentication
# When `MCP_API_KEY` is set, MCP transport endpoints (eg. `/mcp`) and DB-dependent routes (`/api/*` for books/authors/ratings) require `Authorization: Bearer <MCP_API_KEY>`.
MCP_API_KEY=your-secret-key

> Note: A legacy header `x-mcp-api-key` is temporarily supported as a fallback but is deprecated and will be removed in a future release; the server emits a deprecation log when it is used.

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
   ```

   **Deploy-time seeding (recommended)**

   ```bash
   # Seed initial data (creates admin user and sample books)
   # NOTE: Run this as a deploy step (CI or Render deploy hook) to avoid re-seeding on cold-starts
   npm run prisma:seed
   ```

   Example GitHub Actions snippet (run seed after migrations):

   ```yaml
   jobs:
     deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
         - run: npm ci
         - run: npx prisma migrate deploy
         - run: npm run prisma:seed
   ```

   Render: you can add a post-deploy command in your service settings (Render UI) to run `npm run prisma:seed`, or use a Deploy Hook to trigger seeding after deploy.

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
