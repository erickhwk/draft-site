// Testes e2e da seção #contato (FRM-01): formulário, copiar e-mail/WhatsApp e máscara do WhatsApp.
// Formspree e wa.me são simulados: nada é enviado de verdade e não há dependência de rede externa.
//
// Local:  python3 -m http.server 8010 --bind 127.0.0.1   (na raiz, em outro terminal)
//         node testes/contato.mjs                        (BASE=http://127.0.0.1:8010 por padrão)
// Navegador: o Chrome instalado (local). No CI, PW_CANAL="" usa o Chromium da versão fixa do playwright-core.
// playwright-core: o do repo (npm install --no-save playwright-core@1.64.1) ou o cache da skill comparacao-visual.
import { createRequire } from "node:module";
import { join } from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:8010") + "/";
const exigir = createRequire(import.meta.url);
let pw;
try { pw = exigir("playwright-core"); }
catch (e1) {
  try { pw = createRequire(join(process.env.HOME || "", ".cache/comparacao-visual/package.json"))("playwright-core"); }
  catch { console.error(`playwright-core não encontrado (${e1.message.split("\n")[0]}).\nInstale: npm install --no-save --no-package-lock playwright-core@1.64.1`); process.exit(2); }
}
const canal = process.env.PW_CANAL ?? "chrome";
const browser = await pw.chromium.launch({ ...(canal ? { channel: canal } : {}), headless: true });

const res = [];
const ok = (nome, cond, extra = "") => res.push({ nome, cond: !!cond, extra });
const abertos = [];
async function bloco(nome, fn) {
  try { await fn(); }
  catch (e) { ok(`${nome}: terminou sem exceção`, false, e.message.split("\n")[0]); }
  finally { for (const c of abertos.splice(0)) await c.close().catch(() => {}); }
}
const ENVIAR = "#form-contato button[type=submit]";
const WA = /(wa\.me|whatsapp\.com).*5511999606775/;

async function contexto(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "pt-BR", reducedMotion: "reduce", ...opts });
  abertos.push(ctx);
  ctx.setDefaultTimeout(10000);
  // o WhatsApp abre numa aba nova; responde aqui para não depender da rede
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "whatsapp" }));
  return ctx;
}
async function pagina(ctx) {
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(BASE);
  await page.locator("#contato").scrollIntoViewIfNeeded();
  return { page, erros };
}
const enviados = [];
function formspree(page, status, segura) {
  return page.route("https://formspree.io/**", async (r) => {
    enviados.push({ headers: r.request().headers(), body: r.request().postData() });
    if (segura) await segura;
    await r.fulfill({ status, contentType: "application/json", body: status === 200 ? '{"ok":true}' : '{"errors":[{"message":"x"}]}' });
  });
}
const foco = (p) => p.evaluate(() => document.activeElement.id);
async function preencher(page, nome = "Fulano", email = "f@x.com", msg = "Preciso de um sistema") {
  await page.fill("#f-nome", nome); await page.fill("#f-email", email); await page.fill("#f-mensagem", msg);
}

// ---------- formulário ----------
await bloco("form vazio", async () => { const ctx = await contexto(); const { page, erros } = await pagina(ctx); await formspree(page, 200);
  await page.click(ENVIAR);
  const msgs = await page.$$eval(".field-error:not([hidden])", (es) => es.map((e) => e.textContent));
  ok("form vazio: os 3 erros, com o texto certo", JSON.stringify(msgs) === JSON.stringify(["Diz como podemos te chamar.", "Precisamos de um e-mail para responder.", "Conta em poucas linhas o que você precisa."]), JSON.stringify(msgs));
  ok("form vazio: foco no nome", (await foco(page)) === "f-nome");
  ok("form vazio: aria-invalid", (await page.getAttribute("#f-nome", "aria-invalid")) === "true");
  ok("form vazio: nada enviado", enviados.length === 0);
  await page.fill("#f-nome", "A");
  ok("digitar limpa o erro", (await page.isHidden("#e-nome")) && !(await page.getAttribute("#f-nome", "aria-invalid")));
  ok("form: sem erro de JS", erros.length === 0, erros.join());
  await ctx.close(); });

for (const email of ["fulano@", "joao@gmail"]) await bloco(`e-mail ${email}`, async () => {
  const ctx = await contexto(); const { page } = await pagina(ctx); await formspree(page, 200);
  await preencher(page, "F", email, "oi"); await page.click(ENVIAR);
  ok(`e-mail "${email}" barrado`, (await page.textContent("#e-email")) === "Esse e-mail parece incompleto." && (await foco(page)) === "f-email");
  await ctx.close();
});

for (const tipo of ["422", "rede"]) await bloco(`erro ${tipo}`, async () => {
  const ctx = await contexto(); const { page } = await pagina(ctx);
  if (tipo === "rede") await page.route("https://formspree.io/**", (r) => r.abort()); else await formspree(page, 422);
  await preencher(page); await page.click(ENVIAR);
  await page.waitForSelector("#form-status:not([hidden])");
  ok(`erro ${tipo}: mensagem com os contatos`, (await page.textContent("#form-status")).includes("erick@draft.dev.br"));
  ok(`erro ${tipo}: campos preservados`, (await page.inputValue("#f-mensagem")) === "Preciso de um sistema");
  ok(`erro ${tipo}: botão volta`, !(await page.isDisabled(ENVIAR)) && (await page.textContent(ENVIAR)) === "Enviar mensagem");
  await ctx.close();
});

await bloco("2ª falha", async () => { const ctx = await contexto(); const { page } = await pagina(ctx); await page.route("https://formspree.io/**", (r) => r.abort());
  await preencher(page);
  await page.click(ENVIAR); await page.waitForSelector("#form-status:not([hidden])");
  await page.evaluate(() => { const s = document.getElementById("form-status"); window.__textos = []; new MutationObserver(() => window.__textos.push(s.textContent)).observe(s, { childList: true, characterData: true, subtree: true }); });
  await page.click(ENVIAR); await page.waitForFunction(() => window.__textos.length && document.getElementById("form-status").textContent);
  const t = await page.evaluate(() => window.__textos);
  ok("2ª falha seguida esvazia e reescreve o alerta", t.includes("") && t.at(-1).includes("erick@draft.dev.br"), JSON.stringify(t));
  await ctx.close(); });

await bloco("timeout", async () => { const ctx = await contexto(); const page = await ctx.newPage();
  await page.clock.install(); await page.goto(BASE);
  await page.route("https://formspree.io/**", () => {}); // nunca responde
  await preencher(page, "F", "f@x.com", "oi"); await page.click(ENVIAR);
  await page.clock.runFor(16000);
  await page.waitForSelector("#form-status:not([hidden])", { timeout: 5000 }).catch(() => {});
  ok("timeout de 15 s mostra erro e libera o botão", (await page.isVisible("#form-status")) && !(await page.isDisabled(ENVIAR)));
  await ctx.close(); });

await bloco("sucesso", async () => { const ctx = await contexto(); const { page } = await pagina(ctx); enviados.length = 0;
  let liberar; const segura = new Promise((r) => (liberar = r));
  await formspree(page, 200, segura);
  await page.focus("#f-nome"); await page.keyboard.type("Fulano de Tal");
  for (const t of ["fulano@x.com", "11999990000", "ACME", "Preciso de um portal"]) { await page.keyboard.press("Tab"); await page.keyboard.type(t); }
  await page.keyboard.press("Tab");
  ok("Tab chega ao botão", (await page.evaluate(() => document.activeElement.textContent)) === "Enviar mensagem");
  await page.keyboard.press("Enter");
  await page.waitForFunction((s) => document.querySelector(s).disabled, ENVIAR);
  ok("enviando: botão desabilitado", (await page.textContent(ENVIAR)) === "Enviando…");
  liberar();
  await page.waitForSelector("#form-ok:not([hidden])");
  ok("sucesso: o form some", !(await page.isVisible("#form-contato")));
  ok("sucesso: foco no bloco", (await foco(page)) === "form-ok");
  const b = enviados[0].body;
  ok("assunto com o nome", b.includes("Contato pelo site: Fulano de Tal"));
  ok("Accept: application/json", enviados[0].headers.accept === "application/json");
  ok("campos enviados", ["nome", "email", "whatsapp", "empresa", "mensagem", "_gotcha"].every((n) => b.includes(`name="${n}"`)));
  ok("WhatsApp enviado com máscara", b.includes("(11) 99999-0000"));
  await ctx.close(); });

await bloco("sem JS", async () => { const ctx = await contexto({ javaScriptEnabled: false }); const { page } = await pagina(ctx);
  let saiu = false; await page.route("https://formspree.io/**", (r) => { saiu = true; r.fulfill({ status: 200, body: "obrigado" }); });
  ok("sem JS: valor do contato é link", (await page.getAttribute(".contact-copy >> nth=0", "href")) === "mailto:erick@draft.dev.br");
  await page.click(ENVIAR); await page.waitForTimeout(500);
  ok("sem JS: vazio barrado pela validação nativa", !saiu && (await page.evaluate(() => !document.querySelector("#f-nome").checkValidity())));
  await preencher(page, "F", "f@x.com", "oi");
  await Promise.all([page.waitForURL(/formspree/), page.click(ENVIAR)]);
  ok("sem JS: posta direto no Formspree", saiu);
  await ctx.close(); });

// ---------- copiar ----------
for (const [w, h] of [[1360, 900], [390, 844]]) await bloco(`copiar ${w}`, async () => {
  const ctx = await contexto({ viewport: { width: w, height: h }, permissions: ["clipboard-read", "clipboard-write"] });
  const { page, erros } = await pagina(ctx);
  // writeText é assíncrono: espera o valor chegar, em vez de ler logo depois da tecla
  const copiou = (valor) => page.waitForFunction(async (x) => (await navigator.clipboard.readText()) === x, valor, { timeout: 3000 }).then(() => true, () => false);
  await page.locator(".contact-direct").scrollIntoViewIfNeeded();
  await page.click(".contact-copy >> nth=0");
  ok(`${w}: copia o e-mail`, await copiou("erick@draft.dev.br"));
  ok(`${w}: aviso Copiado`, (await page.textContent(".contact-hint >> nth=0")) === "Copiado");
  const sumiu = await page.waitForFunction(() => document.querySelector(".contact-hint").textContent === "", null, { timeout: 4000 }).then(() => true, () => false);
  ok(`${w}: aviso some`, sumiu);
  await page.focus(".contact-copy >> nth=1"); await page.keyboard.press("Enter");
  ok(`${w}: Enter copia o número`, await copiou("(11) 99960-6775"));
  await page.focus(".contact-copy >> nth=0"); await page.keyboard.press("Space");
  ok(`${w}: Espaço copia (role=button)`, (await copiou("erick@draft.dev.br")) && (await page.getAttribute(".contact-copy >> nth=0", "role")) === "button");
  ok(`${w}: copiar não navega`, page.url() === BASE);
  ok(`${w}: setas`, (await page.getAttribute(".contact-go >> nth=0", "href")) === "mailto:erick@draft.dev.br" && (await page.getAttribute(".contact-go >> nth=1", "href")) === "https://wa.me/5511999606775");
  const bb = await page.locator(".contact-go >> nth=1").boundingBox();
  ok(`${w}: seta com alvo de 44 px`, bb.width >= 44 && bb.height >= 44);
  ok(`${w}: sem rolagem horizontal`, (await page.evaluate(() => document.documentElement.scrollWidth)) <= w);
  // Cmd/Ctrl+clique fica com o navegador (aba nova): o contato.js não pode interceptar. Confere o defaultPrevented,
  // porque o Chromium headless do CI não abre aba com Ctrl+clique.
  await page.evaluate(() => document.addEventListener("click", (e) => { window.__interceptou = e.defaultPrevented; e.preventDefault(); }, { once: true }));
  await page.click(".contact-copy >> nth=1", { modifiers: ["ControlOrMeta"] });
  ok(`${w}: Cmd/Ctrl+clique fica com o navegador`, (await page.evaluate(() => window.__interceptou)) === false);
  ok(`${w}: copiar sem erro de JS`, erros.length === 0, erros.join());
  await ctx.close();
});

await bloco("sem Clipboard API", async () => { const ctx = await contexto(); await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined }); });
  const { page } = await pagina(ctx);
  ok("sem Clipboard API: sem papel de botão", (await page.getAttribute(".contact-copy >> nth=1", "role")) === null);
  const [aba] = await Promise.all([ctx.waitForEvent("page"), page.click(".contact-copy >> nth=1")]);
  ok("sem Clipboard API: o clique abre o WhatsApp", WA.test(aba.url()), aba.url());
  await ctx.close(); });

await bloco("cópia recusada", async () => { const ctx = await contexto(); await ctx.addInitScript(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("negado")); });
  const { page } = await pagina(ctx);
  const [aba] = await Promise.all([ctx.waitForEvent("page"), page.click(".contact-copy >> nth=1")]);
  ok("cópia recusada abre o WhatsApp", WA.test(aba.url()), aba.url());
  await ctx.close(); });

// ---------- máscara do WhatsApp ----------
await bloco("máscara", async () => { const ctx = await contexto({ permissions: ["clipboard-read", "clipboard-write"] }); const { page, erros } = await pagina(ctx);
  const v = () => page.inputValue("#f-whatsapp");
  const limpar = async () => { await page.fill("#f-whatsapp", ""); await page.click("#f-whatsapp"); };
  const cursor = (a, b = a) => page.evaluate(([x, y]) => document.querySelector("#f-whatsapp").setSelectionRange(x, y), [a, b]);
  const colar = async (t) => { await page.fill("#f-whatsapp", ""); await page.evaluate((x) => navigator.clipboard.writeText(x), t); await page.focus("#f-whatsapp"); await page.keyboard.press("ControlOrMeta+V"); };

  ok("placeholder só com o formato", (await page.getAttribute("#f-whatsapp", "placeholder")) === "(00) 00000-0000");
  await limpar(); await page.keyboard.type("11912345678");
  ok("celular", (await v()) === "(11) 91234-5678", await v());
  await page.keyboard.type("999"); ok("limita em 11 dígitos", (await v()) === "(11) 91234-5678", await v());
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  ok("apagando volta ao formato de 10 dígitos", (await v()) === "(11) 9123-4", await v());
  for (let i = 0; i < 12; i++) await page.keyboard.press("Backspace");
  ok("Backspace apaga tudo, atravessando a máscara", (await v()) === "", JSON.stringify(await v()));
  await page.keyboard.type("1112345678"); ok("fixo com 10 dígitos", (await v()) === "(11) 1234-5678", await v());
  await cursor(5); await page.keyboard.type("9");
  ok("inserir no meio mantém o cursor", (await v()) === "(11) 91234-5678" && (await page.evaluate(() => document.querySelector("#f-whatsapp").selectionStart)) === 6);
  await colar("+55 11 99960-6775"); ok("colar +55 descarta o 55", (await v()) === "(11) 99960-6775", await v());
  await colar("5511999606775"); ok("colar 13 dígitos com 55 descarta o 55", (await v()) === "(11) 99960-6775", await v());
  await limpar(); await page.keyboard.type("559912345678");
  ok("DDD 55 com dígito a mais mantém o DDD", (await v()) === "(55) 99123-4567", await v());
  await cursor(10); await page.keyboard.press("Delete");
  ok("Delete atravessa o hífen", (await v()) === "(55) 9912-3567", await v());
  await limpar(); await page.keyboard.type("11912345678"); await cursor(10, 11); await page.keyboard.press("Backspace");
  ok("apagar só o hífen selecionado não leva dígito", (await v()) === "(11) 91234-5678", await v());
  await limpar(); await page.keyboard.type("+1 415 555 1234");
  ok("número estrangeiro fica como digitado", (await v()) === "+1 415 555 1234", await v());
  await limpar(); await page.keyboard.type("+55 11 91234-5678");
  ok("+55 digitado vira o formato brasileiro", (await v()) === "(11) 91234-5678", await v());

  await formspree(page, 200);
  await preencher(page, "F", "f@x.com", "oi");
  await limpar(); await page.keyboard.type("1199"); await page.click(ENVIAR);
  ok("número incompleto barra o envio", (await page.textContent("#e-whatsapp")) === "Esse número parece incompleto." && (await foco(page)) === "f-whatsapp");
  await page.fill("#f-whatsapp", ""); await page.click(ENVIAR);
  ok("WhatsApp vazio é opcional e envia", await page.waitForSelector("#form-ok:not([hidden])", { timeout: 5000 }).then(() => true, () => false));
  ok("máscara sem erro de JS", erros.length === 0, erros.join());
  await ctx.close(); });

await browser.close();
let falhas = 0;
for (const r of res) { if (!r.cond) falhas++; console.log(`${r.cond ? "PASSOU" : "FALHOU"}  ${r.nome}${r.extra && !r.cond ? `  (${r.extra})` : ""}`); }
console.log(`\n${res.length - falhas} de ${res.length} passaram`);
process.exit(falhas ? 1 : 0);
