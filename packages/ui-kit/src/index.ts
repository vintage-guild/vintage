// @vintage/ui-kit: importing this module registers every Vintage element.
export {
  type CommandClient,
  createStubClient,
  getCommandClient,
  NOT_CONNECTED,
  setCommandClient,
} from './client';
export { type CharacterInput, VintageCharacterForm } from './elements/character-form';
export { VintageClassBadge } from './elements/class-badge';
export { VintageLogoHeader } from './elements/logo-header';
export { VintageRoleBadge } from './elements/role-badge';
export { VintageSignInCard } from './elements/sign-in-card';
export { SIGNUP_STATUSES, type SignupStatus, VintageSignupCard } from './elements/signup-card';
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
