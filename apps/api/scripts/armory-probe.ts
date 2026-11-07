// Probe Blizzard's WoW: Forever profile API with real credentials: each endpoint's status and the
// shape of what it answers, then the armory module's own fetch of the same character. For checking
// what the undocumented API really sends (libs/forever-api/README.md). Prints public game data only,
// never the token or the secret.
//   BLIZZARD_CLIENT_ID=… BLIZZARD_CLIENT_SECRET=… pnpm --filter @vintage/api exec tsx \
//     scripts/armory-probe.ts <Name> <Surname> [region] [--raw]

import { fetchArmory } from '@vintage/armory/commands';
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

const bearer = await token();
console.log(`token: ok (${region})`);
const slug = encodeURIComponent(characterSlug(name, surname));
const character = `/profile/wow/character/${slug}`;
const profile = await probe(bearer, character);
for (const suffix of [
  '/equipment',
  '/character-media',
  '/specializations',
  '/statistics',
  '/encounters/raids',
  '/professions',
  '/status',
]) {
  await probe(bearer, `${character}${suffix}`);
}
const guild = (profile?.guild as { slug?: string } | undefined)?.slug;
if (guild) await probe(bearer, `/data/wow/guild/${encodeURIComponent(guild)}/roster`);

console.log('\n### armory module: fetchArmory');
const api = createForeverApi({ region, clientId, clientSecret });
console.log(JSON.stringify(await fetchArmory(api, name, surname), null, 1));
