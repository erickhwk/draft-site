// Contato (FRM-01): copiar e-mail e WhatsApp ao clicar, e o formulário que envia ao Formspree.

// Clicar no e-mail ou no número copia o valor e avisa "Copiado" (role=status) por 2 s; a seta ao lado abre o app.
(function () {
  document.querySelectorAll('.contact-copy').forEach(function (botao) {
    var aviso = botao.parentNode.querySelector('.contact-hint');
    var prazo;
    function avisar(texto) {
      clearTimeout(prazo);
      aviso.textContent = texto;
      prazo = setTimeout(function () { aviso.textContent = ''; }, 2000);
    }
    botao.addEventListener('click', function () {
      if (!navigator.clipboard) { avisar('Não deu para copiar'); return; }
      navigator.clipboard.writeText(botao.dataset.copiar)
        .then(function () { avisar('Copiado'); }, function () { avisar('Não deu para copiar'); });
    });
  });
})();

// Formulário: valida em português e envia ao Formspree sem sair da página.
// Sem JS, o <form> posta direto no Formspree, com a validação nativa do navegador.
(function () {
  var form = document.getElementById('form-contato');
  if (!form) return;

  var ok = document.getElementById('form-ok');
  var status = document.getElementById('form-status');
  var botao = form.querySelector('button[type="submit"]');
  var textoBotao = botao.textContent;
  var vazio = {
    nome: 'Diz como posso te chamar.',
    email: 'Preciso de um e-mail para responder.',
    mensagem: 'Conta em poucas linhas o que você precisa.'
  };

  form.noValidate = true;

  function marcar(campo, msg) {
    var erro = document.getElementById(campo.getAttribute('aria-describedby'));
    erro.textContent = msg;
    erro.hidden = !msg;
    if (msg) campo.setAttribute('aria-invalid', 'true');
    else campo.removeAttribute('aria-invalid');
  }

  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid')) marcar(e.target, '');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.hidden = true;
    status.textContent = ''; // texto novo a cada falha, para o role=alert anunciar de novo

    var primeiro = null;
    Object.keys(vazio).forEach(function (nome) {
      var campo = form.elements[nome];
      var msg = !campo.value.trim() ? vazio[nome]
        : nome === 'email' && !/@[^@\s]+\.[^@\s]+$/.test(campo.value.trim()) ? 'Esse e-mail parece incompleto.' : '';
      marcar(campo, msg);
      if (msg && !primeiro) primeiro = campo;
    });
    if (primeiro) { primeiro.focus(); return; }

    form.elements._subject.value = 'Contato pelo site: ' + form.elements.nome.value.trim();
    botao.disabled = true;
    botao.textContent = 'Enviando…';

    var controle = new AbortController();
    var prazo = setTimeout(function () { controle.abort(); }, 15000);

    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: controle.signal })
      .then(function (resp) {
        clearTimeout(prazo);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        form.hidden = true;
        ok.hidden = false;
        ok.focus();
      })
      .catch(function () {
        clearTimeout(prazo);
        status.hidden = false;
        status.textContent = 'Não consegui enviar agora. Me escreve em erick@draft.dev.br ou no WhatsApp (11) 99960-6775.';
        botao.disabled = false;
        botao.textContent = textoBotao;
      });
  });
})();
