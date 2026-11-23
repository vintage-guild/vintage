import { createCli } from '@lushly-dev/afd-cli';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_URL, DEFAULT_TRANSPORT, mcpUrlFromEnv, prepareCliInvocation } from './args';

describe('@vintage/cli argument preparation', () => {
  it('uses the default /mcp URL unless VINTAGE_MCP_URL is set', () => {
    expect(mcpUrlFromEnv({})).toBe(DEFAULT_MCP_URL);
    expect(mcpUrlFromEnv({ VINTAGE_MCP_URL: '  ' })).toBe(DEFAULT_MCP_URL);
    expect(mcpUrlFromEnv({ VINTAGE_MCP_URL: 'http://localhost:3100/mcp' })).toBe(
      'http://localhost:3100/mcp',
    );
  });

  it('points connect at /mcp with --transport streamable-http when omitted', () => {
    expect(prepareCliInvocation(['connect'])).toEqual({
      args: ['connect', '--transport', DEFAULT_TRANSPORT, DEFAULT_MCP_URL],
    });
    expect(prepareCliInvocation(['connect', 'http://127.0.0.1:4000/mcp'])).toEqual({
      args: ['connect', 'http://127.0.0.1:4000/mcp', '--transport', DEFAULT_TRANSPORT],
    });
    expect(
      prepareCliInvocation(['connect', '-t', 'http', 'http://127.0.0.1:4000/message']),
    ).toEqual({
      args: ['connect', '-t', 'http', 'http://127.0.0.1:4000/message'],
    });
    // Does not inject defaults when --help is requested.
    expect(prepareCliInvocation(['connect', '--help'])).toEqual({
      args: ['connect', '--help'],
    });
  });

  it('points call at /mcp with --connect and --transport streamable-http unless overridden', () => {
    expect(
      prepareCliInvocation(['call', 'afd-discover'], {
        VINTAGE_MCP_URL: 'https://mcp.vintageguild.gg/mcp',
      }),
    ).toEqual({
      args: [
        'call',
        '--connect',
        'https://mcp.vintageguild.gg/mcp',
        '--transport',
        DEFAULT_TRANSPORT,
        'afd-discover',
      ],
    });
    // Respects explicit --connect or --module.
    expect(
      prepareCliInvocation(['call', '--connect', 'http://localhost:3100/mcp', 'member-me']),
    ).toEqual({
      args: ['call', '--connect', 'http://localhost:3100/mcp', 'member-me'],
    });
    expect(prepareCliInvocation(['call', '-m', './registry.js', 'member-me'])).toEqual({
      args: ['call', '-m', './registry.js', 'member-me'],
    });
  });

  it('points shell at /mcp with --url and --transport streamable-http unless overridden', () => {
    expect(prepareCliInvocation(['shell'])).toEqual({
      args: ['shell', '--url', DEFAULT_MCP_URL, '--transport', DEFAULT_TRANSPORT],
    });
    expect(prepareCliInvocation(['shell', '-u', 'http://localhost:3100/mcp'])).toEqual({
      args: ['shell', '-u', 'http://localhost:3100/mcp'],
    });
  });

  it('turns VINTAGE_MCP_TOKEN into AFD_HEADERS unless AFD_HEADERS or --header is already set', () => {
    expect(
      prepareCliInvocation(['call', 'afd-discover'], { VINTAGE_MCP_TOKEN: 'tok-123' }),
    ).toMatchObject({
      afdHeaders: 'Authorization: Bearer tok-123',
    });
    expect(
      prepareCliInvocation(['call', 'afd-discover'], {
        VINTAGE_MCP_TOKEN: 'tok-123',
        AFD_HEADERS: 'Authorization: Bearer override',
      }),
    ).not.toHaveProperty('afdHeaders');
    expect(
      prepareCliInvocation(['call', '-H', 'Authorization: Bearer flag', 'afd-discover'], {
        VINTAGE_MCP_TOKEN: 'tok-123',
      }),
    ).not.toHaveProperty('afdHeaders');
  });

  it('wires cleanly onto @lushly-dev/afd-cli', () => {
    const program = createCli();
    const names = program.commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(['connect', 'tools', 'call', 'batch', 'shell']));
  });
});
