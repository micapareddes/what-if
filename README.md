# E SE? — Random Identity Generator
The Brisa Studio

Sorteia **categoria + nome de marca + referência + imagem** para servir de briefing de identidade visual.

## Abrir o site
Basta abrir `index.html` no navegador (funciona direto do arquivo). Ou, com servidor local:

    python3 -m http.server 4321      →  http://localhost:4321

Clique em **RANDOMIZE** (ou aperte a barra de espaço).

## Estrutura
- `data/categories.js` — lista de categorias.
- `data/names.js` — nomes de marca, agrupados por categoria (o nome sempre combina com o negócio).
- `data/references.js` — banco de referências: arquivo da imagem + nome identificador.
- `color-palette/` — as imagens originais.
- `app.js` / `style.css` / `index.html` — interface e animação. O sorteio é 100% local.

## Adicionar novas imagens
1. Coloque o arquivo (.jpg, .png, .webp) em `color-palette/`.
2. Na primeira vez: `npm install`.
3. Rode `npm run catalogar`.

O script envia só as imagens novas para o Claude (visão), recebe um nome curto (ex.: "Frog King")
e grava em `data/references.js`. Precisa de `ANTHROPIC_API_KEY` no ambiente (ou login via `ant auth login`).
Se quiser trocar algum nome, edite `data/references.js` à mão. Imagens apagadas da pasta saem do banco
na próxima execução.

## Adicionar categorias e nomes
Inclua a categoria em `data/categories.js` e a mesma chave com seus nomes em `data/names.js`.
