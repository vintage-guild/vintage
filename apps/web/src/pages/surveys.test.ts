import { Updates } from '@lushly-dev/fast-element';
import { getCommandClient } from '@vintage/ui-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFixtures } from '../fixtures';
import { setSession } from '../session';
import './surveys';

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Updates.next();
    await new Promise((r) => setTimeout(r, 0));
  }
};

beforeEach(() => {
  history.replaceState(null, '', '/surveys');
});

afterEach(() => {
  setSession(null);
  document.body.replaceChildren();
});

describe('/surveys', () => {
  it('shows visitors the sign-in card', async () => {
    await installFixtures('visitor');
    document.body.innerHTML = '<vintage-surveys-page></vintage-surveys-page>';
    await flush();
    const page = document.querySelector('vintage-surveys-page')!;
    expect(page.shadowRoot!.querySelector('vintage-sign-in-card')).not.toBeNull();
  });

  it('lets a member answer a survey on /surveys/<id> and an officer export CSV', async () => {
    const { host } = await installFixtures('officer');
    const officer = (await host.member('Aeryn'))!;
    const created = await host.run<{ id: string }>(host.callerFor(officer), 'survey-create', {
      title: 'Raid pace check',
      description: 'Quick check after Molten Core.',
      questions: [
        { prompt: 'How was the pace?', kind: 'single', options: ['Great', 'Too fast'] },
        { prompt: 'Comments', kind: 'text', required: false },
      ],
      resultsVisible: 'live',
      anonymous: true,
    });
    const surveyId = created.data!.id;

    history.replaceState(null, '', `/surveys/${surveyId}`);
    document.body.innerHTML = '<vintage-surveys-page></vintage-surveys-page>';
    await flush();

    const page = document.querySelector('vintage-surveys-page') as HTMLElement & {
      setSingleChoice(q: string, o: string): void;
      setTextAnswer(q: string, v: string): void;
      onSubmit(e: SubmitEvent): Promise<void>;
      exportCsv(): Promise<void>;
      exportedCsv: string;
    };
    page.setSingleChoice('q1', 'o1');
    page.setTextAnswer('q2', 'Loved the pulls');
    await page.onSubmit({ preventDefault() {} } as unknown as SubmitEvent);
    await flush();

    const got = await getCommandClient().read<{ responses: number }>('survey-get', { surveyId });
    expect(got.data?.responses).toBe(1);

    await page.exportCsv();
    await flush();
    expect(page.exportedCsv).toContain('response_id,submitted_at,updated_at');
    expect(page.exportedCsv).toContain('Great');
    expect(page.exportedCsv).toContain('Loved the pulls');
    expect(page.exportedCsv).not.toContain('Aeryn');
  });
});
