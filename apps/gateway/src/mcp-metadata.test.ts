import { describe, expect, it } from 'vitest';
import {
  isMetadataRequest,
  issuerOf,
  mcpChallenge,
  metadataResponse,
  metadataUrlOf,
} from './mcp-metadata';

const ENV = { VINTAGE_CONVEX_SITE_URL: 'https://dusty-sardine-902.convex.site' };
const GATEWAY = 'https://vintage-gateway.vercel.app';
const get = (path: string, method = 'GET') => new Request(`${GATEWAY}${path}`, { method });

describe('protected-resource metadata (RFC 9728)', () => {
  it('names /mcp as the resource and Better Auth on Convex as its authorization server', async () => {
    const res = metadataResponse(get('/.well-known/oauth-protected-resource/mcp'), ENV);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      resource: `${GATEWAY}/mcp`,
      authorization_servers: ['https://dusty-sardine-902.convex.site/api/auth'],
      scopes_supported: ['commands', 'offline_access'],
      bearer_methods_supported: ['header'],
      resource_name: 'Vintage',
      resource_documentation: 'https://github.com/vintage-guild/vintage',
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('is served at the root and path-inserted for /mcp, and nowhere else', () => {
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      expect(isMetadataRequest(get(path), ENV), path).toBe(true);
    }
    for (const path of [
      '/mcp',
      '/.well-known/oauth-protected-resource/other',
      '/discord/interactions',
    ]) {
      expect(isMetadataRequest(get(path), ENV), path).toBe(false);
    }
  });

  it('follows VINTAGE_MCP_URL, and refuses to guess an issuer', () => {
    const env = { ...ENV, VINTAGE_MCP_URL: 'https://mcp.vintageguild.gg/mcp' };
    expect(metadataUrlOf(env)).toBe(
      'https://mcp.vintageguild.gg/.well-known/oauth-protected-resource/mcp',
    );
    expect(issuerOf({})).toBeNull();
    expect(issuerOf({ VINTAGE_CONVEX_SITE_URL: 'not a url' })).toBeNull();
    expect(metadataResponse(get('/.well-known/oauth-protected-resource'), {}).status).toBe(500);
    expect(metadataResponse(get('/.well-known/oauth-protected-resource', 'POST'), ENV).status).toBe(
      405,
    );
  });
});

describe('the /mcp challenge', () => {
  it('points clients at the metadata so they can sign in', async () => {
    const res = mcpChallenge(ENV);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${GATEWAY}/.well-known/oauth-protected-resource/mcp", scope="commands offline_access"`,
    );
  });

  it('says invalid_token for an expired or revoked token', async () => {
    const res = mcpChallenge(ENV, 'expired');
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
    expect(await res.json()).toEqual({ error: 'invalid_token', error_description: 'expired' });
  });
});
