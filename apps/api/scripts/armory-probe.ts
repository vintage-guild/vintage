// Probe Blizzard's WoW: Forever profile API with real credentials: each endpoint's status and the
// shape of what it answers, then the armory module's own fetches of the same character and the
// guild roster, ending in a pass/fail check per piece (exit 1 if any fails). For checking what the
// undocumented API really sends (libs/forever-api/README.md). Prints public game data only, never
// the token or the secret. The guild is BLIZZARD_GUILD_SLUG, else the character's guild.
//   BLIZZARD_CLIENT_ID=… BLIZZARD_CLIENT_SECRET=… pnpm --filter @vintage/api exec tsx \
//     scripts/armory-probe.ts <Name> <Surname> [region] [--raw]

import { fetchArmory, fetchRosterEntry, toRosterMembers } from '@vintage/armory/commands';
import {
  apiBase,
  characterSlug,
  createForeverApi,
  OAUTH_TOKEN_URL,
  parseRegion,
  profileNamespace,
} from '@vintage/forever-api';

const [name, surname, regionArg = 'us'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const raw = process.argv.includes('--raw');
const clientId = process.env.BLIZZARD_CLIENT_ID;
const clientSecret = process.env.BLIZZARD_CLIENT_SECRET;
const region = parseRegion(regionArg);
if (!name || !surname || !clientId || !clientSecret || !region) {
  console.error(
    'Usage: BLIZZARD_CLIENT_ID=… BLIZZARD_CLIENT_SECRET=… armory-probe <Name> <Surname> [us|eu|kr|tw] [--raw]',
  );
  process.exit(2);
}

/** The shape of a JSON value: keys and types, arrays by their first element, values left out. */
function shape(value: unknown, depth = 0): unknown {
  if (depth > 4) return '…';
  if (Array.isArray(value))
    return value.length ? [shape(value[0], depth + 1), `×${value.length}`] : [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== '_links' && k !== 'key')
        .map(([k, v]) => [k, shape(v, depth + 1)]),
    );
  }
  return typeof value;
}

async function token(): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`token: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function probe(bearer: string, path: string, namespace = profileNamespace(region!)) {
  const url = `${apiBase(region!)}${path}?namespace=${namespace}&locale=en_US`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${bearer}` } });
  const body = await res.json().catch(() => null);
  console.log(`\n### ${res.status} ${path}  (${namespace})`);
  if (res.ok) console.log(JSON.stringify(raw ? body : shape(body), null, 1));
  return res.ok ? (body as Record<string, unknown>) : null;
}

const checks: { name: string; ok: boolean; note: string }[] = [];
const check = (checkName: string, ok: boolean, note: string) =>
  checks.push({ name: checkName, ok, note });
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Does `/professions` look like what `characterProfessionsSchema` and `toProfessions` read? The
 * schema defaults missing lists to [], so a different shape would parse as "no professions"
 * instead of failing: check the keys themselves.
 */
function professionsShape(body: Record<string, unknown> | null): { ok: boolean; note: string } {
  if (!body) return { ok: false, note: 'no /professions body (see its status above)' };
  if (!('primaries' in body) && !('secondaries' in body)) {
    return { ok: false, note: `no primaries/secondaries; keys: ${Object.keys(body).join(', ')}` };
  }
  const entries = [body.primaries, body.secondaries].flatMap((list) =>
    Array.isArray(list) ? (list as Record<string, unknown>[]) : [],
  );
  if (entries.length === 0) {
    return { ok: true, note: 'lists present but empty: probe a character with professions' };
  }
  // Forever keeps skill points in `tiers[]` (confirmed 2026-11-19); a top-level value also reads.
  const points = (e: Record<string, unknown>) =>
    typeof e.skill_points === 'number' ||
    (Array.isArray(e.tiers) &&
      (e.tiers as Record<string, unknown>[]).some((t) => typeof t.skill_points === 'number'));
  const bad = entries.filter(
    (e) => typeof (e.profession as { name?: unknown } | undefined)?.name !== 'string' || !points(e),
  );
  if (bad.length > 0) {
    const keys = Object.keys(bad[0] ?? {}).join(', ');
    return {
      ok: false,
      note: `${bad.length} of ${entries.length} without profession.name or skill_points (top-level or in tiers[]); keys: ${keys}`,
    };
  }
  return { ok: true, note: `${entries.length} profession(s), each with a name and skill points` };
}

const bearer = await token();
console.log(`token: ok (${region})`);
const slug = encodeURIComponent(characterSlug(name, surname));
const character = `/profile/wow/character/${slug}`;
const profile = await probe(bearer, character);
let professionsBody: Record<string, unknown> | null = null;
for (const suffix of [
  '/equipment',
  '/character-media',
  '/specializations',
  '/statistics',
  '/encounters/raids',
  '/professions',
  '/status',
]) {
  const body = await probe(bearer, `${character}${suffix}`);
  if (suffix === '/professions') professionsBody = body;
}
const guild =
  process.env.BLIZZARD_GUILD_SLUG ?? (profile?.guild as { slug?: string } | undefined)?.slug;
if (guild) await probe(bearer, `/data/wow/guild/${encodeURIComponent(guild)}/roster`);
check('profile', profile !== null, profile ? 'found' : `${name} ${surname} not found`);

const api = createForeverApi({ region, clientId, clientSecret });
console.log('\n### armory module: fetchArmory');
console.log(JSON.stringify(await fetchArmory(api, name, surname), null, 1));

const shapeCheck = professionsShape(professionsBody);
check('professions shape', shapeCheck.ok, shapeCheck.note);
try {
  const parsed = await api.characterProfessions(name, surname);
  const count = (parsed?.primaries.length ?? 0) + (parsed?.secondaries.length ?? 0);
  check('professions schema', parsed !== null, parsed ? `${count} parsed` : 'not found');
} catch (err) {
  check('professions schema', false, message(err));
}

console.log('\n### armory module: fetchRosterEntry');
const entry = await fetchRosterEntry(api, region, name, surname);
console.log(JSON.stringify(entry, null, 1));
// A field left out of a found entry means its request failed (the sync keeps the stored value).
const professionsList = entry.status === 'found' ? entry.professions : undefined;
if (entry.status === 'found' && !professionsList) {
  check('profession levels', false, 'the /professions request failed');
} else if (professionsList && professionsList.length > 0) {
  const zero = professionsList.filter((p) => p.level === 0).length;
  check(
    'profession levels',
    zero < professionsList.length,
    professionsList.map((p) => `${p.name} ${p.level}/${p.maxLevel ?? '?'}`).join(', '),
  );
}
check(
  'roster entry',
  entry.status === 'found',
  entry.status === 'found'
    ? `${entry.activeSpec ?? 'no spec'} ${entry.className ?? ''}, ${professionsList?.length ?? 'unknown'} profession(s)`
    : entry.error,
);

if (!guild) {
  check('guild roster', false, 'no guild: set BLIZZARD_GUILD_SLUG or probe a guild member');
} else {
  console.log(`\n### armory module: toRosterMembers(guildRoster("${guild}"))`);
  try {
    const roster = await api.guildRoster(guild);
    if (!roster) {
      check('guild roster', false, `guild "${guild}" not found`);
    } else {
      const members = toRosterMembers(roster);
      const ranks = new Map<number, number>();
      for (const m of members) ranks.set(m.guildRank, (ranks.get(m.guildRank) ?? 0) + 1);
      const noSurname = members.filter((m) => !m.surname).length;
      console.log(JSON.stringify(members.slice(0, 5), null, 1));
      console.log(
        `ranks: ${[...ranks]
          .sort(([a], [b]) => a - b)
          .map(([r, n]) => `${r}×${n}`)
          .join(' ')}`,
      );
      check(
        'guild roster',
        members.length > 0 && noSurname === 0,
        `${members.length} member(s)${noSurname ? `, ${noSurname} without a surname (bad slugs)` : ''}`,
      );
    }
  } catch (err) {
    check('guild roster', false, message(err));
  }
}

console.log('\n### checks');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.note}`);
process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
