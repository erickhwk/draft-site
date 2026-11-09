// Contraste de texto (AJ-06): roda a regra color-contrast do axe-core (WCAG AA: 4,5:1 no texto normal,
// 3:1 no texto grande) na home, na 404 e na política, em 1440 e 390 px, com o FAQ aberto.
// Pega o tipo de erro que só aparecia no /code-review (texto creme sobre o laranja, laranja escuro sobre a areia).
// Digitais e quadrados decorativos ficam escondidos durante a medição. O que o axe ainda não consegue medir (texto
// sobre imagem, setas) sai listado como "a conferir", sem falhar.
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

const PAGINAS = ["/", "/404.html", "/privacidade.html"];
const LARGURAS = [[1440, 900], [390, 844]];
let falhas = 0;
for (const caminho of PAGINAS) {
  for (const [w, h] of LARGURAS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const resp = await page.goto(BASE + caminho, { waitUntil: "networkidle" });
    const nome = `${caminho} ${w}px`;
    if (resp?.status() !== 200) { falhas++; console.log(`FALHOU  ${nome}: a página respondeu ${resp?.status()}`); await page.close(); continue; }
    await page.evaluate(() => {
      // FAQ aberto e os estados do formulário à mostra (erro de campo, status do envio, sucesso), com texto de exemplo
      document.querySelectorAll("details").forEach((d) => { d.open = true; });
      document.querySelectorAll(".field-error, #form-status, #form-ok").forEach((e) => {
        e.hidden = false;
        if (!e.textContent.trim()) e.textContent = "Texto de exemplo da mensagem";
      });
      // digitais e quadrados são decorativos, tom sobre tom: escondidos, o axe mede o texto contra o fundo da seção
      // em vez de marcar como "a conferir" tudo o que passa por cima deles
      const s = document.createElement("style");
      s.textContent = ".hero-digital, .contact-digital, .hachura { display: none !important }";
      document.head.append(s);
    });
    await page.addScriptTag({ content: axe });
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: ["color-contrast"] }));
    const nos = r.violations.flatMap((v) => v.nodes);
    const conferir = r.incomplete.flatMap((v) => v.nodes);
    if (nos.length) {
      falhas++;
      console.log(`FALHOU  ${nome}: ${nos.length} texto(s) abaixo do contraste AA`);
      for (const n of nos) { const d = n.any[0]?.data; console.log(`        ${n.target.join(" ")}  ${d?.contrastRatio ? `${d.contrastRatio}:1 (mínimo ${d.expectedContrastRatio}), ${d.fgColor} sobre ${d.bgColor}` : n.failureSummary}`); }
    } else {
      console.log(`PASSOU  ${nome}${conferir.length ? `  (${conferir.length} que o axe não mede, a conferir no olho):` : ""}`);
      for (const n of conferir) console.log(`        ${n.target.join(" ")}  ${n.any[0]?.message || ""}`);
    }
    await page.close();
  }
}
await browser.close();
const total = PAGINAS.length * LARGURAS.length;
console.log(`\n${total - falhas} de ${total} passaram`);
process.exit(falhas ? 1 : 0);
