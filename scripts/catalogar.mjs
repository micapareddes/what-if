// Catalogar novas imagens do banco de referências — E SE?
//
// Procura imagens em /color-palette que ainda não estão em data/references.js,
// envia cada uma para o Claude (visão) e grava o nome identificador gerado.
// Roda só no cadastro — o sorteio no site continua 100% local.
//
// Uso:  npm install   (uma vez)
//       npm run catalogar
//
// Credenciais: ANTHROPIC_API_KEY no ambiente, ou um login feito com `ant auth login`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMG_DIR = path.join(ROOT, "color-palette");
const DATA_FILE = path.join(ROOT, "data", "references.js");
const PREFIX = "window.ESE_REFERENCES = ";

const MEDIA = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

function readBank() {
  const src = fs.readFileSync(DATA_FILE, "utf8");
  const start = src.indexOf(PREFIX);
  const header = src.slice(0, start);
  const json = src.slice(start + PREFIX.length).trim().replace(/;\s*$/, "");
  return { header, items: JSON.parse(json) };
}

function writeBank(header, items) {
  fs.writeFileSync(DATA_FILE, header + PREFIX + JSON.stringify(items, null, 2) + ";\n");
}

const PROMPT = `You name images for a visual reference bank used by a graphic designer.
Give this image a short, memorable identifier of 2 (max 3) words in English, in Title Case.
It must say WHAT the image shows in a simple, friendly way, like a nickname for the picture —
examples: "Cat Sticker", "Red Cherries", "Blue Balloon", "Pink Matchbox", "Lemon Soap", "Vintage Bow", "Frog King".
Do NOT describe the color palette, mood or style. No quotes, no punctuation, no explanation.
Avoid these names, already used: {USED}.
Reply with the name only.`;

async function nameImage(client, file, used) {
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(path.join(IMG_DIR, file)).toString("base64");
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: MEDIA[ext], data } },
          { type: "text", text: PROMPT.replace("{USED}", used.join(", ") || "none") },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("o modelo recusou nomear esta imagem");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return text.replace(/["'.]/g, "").split("\n")[0].trim();
}

async function main() {
  const { header, items } = readBank();
  const known = new Set(items.map((i) => i.file));
  const fresh = fs
    .readdirSync(IMG_DIR)
    .filter((f) => MEDIA[path.extname(f).toLowerCase()] && !known.has(f))
    .sort();

  // Remove do banco arquivos que foram apagados da pasta.
  const onDisk = new Set(fs.readdirSync(IMG_DIR));
  const kept = items.filter((i) => onDisk.has(i.file));
  const removed = items.length - kept.length;

  if (!fresh.length) {
    if (removed) writeBank(header, kept);
    console.log(`Nenhuma imagem nova.${removed ? ` ${removed} removida(s) do banco.` : ""}`);
    return;
  }

  const client = new Anthropic();
  for (const file of fresh) {
    process.stdout.write(`${file} → `);
    try {
      const name = await nameImage(client, file, kept.map((i) => i.name));
      kept.push({ file, name });
      console.log(name);
    } catch (err) {
      kept.push({ file, name: path.parse(file).name });
      console.log(`(sem nome: ${err.message}) — edite manualmente em data/references.js`);
    }
    writeBank(header, kept); // grava a cada imagem para não perder progresso
  }
  console.log(`\n${fresh.length} imagem(ns) cadastrada(s). Banco com ${kept.length} referências.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
