import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConflitoErro, gravar, ler } from '../src/core/armazem';
import { pastaTemp } from './util';

describe('armazém', () => {
  it('grava de forma atómica e não deixa temporários', async () => {
    const d = await pastaTemp();
    const f = path.join(d, 'a.md');
    await gravar(f, 'ola\r\nmundo');
    expect((await ler(f)).texto).toBe('ola\nmundo');
    expect((await fs.readdir(d)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('deteta conflito quando o ficheiro mudou desde a leitura', async () => {
    const d = await pastaTemp();
    const f = path.join(d, 'a.md');
    await gravar(f, 'v1');
    const lido = await ler(f);
    await gravar(f, 'v2 da Ana'); // outro PC grava entretanto
    await expect(gravar(f, 'v2 do Bruno', lido.hash)).rejects.toBeInstanceOf(ConflitoErro);
    expect((await ler(f)).texto).toBe('v2 da Ana'); // nada foi sobrescrito
    try {
      await gravar(f, 'v2 do Bruno', lido.hash);
    } catch (e) {
      expect((e as ConflitoErro).atual.texto).toBe('v2 da Ana');
    }
  });

  it('com o hash certo grava, e criar exige que não exista', async () => {
    const d = await pastaTemp();
    const f = path.join(d, 'a.md');
    await gravar(f, 'v1', null);
    const l = await ler(f);
    await gravar(f, 'v2', l.hash);
    await expect(gravar(f, 'outro', null)).rejects.toBeInstanceOf(ConflitoErro);
  });

  it('gravar o mesmo conteúdo que já está não é conflito', async () => {
    const d = await pastaTemp();
    const f = path.join(d, 'a.md');
    await gravar(f, 'v1');
    const l = await ler(f);
    await gravar(f, 'igual');
    await expect(gravar(f, 'igual', l.hash)).resolves.toBeTruthy();
  });
});
