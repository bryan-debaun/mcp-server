# GitHub Projects V2 Integration Tests

Integration tests for the GitHub Projects V2 MCP tools that interact with real GitHub API.

## Prerequisites

1. **GitHub Token**: Valid GitHub token with `project` scope

   ```bash
   gh auth refresh -s project
   ```

2. **Test Project**: A GitHub Project V2 to use for testing
   - Default: Project #2 in `bryan-debaun/mcp-server`
   - Or configure via environment variables (see below)

3. **Test Issue**: An issue in the repository to use for value-setting tests
   - Default: Issue #73 in `bryan-debaun/mcp-server`

## Running Integration Tests

### Run all integration tests

```bash
RUN_GITHUB_PROJECTS_INTEGRATION=true npm test -- github-projects.test.ts
```

### Configuration via Environment Variables

You can customize the test target by setting these environment variables:

```bash
# Required
export GITHUB_TOKEN="ghp_..."

# Optional - defaults to bryan-debaun/mcp-server Project #2
export GITHUB_TEST_OWNER="bryan-debaun"
export GITHUB_TEST_REPO="mcp-server"
export GITHUB_TEST_PROJECT_NUMBER="3"
export GITHUB_TEST_ISSUE_NUMBER="73"

# Run tests
RUN_GITHUB_PROJECTS_INTEGRATION=true npm test -- github-projects.test.ts
```

### PowerShell (Windows)

```powershell
$env:RUN_GITHUB_PROJECTS_INTEGRATION = "true"
npm test -- github-projects.test.ts
```

## What Gets Tested

The integration tests cover all 6 GitHub Projects V2 tools:

### 1. **get-project-fields**

- ✓ Retrieves real project fields from GitHub
- ✓ Validates field structure (id, name, dataType)
- ✓ Stores projectId for subsequent tests

### 2. **create-project-field**

- ✓ Creates TEXT field
- ✓ Creates SINGLE_SELECT field with options
- ✓ Validates field IDs (PVTF_*)

### 3. **update-project-field**

- ✓ Renames existing field
- ✓ Verifies rename via cache refresh
- ✓ Adds options to SINGLE_SELECT field
- ✓ Removes options from SINGLE_SELECT field

### 4. **set-project-field-value**

- ✓ Gets issue node ID
- ✓ Adds issue to project
- ✓ Sets field value on project item
- ✓ Tests TEXT field value updates

### 5. **delete-project-field**

- ✓ Deletes test field
- ✓ Verifies deletion via cache refresh

### 6. **Field Caching**

- ✓ Validates caching behavior (faster second call)
- ✓ Tests cache clearing functionality

## Test Cleanup

The integration tests automatically clean up after themselves:

- **afterAll**: Deletes any created test fields
- **Field naming**: Uses timestamp suffixes (`Test_Field_${Date.now()}`) to avoid conflicts
- **Immediate cleanup**: Some tests clean up immediately after validation

## Expected Behavior

### When Skipped (Default)

```
✓ test/integration/github-projects.test.ts (1 test | 1 skipped)

Test Files  1 skipped (1)
     Tests  1 skipped (1)
```

### When Running

```
Running integration tests against:
  Project: bryan-debaun Project #2
  Test Issue: bryan-debaun/mcp-server#73

✓ get-project-fields > should retrieve project fields from real GitHub project
✓ create-project-field > should create a TEXT field
✓ create-project-field > should create a SINGLE_SELECT field with options
✓ update-project-field > should rename a field
✓ add/remove field options > should add options to SINGLE_SELECT field
✓ add/remove field options > should remove options from SINGLE_SELECT field
✓ set-project-field-value > should add issue to project and set field value
✓ delete-project-field > should delete the test field
✓ field caching > should cache project fields on repeated calls
✓ field caching > should refresh cache after clearProjectCache

Test Files  1 passed (1)
     Tests  10 passed (10)
```

## Troubleshooting

### Error: "GITHUB_TOKEN environment variable required"

**Solution**: Set your GitHub token:

```bash
export GITHUB_TOKEN=$(gh auth token)
```

### Error: "Could not resolve to a Project"

**Solution**: Verify the project exists and your token has access:

```bash
gh project list --owner bryan-debaun
```

### Error: "Insufficient permissions"

**Solution**: Refresh token with project scope:

```bash
gh auth refresh -s project
```

### Tests are slow

**Expected**: Integration tests make real API calls and take 30-60 seconds total. Each test has a 30-second timeout.

## CI/CD Integration

To run integration tests in CI:

```yaml
- name: Run Integration Tests
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    RUN_GITHUB_PROJECTS_INTEGRATION: true
    GITHUB_TEST_OWNER: bryan-debaun
    GITHUB_TEST_REPO: mcp-server
    GITHUB_TEST_PROJECT_NUMBER: 2
    GITHUB_TEST_ISSUE_NUMBER: 73
  run: npm test -- github-projects.test.ts
```

## Development Notes

- **Test isolation**: Each test suite uses its own fields to avoid conflicts
- **Timestamps**: Field names include timestamps for uniqueness
- **Cache management**: Tests explicitly clear cache when verification requires fresh data
- **Error handling**: Tests validate both success and cleanup scenarios
