// Local settings (per person, outside the vaults): name, registered vaults and where each one lives.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathExists, writeTextFile } from '../fs/file-store';
import { readVaultMeta } from '../vault/vault';
import { VAULT_FILE } from '../vault/layout';
import type { Settings, VaultInfo, VaultRecord } from '../../shared/types';

export const defaultSettings = (): Settings => ({ userName: '', openLastVault: false, activeVaultId: '', vaults: [] });

/** Settings file written by versions before v0.2 (Portuguese keys), next to the current one. */
export const LEGACY_SETTINGS_FILE = 'definicoes.json';

export class SettingsStore {
  constructor(private readonly file: string) {}

  async read(): Promise<Settings> {
    try {
      return normalize(JSON.parse(await fs.readFile(this.file, 'utf8')));
    } catch {
      return (await this.importLegacy()) ?? defaultSettings();
    }
  }

  async write(settings: Settings): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await writeTextFile(this.file, JSON.stringify(settings, null, 2));
  }

  async update(change: (s: Settings) => void): Promise<Settings> {
    const s = await this.read();
    change(s);
    await this.write(s);
    return s;
  }

  /** Converts definicoes.json once, the first time the new version runs. */
  private async importLegacy(): Promise<Settings | null> {
    const legacy = path.join(path.dirname(this.file), LEGACY_SETTINGS_FILE);
    if (!(await pathExists(legacy))) return null;
    try {
      const j = JSON.parse(await fs.readFile(legacy, 'utf8')) as Record<string, unknown>;
      const vaults = Array.isArray(j.cofres)
        ? j.cofres.map((v: Record<string, unknown>) => ({ id: v.id, name: v.nome, path: v.caminho, personal: v.pessoal }))
        : [];
      const s = normalize({ userName: j.utilizador, openLastVault: j.abrirUltimo, activeVaultId: j.cofreAtivo, vaults });
      await this.write(s);
      return s;
    } catch {
      return null;
    }
  }
}

function normalize(raw: unknown): Settings {
  const j = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const vaults: VaultRecord[] = Array.isArray(j.vaults)
    ? j.vaults
        .filter((v): v is Record<string, unknown> => !!v && typeof v.id === 'string' && typeof v.path === 'string')
        .map((v) => ({ id: v.id as string, name: String(v.name ?? ''), path: v.path as string, personal: v.personal === true }))
    : [];
  return { userName: String(j.userName ?? ''), openLastVault: j.openLastVault === true, activeVaultId: String(j.activeVaultId ?? ''), vaults };
}

/** Status of each registered vault: available, or why not (missing folder, a different vault in the folder). */
export async function getVaultStatuses(settings: Settings): Promise<VaultInfo[]> {
  const out: VaultInfo[] = [];
  for (const v of settings.vaults) {
    if (!(await pathExists(v.path))) {
      out.push({ ...v, available: false, reason: 'Folder not found' });
      continue;
    }
    const meta = await readVaultMeta(v.path);
    if (!meta) out.push({ ...v, available: false, reason: `The folder no longer has ${VAULT_FILE}` });
    else if (meta.id !== v.id) out.push({ ...v, available: false, reason: 'The folder holds a different vault' });
    else out.push({ ...v, name: meta.name || v.name, available: true });
  }
  return out;
}
