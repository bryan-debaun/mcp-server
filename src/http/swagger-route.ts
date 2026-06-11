import { Application } from 'express'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import swaggerUi from 'swagger-ui-express'
import { fileURLToPath } from 'url'
import { logger } from '../logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function registerSwaggerRoute(app: Application) {
    try {
        // Load the generated OpenAPI spec
        const swaggerPath = join(__dirname, '../../build/swagger.json')
        const swaggerDocument = JSON.parse(readFileSync(swaggerPath, 'utf8'))

        // Serve the raw spec at /docs/swagger.json BEFORE Swagger UI
        app.get('/docs/swagger.json', (_req, res) => {
            res.json(swaggerDocument)
        })

        // Serve Swagger UI at /docs
        app.use(
            '/docs',
            swaggerUi.serve,
            swaggerUi.setup(swaggerDocument, {
                customSiteTitle: 'MCP Server API Docs',
                customCss: '.swagger-ui .topbar { display: none }',
            }),
        )

        logger.info('registered Swagger UI at /docs')
    } catch (err) {
        logger.error('failed to register Swagger UI', err)
    }
}
