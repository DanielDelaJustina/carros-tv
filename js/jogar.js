// TV: sala + estrada livre com os carros dirigidos pelos celulares.
// Parâmetros: ?teclado=1 (um carro no teclado: setas, Shift = nitro, R = voltar à estrada)  ?r=540|720|1080  ?q=0
(function () {
  function $(id) { return document.getElementById(id); }
  function param(n, pad) { var m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : pad; }
  var erros = [];
  window.onerror = function (msg, src, linha) {
    var t = '⚠ ' + msg + ' (' + String(src || '').split('/').pop() + ':' + linha + ')';
    var d = document.createElement('div'); d.textContent = t; $('erros').appendChild(d);
    var c = $('carregando'); if (c.style.display !== 'none') { c.style.fontSize = '2.4vh'; c.textContent = 'ERRO: ' + t; }
    erros.push(t);
  };

  var RES = parseInt(param('r', '720'), 10), Q = parseInt(param('q', '1'), 10), TECLADO = param('teclado', '') === '1', VITRINE = param('vitrine', '') === '1';
  var CORES = [0x3aa0ff, 0x46d17a, 0xffc83a, 0xc47aff], CORES_CSS = ['#3aa0ff', '#46d17a', '#ffc83a', '#c47aff'];
  var NOMES_CARRO = { buggy: 'BUGGY', muscle: 'MUSCLE' };
  var MAX = 2;
  var SESSAO = 's' + Date.now(); // se a TV recarregar, os celulares refazem a conexão direta

  // ---------------- sala (o código fica guardado para a TV voltar na mesma sala)
  var cod = null;
  try { cod = localStorage.getItem('carros_sala'); } catch (e) {}
  if (!cod || param('nova', '') === '1') { cod = Rede.novoCodigo(); try { localStorage.setItem('carros_sala', cod); } catch (e) {} }
  var linkCel = location.href.replace(/jogar\.html.*$/, 'controle.html') + '?sala=' + cod;

  // ---------------- 3D
  var T = window.THREE;
  var renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(RES * 16 / 9), RES, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  $('gl').appendChild(renderer.domElement);
  var cena = new T.Scene();
  var camera = new T.PerspectiveCamera(62, 16 / 9, 0.5, 2200);
  var mundo;

  // ---------------- som (Web Audio, só depois de apertar o botão)
  var Som = {
    ctx: null, mestre: null, ruido: null,
    ligar: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC();
      this.mestre = this.ctx.createGain(); this.mestre.gain.value = 0.7; this.mestre.connect(this.ctx.destination);
      var n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.ruido = b;
      for (var k in jogadores) this.motor(jogadores[k]);
    },
    motor: function (j) {
      if (!this.ctx || j.som) return;
      var c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200 + 7;
      f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
      g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.mestre);
      o1.start(); o2.start();
      // chiado de pneu
      var src = c.createBufferSource(); src.buffer = this.ruido; src.loop = true;
      var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 3;
      var gs = c.createGain(); gs.gain.value = 0;
      src.connect(bp); bp.connect(gs); gs.connect(this.mestre); src.start();
      j.som = { o1: o1, o2: o2, f: f, g: g, gs: gs };
    },
    atualizar: function (j) {
      if (!this.ctx || !j.som) return;
      var v = Math.abs(j.ve.v), t = this.ctx.currentTime, s = j.som, base = j.info.carro === 'muscle' ? 32 : 44;
      var fr = base + v * 2.4 + (j.ve.usandoNitro ? 18 : 0) + (j.ent.a ? 6 : 0);
      s.o1.frequency.setTargetAtTime(fr, t, 0.06); s.o2.frequency.setTargetAtTime(fr, t, 0.06);
      s.f.frequency.setTargetAtTime(300 + v * 28 + (j.ent.a ? 400 : 0), t, 0.08);
      s.g.gain.setTargetAtTime(0.035 + Math.min(0.05, v * 0.0016) + (j.ent.a ? 0.015 : 0), t, 0.1);
      s.gs.gain.setTargetAtTime(Math.max(0, Math.min(0.12, (j.ve.derrapando - 3) * 0.02)), t, 0.05);
    },
    parar: function (j) {
      if (!j.som) return;
      try { j.som.o1.stop(); j.som.o2.stop(); j.som.g.disconnect(); j.som.gs.disconnect(); } catch (e) {}
      j.som = null;
    },
    pancada: function (forca) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.ruido; f.type = 'lowpass'; f.frequency.value = 600;
      g.gain.setValueAtTime(Math.min(0.5, forca * 0.03), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      src.connect(f); f.connect(g); g.connect(this.mestre); src.start(t); src.stop(t + 0.4);
    },
    nitro: function () {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.ruido; f.type = 'bandpass'; f.Q.value = 1;
      f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      src.connect(f); f.connect(g); g.connect(this.mestre); src.start(t); src.stop(t + 1);
    },
    entrada: function () {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime;
      [523, 659, 784].forEach(function (fr, i) {
        var o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.15, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.3);
        o.connect(g); g.connect(Som.mestre); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.35);
      });
    }
  };
  $('btSom').onclick = function () { Som.ligar(); this.textContent = '🔊 Som ligado'; };

  // ---------------- jogadores
  var jogadores = {}, ordem = []; // key → jogador
  function slotLivre() {
    for (var s = 0; s < MAX; s++) { var usado = false; for (var k in jogadores) if (jogadores[k].slot === s) usado = true; if (!usado) return s; }
    return -1;
  }
  function aviso(txt, cor) {
    var d = document.createElement('div'); d.className = 'aviso'; d.textContent = txt;
    if (cor) d.style.borderLeftColor = cor;
    $('avisos').appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3600);
  }
  function lugarInicial(slot) {
    var e = mundo.estrada, i = 30 - Math.floor(slot / 2) * 5;
    var p = mundo.aoLado(i, slot % 2 ? 1 : -1, 3.2);
    return { x: p.x, z: p.z, h: Math.atan2(e.tx[(i + e.n) % e.n], e.tz[(i + e.n) % e.n]) };
  }
  function criarJogador(key, info) {
    var slot = slotLivre();
    if (slot < 0) { aviso('Sala cheia: ' + info.nome + ' não entrou'); if (rede) rede.publicarJogador(key, { cheia: Date.now() }); return null; }
    var tipo = info.carro === 'muscle' ? 'muscle' : 'buggy';
    var m = Carros.modelo(tipo, CORES[slot], slot + 1);
    cena.add(m.obj); cena.add(m.sombra);
    var ve = new Carros.Veiculo(mundo, m);
    var p = lugarPerto(slot);
    ve.colocar(p.x, p.z, p.h);
    var j = { key: key, slot: slot, info: info, m: m, ve: ve, ent: { x: 0, a: 0, r: 0, n: 0 }, canal: 'Firebase', ultimoCtrl: Date.now(), cam: novaCam() };
    // etiqueta e cartão
    j.etq = document.createElement('div'); j.etq.className = 'etiqueta'; j.etq.style.color = CORES_CSS[slot];
    $('etiquetas').appendChild(j.etq);
    j.cartao = document.createElement('div'); j.cartao.className = 'cartao s' + slot; j.cartao.style.borderTopColor = CORES_CSS[slot];
    j.cartao.innerHTML = '<svg viewBox="0 0 100 100"><path d="M18 78 A40 40 0 1 1 82 78" fill="none" stroke="#2a1d14" stroke-width="9" stroke-linecap="round"/>' +
      '<path class="arco" d="M18 78 A40 40 0 1 1 82 78" fill="none" stroke="' + CORES_CSS[slot] + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 400"/>' +
      '<line class="ponteiro" x1="50" y1="50" x2="50" y2="18" stroke="#ff5a48" stroke-width="4" stroke-linecap="round"/>' +
      '<circle cx="50" cy="50" r="6" fill="#ddd"/><text class="kmh" x="50" y="80" text-anchor="middle" fill="#fff" font-size="20" font-weight="700">0</text>' +
      '<text x="50" y="95" text-anchor="middle" fill="#b8a690" font-size="10">km/h</text></svg>' +
      '<div style="flex:1;min-width:0"><div class="nome"></div><div class="tipo"></div>' +
      '<div class="rot"><span>NITRO</span><span class="sinal">●</span></div><div class="barra"><i></i></div></div>';
    $('cartoes').appendChild(j.cartao);
    j.ui = { arco: j.cartao.querySelector('.arco'), ponteiro: j.cartao.querySelector('.ponteiro'), kmh: j.cartao.querySelector('.kmh'),
      nitro: j.cartao.querySelector('.barra i'), sinal: j.cartao.querySelector('.sinal'), nome: j.cartao.querySelector('.nome'), tipo: j.cartao.querySelector('.tipo') };
    preencherCartao(j);
    jogadores[key] = j;
    Som.motor(j); Som.entrada();
    aviso(info.nome + ' entrou com o ' + NOMES_CARRO[tipo], CORES_CSS[slot]);
    if (rede && key !== 'teclado') rede.publicarJogador(key, { slot: slot, cor: CORES_CSS[slot], tv: SESSAO });
    atualizarLobby();
    return j;
  }
  // nasce perto de quem já está jogando (ou na largada)
  function lugarPerto(slot) {
    var outro = null;
    for (var k in jogadores) { outro = jogadores[k]; break; }
    if (!outro) return lugarInicial(slot);
    var ep = mundo.estradaPerto(outro.ve.x, outro.ve.z), e = mundo.estrada;
    var dir = Math.cos(outro.ve.h - ep.h) >= 0 ? 1 : -1, i = ep.i - dir * 6;
    var p = mundo.aoLado(i, slot % 2 ? 1 : -1, 3.2);
    var ii = ((i % e.n) + e.n) % e.n;
    return { x: p.x, z: p.z, h: Math.atan2(e.tx[ii], e.tz[ii]) + (dir < 0 ? Math.PI : 0) };
  }
  function preencherCartao(j) {
    j.ui.nome.textContent = j.info.nome; j.ui.tipo.textContent = NOMES_CARRO[j.m.tipo];
    j.etq.innerHTML = '';
    j.etq.appendChild(document.createTextNode(j.info.nome.toUpperCase()));
    j.etq.appendChild(document.createElement('i')); j.etq.appendChild(document.createElement('s'));
  }
  function removerJogador(key) {
    var j = jogadores[key]; if (!j) return;
    cena.remove(j.m.obj); cena.remove(j.m.sombra);
    Som.parar(j);
    if (j.etq.parentNode) j.etq.parentNode.removeChild(j.etq);
    if (j.cartao.parentNode) j.cartao.parentNode.removeChild(j.cartao);
    delete jogadores[key];
    aviso(j.info.nome + ' saiu');
    atualizarLobby();
  }
  function trocarCarro(key, info) {
    var j = jogadores[key]; if (!j) return;
    var x = j.ve.x, z = j.ve.z, h = j.ve.h;
    if ((info.carro === 'muscle' ? 'muscle' : 'buggy') === j.m.tipo) { preencherCartao(j); return; }
    removerJogador(key);
    var n = criarJogador(key, info); if (n) n.ve.colocar(x, z, h);
  }
  function nitro(j) { if (j.ve.acionarNitro()) Som.nitro(); }
  function voltarEstrada(j) {
    var ep = mundo.estradaPerto(j.ve.x, j.ve.z);
    var h = ep.h + (Math.cos(j.ve.h - ep.h) >= 0 ? 0 : Math.PI);
    j.ve.colocar(ep.x - Math.cos(h) * 3, ep.z + Math.sin(h) * 3, h);
  }
  function atualizarLobby() {
    var n = 0; for (var k in jogadores) n++;
    $('qtd').textContent = n + '/' + MAX + ' JOGADORES';
    $('lobby').classList.toggle('escondido', n > 0);
    $('mini').classList.toggle('escondido', n === 0 || n >= MAX);
  }

  // ---------------- rede
  var rede = null;
  function iniciarRede() {
    rede = new Rede.TV(cod, {
      entrou: function (key, info) { criarJogador(key, info); },
      mudou: function (key, info) { trocarCarro(key, info); },
      saiu: function (key) { removerJogador(key); },
      ctrl: function (key, c) {
        var j = jogadores[key]; if (!j) return;
        j.ent.x = c[0]; j.ent.a = c[1]; j.ent.r = c[2]; j.ultimoCtrl = Date.now();
        // c[3] = quantos toques no nitro o celular já deu (contador não se perde se um pacote sumir)
        if (j.nitroCont === undefined || c[3] < j.nitroCont) j.nitroCont = c[3];
        else if (c[3] > j.nitroCont) { j.nitroCont = c[3]; nitro(j); }
      },
      reset: function (key) { var j = jogadores[key]; if (j) voltarEstrada(j); },
      canal: function (key, nome) { var j = jogadores[key]; if (j) { j.canal = nome; j.ui.sinal.className = 'sinal' + (nome === 'WebRTC' ? '' : ' fb'); } }
    });
  }

  // ---------------- teclado (para testar sem celular)
  var teclas = {};
  document.addEventListener('keydown', function (e) {
    teclas[e.keyCode] = true;
    if (TECLADO && e.keyCode === 82 && jogadores.teclado) voltarEstrada(jogadores.teclado);
    if (TECLADO && e.keyCode === 16 && !e.repeat && jogadores.teclado) nitro(jogadores.teclado);
    if (TECLADO && [37, 38, 39, 40, 32].indexOf(e.keyCode) >= 0) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { teclas[e.keyCode] = false; });

  // ---------------- câmeras: tela cheia com 1 jogador, tela dividida (cima/baixo) com 2
  var passeio = 0, camPasseio = { cam: camera, pos: new T.Vector3(), olhar: new T.Vector3(), primeiro: true };
  var LARG = Math.round(RES * 16 / 9), ALT = RES, modoDividido = null;
  function novaCam() { return { cam: new T.PerspectiveCamera(62, 16 / 9, 0.5, 2200), pos: new T.Vector3(), olhar: new T.Vector3(), primeiro: true }; }
  function seguir(c, cx, cy, cz, ox, oy, oz, dt, firme) {
    cy = Math.max(cy, mundo.altura(cx, cz) + 1.5);
    var lk = firme ? 1 : 1 - Math.exp(-dt * 4), lo = Math.min(1, lk * 1.4);
    if (c.primeiro) { c.pos.set(cx, cy, cz); c.olhar.set(ox, oy, oz); c.primeiro = false; }
    else {
      c.pos.x += (cx - c.pos.x) * lk; c.pos.y += (cy - c.pos.y) * lk; c.pos.z += (cz - c.pos.z) * lk;
      c.olhar.x += (ox - c.olhar.x) * lo; c.olhar.y += (oy - c.olhar.y) * lo; c.olhar.z += (oz - c.olhar.z) * lo;
    }
    c.cam.position.copy(c.pos); c.cam.lookAt(c.olhar);
  }
  function camJogador(j, dt, dividido) {
    var v = j.ve;
    if (VITRINE) { passeio += dt * 0.25; seguir(j.cam, v.x + Math.cos(passeio + j.slot) * 7, v.y + 2.4, v.z + Math.sin(passeio + j.slot) * 7, v.x, v.y + 0.9, v.z, dt, true); return; }
    var re = v.v < -2 ? -1 : 1, fx = Math.sin(v.h) * re, fz = Math.cos(v.h) * re;
    var dist = dividido ? 9.5 : 11, alt = dividido ? 3.4 : 4.6;
    seguir(j.cam, v.x - fx * dist, v.y + alt, v.z - fz * dist, v.x + fx * 7, v.y + 1.4, v.z + fz * 7, dt);
  }
  function ordenados() {
    var l = [];
    for (var k in jogadores) l.push(jogadores[k]);
    l.sort(function (a, b) { return a.slot - b.slot; });
    return l;
  }
  function camerasAtivas() {
    var l = ordenados(), c = [];
    for (var i = 0; i < l.length; i++) c.push(l[i].cam.cam);
    return c.length ? c : [camera];
  }
  function desenharTela(dt) {
    var lista = ordenados(), dividido = lista.length >= 2, i, c;
    if (dividido !== modoDividido) {
      modoDividido = dividido;
      document.body.classList.toggle('dividido', dividido);
      mundo.densidade(dividido ? 0.5 : 1); // menos capim e moitas quando desenha duas vezes
    }
    renderer.setScissorTest(false);
    if (!lista.length) { // ninguém jogando: passeio pela estrada
      passeio += dt * 14;
      var e = mundo.estrada, f = (passeio / e.total * e.n) % e.n, a = Math.floor(f), b = (a + 25) % e.n;
      seguir(camPasseio, e.px[a], e.ph[a] + 9, e.pz[a], e.px[b], e.ph[b] + 2, e.pz[b], dt);
      camera.fov = 62; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
      renderer.setViewport(0, 0, LARG, ALT);
      mundo.escalaParticulas(ALT, 62); mundo.verCamera(camera);
      renderer.render(cena, camera);
      return;
    }
    if (!dividido) {
      c = lista[0].cam.cam; c.fov = 62; c.aspect = 16 / 9; c.updateProjectionMatrix();
      camJogador(lista[0], dt, false);
      renderer.setViewport(0, 0, LARG, ALT);
      mundo.escalaParticulas(ALT, 62); mundo.verCamera(c);
      renderer.render(cena, c);
      return;
    }
    renderer.setScissorTest(true);
    mundo.escalaParticulas(ALT / 2, 38);
    for (i = 0; i < 2; i++) {
      c = lista[i].cam.cam; c.fov = 38; c.aspect = LARG / (ALT / 2); c.updateProjectionMatrix();
      camJogador(lista[i], dt, true);
      var y = i === 0 ? ALT / 2 : 0; // o primeiro jogador fica em cima
      renderer.setViewport(0, y, LARG, ALT / 2); renderer.setScissor(0, y, LARG, ALT / 2);
      mundo.verCamera(c);
      renderer.render(cena, c);
    }
    renderer.setScissorTest(false);
  }

  // ---------------- laço principal
  var ultimoHud = 0, fq = 0, fDesde = 0, ultimoFpsSalvo = 0, fpsAtual = 0;
  function quadro(dt, t) {
    var lista = [], k, j;
    for (k in jogadores) lista.push(jogadores[k].ve);
    for (k in jogadores) {
      j = jogadores[k];
      if (k === 'teclado') {
        j.ent.x = teclas[37] ? -1 : teclas[39] ? 1 : 0; j.ent.a = teclas[38] ? 1 : 0; j.ent.r = teclas[40] ? 1 : 0;
      } else if (Date.now() - j.ultimoCtrl > 2500 && j.canal === 'Firebase' && j.ent.a) { j.ent.a = 0; } // controle sumiu: solta o acelerador
      var bat = j.ve.atualizar(dt, j.ent, lista);
      if (bat > 7) { Som.pancada(bat); if (rede) rede.enviar(k, { vib: Math.min(200, Math.round(bat * 8)) }); }
      j.ve.desenhar(dt, t, j.ent.r && j.ve.v > 0.5 || (j.ent.r && !j.ent.a));
      // poeira das rodas de trás
      var v = j.ve, fx = Math.sin(v.h), fz = Math.cos(v.h), fora = !v.naEstrada;
      if (Math.random() < (fora ? 1.6 : 0.6)) {
        mundo.poeiraCarro(v.x - fx * 1.9 + fz * 1.1, v.y, v.z - fz * 1.9 - fx * 1.1, Math.abs(v.v) + v.derrapando * 3);
        mundo.poeiraCarro(v.x - fx * 1.9 - fz * 1.1, v.y, v.z - fz * 1.9 + fx * 1.1, Math.abs(v.v) + v.derrapando * 3);
      }
      Som.atualizar(j);
    }
    mundo.atualizar(dt, camerasAtivas());
    desenharTela(dt);

    // painel (10x por segundo)
    if (t - ultimoHud > 0.1) {
      ultimoHud = t;
      for (k in jogadores) {
        j = jogadores[k];
        var kmh = Math.round(Math.abs(j.ve.v) * 4.2), fr = Math.min(1, kmh / 260);
        j.ui.kmh.textContent = kmh;
        j.ui.arco.setAttribute('stroke-dasharray', (fr * 200) + ' 400');
        j.ui.ponteiro.setAttribute('transform', 'rotate(' + (-135 + fr * 270) + ' 50 50)');
        j.ui.nitro.style.width = Math.round(j.ve.nitro * 100) + '%';
        j.ui.nitro.parentNode.className = 'barra' + (j.ve.usandoNitro ? ' ativo' : '');
        if (rede && k !== 'teclado' && Math.floor(t * 4) !== j.ultimoEnvio) { j.ultimoEnvio = Math.floor(t * 4); rede.enviar(k, { hud: { v: kmh, c: Math.round(j.ve.cargas * 100) / 100, b: j.ve.usandoNitro ? 1 : 0 } }); }
      }
    }
    // fps vão para o Firebase a cada 10 s (para o Claude conferir sem precisar de foto)
    if (t - ultimoFpsSalvo > 10 && fpsAtual) {
      ultimoFpsSalvo = t;
      FB.put('salas/' + cod + '/tv', { fps: fpsAtual, jogadores: lista.length, dividido: !!modoDividido, ua: navigator.userAgent, hora: new Date().toISOString() })['catch'](function () {});
    }
  }

  // ---------------- início
  setTimeout(function () {
    try {
      mundo = Mundo.criar(T, cena, { q: Q });
      Carros.iniciar(T);
    } catch (e) { window.onerror(String(e && e.stack || e), '', 0); return; }
    mundo.escalaParticulas(RES, 62);
    $('carregando').style.display = 'none';
    $('cod').textContent = cod; $('codMini').textContent = cod;
    $('link').textContent = linkCel.replace(/^https?:\/\//, '');
    if (window.QRCode) {
      new QRCode($('qr'), { text: linkCel, width: 320, height: 320 });
      new QRCode($('qrMini'), { text: linkCel, width: 160, height: 160 });
    }
    iniciarRede();
    if (VITRINE) { criarJogador('v1', { nome: 'Buggy', carro: 'buggy' }); criarJogador('v2', { nome: 'Muscle', carro: 'muscle' }); }
    if (TECLADO) criarJogador('teclado', { nome: 'Teclado', carro: param('carro', 'buggy') });
    atualizarLobby();
    $('btSom').focus();
    for (var i = 0; i < 100; i++) mundo.atualizar(0.1, []);
    var ultimo = 0;
    function loop(t) {
      var dt = ultimo ? Math.min((t - ultimo) / 1000, 0.05) : 0.016;
      ultimo = t;
      fq++;
      if (t - fDesde >= 1000) { fpsAtual = Math.round(fq * 1000 / (t - fDesde)); $('fps').textContent = fpsAtual + ' fps'; fq = 0; fDesde = t; }
      quadro(dt, t / 1000);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }, 50);
})();
