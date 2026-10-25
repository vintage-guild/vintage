# Security

## Reporting a vulnerability

Report security issues privately through GitHub:
**[Report a vulnerability](https://github.com/vintage-guild/vintage/security/advisories/new)**
(Security tab → "Report a vulnerability"). Please don't open a public issue.

Include what you found, how to reproduce it, and what an attacker could do with it. Expect a
first reply within a few days; this is a volunteer guild project.

## In scope

- Permission bypasses: running a command above your tier, seeing another member's data,
  confirming a destructive command without a valid token
- Authentication: Discord sign-in, `/mcp` OAuth tokens, caller resolution
- The Discord interactions endpoint (signature verification)
- Secrets exposed in the repo, CI logs, or the website
- The WoW addon's import/export strings (malformed input handling)

## Out of scope

- Vulnerabilities in WoW, Discord, Convex, or Vercel themselves (report to those vendors)
- Issues requiring an already-compromised officer account
- Social engineering of guild members

## How the project protects itself

Every command goes through one registry that checks the caller's tier, validates input, and
requires a signed confirmation token for destructive actions (PLAN.md §3.3, §3.7). Secrets live
only in the Convex and Vercel environments. Secret scanning with push protection, Dependabot
alerts and security updates, and private vulnerability reporting are enabled.
