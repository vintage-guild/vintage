/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The guild server (Convex deployment). Unset uses production (src/connect.ts). */
  readonly VITE_CONVEX_URL?: string;
}

/** When this build was made (ISO 8601), from vite.config.ts `define`. */
declare const __BUILD_TIME__: string;
