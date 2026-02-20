Write-Host "Testing TSOA generation..."

# Test TypeScript compilation first
Write-Host "=== TypeScript Check ==="
$tscOutput = npx tsc --noEmit --skipLibCheck 2>&1 | Out-String
Write-Host $tscOutput

# Test TSOA generation
Write-Host "=== TSOA Generation ==="
$tsoaOutput = npx tsoa spec-and-routes 2>&1 | Out-String  
Write-Host $tsoaOutput

# Check results
Write-Host "=== File Check ==="
if (Test-Path "src/http/tsoa-routes.ts") {
    Write-Host "✓ tsoa-routes.ts exists"
}
else {
    Write-Host "✗ tsoa-routes.ts missing"
}

if (Test-Path "build/swagger.json") {
    Write-Host "✓ swagger.json exists"
}
else {
    Write-Host "✗ swagger.json missing"  
}

Write-Host "Done."