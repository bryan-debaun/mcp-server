#!/usr/bin/env powershell
Write-Host "Running TypeScript compilation check..."
try {
    $output = npx tsc --noEmit --skipLibCheck 2>&1
    Write-Host "TypeScript output:"
    Write-Host $output
    Write-Host "TypeScript compilation completed"
}
catch {
    Write-Host "TypeScript compilation failed: $_"
}

Write-Host "`nRunning TSOA generation..."
try {
    $output = npx tsoa spec-and-routes 2>&1
    Write-Host "TSOA output:"
    Write-Host $output 
    Write-Host "TSOA generation completed"
}
catch {
    Write-Host "TSOA generation failed: $_"
}

Write-Host "`nChecking if files exist..."
if (Test-Path "src/http/tsoa-routes.ts") {
    Write-Host "tsoa-routes.ts exists"
}
else {
    Write-Host "tsoa-routes.ts does NOT exist"
}

if (Test-Path "build/swagger.json") {
    Write-Host "swagger.json exists"
}
else {
    Write-Host "swagger.json does NOT exist"
}

Write-Host "`nDone."