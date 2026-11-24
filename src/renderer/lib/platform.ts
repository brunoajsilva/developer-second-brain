export const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);

/** Label for the primary modifier: ⌘ on macOS, Ctrl elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl';

/** Formats a shortcut such as "mod+K" for display. */
export const shortcut = (keys: string) => keys.replace(/mod/gi, modKey).replace(/shift/gi, isMac ? '⇧' : 'Shift').replace(/alt/gi, isMac ? '⌥' : 'Alt').replace(/\+/g, isMac ? '' : '+');
