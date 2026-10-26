// @vintage/ui-kit: importing this module registers every Vintage element.
export {
  type CommandClient,
  createStubClient,
  getCommandClient,
  NOT_CONNECTED,
  setCommandClient,
} from './client';
export {
  type LedgerArt,
  type LedgerBoss,
  type LedgerKill,
  type LedgerLoot,
  type LedgerRaid,
  VintageBossLedger,
} from './elements/boss-ledger';
export { type CharacterInput, VintageCharacterForm } from './elements/character-form';
export { VintageClassBadge } from './elements/class-badge';
export { VintageFigure } from './elements/figure';
export { VintageHero } from './elements/hero';
export { VintageLogoHeader } from './elements/logo-header';
export { VintageMemberMenu } from './elements/member-menu';
export {
  COORDINATOR_STATES,
  type CoordinatorState,
  VintageOfficerStrip,
} from './elements/officer-strip';
export { type PollCardOption, VintagePollCard } from './elements/poll-card';
export { VintageRoleBadge } from './elements/role-badge';
export { RANK_GROUPS, type RosterMember, VintageRosterWall } from './elements/roster-wall';
export { VintageSignInCard } from './elements/sign-in-card';
export {
  ANSWER_LABELS,
  ANSWERS,
  type Answer,
  EMPTY_COUNTS,
  SIGNUP_STATUSES,
  type SignupCounts,
  type SignupStatus,
  VintageSignupCard,
} from './elements/signup-card';
export { VintageThemeSwitch } from './elements/theme-switch';
export { titleCase } from './labels';
export { describeError, type ElementResult, toElementResult } from './result';
export {
  applyTheme,
  currentTheme,
  DEFAULT_THEME,
  isTheme,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
} from './theme';
