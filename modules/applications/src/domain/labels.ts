// Application labels (#134): one Decisions request per application, read against conservative
// thresholds. No labeled set of real applications exists yet (the research note's open question
// 1), so the floors are high and a label below them shows as "unsure". Labels inform officers;
// they never accept or decline anything.
import {
  choiceAtLeast,
  type DecisionRequest,
  type DecisionResult,
  type DecisionsPort,
  predicateAtLeast,
  scoreAtLeast,
} from '@vintage/decisions';
import { type Application, type ApplicationLabels, FIT_LEVELS } from '../contract';

export const LABEL_THRESHOLDS = { role: 0.8, complete: 0.7, fitConfidence: 0.6 } as const;

/** A recruiting need as the labeler reads it. */
export interface NeedLine {
  wowClass: string;
  specs: string;
  need: string;
}

export function labelRequest(
  application: Application,
  needs: readonly NeedLine[],
  cacheKey: string,
): DecisionRequest {
  const open = needs.filter((n) => n.need !== 'closed');
  const input = [
    'An application to raid with a World of Warcraft guild.',
    `Open recruiting needs: ${
      open.length
        ? open.map((n) => `${n.wowClass} (${n.specs}, ${n.need})`).join('; ')
        : 'none listed'
    }.`,
    '',
    `Character: ${application.characterName}, ${application.spec} ${application.wowClass}`,
    `Applying as: ${application.role}`,
    `About: ${application.about}`,
    `Raiding experience: ${application.experience}`,
    `Availability: ${application.availability}`,
  ].join('\n');
  return {
    input,
    cacheKey,
    questions: [
      {
        type: 'choice',
        name: 'role',
        instructions: 'What does this person want, judging by what they wrote?',
        choices: [
          { value: 'raider', description: 'A core raid spot, every raid night' },
          { value: 'flex-raider', description: 'Raiding sometimes, when there is room or a need' },
          { value: 'social', description: 'Mostly to be in the guild; raiding is not the point' },
        ],
      },
      {
        type: 'predicate',
        name: 'complete',
        instructions:
          'Does the application answer every question with real detail (not one word or placeholder text)?',
      },
      {
        type: 'score',
        name: 'fit',
        instructions:
          "How well does this character's class and spec fit the open recruiting needs?",
        levels: [
          { label: 'poor', description: 'Class or spec not needed' },
          { label: 'partial', description: 'Class needed, different spec, or a low need' },
          { label: 'good', description: 'Matches a medium need' },
          { label: 'strong', description: 'Matches a high need' },
        ],
      },
    ],
  };
}

export function readLabels(result: DecisionResult | null, now: number): ApplicationLabels {
  const completeAnswer = result?.answers.complete;
  const complete =
    completeAnswer?.type !== 'predicate'
      ? null
      : predicateAtLeast(result, 'complete', LABEL_THRESHOLDS.complete)
        ? true
        : completeAnswer.probability <= 1 - LABEL_THRESHOLDS.complete
          ? false
          : null;
  const fit = scoreAtLeast(result, 'fit', LABEL_THRESHOLDS.fitConfidence);
  return {
    role: choiceAtLeast(result, 'role', LABEL_THRESHOLDS.role),
    complete,
    fit: fit === null ? null : Math.max(0, Math.min(FIT_LEVELS.length - 1, Math.round(fit))),
    labeledAt: now,
  };
}

/** Label one application, or null on any failure (it shows unlabeled). */
export async function labelApplication(
  decisions: DecisionsPort | null | undefined,
  application: Application,
  needs: readonly NeedLine[],
  now: number,
): Promise<ApplicationLabels | null> {
  if (!decisions) return null;
  try {
    return readLabels(
      await decisions.ask(labelRequest(application, needs, application.guildId)),
      now,
    );
  } catch {
    return null;
  }
}
