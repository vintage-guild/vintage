// Applications in Discord (#135). Pure: data in, discord-kit shapes out.
//   /random apply character class spec role → the apply modal (the long answers)
//   modal  app:form:<class>:<role>:<name>:<spec> → application-submit
//   button app:ok:<id>  → application-review accepted
//   button app:re:<id>  → the reply modal; modal app:rs:<id> → application-review in-review + reply
//   button app:no:<id>  → application-decline preview, with a Confirm button
//   button app:nn:<id>  → application-decline for real (the click is the confirmation)
import {
  actionRow,
  ButtonStyle,
  button,
  type Embed,
  embed,
  type InteractionResponse,
  type MessageData,
  modal,
  TextInputStyle,
  textInput,
  truncate,
} from '@vintage/discord-kit';
import { CLASS_NAMES, type WowClass } from '@vintage/wow-data';
import {
  APPLICATION_LIMITS,
  APPLY_ROLES,
  type Application,
  type ApplicationLabels,
  type ApplyRole,
  FIT_LEVELS,
  OPEN_STATUSES,
} from '../contract';

const PREFIX = 'app';
export const APPLICATION_ACTIONS = ['form', 'ok', 're', 'rs', 'no', 'nn'] as const;
export type ApplicationAction = (typeof APPLICATION_ACTIONS)[number];

export const applicationCustomId = (action: Exclude<ApplicationAction, 'form'>, id: string) =>
  `${PREFIX}:${action}:${id}`;

export interface ApplyForm {
  wowClass: WowClass;
  role: ApplyRole;
  characterName: string;
  spec: string;
}

/** The modal's custom id carries the slash command's short answers (100 characters at most). */
export function applyFormCustomId(form: ApplyForm): string {
  const spec = form.spec.replace(/:/g, ' ').trim().slice(0, 40);
  return `${PREFIX}:form:${CLASS_NAMES.indexOf(form.wowClass)}:${APPLY_ROLES.indexOf(form.role)}:${form.characterName}:${spec}`.slice(
    0,
    100,
  );
}

export type ParsedApplicationId =
  | { action: 'form'; form: ApplyForm }
  | { action: Exclude<ApplicationAction, 'form'>; applicationId: string };

export function parseApplicationCustomId(customId: string | undefined): ParsedApplicationId | null {
  const parts = (customId ?? '').split(':');
  if (parts[0] !== PREFIX) return null;
  const action = parts[1] as ApplicationAction;
  if (action === 'form') {
    const wowClass = CLASS_NAMES[Number(parts[2])];
    const role = APPLY_ROLES[Number(parts[3])];
    const characterName = parts[4];
    const spec = parts.slice(5).join(':');
    if (!wowClass || !role || !characterName || !spec) return null;
    return { action, form: { wowClass, role, characterName, spec } };
  }
  if (!APPLICATION_ACTIONS.includes(action) || !parts[2]) return null;
  return { action, applicationId: parts[2] };
}

export const APPLY_FIELDS = {
  about: 'about',
  experience: 'experience',
  availability: 'availability',
};

export function applyModal(form: ApplyForm): InteractionResponse {
  return modal(
    applyFormCustomId(form),
    'Apply to Vintage',
    textInput(APPLY_FIELDS.about, 'A few words about you', {
      style: TextInputStyle.PARAGRAPH,
      max_length: APPLICATION_LIMITS.about,
      required: true,
    }),
    textInput(APPLY_FIELDS.experience, 'Your raiding experience', {
      style: TextInputStyle.PARAGRAPH,
      max_length: APPLICATION_LIMITS.experience,
      required: true,
    }),
    textInput(APPLY_FIELDS.availability, 'Which nights and times you can raid', {
      style: TextInputStyle.SHORT,
      max_length: APPLICATION_LIMITS.availability,
      required: true,
    }),
  );
}

export const REPLY_FIELD = 'reply';

export function replyModal(applicationId: string): InteractionResponse {
  return modal(
    applicationCustomId('rs', applicationId),
    'Reply to the applicant',
    textInput(REPLY_FIELD, 'They get this in a DM', {
      style: TextInputStyle.PARAGRAPH,
      max_length: APPLICATION_LIMITS.reply,
      required: true,
    }),
  );
}

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Reads as raider · complete · fit strong", or why there are no labels. */
export function labelsLine(labels: ApplicationLabels | null): string {
  if (!labels) return 'Not labeled (no key, paused, or the labeler failed)';
  const parts = [
    labels.role ? `reads as ${labels.role}` : 'role unsure',
    labels.complete === null ? 'completeness unsure' : labels.complete ? 'complete' : 'incomplete',
    labels.fit === null ? 'fit unsure' : `fit ${FIT_LEVELS[labels.fit]}`,
  ];
  return title(parts.join(' · '));
}

const STATUS_LINE: Record<Application['status'], string> = {
  new: 'New',
  'in-review': 'In review',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn by the applicant',
};

/** The review post in the recruitment channel; buttons only while the application is open. */
export function renderApplicationPost(application: Application): MessageData {
  const open = OPEN_STATUSES.includes(application.status);
  const fields = [
    {
      name: 'Applicant',
      value: `<@${application.discordId}> (${application.applicantName})`,
      inline: true,
    },
    { name: 'Wants', value: title(application.role.replace('-', ' ')), inline: true },
    { name: 'Labels', value: labelsLine(application.labels) },
    { name: 'About', value: application.about },
    { name: 'Raiding experience', value: application.experience },
    { name: 'Availability', value: application.availability },
    ...(application.reply ? [{ name: 'Officers replied', value: application.reply }] : []),
  ];
  const post: Embed = embed({
    title: `${application.characterName} · ${title(application.spec)} ${title(application.wowClass)}`,
    fields,
    footer: { text: `${STATUS_LINE[application.status]} · application ${application.id}` },
    timestamp: new Date(application.createdAt).toISOString(),
  });
  return {
    embeds: [post],
    components: open
      ? [
          actionRow(
            button(applicationCustomId('ok', application.id), 'Accept', ButtonStyle.SUCCESS),
            button(applicationCustomId('re', application.id), 'Reply', ButtonStyle.PRIMARY),
            button(applicationCustomId('no', application.id), 'Decline', ButtonStyle.DANGER),
          ),
        ]
      : [],
    allowed_mentions: { parse: [] },
  };
}

/** The decline preview: one Confirm button. */
export function renderDeclinePreview(application: Application): MessageData {
  return {
    content: `Decline ${application.characterName} (${application.applicantName})? They get no message unless you reply first.`,
    components: [
      actionRow(
        button(applicationCustomId('nn', application.id), 'Confirm decline', ButtonStyle.DANGER),
      ),
    ],
    allowed_mentions: { parse: [] },
  };
}

/** The DM an applicant gets for a reply, a decline, or an acceptance. */
export function renderApplicantDm(text: string): MessageData {
  return { content: truncate(text, 2000), allowed_mentions: { parse: [] } };
}

export interface NeedLineView {
  wowClass: WowClass;
  specs: string;
  need: 'high' | 'medium' | 'closed';
}

/** `/random recruiting`: the open needs, and how to apply. */
export function renderRecruitingPost(
  headline: string,
  needs: readonly NeedLineView[],
  siteUrl: string | null,
): MessageData {
  const open = needs.filter((n) => n.need !== 'closed');
  const lines = open.length
    ? open.map(
        (n) =>
          `**${title(n.wowClass)}** · ${n.specs} · ${n.need === 'high' ? 'high need' : 'some need'}`,
      )
    : ['No classes listed right now; strong players of any class are welcome to apply.'];
  return {
    embeds: [
      embed({
        title: 'Vintage is recruiting',
        description: [
          headline,
          '',
          ...lines,
          '',
          'Apply with `/random apply` here in Discord.',
        ].join('\n'),
        ...(siteUrl ? { url: siteUrl } : {}),
      }),
    ],
    allowed_mentions: { parse: [] },
  };
}
