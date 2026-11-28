// Feature flags: guild features that can be switched off everywhere (the website, Discord, help)
// without removing their code or data. Each flag is a constant, so turning one on or off is a
// one-line change and a deploy. Platform-free: the site, the gateway, and apps/api all read it.

/** Every flag and whether it is on. */
export const FEATURES = {
  /**
   * Polls: the site's Polls page, header link, home card, and quarters tab; `/vintage poll` and
   * `/vintage event pick-night` in Discord; and the help topic. Off since 2026-11-27 (TJ). The
   * poll commands stay registered for agents and MCP, and stored polls are kept.
   */
  polls: false,
} as const;

export type Feature = keyof typeof FEATURES;

/** Whether a feature is on. */
export function featureOn(feature: Feature): boolean {
  return FEATURES[feature];
}
