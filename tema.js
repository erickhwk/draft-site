// Tema claro/escuro. O <head> de cada página já aplica o tema antes de pintar;
// aqui fica o botão e a escuta do sistema. Sem escolha salva, o site segue o sistema.
(function () {
  var root = document.documentElement;
  var mq = matchMedia('(prefers-color-scheme: dark)');
  var btn = document.querySelector('.theme-toggle');
  function system() { return mq.matches ? 'dark' : 'light'; }
  function saved() {
    var t; try { t = localStorage.getItem('tema'); } catch (e) {}
    return t === 'dark' || t === 'light' ? t : null;
  }
  function apply(t) {
    root.dataset.theme = t;
    if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
  }
  apply(saved() || system());
  if (btn) btn.addEventListener('click', function () {
    var t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    // escolher o mesmo tema do sistema apaga a escolha, e o site volta a seguir o sistema
    try {
      if (t === system()) localStorage.removeItem('tema');
      else localStorage.setItem('tema', t);
    } catch (e) {}
    apply(t);
  });
  function follow() { if (!saved()) apply(system()); }
  if (mq.addEventListener) mq.addEventListener('change', follow); else mq.addListener(follow);
  // escolha feita em outra aba
  addEventListener('storage', function (e) { if (e.key === 'tema') apply(saved() || system()); });
})();
