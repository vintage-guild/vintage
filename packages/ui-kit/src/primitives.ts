// The violet-elements primitives ui-kit uses. violet-elements has no per-component `exports`
// map, so these are deep imports into its dist; a FAST-AF re-sync that moves files only
// touches this file. Importing a primitive registers its custom element.
import '@lushly-dev/violet-elements/dist/badge/violet-badge';
import '@lushly-dev/violet-elements/dist/button/violet-button';
import '@lushly-dev/violet-elements/dist/card/violet-card';
import '@lushly-dev/violet-elements/dist/checkbox/violet-checkbox';
import '@lushly-dev/violet-elements/dist/option/violet-option';
import '@lushly-dev/violet-elements/dist/select/violet-select';
import '@lushly-dev/violet-elements/dist/switch/violet-switch';
import '@lushly-dev/violet-elements/dist/text-field/violet-text-field';
