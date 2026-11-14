// Celular: entra na sala, escolhe o carro e vira volante + pedais.
// Vários jogadores no mesmo navegador (para testar): controle.html?sala=X&j=2
(function () {
  function $(id) { return document.getElementById(id); }
  function param(n, pad) { var m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : pad; }
  var cod = (param('sala', '') || '').toUpperCase();
  if (!cod) { cod = (prompt('Código da sala (está na TV):') || '').toUpperCase().trim(); }
  $('salaCod').textContent = cod;

  // identidade do jogador
  var sufixo = param('j', '') ? '_' + param('j', '') : '';
  var key = null;
  try { key = localStorage.getItem('carros_key' + sufixo); } catch (e) {}
  if (!key) { key = 'k' + Math.random().toString(36).slice(2, 10); try { localStorage.setItem('carros_key' + sufixo, key); } catch (e) {} }
  var nomeSalvo = ''; try { nomeSalvo = localStorage.getItem('carros_nome' + sufixo) || ''; } catch (e) {}
  $('nome').value = nomeSalvo;
  var carro = 'buggy', papel = 'piloto';
  try { papel = localStorage.getItem('carros_papel' + sufixo) || 'piloto'; } catch (e) {}
  try { carro = localStorage.getItem('carros_carro' + sufixo) || 'buggy'; } catch (e) {}

  var opcoes = document.querySelectorAll('.opcao');
  function marcar() { for (var i = 0; i < opcoes.length; i++) opcoes[i].classList.toggle('sel', opcoes[i].getAttribute('data-carro') === carro); }
  for (var i = 0; i < opcoes.length; i++) opcoes[i].onclick = function () { carro = this.getAttribute('data-carro'); marcar(); };
  marcar();
  var papeis = document.querySelectorAll('.papel');
  function marcarPapel() {
    for (var i = 0; i < papeis.length; i++) papeis[i].classList.toggle('sel', papeis[i].getAttribute('data-papel') === papel);
    $('escolhaCarro').style.display = papel === 'artilheiro' ? 'none' : '';
    $('dicaArt').style.display = papel === 'artilheiro' ? '' : 'none';
  }
  for (i = 0; i < papeis.length; i++) papeis[i].onclick = function () { papel = this.getAttribute('data-papel'); marcarPapel(); };
  marcarPapel();

  // ---------------- rede
  var lat = '', ultimoTv = null, canalTxt = 'conectando…';
  function mostrarEstado() { $('estado').textContent = canalTxt + (lat ? ' · ' + lat : ''); }
  var rede = new Rede.Celular(cod, key, {
    estado: function (t) { canalTxt = t === 'conectado' ? '● direto' : t; mostrarEstado(); },
    info: function (d) {
      if (d.cor) { $('barraTopo').style.borderBottomColor = d.cor; $('eu').style.color = d.cor; }
      if (papel === 'artilheiro' && entrou) { var av0 = $('avisoCel'); if (d.espera) { av0.textContent = 'Esperando um piloto entrar…'; av0.className = 'avisoCel'; } else if (!fimAberto && d.espera === 0) av0.className = 'avisoCel escondido'; }
      if (d.cheia && entrou && d.cheia !== ultimaCheia) { ultimaCheia = d.cheia; sair('A sala está cheia (máximo 2). Tente de novo quando alguém sair.'); return; }
      if (d.tv && d.tv !== ultimoTv) { var antes = ultimoTv; ultimoTv = d.tv; if (antes && entrou) rede.conectar(); }
    },
    msg: function (m) {
      if (m.vib && navigator.vibrate) navigator.vibrate(m.vib);
      if (m.fim !== undefined) mostrarFim(m.fim);
      if (m.hud) {
        var h = m.hud;
        $('kmh').textContent = h.v;
        document.body.classList.toggle('comArtilheiro', papel === 'piloto' && !!h.g);
        var inf = '';
        if (h.pos) inf = h.pos + 'º de ' + h.total + ' · volta ' + h.volta + '/3';
        else if (h.cam !== undefined) inf = 'caminhão ' + h.cam + '%';
        else if (h.f === 'jogando') inf = 'onda ' + h.o + '/5';
        $('infoJogo').textContent = inf;
        if (papel === 'artilheiro') {
          $('nitroBar').style.width = h.calor + '%'; $('nitroBar').className = 'calor';
          $('btAcel').firstChild.nodeValue = h.quente ? 'ESFRIANDO…' : '💥 ATIRAR';
        }
        $('vidaBar').style.width = (h.hp || 0) + '%';
        $('vidaBar').className = h.hp < 35 ? 'baixa' : '';
        $('missilQtd').textContent = h.m + ' de 3';
        $('btMissil').className = 'bt' + (h.m < 1 ? ' vazio' : '');
        $('escudoQtd').textContent = h.e === 'pronto' ? 'pronto' : h.e === 'ativo' ? 'ATIVO!' : h.e + ' s';
        $('btEscudo').className = 'bt' + (h.e === 'ativo' ? ' on' : h.e !== 'pronto' ? ' vazio' : '');
        $('btComecar').style.display = h.f === 'livre' ? '' : 'none';
        var av = $('avisoCel');
        if (h.fora) { av.textContent = 'Acabaram as vidas da equipe… torça pelo outro!'; av.className = 'avisoCel'; }
        else if (h.morto) { av.textContent = 'DESTRUÍDO! Voltando em ' + h.morto + '…'; av.className = 'avisoCel'; }
        else if (!fimAberto) av.className = 'avisoCel escondido';
        var cg = m.hud.c || 0;
        if (papel !== 'artilheiro') $('nitroBar').style.width = Math.round(cg / 3 * 100) + '%';
        var bt = $('btNitro');
        bt.className = 'bt' + (m.hud.b ? ' on' : cg < 1 ? ' vazio' : '');
        $('nitroQtd').textContent = m.hud.b ? 'ATIVO!' : (Math.floor(cg) + ' de 3');
      }
    },
    latencia: function (ms, canal) { lat = Math.round(ms) + ' ms' + (canal === 'Firebase' ? ' (internet)' : ''); mostrarEstado(); }
  });

  var entrou = false, ultimaCheia = null, fimAberto = false;
  function mostrarFim(res) {
    var av = $('avisoCel');
    if (!res) { fimAberto = false; av.className = 'avisoCel escondido'; return; }
    fimAberto = true;
    var h;
    if (res.modo === 'corrida') {
      h = '<b>FIM DA CORRIDA</b>';
      for (var q = 0; q < res.chegada.length; q++) h += '<br>' + res.chegada[q].pos + 'º <span style="color:' + res.chegada[q].cor + '">' + res.chegada[q].nome + '</span>';
      av.innerHTML = h; av.className = 'avisoCel fim'; return;
    }
    h = '<b>' + (res.vitoria ? 'VITÓRIA!' : 'DERROTA') + '</b><br>' + res.abates + ' bots destruídos';
    for (var i = 0; i < res.placar.length; i++) { var p = res.placar[i]; h += '<br><span style="color:' + p.cor + '">' + p.nome + '</span>: ' + p.abates + ' destruídos, ' + p.mortes + ' mortes'; }
    av.innerHTML = h; av.className = 'avisoCel fim';
  }
  // sair: tira o carro da TV e libera a vaga
  function sair(msg) {
    entrou = false;
    rede.sair();
    $('telaJogo').classList.remove('ativo');
    $('telaEntrar').style.display = '';
    $('btEntrar').textContent = 'ENTRAR';
    $('salaCod').textContent = cod + (msg ? ' · ' + msg : ' · você saiu');
  }
  function telaCheia() {
    var el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
    if (f && !document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        var p = f.call(el);
        if (p && p.then) p.then(function () { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape')['catch'](function () {}); })['catch'](function () {});
      } catch (e) {}
    }
  }
  $('btEntrar').onclick = function () {
    var nome = $('nome').value.trim().slice(0, 12) || 'Piloto';
    try { localStorage.setItem('carros_nome' + sufixo, nome); localStorage.setItem('carros_carro' + sufixo, carro); localStorage.setItem('carros_papel' + sufixo, papel); } catch (e) {}
    document.body.classList.toggle('artilheiro', papel === 'artilheiro');
    $('btAcel').firstChild.nodeValue = papel === 'artilheiro' ? '💥 ATIRAR' : 'ACELERA';
    $('dicaDir').textContent = papel === 'artilheiro' ? 'arraste para girar a torre' : 'arraste para os lados';
    telaCheia();
    $('eu').textContent = nome;
    $('telaEntrar').style.display = 'none';
    $('telaJogo').classList.add('ativo');
    entrou = true;
    $('salaCod').textContent = cod;
    rede.entrar(nome, carro, papel);
  };
  $('btTrocar').onclick = function () {
    $('telaJogo').classList.remove('ativo');
    $('telaEntrar').style.display = '';
    $('btEntrar').textContent = 'VOLTAR AO JOGO';
  };
  $('btEstrada').onclick = function () { if (!rede.mandar({ reset: 1 })) FB.patch('salas/' + cod + '/c/' + key, { reset: Date.now() }); };
  $('btTela').onclick = telaCheia;
  $('btSair').onclick = function () { if (confirm('Sair do jogo e liberar a vaga?')) sair(); };
  window.addEventListener('pagehide', function () { /* mantém o jogador; sai só pelo botão da TV ou ao fechar a sala */ });

  // ---------------- controles
  var ctrl = { x: 0, a: 0, r: 0, n: 0, m: 0, e: 0, s: 0, modo: 0 }, mudou = true;
  function botao(id, campo) {
    var el = $(id);
    function liga(v) { if (ctrl[campo] !== v) { ctrl[campo] = v; mudou = true; enviar(true); } el.classList.toggle('on', !!v); }
    el.addEventListener('touchstart', function (e) { e.preventDefault(); liga(1); if (campo === 'n' && navigator.vibrate) navigator.vibrate(20); });
    el.addEventListener('touchend', function (e) { e.preventDefault(); liga(0); });
    el.addEventListener('touchcancel', function () { liga(0); });
    el.addEventListener('mousedown', function () { liga(1); });
    el.addEventListener('mouseup', function () { liga(0); });
    el.addEventListener('mouseleave', function () { liga(0); });
  }
  botao('btAcel', 'a'); botao('btRe', 'r');
  // nitro: um toque ativa (manda um contador de toques, que não se perde se um pacote sumir)
  function tocar(campo) { ctrl[campo]++; mudou = true; enviar(true); if (navigator.vibrate) navigator.vibrate(30); }
  function tocarNitro() { tocar('n'); }
  function botaoToque(id, campo) {
    $(id).addEventListener('touchstart', function (e) { e.preventDefault(); tocar(campo); });
    $(id).addEventListener('mousedown', function () { tocar(campo); });
  }
  botaoToque('btNitro', 'n'); botaoToque('btMissil', 'm'); botaoToque('btEscudo', 'e');
  $('btComecar').onclick = function () { $('menuModo').className = 'menuModo'; };
  var modos = document.querySelectorAll('.modo');
  for (var mi = 0; mi < modos.length; mi++) modos[mi].onclick = function () {
    ctrl.modo = parseInt(this.getAttribute('data-modo'), 10); tocar('s'); $('menuModo').className = 'menuModo escondido';
  };
  $('btFecharModo').onclick = function () { $('menuModo').className = 'menuModo escondido'; };

  // direção flutuante: onde o dedo encosta vira o centro
  var dir = $('direcao'), pino = $('dPino'), base = $('dBase'), toqueId = null, cx = 0, cy = 0, ALC = 75;
  function posDir(px) {
    var x = (px - cx) / ALC; x = Math.max(-1, Math.min(1, x));
    if (Math.abs(x) < 0.06) x = 0;
    x = Math.round(x * 20) / 20;
    if (x !== ctrl.x) { ctrl.x = x; mudou = true; }
    var r = dir.getBoundingClientRect();
    pino.style.left = (cx - r.left + x * ALC) + 'px'; pino.style.top = (cy - r.top) + 'px';
  }
  function comecar(px, py) {
    var r = dir.getBoundingClientRect(); cx = px; cy = py;
    base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px';
    base.style.display = 'block'; pino.style.display = 'block';
    posDir(px);
  }
  function soltar() { toqueId = null; ctrl.x = 0; mudou = true; pino.style.display = 'none'; base.style.display = 'none'; enviar(true); }
  dir.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0]; toqueId = t.identifier; comecar(t.clientX, t.clientY);
  });
  dir.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === toqueId) posDir(e.changedTouches[i].clientX);
  });
  dir.addEventListener('touchend', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === toqueId) soltar();
  });
  var arrastando = false;
  dir.addEventListener('mousedown', function (e) { arrastando = true; comecar(e.clientX, e.clientY); });
  window.addEventListener('mousemove', function (e) { if (arrastando) posDir(e.clientX); });
  window.addEventListener('mouseup', function () { if (arrastando) { arrastando = false; soltar(); } });

  // envio: 30x por segundo quando muda; mantém vivo a cada 150 ms (direto) ou 1 s (internet)
  var ultimoEnvio = 0;
  function enviar(forcar) {
    if (!entrou) return;
    var agora = Date.now(), vivo = rede.aberto() ? 150 : 1000;
    if (!mudou && !forcar && agora - ultimoEnvio < vivo) return;
    rede.controle([ctrl.x, ctrl.a, ctrl.r, ctrl.n, ctrl.m, ctrl.e, ctrl.s, ctrl.modo], forcar);
    mudou = false; ultimoEnvio = agora;
  }
  setInterval(function () { enviar(false); }, 33);

  // teclado (testar no computador)
  var mapa = { 37: ['x', -1], 39: ['x', 1], 38: ['a', 1], 40: ['r', 1] };
  document.addEventListener('keydown', function (e) { if (e.keyCode === 16 && !e.repeat) tocarNitro(); if (e.keyCode === 77 && !e.repeat) tocar('m'); if (e.keyCode === 69 && !e.repeat) tocar('e'); if (e.keyCode === 67 && !e.repeat) tocar('s'); var m = mapa[e.keyCode]; if (m && ctrl[m[0]] !== m[1]) { ctrl[m[0]] = m[1]; mudou = true; } });
  document.addEventListener('keyup', function (e) { var m = mapa[e.keyCode]; if (m) { ctrl[m[0]] = 0; mudou = true; } });
})();
