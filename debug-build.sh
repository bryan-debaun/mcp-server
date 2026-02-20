#!/bin/bash
echo "Running TSOA with debugging..."
npx tsoa spec-and-routes --verbose
echo "TSOA complete, exit code: $?"
echo "Checking timestamps..."
ls -la src/http/tsoa-routes.ts
ls -la build/swagger.json