import { describe, expect, it } from 'vitest';
import { hasAdminAccess } from '../src/admin-access';

describe('hasAdminAccess', () => {
  it('returns false when neither env var is set', () => {
    expect(hasAdminAccess({ discordId: '111', roleIds: ['999'] }, {})).toBe(false);
  });

  it('matches comma-separated Discord user ids in VINTAGE_ADMIN_DISCORD_IDS', () => {
    const env = { VINTAGE_ADMIN_DISCORD_IDS: ' 111 , 222 ' };
    expect(hasAdminAccess({ discordId: '222', roleIds: [] }, env)).toBe(true);
    expect(hasAdminAccess({ discordId: '333', roleIds: [] }, env)).toBe(false);
  });

  it('matches comma-separated Discord role ids in VINTAGE_ADMIN_ROLE_IDS', () => {
    const env = { VINTAGE_ADMIN_ROLE_IDS: ' 888 , 999 ' };
    expect(hasAdminAccess({ discordId: '333', roleIds: ['100', '999'] }, env)).toBe(true);
    expect(hasAdminAccess({ discordId: '333', roleIds: ['100'] }, env)).toBe(false);
  });
});
