/** Stable DOM id of a settings row, derived from its title. Used by `SettingRow` and the settings search. */
export const rowSlug = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
