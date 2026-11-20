# Recipe search

## Why

Officers and members ask in Discord who can craft a potion, a bag, or an enchant. Blizzard's
armory already lists every recipe each character knows (`/professions` → `tiers[].known_recipes`),
and the guild roster sync already fetches that endpoint.

## How it works

- `libs/forever-api` keeps `known_recipes` (id and name) on each profession tier.
- The roster sync stores each character's recipes in `rosterRecipes`, one row per roster entry
  (moved off the `rosterEntries` row 2026-11-20 so the roster listing never loads them; older
  rows move on their next update, or with `armory:rosterMigrateRecipes`; until then the search
  reads them where they are). A failed
  `/professions` request keeps the stored recipes.
- `armory-recipe-search` (public) matches recipe names by substring, optionally in one profession,
  and answers each recipe with everyone who knows it and their skill, best first, or none. At
  most 50.
- **The recipe catalog** (2026-11-20): every recipe each crafting profession has, from Blizzard's
  game data (`static-forever-{region}`: `/data/wow/profession/index`, `/profession/{id}`,
  `/profession/{id}/skill-tier/{tierId}`), in `professionCatalog`, one row per profession, synced
  daily. Recipe ids match a character's known recipes. Gathering skills are skipped.
  `armory-profession-list` and `armory-profession-get` read it with the roster's knowledge, and
  the search covers it, so recipes nobody knows show as "No one yet".
- `/professions` on the website, linked from the header next to Roster: a card per crafting
  profession (crafters, recipes known of the catalog, the best three) and the recipe search.
  `/professions/<name>`: every recipe in Blizzard's categories with who knows it, a name filter,
  and an All recipes / Known in the guild toggle.
- **Recipe details** (2026-11-20): the same daily sync fetches `/data/wow/recipe/{id}` (the
  crafted item and reagents) and `/data/wow/item/{id}` (the item's display strings) for catalog
  recipes that have none yet, up to 2,500 a run, into `recipeDetails`. The first run took about 2
  minutes for 2,484 recipes. `armory-recipe-get` answers one for the website's tooltip.
- **Where a recipe is learned** isn't in Blizzard's API (trainer, vendor, drop). Each recipe name
  links to its crafted item on Wowhead's Forever section (`wowhead.com/forever/item=<id>`; the
  ids match), or a Wowhead search when the item isn't synced. We link rather than scrape.
- **A character's crafting**: `armory-character-recipes` answers, per crafting profession, what a
  roster character knows and which catalog recipes it's missing. The website's
  `/professions/character/<slug>`, reached from the Character search on `/professions`.

Checked live 2026-11-19: 113 characters synced with recipes; "sharpening" found 5 Blacksmithing
recipes, "bandage" 10 First Aid recipes. Forever has recipes Classic doesn't (healing potions under
First Aid, "Discolored Healing Potion"). Catalog checked live 2026-11-20: 9 crafting professions
recorded; Blacksmithing 507 recipes in 33 categories (115 known in the guild), Leatherworking 592,
Tailoring 471.

## Next: raid kills

Each character's `/encounters/raids` answers boss kills once the raids open (Dec 9). Use it to
record guild progression automatically, in place of entering kills by hand on the Progress tab.
