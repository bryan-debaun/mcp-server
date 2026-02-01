# Phase 1 Spike: tsoa + OpenAPI 3.x - POC Results

**Date**: 2026-02-01  
**Issue**: [#32 - API Spec Generation & Client SDK Strategy](https://github.com/bryan-debaun/mcp-server/issues/32)

---

## Summary

✅ **POC SUCCESSFUL** - tsoa integration works as expected with minimal friction.

Successfully converted GET /api/books to a tsoa controller, generated OpenAPI 3.x spec, integrated Swagger UI, and verified backward compatibility with existing routes.

---

## What Was Accomplished

### 1. Dependencies Installed

- `tsoa` - OpenAPI spec generation from TypeScript decorators
- `@tsoa/runtime` - Runtime support for tsoa
- `swagger-ui-express` - Interactive API documentation UI
- `@types/swagger-ui-express` - TypeScript types

### 2. Configuration

- Created `tsoa.json` config file specifying:
  - Entry point: `src/http/server.ts`
  - Controllers glob: `src/http/controllers/**/*Controller.ts`
  - Output: `build/swagger.json` (OpenAPI 3.x)
  - Routes file: `src/http/tsoa-routes.ts` (auto-generated)
- Updated `tsconfig.json` to enable experimental decorators:

  ```json
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
  ```

- Added `.gitignore` entries for generated files:
  - `build/swagger.json`
  - `src/http/tsoa-routes.ts`

### 3. Implemented BooksController

Created `src/http/controllers/BooksController.ts` with:

- TypeScript interfaces for request/response types (`Book`, `BookWithAuthors`, `ListBooksResponse`)
- Decorators for route definition (`@Route`, `@Get`, `@Query`)
- Documentation via JSDoc comments (appear in OpenAPI spec)
- Error handling (graceful degradation on DB failure)

### 4. Integrated with Server

- Added `RegisterRoutes(app)` call to register tsoa-generated routes
- Created `swagger-route.ts` to serve:
  - Swagger UI at `/docs`
  - Raw OpenAPI spec at `/docs/swagger.json`

### 5. Verification

- ✅ Build succeeds with decorators enabled
- ✅ All 68 baseline tests still pass (backward compatibility maintained)
- ✅ Added 3 new tests for tsoa controller - all pass
- ✅ OpenAPI 3.0 spec generated correctly with proper schema definitions
- ✅ Swagger UI registered and accessible
- ✅ Existing `/api/books` route behavior unchanged (original route still works)

---

## Key Findings

### Pros Confirmed

1. **TypeScript-first DX**: Decorators feel natural, TypeScript types drive the spec
2. **No spec drift**: Spec is generated from code - impossible to get out of sync
3. **Express-compatible**: Works alongside existing routes without conflicts
4. **Mature tooling**: tsoa ecosystem works as advertised
5. **Backward compatible**: Old routes continue to work during migration

### Cons/Tradeoffs Encountered

1. **Decorator support required**: Had to add `experimentalDecorators: true` to tsconfig
   - **Impact**: Minimal - standard practice for decorator-based frameworks
2. **Generated code**: `tsoa-routes.ts` is auto-generated and must be gitignored
   - **Impact**: Requires `npm run build:spec` before running server locally
3. **Zod integration not direct**: tsoa uses TypeScript types, not Zod schemas
   - **Impact**: Need to define TypeScript interfaces that match existing Zod schemas
   - **Mitigation**: Interfaces are simpler than Zod schemas; can coexist with existing validation

### Unexpected Benefits

1. **Route registration visible**: tsoa routes show up in Express route enumeration
2. **Swagger UI integration trivial**: `swagger-ui-express` just works
3. **Controller pattern improves organization**: Separating controllers from routes is cleaner

---

## Zod Integration Assessment

**Question**: Can we use existing Zod schemas from `src/tools/db/books/schemas.ts`?

**Answer**: Not directly. tsoa reads TypeScript types, not runtime schemas.

**Solution**: Define TypeScript interfaces for request/response types in controllers. Keep Zod schemas for MCP tool validation (separate concern).

**Example**:

```typescript
// tsoa controller uses TypeScript interface
export interface ListBooksResponse {
    books: BookWithAuthors[];
    total: number;
}

// Zod schema remains for MCP tool validation
export const ListBooksInputSchema = { ... };
```

**Trade-off**: Some duplication between TypeScript interfaces and Zod schemas, BUT:

- MCP tools need Zod for runtime validation (no types available in MCP protocol)
- HTTP routes benefit from tsoa's TypeScript-driven spec generation
- Both can coexist without conflicts

---

## Test Results

**Baseline (main branch)**:

- Build: ✅ Success
- Tests: ✅ 68 passed

**After tsoa integration**:

- Build: ✅ Success
- Tests: ✅ 71 passed (68 baseline + 3 new)
- New tests:
  1. `should return books via tsoa controller GET /api/books`
  2. `should accept query parameters for GET /api/books`
  3. `should serve swagger spec at /docs/swagger.json`

---

## Generated OpenAPI Spec Sample

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "MCP Server API",
    "version": "0.1.0",
    "description": "REST API for MCP Server with books, authors, ratings, and admin operations",
    "contact": {
      "name": "Bryan DeBaun",
      "email": "bryan@debaun.dev"
    },
    "license": "MIT"
  },
  "paths": {
    "/api/books": {
      "get": {
        "operationId": "ListBooks",
        "summary": "Get a list of books",
        "tags": ["Books"],
        "parameters": [
          { "name": "authorId", "in": "query", "schema": { "type": "number" } },
          { "name": "minRating", "in": "query", "schema": { "type": "number" } },
          { "name": "search", "in": "query", "schema": { "type": "string" } },
          { "name": "limit", "in": "query", "schema": { "type": "number" } },
          { "name": "offset", "in": "query", "schema": { "type": "number" } }
        ],
        "responses": {
          "200": { "description": "Books retrieved successfully", ... },
          "500": { "description": "Internal server error" }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "BookWithAuthors": { ... },
      "ListBooksResponse": { ... }
    }
  }
}
```

---

## Go/No-Go Decision

### **RECOMMENDATION: GO** ✅

tsoa meets all requirements and the POC validated feasibility:

1. ✅ TypeScript-first with strong typing
2. ✅ No spec drift (generated from code)
3. ✅ OpenAPI 3.x standard format
4. ✅ Backward compatible with existing routes
5. ✅ Swagger UI integration works
6. ✅ Build pipeline integration straightforward
7. ✅ Test coverage maintained

### Next Steps

Proceed to **Phase 2: Core Routes Migration**:

1. Migrate remaining `/api/books` routes (GET by ID, POST, PUT, DELETE) to tsoa
2. Migrate `/api/authors` routes
3. Migrate `/api/ratings` routes
4. Add JWT authentication decorators (Phase 3)

---

## Estimated Effort for Full Migration

Based on POC experience:

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| **Phase 1** (DONE) | Spike: 1 route + config | ✅ Completed |
| **Phase 2** | Migrate books/authors/ratings (~15 routes) | 2-3 days |
| **Phase 3** | Admin routes with JWT decorators | 1-2 days |
| **Phase 4** | Client SDK generation + CI | 1 day |

**Total**: ~5 days for complete migration

---

## Artifacts

- `tsoa.json` - Configuration
- `src/http/controllers/BooksController.ts` - Sample controller
- `src/http/swagger-route.ts` - Swagger UI integration
- `build/swagger.json` - Generated OpenAPI spec
- `test/http/tsoa-books-controller.test.ts` - Integration tests

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking changes during migration | Keep old routes in place, dual-run during transition |
| Decorator complexity | Start with simple routes, add patterns incrementally |
| Build step adds overhead | Automate with npm script, add to CI |
| Team learning curve | Document patterns in repo-specific agent |

---

## Conclusion

The tsoa POC successfully demonstrated that OpenAPI 3.x spec generation works well for this project. The benefits (type safety, no drift, Swagger UI, ecosystem compatibility) outweigh the tradeoffs (decorators, build step).

**Proceed with full migration** per the phased plan in Issue #32.
