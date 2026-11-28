// The quarters' three sections: the header links and the page read the same list.
import { describe, expect, it } from 'vitest';
import { OFFICER_SECTIONS, officerTabHref, sectionFromUrl } from './officer-sections';

describe('the officers’ sections', () => {
  it('splits the tabs into Event Management, Guild, and Bot, with no Roster or Polls tab', () => {
    expect(OFFICER_SECTIONS.map((s) => [s.label, s.path, [...s.tabs]])).toEqual([
      ['Event Management', '/officers/events', ['tonight', 'calendar', 'progress']],
      ['Guild', '/officers/guild', ['guild', 'recruiting', 'applications', 'roles']],
      ['Bot', '/officers/bot', ['coordinator']],
    ]);
  });

  it('reads the section from the path, or from an older link’s ?tab=', () => {
    expect(sectionFromUrl('/officers/guild', '').id).toBe('guild');
    expect(sectionFromUrl('/officers/bot/', '?tab=calendar').id).toBe('bot');
    expect(sectionFromUrl('/officers', '?tab=applications').id).toBe('guild');
    expect(sectionFromUrl('/officers', '?tab=roster').id).toBe('guild');
    expect(sectionFromUrl('/officers', '?tab=coordinator').id).toBe('bot');
    expect(sectionFromUrl('/officers', '').id).toBe('events');
    expect(sectionFromUrl('/officers/nope', '').id).toBe('events');
  });

  it('gives each tab its address, leaving ?tab= off the section’s first', () => {
    const [events, guild] = OFFICER_SECTIONS;
    if (!events || !guild) throw new Error('sections missing');
    expect(officerTabHref(events, 'tonight')).toBe('/officers/events');
    expect(officerTabHref(events, 'calendar')).toBe('/officers/events?tab=calendar');
    expect(officerTabHref(guild, 'roles')).toBe('/officers/guild?tab=roles');
  });
});
