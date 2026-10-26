import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, mount, settle, shadowText } from '../test-helpers';
import type { LedgerRaid, VintageBossLedger } from './boss-ledger';
import './boss-ledger';

afterEach(cleanup);

const OPENS_ON = '2026-12-09';
// Noon UTC, so the rendered day is the same from UTC-11 to UTC+11 (CI runs in UTC, dev in ET or PT).
const DEC_10 = Date.UTC(2026, 11, 10, 12);
const DEC_17 = Date.UTC(2026, 11, 17, 12);

const boss = (id: string, name: string, firstKillAt: number | null = null, datamined = true) => ({
  id,
  name,
  datamined,
  firstKillAt,
  loot: [],
});

const raids = (): LedgerRaid[] => [
  {
    id: 'barrow-deeps',
    name: 'Barrow Deeps',
    size: 10,
    bosses: [boss('a', 'Chillhowl'), boss('b', 'Elder Tangleclaw'), boss('c', 'Khalith')],
  },
  {
    id: 'onyxias-lair',
    name: "Onyxia's Lair",
    size: 40,
    bosses: [boss('ony', 'Onyxia', null, false)],
  },
];

const slots = (el: Element) => [...el.shadowRoot!.querySelectorAll<HTMLElement>('.slot')];

describe('vintage-boss-ledger', () => {
  it('before the raids unlock: every slot empty, each row says when, names on hover', async () => {
    const el = await mount<VintageBossLedger>(
      `<vintage-boss-ledger opens-on="${OPENS_ON}"></vintage-boss-ledger>`,
    );
    el.raids = raids();
    await settle();
    const text = shadowText(el);
    // Closed rows keep the plain tally; the page says the unlock date once. Slots are numbered.
    expect(text).toContain('Barrow Deeps 10 players · 3 bosses 0 / 3 1');
    expect(text).toContain("Onyxia's Lair 40 players · 1 boss 0 / 1 1");
    expect(slots(el).map((s) => s.className)).toEqual([
      'slot locked',
      'slot locked',
      'slot locked',
      'slot locked',
    ]);
    expect(slots(el)[0]?.getAttribute('aria-label')).toBe(
      'Chillhowl · unlocks Dec 9 · datamined name',
    );
    expect(slots(el)[3]?.getAttribute('aria-label')).toBe('Onyxia · unlocks Dec 9');
    expect(slots(el).every((s) => s.getAttribute('tabindex') === '0')).toBe(true);
    expect(el.shadowRoot!.querySelector('.callout')).toBeNull();
    expect(text).toContain('datamined from the beta client');
  });

  it('once raiding: killed slots carry the date, the next target is marked, and the latest kill gets a callout', async () => {
    const el = await mount<VintageBossLedger>(
      `<vintage-boss-ledger open opens-on="${OPENS_ON}"></vintage-boss-ledger>`,
    );
    const data = raids();
    data[0]!.bosses[0]!.firstKillAt = DEC_10;
    data[0]!.bosses[1]!.firstKillAt = DEC_17;
    el.raids = data;
    el.latest = {
      raidName: 'Barrow Deeps',
      bossName: 'Elder Tangleclaw',
      killedAt: DEC_17,
      loot: [
        { name: 'Tangleclaw Mantle', quality: 'epic' },
        { name: 'Rootbound Band', quality: 'rare' },
      ],
    };
    await settle();
    const text = shadowText(el);
    expect(text).toContain('First kill Elder Tangleclaw Barrow Deeps · Dec 17');
    expect(text).toContain('[Tangleclaw Mantle][Rootbound Band]');
    expect([...el.shadowRoot!.querySelectorAll('.item')].map((i) => i.className)).toEqual([
      'item q-epic',
      'item q-rare',
    ]);
    expect(text).toContain('Barrow Deeps 10 players · 3 bosses 2 / 3');
    expect(slots(el).map((s) => s.className)).toEqual([
      'slot killed',
      'slot killed',
      'slot next',
      'slot next',
    ]);
    expect(slots(el)[0]?.getAttribute('aria-label')).toBe(
      'Chillhowl · first kill Dec 10 · datamined name',
    );
    expect(slots(el)[0]?.querySelector('.date')?.textContent).toBe('Dec 10');
    expect(slots(el)[2]?.getAttribute('aria-label')).toBe('Khalith · next target · datamined name');
    expect(slots(el)[3]?.getAttribute('aria-label')).toBe('Onyxia · next target');
  });

  it('says cleared when every boss in a raid is down, and skips the note without datamined names', async () => {
    const el = await mount<VintageBossLedger>(
      `<vintage-boss-ledger open opens-on="${OPENS_ON}"></vintage-boss-ledger>`,
    );
    el.raids = [raids()[1]!];
    el.raids[0]!.bosses[0]!.firstKillAt = DEC_10;
    await settle();
    expect(shadowText(el)).toContain('1 / 1 · cleared');
    expect(el.shadowRoot!.querySelector('.note')).toBeNull();
  });
});
