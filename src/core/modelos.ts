// Modelos iniciais (ficheiros em _modelos/, editáveis por qualquer pessoa).
// Marcadores: {{titulo}} {{data}} {{autor}}

export const modeloAdr = `# {{titulo}}

Estado: Proposto · {{data}} · {{autor}}

## Contexto

## Decisao

## Consequencias
`;

export const modeloReuniao = `# {{titulo}}

{{data}} · {{autor}}

## Participantes

## Pontos

## Decisoes

## Acoes

- [ ]
`;

export const modelo1a1 = `# 1:1 {{titulo}}

{{data}}

## Como esta

## Em curso

## Bloqueios

## Acoes

- [ ]
`;

export const modeloPostmortem = `# Postmortem: {{titulo}}

{{data}} · {{autor}}

## Resumo

## Impacto

## Linha temporal

## Causa raiz

## O que correu bem

## O que melhorar

## Acoes

- [ ]
`;

export const modeloRunbook = `# {{titulo}}

Responsavel: {{autor}} · atualizado em {{data}}

## Quando usar

## Passos

1.

## Verificacao

## Reverter
`;
