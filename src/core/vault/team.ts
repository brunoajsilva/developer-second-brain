// The vault's team lives in _team.md as a bullet list, so everyone sharing the folder sees the same people.
import * as path from 'node:path';
import { pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { listAllCards } from '../boards/boards';
import { TEAM_FILE } from './layout';

const BULLET = /^\s*[-*]\s+(.+)$/;
const teamFile = (vault: string) => path.join(vault, TEAM_FILE);

export async function listTeam(vault: string): Promise<string[]> {
  const file = teamFile(vault);
  if (!(await pathExists(file))) return [];
  const out: string[] = [];
  for (const line of (await readTextFile(file)).text.split('\n')) {
    const m = line.match(BULLET);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** Team members, everyone assigned to a card, and the current user. */
export async function listPeople(vault: string, currentUser: string): Promise<string[]> {
  const names = new Set(await listTeam(vault));
  for (const c of await listAllCards(vault)) if (c.assignee) names.add(c.assignee);
  if (currentUser) names.add(currentUser);
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function addTeamMember(vault: string, name: string): Promise<void> {
  const clean = name.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  if (!clean) return;
  const file = teamFile(vault);
  const text = (await pathExists(file)) ? (await readTextFile(file)).text : '# Team\n\n';
  if ((await listTeam(vault)).some((n) => n.toLowerCase() === clean.toLowerCase())) return;
  await writeTextFile(file, text.replace(/\n*$/, '\n') + `- ${clean}\n`);
}

export async function removeTeamMember(vault: string, name: string): Promise<void> {
  const file = teamFile(vault);
  if (!(await pathExists(file))) return;
  const target = name.trim().toLowerCase();
  const current = await readTextFile(file);
  const lines = current.text.split('\n').filter((l) => !BULLET.test(l) || l.replace(/^\s*[-*]\s+/, '').trim().toLowerCase() !== target);
  await writeTextFile(file, lines.join('\n'), current.hash);
}
