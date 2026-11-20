# Recipe search

## Why

Officers and members ask in Discord who can craft a potion, a bag, or an enchant. Blizzard's
armory already lists every recipe each character knows (`/professions` → `tiers[].known_recipes`),
and the guild roster sync already fetches that endpoint.

## How it works

- `libs/forever-api` keeps `known_recipes` (id and name) on each profession tier.
- The roster sync stores each character's recipes in `rosterRecipes`, one row per roster entry.
  The roster listing reads `rosterEntries`. A failed `/professions` request keeps the stored
  recipes.
- `armory-recipe-search` (public) matches recipe names by substring, optionally in one profession,
  and answers each recipe with everyone who knows it and their skill, best first. At most 50.
- `/professions` on the website, linked from the header next to Roster: a recipe search box and a profession filter.

Checked live 2026-11-19: 113 characters synced with recipes; "sharpening" found 5 Blacksmithing
recipes, "bandage" 10 First Aid recipes. Forever has recipes Classic doesn't (healing potions under
First Aid, "Discolored Healing Potion").

## Open questions

- Links from a recipe to Wowhead or the crafted item: Blizzard's recipe id isn't Wowhead's spell
  id; `/data/wow/recipe/{id}` would give the crafted item, unchecked for Forever.

## Next: raid kills

Each character's `/encounters/raids` answers boss kills once the raids open (Dec 9). Use it to
record guild progression automatically, in place of entering kills by hand on the Progress tab.
