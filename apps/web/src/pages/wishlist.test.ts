import { Updates } from '@lushly-dev/fast-element';
import { getCommandClient, setCommandClient } from '@vintage/ui-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { installFixtures } from '../fixtures';
import { setSession } from '../session';
import './wishlist';

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
};

afterEach(() => {
  setSession(null);
  document.body.replaceChildren();
});

describe('/wishlist', () => {
  it('shows visitors the sign-in card', async () => {
    await installFixtures('visitor');
    document.body.innerHTML = '<vintage-wishlist-page></vintage-wishlist-page>';
    await flush();
    const page = document.querySelector('vintage-wishlist-page')!;
    expect(page.shadowRoot!.querySelector('vintage-sign-in-card')).not.toBeNull();
  });

  it('lets a raider add, reorder, and remove wishlist items for a character', async () => {
    await installFixtures('raider');
    document.body.innerHTML = '<vintage-wishlist-page></vintage-wishlist-page>';
    await flush();

    const page = document.querySelector('vintage-wishlist-page') as HTMLElement & {
      selectedCharacterId: string;
      itemIdInput: string;
      itemNameInput: string;
      noteInput: string;
      onAdd(e: SubmitEvent): Promise<void>;
      moveItem(id: number, delta: -1 | 1): Promise<void>;
      removeItem(id: number): Promise<void>;
    };
    expect(page.selectedCharacterId).toBeTruthy();

    // Add two items through the page's form handler.
    const submitEvent = () => ({ preventDefault() {} }) as unknown as SubmitEvent;
    page.itemIdInput = '17103';
    page.itemNameInput = 'Azuresong Mageblade';
    page.noteInput = 'BiS weapon';
    await page.onAdd(submitEvent());
    await flush();

    page.itemIdInput = '18803';
    page.itemNameInput = "Finkle's Lava Dredger";
    page.noteInput = 'Offspec';
    await page.onAdd(submitEvent());
    await flush();

    const rows = () =>
      [...page.shadowRoot!.querySelectorAll('.entry')].map((el) =>
        el.textContent?.replace(/\s+/g, ' ').trim(),
      );
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain('#1');
    expect(rows()[0]).toContain('Azuresong Mageblade');
    expect(rows()[1]).toContain('#2');

    // Move the second item up to #1.
    await page.moveItem(18803, -1);
    await flush();
    expect(rows()[0]).toContain("Finkle's Lava Dredger");

    // Verify persisted via wishlist-get.
    const got = await getCommandClient().read<{ entries: { itemId: number; rank: number }[] }>(
      'wishlist-get',
      { characterId: page.selectedCharacterId },
    );
    expect(got.success).toBe(true);
    expect(got.data?.entries.map((e) => [e.itemId, e.rank])).toEqual([
      [18803, 1],
      [17103, 2],
    ]);

    // Remove the first item.
    await page.removeItem(18803);
    await flush();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('Azuresong Mageblade');
  });

  it('shows member tier a read-only view without add/reorder controls', async () => {
    const prev = getCommandClient();
    await installFixtures('member');
    document.body.innerHTML = '<vintage-wishlist-page></vintage-wishlist-page>';
    await flush();
    const page = document.querySelector('vintage-wishlist-page')!;
    expect(page.shadowRoot!.querySelector('.add-form')).toBeNull();
    setCommandClient(prev);
  });
});
