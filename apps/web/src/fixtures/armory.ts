// The armory in development: a stand-in for Blizzard's Forever profile API over the example
// guild's characters, so the characters page's armory cards fill in through the real commands
// (armory-link → fetch → armory-record) with no network. A registered "First Last" answers to
// that surname only; a first name alone answers to any surname but "Unknown".
import type { ArmoryClient } from '@vintage/armory/commands';
import type { Character } from '@vintage/identity/contract';
import { titleCase } from '@vintage/ui-kit';

const RACES: Record<string, string> = {
  warrior: 'Orc',
  paladin: 'Human',
  hunter: 'Night Elf',
  rogue: 'Undead',
  priest: 'Dwarf',
  shaman: 'Tauren',
  mage: 'Gnome',
  warlock: 'Undead',
  druid: 'Night Elf',
};

/** A plausible level-40-something kit, the same for everyone: slot, item, quality, item level. */
const KIT: [string, number, string, string, number][] = [
  ['HEAD', 10289, 'Embossed Plate Helmet', 'UNCOMMON', 41],
  ['SHOULDER', 9970, 'Glimmering Shoulder Pads', 'UNCOMMON', 38],
  ['CHEST', 6473, 'Armor of the Fang', 'RARE', 32],
  ['WAIST', 2857, 'Runed Copper Belt', 'UNCOMMON', 18],
  ['LEGS', 15451, 'Gargoyle Leggings', 'UNCOMMON', 40],
  ['FEET', 9407, 'Stonegrip Boots', 'RARE', 43],
  ['FINGER_1', 1449, 'Minor Channeling Ring', 'RARE', 36],
  ['MAIN_HAND', 1263, 'Brain Hacker', 'EPIC', 45],
  ['SHIRT', 6125, "Brawler's Harness", 'COMMON', 1],
];

/** A fake Forever API over `characters()`: what the example guild's armory would answer. */
export function createFixtureArmoryClient(characters: () => Promise<Character[]>): ArmoryClient {
  const find = async (name: string, surname: string) => {
    for (const c of await characters()) {
      const [first, last] = c.name.split(' ');
      if (first?.toLowerCase() !== name.toLowerCase()) continue;
      const answers = last
        ? last.toLowerCase() === surname.toLowerCase()
        : surname.toLowerCase() !== 'unknown';
      if (answers) return c;
    }
    return null;
  };
  return {
    async characterProfile(name, surname) {
      const c = await find(name, surname);
      if (!c) return null;
      return {
        id: 500000 + c.name.length * 97,
        name,
        surname: titleCase(surname),
        level: 42,
        character_class: { id: 1, name: titleCase(c.class) },
        race: { id: 1, name: RACES[c.class] ?? 'Human' },
        faction: { type: 'HORDE', name: 'Horde' },
        guild: { name: 'Vintage', slug: 'vintage' },
        active_spec: { name: titleCase(c.spec.replaceAll('-', ' ')) },
        equipped_item_level: 37,
        average_item_level: 38,
        last_login_timestamp: Date.parse('2026-10-25T22:00:00-04:00'),
      };
    },
    async characterEquipment(name, surname) {
      if (!(await find(name, surname))) return null;
      return {
        equipped_items: KIT.map(([slot, id, itemName, quality, level]) => ({
          item: { id },
          slot: { type: slot },
          quality: { type: quality },
          name: itemName,
          level: { value: level },
        })),
      };
    },
    // No portraits in development: the card shows the initial, and nothing leaves the machine.
    characterMedia: async () => null,
    characterSpecializations: async () => null,
  };
}
