// Discord invite embed and non-responder reminder DM for surveys (#65).
// Pure: data in, MessageData out. Answering happens on the website; Discord shows the invite
// with a link button and a live responded count.
import { discordColor } from '@vintage/design-tokens';
import {
  actionRow,
  discordTimestamp,
  embed,
  linkButton,
  type MessageData,
  TimestampStyle,
  truncate,
} from '@vintage/discord-kit';
import { type Tier, tierAllows } from '@vintage/guild-kit';
import type { Member } from '@vintage/identity/contract';
import type { Survey, SurveyResponse } from '../contract';

const AUDIENCE: Record<Tier, string> = {
  public: 'Everyone',
  friend: 'Friends and up',
  member: 'Members and up',
  recruit: 'Recruits and up',
  raider: 'Raiders and up',
  leader: 'Raid leaders and officers',
  officer: 'Officers',
};

export interface SurveyCard {
  survey: Survey;
  responded: number;
  eligible: number | null;
  surveyUrl: string | null;
}

export function buildSurveyCard(
  survey: Survey,
  responses: readonly Pick<SurveyResponse, 'memberId'>[],
  members: readonly Pick<Member, 'inServer' | 'tier'>[],
  surveyUrl: string | null,
): SurveyCard {
  const eligible = members.filter(
    (m) => m.inServer && tierAllows(m.tier, survey.eligibleTier),
  ).length;
  return { survey, responded: responses.length, eligible, surveyUrl };
}

/** Changes whenever the invite embed needs an edit in Discord. */
export function surveyRenderKey({ survey, responded, eligible, surveyUrl }: SurveyCard): string {
  return `${survey.configVersion}:${survey.status}:${responded}:${eligible ?? ''}:${surveyUrl ?? ''}`;
}

/** Discord invite embed with responded counter and website link button. */
export function renderSurveyInvite(card: SurveyCard): MessageData {
  const { survey, responded, eligible, surveyUrl } = card;
  const qCount = survey.questions.length;
  const metaParts = [`${qCount} question${qCount === 1 ? '' : 's'}`, AUDIENCE[survey.eligibleTier]];
  if (survey.anonymous) metaParts.push('anonymous');
  if (survey.status === 'open' && survey.closesAt !== null) {
    metaParts.push(`closes ${discordTimestamp(survey.closesAt, TimestampStyle.RELATIVE)}`);
  }
  if (survey.status === 'closed') metaParts.push('**closed**');
  if (survey.status === 'cancelled') metaParts.push('**cancelled**');

  const progress =
    eligible !== null ? `**${responded} / ${eligible}** responded` : `**${responded}** responded`;
  const lines = [
    survey.description ? truncate(survey.description, 500) : null,
    metaParts.join(' · '),
    progress,
  ].filter((l): l is string => l !== null);

  const color =
    survey.status === 'open'
      ? discordColor('color.text.accent')
      : discordColor('color.text.secondary');
  const titlePrefix = survey.status === 'closed' ? 'Closed · ' : '';
  const body = embed({
    title: truncate(`${titlePrefix}${survey.title}`, 256),
    description: lines.join('\n\n'),
    color,
    footer: {
      text:
        survey.status === 'open'
          ? 'Answer on the website — one response per member'
          : 'Survey closed',
    },
  });

  const components =
    surveyUrl && survey.status !== 'cancelled'
      ? [
          actionRow(
            linkButton(survey.status === 'open' ? 'Answer survey' : 'View survey', surveyUrl),
          ),
        ]
      : [];

  return { embeds: [body], components };
}

/** Private DM nudging a non-responder who has not opted out of DMs. */
export function renderSurveyReminderDm(survey: Survey, surveyUrl: string | null): MessageData {
  const closeNote =
    survey.closesAt !== null
      ? ` — closes ${discordTimestamp(survey.closesAt, TimestampStyle.RELATIVE)}`
      : '';
  const linkLine = surveyUrl ? `\n${surveyUrl}` : '';
  return {
    content: `Quick reminder: **${survey.title}** is still open${closeNote}. It takes a minute on the website.${linkLine}`,
    components: surveyUrl ? [actionRow(linkButton('Answer survey', surveyUrl))] : [],
  };
}
