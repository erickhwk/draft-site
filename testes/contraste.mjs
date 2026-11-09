// Contraste de texto (AJ-06): roda a regra color-contrast do axe-core (WCAG AA: 4,5:1 no texto normal,
// 3:1 no texto grande) na home, na 404 e na política, em 1440 e 390 px, com o FAQ aberto.
// Pega o tipo de erro que só aparecia no /code-review (texto creme sobre o laranja, laranja escuro sobre a areia).
// Texto sobre imagem ou gradiente o axe não consegue medir: sai como "a conferir", sem falhar.
//
// Local:  python3 -m http.server 8010 --bind 127.0.0.1   (na raiz, em outro terminal)
//         node testes/contraste.mjs                      (BASE=http://127.0.0.1:8010 por padrão)
// Dependências: playwright-core@1.64.1 e axe-core@4.14.0, as do repo (npm install --no-save) ou as do cache da
// skill comparacao-visual (~/.cache/comparacao-visual).
import { createRequire } from "node:module";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:8010";
const doRepo = createRequire(import.meta.url);
const doCache = createRequire(join(process.env.HOME || "", ".cache/comparacao-visual/package.json"));
function exigir(nome) {
  try { return doRepo.resolve(nome); } catch {}
  try { return doCache.resolve(nome); } catch {}
  console.error(`${nome} não encontrado. Instale: npm install --no-save --no-package-lock playwright-core@1.64.1 axe-core@4.14.0`);
  process.exit(2);
}
const pw = doRepo(exigir("playwright-core"));
const axe = readFileSync(join(exigir("axe-core"), "..", "axe.min.js"), "utf8");

const canal = process.env.PW_CANAL ?? "chrome";
const browser = await pw.chromium.launch({ ...(canal ? { channel: canal } : {}), headless: true });

let falhas = 0;
for (const caminho of ["/", "/404.html", "/privacidade.html"]) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    await page.goto(BASE + caminho, { waitUntil: "networkidle" });
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    await page.addScriptTag({ content: axe });
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: ["color-contrast"] }));
    const nos = r.violations.flatMap((v) => v.nodes);
    const conferir = r.incomplete.flatMap((v) => v.nodes).length;
    const nome = `${caminho} ${w}px`;
    if (nos.length) {
      falhas++;
      console.log(`FALHOU  ${nome}: ${nos.length} texto(s) abaixo do contraste AA`);
      for (const n of nos) { const d = n.any[0]?.data || {}; console.log(`        ${n.target.join(" ")}  ${d.contrastRatio}:1 (mínimo ${d.expectedContrastRatio}), ${d.fgColor} sobre ${d.bgColor}`); }
    } else {
      console.log(`PASSOU  ${nome}${conferir ? `  (${conferir} sobre imagem ou gradiente, a conferir no olho)` : ""}`);
    }
    await page.close();
  }
}
await browser.close();
console.log(`\n${6 - falhas} de 6 passaram`);
process.exit(falhas ? 1 : 0);
