// Tema claro/escuro. O <head> de cada página já aplica o tema antes de pintar;
// aqui fica o botão e a escuta do sistema. Sem escolha salva, o site segue o sistema.
(function () {
  var root = document.documentElement;
  var mq = matchMedia('(prefers-color-scheme: dark)');
  var btn = document.querySelector('.theme-toggle');
  function saved() { try { return localStorage.getItem('tema'); } catch (e) { return null; } }
  function apply(t) {
    root.dataset.theme = t;
    if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
  }
  apply(root.dataset.theme);
  mq.addEventListener('change', function (e) { if (!saved()) apply(e.matches ? 'dark' : 'light'); });
  if (btn) btn.addEventListener('click', function () {
    var t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    // escolher o mesmo tema do sistema apaga a escolha, e o site volta a seguir o sistema
    try {
      if (t === (mq.matches ? 'dark' : 'light')) localStorage.removeItem('tema');
      else localStorage.setItem('tema', t);
    } catch (e) {}
    apply(t);
  });
})();
