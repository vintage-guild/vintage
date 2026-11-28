// The officers' quarters in three parts, each its own header link (TJ, 2026-11-27): Event
// Management, Guild, and Bot. The header (src/main.ts) and the quarters page
// (src/pages/officers.ts) both read this, so a tab can't be in one and missing from the other.
import { featureOn } from '@vintage/features';

/** Every tab in the quarters, by id. */
export type OfficerTabId =
  | 'tonight'
  | 'calendar'
  | 'progress'
  | 'guild'
  | 'recruiting'
  | 'applications'
  | 'roles'
  | 'polls'
  | 'coordinator';

export interface OfficerSection {
  id: 'events' | 'guild' | 'bot';
  /** The header link and the page heading. */
  label: string;
  path: string;
  /** Its tabs, in order; the first opens by default. */
  tabs: readonly OfficerTabId[];
}

export const OFFICER_SECTIONS: readonly OfficerSection[] = [
  {
    id: 'events',
    label: 'Event Management',
    path: '/officers/events',
    tabs: ['tonight', 'calendar', 'progress'],
  },
  {
    id: 'guild',
    label: 'Guild',
    path: '/officers/guild',
    // Polls are off (@vintage/features); their tab comes back with the flag.
    tabs: [
      'guild',
      'recruiting',
      'applications',
      'roles',
      ...(featureOn('polls') ? ['polls' as const] : []),
    ],
  },
  { id: 'bot', label: 'Bot', path: '/officers/bot', tabs: ['coordinator'] },
];

/** Older links name a tab that has a new id. */
const RENAMED: Partial<Record<string, OfficerTabId>> = { roster: 'roles' };

const tabParam = (search: string): string | null => {
  const raw = new URLSearchParams(search).get('tab');
  return raw ? (RENAMED[raw] ?? raw) : null;
};

/**
 * The section for `/officers/<section>`. A bare `/officers` (older links, like
 * `/officers?tab=applications`) takes the section holding its `?tab=`, else Event Management.
 */
export function sectionFromUrl(pathname: string, search: string): OfficerSection {
  const named = /^\/?officers\/([^/?#]+)/.exec(pathname)?.[1];
  const bySection = OFFICER_SECTIONS.find((s) => s.id === named);
  if (bySection) return bySection;
  const tab = tabParam(search);
  return OFFICER_SECTIONS.find((s) => s.tabs.includes(tab as OfficerTabId)) ?? OFFICER_SECTIONS[0]!;
}

/** The tab named in `?tab=` when the section has it; the section's first tab otherwise. */
export function tabFromUrl(search: string, section: OfficerSection): OfficerTabId {
  const tab = tabParam(search);
  return section.tabs.find((t) => t === tab) ?? section.tabs[0]!;
}

/** The address for a tab: its section's path, with `?tab=` unless it's the section's first. */
export function officerTabHref(section: OfficerSection, tab: OfficerTabId): string {
  return tab === section.tabs[0] ? section.path : `${section.path}?tab=${tab}`;
}
