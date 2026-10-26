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

/** Without a choice the site signs in Bloodfen, a flex raider. */
export const DEFAULT_PERSONA: FixturePersona = 'raider';

const STORAGE_KEY = 'vintage-dev-persona';

export function isPersona(value: string | null | undefined): value is FixturePersona {
  return value != null && Object.hasOwn(FIXTURE_PERSONAS, value);
}

/** The persona from `?as=`, else the one remembered for this tab, else the default. */
export function personaFrom(search: string, remembered: string | null): FixturePersona {
  const asked = new URLSearchParams(search).get('as');
  if (isPersona(asked)) return asked;
  if (isPersona(remembered)) return remembered;
  return DEFAULT_PERSONA;
}

/** Read the persona for this page load and remember it for the tab. */
export function choosePersona(): FixturePersona {
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
export function installPersonaSwitch(current: FixturePersona): void {
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
  select.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('as', select.value);
    location.assign(url);
  });
  label.append(select);
  document.body.append(label);
}
