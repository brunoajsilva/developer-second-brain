# Developer SecondBrain

Docs e boards em ficheiros Markdown, em cofres (pastas) à tua escolha. Sem instalação: um único `.exe` portátil.

## Usar
- Abre o `.exe`, escreve o teu nome, cria um cofre (ou abre uma pasta partilhada na drive) e começa.
- Vários cofres: um pessoal e outros partilhados. Cada cofre é uma pasta com `_cofre.md`, `Docs/` e `Boards/`.
- Atalhos: Ctrl+K procurar · Ctrl+Shift+O trocar de cofre · Ctrl+1..9 abrir cofre · Ctrl+Shift+N captura rápida (global).
- Se a drive criar cópias de conflito, aparecem em "Conflitos".

## Desenvolver
    npm install
    npm run dev        # Electron + Vite com hot reload
    npm test           # testes da camada de ficheiros
    npm run typecheck
    npm run build      # compila para dist/

## Gerar o .exe portátil

### Pelo GitHub (recomendado, sem instalar nada)
O ficheiro `.github/workflows/build.yml` compila o `.exe` num Windows na nuvem.

- **A cada push para `main`** (ou manualmente, em *Actions → Build → Run workflow*): corre os testes e gera o `.exe`. Descarrega-o em *Actions →* a execução *→ Artifacts* (fica 30 dias).
- **Para publicar uma versão** com download permanente, cria uma tag que comece por `v` (a versão deve coincidir com o `package.json`):

      git tag v0.1.0
      git push origin v0.1.0

  O GitHub cria uma *Release* com o `DeveloperSecondBrain-0.1.0-portatil.exe` para descarregar.

### No teu PC (Windows, com Node.js 20+)
    npm install
    npm run dist       # release/DeveloperSecondBrain-<versão>-portatil.exe

## Instalar noutro PC (a partir do repositório público)

**Windows** (PowerShell, sem instalar nada; precisa de uma release publicada):

```
irm https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/instalar.ps1 | iex
```

Descarrega o `secondbrain.exe` mais recente para `%LOCALAPPDATA%\SecondBrain`, junta a pasta ao `PATH` e cria um atalho no menu Iniciar. Para atualizar, corre o mesmo comando outra vez.

**Mac/Linux** (precisa de Node 22+ e Git):

```
curl -fsSL https://raw.githubusercontent.com/brunoajsilva/developer-second-brain/main/scripts/instalar.sh | bash
```

Depois, em qualquer terminal novo: `secondbrain`.

## Abrir a partir do terminal (`secondbrain`)

**Mac/Linux/Windows, a partir do código** (precisa de Node):

```
npm install
npm run cli:instalar   # compila e regista o comando "secondbrain" (npm link)
secondbrain            # abre a aplicação; o terminal fica livre
```

Para remover: `npm unlink -g developer-secondbrain`.

**Windows, com o executável portátil:** o ficheiro chama-se `secondbrain.exe`. Põe-no numa pasta (por exemplo `C:\Ferramentas`), junta essa pasta ao `PATH` e escreve `secondbrain` numa nova janela do terminal.
