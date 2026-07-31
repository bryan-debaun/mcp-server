import type { Application, Request, Response } from 'express'
import { config } from '../config.js'

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata (#152).
 *
 * The June 2025 revision of the MCP authorization specification separates the
 * **MCP server (resource server)** from the **authorization server**, and
 * requires MCP servers to publish RFC 9728 metadata. That revision removed the
 * previous fallback-default-endpoint mechanism, so PRM is now the only way a
 * standards-based MCP client can discover how to authenticate here.
 *
 * This adds the conformant discovery path. It does **not** remove `MCP_API_KEY`:
 * that shared-secret gate keeps working exactly as before, and replacing it (and
 * the service-role bearer shortcut) with real `client_credentials` grants is
 * follow-on work tracked with the ADR 0001 Stage 2 spike.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc9728
 * @see https://modelcontextprotocol.io/specification/draft/basic/authorization
 */

/** The RFC 9728 well-known path prefix. */
const WELL_KNOWN = '/.well-known/oauth-protected-resource'

/** The MCP endpoint this server exposes, relative to its origin. */
const MCP_PATH = '/mcp'

/**
 * Best-effort origin for this deployment.
 *
 * `PUBLIC_BASE_URL` wins when set. Otherwise we fall back to the forwarded
 * proto + Host header — convenient, but note the Host header is client-supplied,
 * so a caller can influence the `resource` value it gets back. That is
 * acceptable for a discovery document (it is public, carries no secret, and a
 * client that lies to itself only breaks its own flow), but production should
 * pin `PUBLIC_BASE_URL` so the advertised resource identifier is stable and
 * matches the audience real tokens are minted for.
 */
function originFor(req: Request): string {
    const configured = config.oauth.publicBaseUrl
    if (configured) return configured.replace(/\/$/, '')

    const proto =
        (req.headers['x-forwarded-proto'] || '').toString().split(',')[0] ||
        req.protocol ||
        'https'
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
        .toString()
        .split(',')[0]
    return `${proto}://${host}`
}

/** The canonical resource identifier this server advertises. */
export function resourceIdentifier(req: Request, resourcePath = ''): string {
    const configured = config.oauth.resourceIdentifier
    if (configured) return configured.replace(/\/$/, '')
    return `${originFor(req)}${resourcePath}`
}

/**
 * Authorization servers to advertise.
 *
 * Configurable, defaulting to the OIDC issuer we already verify tokens against —
 * so the document is meaningful today against Supabase and becomes correct for a
 * different provider by changing env, not code. (Per #152's sequencing note, the
 * value is only *finally* settled once ADR 0001 Stage 2 picks an AS.)
 */
function authorizationServers(): string[] {
    if (config.oauth.authorizationServers.length > 0) {
        return config.oauth.authorizationServers
    }
    const issuer = config.auth.oidc.issuer
    return issuer ? [issuer] : []
}

/** Build the RFC 9728 metadata document for a given resource path. */
export function buildMetadata(
    req: Request,
    resourcePath = '',
): Record<string, unknown> {
    const doc: Record<string, unknown> = {
        // REQUIRED by RFC 9728 §2.
        resource: resourceIdentifier(req, resourcePath),
        // Advertised so audience-restricted tokens validate against this resource.
        bearer_methods_supported: ['header'],
    }

    const servers = authorizationServers()
    if (servers.length > 0) doc.authorization_servers = servers

    if (config.oauth.scopesSupported.length > 0) {
        doc.scopes_supported = config.oauth.scopesSupported
    }

    return doc
}

/**
 * The `WWW-Authenticate` value to return alongside a 401/403 from a protected
 * MCP endpoint, pointing the client at the metadata document (RFC 9728 §5.1).
 */
export function wwwAuthenticateValue(
    req: Request,
    opts: { error?: string; description?: string } = {},
): string {
    const metadataUrl = `${originFor(req)}${WELL_KNOWN}${MCP_PATH}`
    const params = [`resource_metadata="${metadataUrl}"`]
    if (opts.error) params.unshift(`error="${opts.error}"`)
    if (opts.description) params.push(`error_description="${opts.description}"`)
    return `Bearer ${params.join(', ')}`
}

/**
 * Register the metadata endpoints.
 *
 * MUST be registered before any auth middleware — a discovery document behind
 * the very gate it describes is useless. In hosted mode `createBasicApp()` runs
 * before `registerDbDependentRoutes()` installs `mcpAuthMiddleware`, so calling
 * this from there keeps it public.
 */
export function registerProtectedResourceMetadata(app: Application): void {
    const send = (resourcePath: string) => (req: Request, res: Response) => {
        // Public, cacheable, and explicitly not tied to a session.
        res.set('Cache-Control', 'public, max-age=3600')
        res.status(200).json(buildMetadata(req, resourcePath))
    }

    // RFC 9728 §3.1 inserts the resource's path component after the well-known
    // prefix, so the document for `https://host/mcp` lives at
    // `/.well-known/oauth-protected-resource/mcp`. Standards-based MCP clients
    // request this form.
    app.get(`${WELL_KNOWN}${MCP_PATH}`, send(MCP_PATH))

    // The bare form, for the origin itself — what a client checks when it has no
    // path component to insert.
    app.get(WELL_KNOWN, send(''))
}
