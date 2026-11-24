// How a vault is laid out on disk. Every name the app reads or writes lives here.

export const VAULT_FILE = '_vault.md';
export const TEAM_FILE = '_team.md';
export const DOCS_DIR = 'Docs';
export const BOARDS_DIR = 'Boards';
export const BOARD_FILE = '_board.md';
export const TRASH_DIR = '.trash';
export const ATTACHMENTS_DIR = '_attachments';

/** Names used by vaults created before v0.2 (Portuguese). Only read by the migration. */
export const LEGACY = {
  vaultFile: '_cofre.md',
  teamFile: '_equipa.md',
  trashDir: '.lixo',
  attachmentsDir: '_anexos'
} as const;
