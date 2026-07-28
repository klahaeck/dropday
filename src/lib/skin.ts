export const SKIN_STORAGE_KEY = "dropday-skin";

export interface SkinDefinition {
  id: string;
  label: string;
  description: string;
}

/**
 * Every visual design Dropday ships, in the order they appear in settings.
 *
 * This list is the single source of truth: the `SkinPreference` union, the
 * settings selector, request validation, and the boot script all derive from it.
 *
 * To add a design:
 *   1. Add an entry below.
 *   2. Create `src/app/skin-<id>.css` with every rule scoped to
 *      `:root[data-skin="<id>"]`. The default lives in `globals.css` and needs
 *      no change — scopes are mutually exclusive, so nothing leaks either way.
 *   3. Import that stylesheet in `src/app/layout.tsx`.
 *   4. Add its Clerk palette in `src/components/clerk-ui.tsx` and its icon in
 *      `src/components/skin-provider.tsx`. Both are keyed by skin id, so
 *      typecheck fails until they are filled in.
 */
export const SKINS = [
  { id: "classic", label: "Classic", description: "The original Dropday look." },
  { id: "brutal", label: "Brutal", description: "Squared edges, heavier type, and brighter accents." },
] as const satisfies readonly SkinDefinition[];

export type SkinPreference = (typeof SKINS)[number]["id"];

export const SKIN_IDS: readonly SkinPreference[] = SKINS.map((skin) => skin.id);

/** The original Dropday look. Anything else is opt-in. */
export const DEFAULT_SKIN: SkinPreference = "classic";

export function isSkinPreference(value: unknown): value is SkinPreference {
  return SKIN_IDS.some((id) => id === value);
}

export function resolveSkinPreference(value: unknown): SkinPreference {
  return isSkinPreference(value) ? value : DEFAULT_SKIN;
}

export function skinDefinition(skin: SkinPreference): (typeof SKINS)[number] {
  return SKINS.find((entry) => entry.id === skin) ?? SKINS[0];
}
