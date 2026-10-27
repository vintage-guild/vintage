// Event kinds (#151). The rules live in @vintage/comp-solver so the coordinator card and the
// site's forms use the same ones; raids re-exports them through its contract.
export {
  AKind,
  aKind,
  compSize,
  defaultRoleTargets,
  EVENT_KINDS,
  type EventKind,
  eventTemplate,
  hasRoleTargets,
  instanceOptional,
  KIND_LABELS,
  KIND_SIZES,
  kindNoun,
  kindOf,
  kindRules,
  MAX_EVENT_SIZE,
  sizeFits,
  sizeLabel,
  sizeOptional,
  sizesText,
  targetsOf,
} from '@vintage/comp-solver';
