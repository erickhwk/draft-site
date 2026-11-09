// Logos de clientes (AJ-03): os logos (.clientes-logos img) não usam mix-blend-mode e são escurecidos por filtro, então todo PNG precisa vir com
// fundo transparente. Confere os quatro cantos de cada logo da home; fundo branco opaco faz o teste falhar.
//
// Local:  python3 -m http.server 8010 --bind 127.0.0.1   (na raiz, em outro terminal)
//         node testes/logos.mjs                          (BASE=http://127.0.0.1:8010 por padrão)
import { createRequire } from "node:module";
import { join } from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:8010") + "/";
let pw;
try { pw = createRequire(import.meta.url)("playwright-core"); }
catch (e1) {
  try { pw = createRequire(join(process.env.HOME || "", ".cache/comparacao-visual/package.json"))("playwright-core"); }
  catch { console.error(`playwright-core não encontrado (${e1.message.split("\n")[0]}).\nInstale: npm install --no-save --no-package-lock playwright-core@1.64.1`); process.exit(2); }
}
const canal = process.env.PW_CANAL ?? "chrome";
const browser = await pw.chromium.launch({ ...(canal ? { channel: canal } : {}), headless: true });
const page = await browser.newPage();
await page.goto(BASE);
const logos = await page.$$eval(".clientes-logos img", (imgs) => Promise.all(imgs.map(async (img) => {
  img.loading = "eager";
  await img.decode();
  const c = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const alfa = (x, y) => g.getImageData(x, y, 1, 1).data[3];
  const w = c.width - 1, h = c.height - 1;
  return { src: img.getAttribute("src"), cantos: [alfa(0, 0), alfa(w, 0), alfa(0, h), alfa(w, h)] };
})));
await browser.close();

let falhas = 0;
for (const { src, cantos } of logos) {
  // canto opaco e claro é fundo; um canto opaco escuro pode ser o próprio desenho (o K do K2), por isso basta 3 de 4
  const transparentes = cantos.filter((a) => a === 0).length;
  const passou = transparentes >= 3;
  if (!passou) falhas++;
  console.log(`${passou ? "PASSOU" : "FALHOU"}  ${src} com fundo transparente${passou ? "" : `  (alfa dos cantos: ${cantos.join(", ")})`}`);
}
if (!logos.length) { falhas++; console.log("FALHOU  nenhum logo encontrado em .clientes-logos"); }
console.log(`\n${logos.length - falhas} de ${logos.length} passaram`);
process.exit(falhas ? 1 : 0);
