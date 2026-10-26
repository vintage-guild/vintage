// The dev-only "view as" switch: which fixture member the site signs in, so the visitor, member,
// and officer compositions can be built and checked before Discord sign-in (#7) is real.
// `?as=<persona>` picks one and is remembered for the tab; the floating switch sets it.

/** One fixture member per tier, or nobody. Names are from MEMBERS in data.ts. */
export const FIXTURE_PERSONAS = {
  visitor: null,
  member: 'Gwendolyn',
  recruit: 'Wendeline',
  raider: 'Bloodfen',
  leader: 'Garrick',
  officer: 'Aeryn',
} as const satisfies Record<string, string | null>;

export type FixturePersona = keyof typeof FIXTURE_PERSONAS;

/** Not a fixture: the real server and Discord sign-in, from the dev server. Real members. */
export const LIVE = 'live';

/** What the dev switch can pick: a fixture persona, or the live server. */
export type DevChoice = FixturePersona | typeof LIVE;

/** Without a choice the site signs in Bloodfen, a flex raider. */
export const DEFAULT_PERSONA: FixturePersona = 'raider';

const STORAGE_KEY = 'vintage-dev-persona';

export function isPersona(value: string | null | undefined): value is FixturePersona {
  return value != null && Object.hasOwn(FIXTURE_PERSONAS, value);
}

const isChoice = (value: string | null | undefined): value is DevChoice =>
  value === LIVE || isPersona(value);

/** The choice from `?as=`, else the one remembered for this tab, else the default persona. */
export function personaFrom(search: string, remembered: string | null): DevChoice {
  const asked = new URLSearchParams(search).get('as');
  if (isChoice(asked)) return asked;
  if (isChoice(remembered)) return remembered;
  return DEFAULT_PERSONA;
}

/** Read the persona for this page load and remember it for the tab. */
export function choosePersona(): DevChoice {
  let remembered: string | null = null;
  try {
    remembered = sessionStorage.getItem(STORAGE_KEY);
  } catch {}
  const persona = personaFrom(location.search, remembered);
  try {
    sessionStorage.setItem(STORAGE_KEY, persona);
  } catch {}
  return persona;
}

/** The floating "view as" control, bottom left. Changing it reloads as the new persona. */
export function installPersonaSwitch(current: DevChoice): void {
  const label = document.createElement('label');
  label.className = 'dev-switch';
  label.title = 'Development only: sign in as a fixture member of this tier';
  label.append('View as');
  const select = document.createElement('select');
  for (const persona of Object.keys(FIXTURE_PERSONAS) as FixturePersona[]) {
    const name = FIXTURE_PERSONAS[persona];
    const option = new Option(name ? `${persona} · ${name}` : persona, persona);
    option.selected = persona === current;
    select.append(option);
  }
  const live = new Option('live · Discord sign-in (real data)', LIVE);
  live.selected = current === LIVE;
  select.append(live);
  select.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('as', select.value);
    location.assign(url);
  });
  label.append(select);
  document.body.append(label);
}
