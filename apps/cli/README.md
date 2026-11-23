# @vintage/cli

Thin wrapper around `@lushly-dev/afd-cli` pointed at Vintage's stateless `/mcp` endpoint with
`--transport streamable-http` (#9, PLAN §3.7).

## Usage

Run from the repo root:

```bash
# Connect and save Vintage's /mcp URL (streamable-http)
pnpm --filter @vintage/cli vintage connect

# Discover commands available to your rank
VINTAGE_MCP_TOKEN="<oauth-access-token>" pnpm --filter @vintage/cli vintage call afd-discover

# Inspect a command's schema
VINTAGE_MCP_TOKEN="<oauth-access-token>" pnpm --filter @vintage/cli vintage call afd-detail '{"command":"member-list"}'

# Run a command
VINTAGE_MCP_TOKEN="<oauth-access-token>" pnpm --filter @vintage/cli vintage call afd-call '{"command":"member-list","input":{}}'

# Interactive shell
VINTAGE_MCP_TOKEN="<oauth-access-token>" pnpm --filter @vintage/cli vintage shell
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VINTAGE_MCP_URL` | `https://vintage-gateway.vercel.app/mcp` | Target `/mcp` endpoint when `--connect` / `--url` / `<url>` is omitted |
| `VINTAGE_MCP_TOKEN` | — | OAuth bearer token passed as `Authorization: Bearer <token>` via `AFD_HEADERS` (never written to disk) |
| `AFD_HEADERS` | — | Standard `afd-cli` header lines; takes precedence over `VINTAGE_MCP_TOKEN` |
