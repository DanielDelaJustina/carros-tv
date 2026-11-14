// TV: sala + estrada livre com os carros dirigidos pelos celulares.
// Parâmetros: ?teclado=1 (um carro no teclado: setas, Shift = nitro, M = míssil, E = escudo, C/1 = incursão, 2 = corrida, 3 = comboio, R = voltar à estrada; F = tela cheia)  ?r=540|720|1080  ?q=0
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
    tiro: function (vol) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime;
      if (this.ultTiro && t - this.ultTiro < 0.05) return;
      this.ultTiro = t;
      var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.ruido; f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 600; f.Q.value = 0.9;
      g.gain.setValueAtTime(0.13 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      src.connect(f); f.connect(g); g.connect(this.mestre); src.start(t, Math.random()); src.stop(t + 0.08);
    },
    explosao: function (forca) {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.ruido; f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
      g.gain.setValueAtTime(Math.min(0.9, 0.45 * forca), t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      src.connect(f); f.connect(g); g.connect(this.mestre); src.start(t, Math.random()); src.stop(t + 1.35);
      var o = c.createOscillator(), go = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
      go.gain.setValueAtTime(0.5 * Math.min(1.5, forca), t); go.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(go); go.connect(this.mestre); o.start(t); o.stop(t + 0.75);
    },
    missil: function () {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.ruido; f.type = 'bandpass'; f.Q.value = 2;
      f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      src.connect(f); f.connect(g); g.connect(this.mestre); src.start(t, Math.random()); src.stop(t + 0.75);
    },
    escudo: function () {
      if (!this.ctx) return;
      var c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.35);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(g); g.connect(this.mestre); o.start(t); o.stop(t + 0.55);
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
  // tela cheia na TV (botão no lobby, botão no canto e tecla F)
  function telaCheia() {
    var el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
    var sair = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
    var cheia = document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement;
    try { if (cheia) { if (sair) sair.call(document); } else if (f) f.call(el); } catch (e) {}
    Som.ligar();
  }
  $('btTela').onclick = telaCheia; $('btTela2').onclick = telaCheia;

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
    if (slot >= 0 && totalCelulares() >= MAX) slot = -1;
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
      '<div class="rot"><span>VIDA</span><span class="sinal">●</span></div><div class="barra vida"><i></i></div>' +
      '<div class="rot"><span>NITRO</span><span class="itens"></span></div><div class="barra nitro"><i></i></div></div>';
    $('cartoes').appendChild(j.cartao);
    j.ui = { arco: j.cartao.querySelector('.arco'), ponteiro: j.cartao.querySelector('.ponteiro'), kmh: j.cartao.querySelector('.kmh'),
      nitro: j.cartao.querySelector('.barra.nitro i'), vida: j.cartao.querySelector('.barra.vida i'), itens: j.cartao.querySelector('.itens'), sinal: j.cartao.querySelector('.sinal'), nome: j.cartao.querySelector('.nome'), tipo: j.cartao.querySelector('.tipo') };
    preencherCartao(j);
    jogadores[key] = j;
    Incursao.prepararJogador(j);
    Som.motor(j); Som.entrada();
    aviso(info.nome + ' entrou com o ' + NOMES_CARRO[tipo], CORES_CSS[slot]);
    if (rede && key !== 'teclado') rede.publicarJogador(key, { slot: slot, cor: CORES_CSS[slot], tv: SESSAO });
    ligarArtilheiros();
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
    j.ui.nome.textContent = j.info.nome + (j.artilheiro ? ' & ' + j.artilheiro.info.nome : '');
    j.ui.tipo.textContent = NOMES_CARRO[j.m.tipo] + (j.artilheiro ? ' · PILOTO & ARTILHEIRO' : '');
    j.etq.innerHTML = '';
    j.etq.appendChild(document.createTextNode(j.info.nome.toUpperCase()));
    j.etq.appendChild(document.createElement('i')); j.etq.appendChild(document.createElement('s'));
  }
  function removerJogador(key) {
    var j = jogadores[key]; if (!j) return;
    cena.remove(j.m.obj); cena.remove(j.m.sombra);
    Incursao.removerJogador(j);
    Som.parar(j);
    if (j.etq.parentNode) j.etq.parentNode.removeChild(j.etq);
    if (j.cartao.parentNode) j.cartao.parentNode.removeChild(j.cartao);
    delete jogadores[key];
    if (j.artilheiro) { j.artilheiro.carro = null; ligarArtilheiros(); }
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

  // ---------------- artilheiros: segundo celular que cuida das armas de um carro
  var artilheiros = {};
  function totalCelulares() { var n = 0, k; for (k in jogadores) n++; for (k in artilheiros) n++; return n; }
  function criarArtilheiro(key, info) {
    if (totalCelulares() >= MAX) { aviso('Sala cheia: ' + info.nome + ' não entrou'); if (rede) rede.publicarJogador(key, { cheia: Date.now() }); return; }
    artilheiros[key] = { key: key, info: info, carro: null };
    aviso(info.nome + ' entrou como artilheiro');
    Som.entrada();
    ligarArtilheiros();
    atualizarLobby();
  }
  function ligarArtilheiros() {
    for (var k in artilheiros) {
      var a = artilheiros[k]; if (a.carro) continue;
      for (var c in jogadores) {
        var j = jogadores[c]; if (j.artilheiro) continue;
        a.carro = j; j.artilheiro = a; j.arte = { giro: 0, atira: 0 };
        aviso(a.info.nome + ' cuida das armas de ' + j.info.nome, CORES_CSS[j.slot]);
        preencherCartao(j);
        break;
      }
      if (rede) rede.publicarJogador(a.key, a.carro ? { espera: 0, cor: CORES_CSS[a.carro.slot], tv: SESSAO } : { espera: Date.now(), tv: SESSAO });
    }
  }
  function removerArtilheiro(key) {
    var a = artilheiros[key]; if (!a) return;
    if (a.carro) { a.carro.artilheiro = null; a.carro.arte = null; preencherCartao(a.carro); }
    delete artilheiros[key];
    aviso(a.info.nome + ' saiu');
    atualizarLobby();
  }
  function voltarEstrada(j) {
    var ep = mundo.estradaPerto(j.ve.x, j.ve.z);
    var h = ep.h + (Math.cos(j.ve.h - ep.h) >= 0 ? 0 : Math.PI);
    j.ve.colocar(ep.x - Math.cos(h) * 3, ep.z + Math.sin(h) * 3, h);
  }
  function atualizarLobby() {
    var n = totalCelulares();
    $('qtd').textContent = n + '/' + MAX + ' JOGADORES';
    $('lobby').classList.toggle('escondido', n > 0);
    $('mini').classList.toggle('escondido', n === 0 || n >= MAX);
  }

  // botões de toque: o celular manda quantas vezes já tocou; a TV age quando o número sobe
  function contador(j, nome, valor, acao) {
    if (valor === undefined) return;
    if (j[nome] === undefined || valor < j[nome]) j[nome] = valor;
    else if (valor > j[nome]) { j[nome] = valor; acao(j); }
  }

  // ---------------- rede
  var rede = null;
  function iniciarRede() {
    rede = new Rede.TV(cod, {
      entrou: function (key, info) { if (info.papel === 'artilheiro') criarArtilheiro(key, info); else criarJogador(key, info); },
      mudou: function (key, info) {
        var eraArt = !!artilheiros[key];
        if (eraArt !== (info.papel === 'artilheiro')) { // trocou de papel
          if (eraArt) removerArtilheiro(key); else removerJogador(key);
          if (info.papel === 'artilheiro') criarArtilheiro(key, info); else criarJogador(key, info);
        } else if (eraArt) { artilheiros[key].info = info; if (artilheiros[key].carro) preencherCartao(artilheiros[key].carro); }
        else trocarCarro(key, info);
      },
      saiu: function (key) { if (artilheiros[key]) removerArtilheiro(key); else removerJogador(key); },
      ctrl: function (key, c) {
        var a = artilheiros[key];
        if (a) { // artilheiro: x gira a torre, a atira; botões de míssil, escudo e começar
          if (a.carro) a.carro.arte = { giro: c[0], atira: c[1] };
          contador(a, 'missilCont', c[5], function () { if (a.carro) Incursao.missil(a.carro); });
          contador(a, 'escudoCont', c[6], function () { if (a.carro) Incursao.escudo(a.carro); });
          contador(a, 'comecarCont', c[7], function () { Incursao.comecar(c[8] || 0); });
          return;
        }
        var j = jogadores[key]; if (!j) return;
        j.ent.x = c[0]; j.ent.a = c[1]; j.ent.r = c[2]; j.ultimoCtrl = Date.now();
        // c[3] = quantos toques no nitro o celular já deu (contador não se perde se um pacote sumir)
        contador(j, 'nitroCont', c[3], nitro);
        contador(j, 'missilCont', c[5], Incursao.missil);
        contador(j, 'escudoCont', c[6], Incursao.escudo);
        contador(j, 'comecarCont', c[7], function () { Incursao.comecar(c[8] || 0); });
      },
      reset: function (key) { var j = jogadores[key] || (artilheiros[key] && artilheiros[key].carro); if (j) voltarEstrada(j); },
      canal: function (key, nome) { var j = jogadores[key]; if (j) { j.canal = nome; j.ui.sinal.className = 'sinal' + (nome === 'WebRTC' ? '' : ' fb'); } }
    });
  }

  // ---------------- teclado (para testar sem celular)
  var teclas = {};
  document.addEventListener('keydown', function (e) {
    teclas[e.keyCode] = true;
    if (TECLADO && e.keyCode === 82 && jogadores.teclado) voltarEstrada(jogadores.teclado);
    if (TECLADO && e.keyCode === 16 && !e.repeat && jogadores.teclado) nitro(jogadores.teclado);
    if (TECLADO && e.keyCode === 77 && !e.repeat && jogadores.teclado) Incursao.missil(jogadores.teclado);
    if (TECLADO && e.keyCode === 69 && !e.repeat && jogadores.teclado) Incursao.escudo(jogadores.teclado);
    if (TECLADO && e.keyCode === 67 && !e.repeat) Incursao.comecar(0);
    if (TECLADO && e.keyCode >= 49 && e.keyCode <= 51 && !e.repeat) Incursao.comecar(e.keyCode - 49);
    if (e.keyCode === 70 && !e.repeat) telaCheia();
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
    if (j.tremor > 0.02) {
      j.cam.cam.position.x += (Math.random() - 0.5) * j.tremor; j.cam.cam.position.y += (Math.random() - 0.5) * j.tremor;
      j.tremor *= Math.exp(-dt * 7);
    }
  }
  function tremer(x, z, forca) {
    for (var k in jogadores) {
      var j = jogadores[k], d = Math.sqrt((j.ve.x - x) * (j.ve.x - x) + (j.ve.z - z) * (j.ve.z - z));
      j.tremor = Math.max(j.tremor || 0, forca * 1.1 * Math.max(0, 1 - d / 70));
    }
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

  // ---------------- placar, mensagens, minimapa e resultado
  function placar() {
    var el = $('placar'), txt = Incursao.textoPlacar();
    if (el.getAttribute('data-t') !== txt) { el.innerHTML = txt; el.setAttribute('data-t', txt); }
  }
  function placarAntigo() {
    var E = Incursao.estado, el = $('placar'), txt;
    if (E.fase === 'livre') txt = 'ESTRADA LIVRE · toque <b>▶ COMEÇAR</b> no celular';
    else if (E.fase === 'contagem') txt = 'PREPAREM-SE!';
    else {
      var s = Math.floor(E.tempo), mm = Math.floor(s / 60), ss = s % 60;
      txt = 'ONDA <b>' + E.onda + '/' + Incursao.ONDAS + '</b> · BOTS DESTRUÍDOS <b>' + E.abates + '</b> · VIDAS <b>' + E.vidas + '</b> · ' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    if (el.getAttribute('data-t') !== txt) { el.innerHTML = txt; el.setAttribute('data-t', txt); }
  }
  var msgTimer = null;
  function mensagem(txt, seg) {
    var el = $('mensagem');
    el.textContent = txt; el.className = ''; void el.offsetWidth; el.className = 'mostra';
    clearTimeout(msgTimer); msgTimer = setTimeout(function () { el.className = ''; }, seg * 1000);
  }
  var mapaG = null, mapaFundo = null, MT = 200;
  function mx(x) { return (x + 450) / 900 * MT; }
  function prepararMapa() {
    var cv = $('mapa'); cv.width = MT; cv.height = MT; mapaG = cv.getContext('2d');
    mapaFundo = document.createElement('canvas'); mapaFundo.width = MT; mapaFundo.height = MT;
    var g = mapaFundo.getContext('2d'), e = mundo.estrada;
    g.fillStyle = 'rgba(120,70,40,.35)'; g.fillRect(0, 0, MT, MT);
    g.strokeStyle = '#d9c3a0'; g.lineWidth = 4; g.beginPath();
    for (var i = 0; i <= e.n; i += 3) { var q = i % e.n; if (!i) g.moveTo(mx(e.px[q]), mx(e.pz[q])); else g.lineTo(mx(e.px[q]), mx(e.pz[q])); }
    g.closePath(); g.stroke();
    var at = mundo.atalhos; g.strokeStyle = '#b08a5a'; g.lineWidth = 2.5;
    for (var a = 0; a < at.qtd; a++) { g.beginPath(); for (var s = 0; s < at.n; s += 4) { var q2 = a * at.n + s; if (!s) g.moveTo(mx(at.px[q2]), mx(at.pz[q2])); else g.lineTo(mx(at.px[q2]), mx(at.pz[q2])); } g.stroke(); }
  }
  function desenharMapa() {
    if (!mapaG) return;
    var g = mapaG, bots = Incursao.bots(), i;
    g.clearRect(0, 0, MT, MT);
    g.save(); g.beginPath(); g.arc(MT / 2, MT / 2, MT / 2 - 2, 0, 6.29); g.clip();
    g.drawImage(mapaFundo, 0, 0);
    var cam2 = Incursao.caminhao(), dst = Incursao.destino();
    if (dst) { g.fillStyle = '#46d17a'; g.beginPath(); g.arc(mx(dst.x), mx(dst.z), 7, 0, 6.29); g.fill(); }
    if (cam2 && !cam2.morto) { g.fillStyle = '#fff'; g.fillRect(mx(cam2.ve.x) - 5, mx(cam2.ve.z) - 5, 10, 10); }
    g.fillStyle = '#ff3a2a';
    for (i = 0; i < bots.length; i++) if (!bots[i].morto) { g.beginPath(); g.arc(mx(bots[i].ve.x), mx(bots[i].ve.z), bots[i].chefe ? 7 : 4.5, 0, 6.29); g.fill(); }
    for (var k in jogadores) {
      var j = jogadores[k]; if (j.morto > 0 || j.fora) continue;
      var x = mx(j.ve.x), z = mx(j.ve.z), h = j.ve.h;
      g.fillStyle = CORES_CSS[j.slot]; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x + Math.sin(h) * 9, z + Math.cos(h) * 9);
      g.lineTo(x + Math.sin(h + 2.5) * 6, z + Math.cos(h + 2.5) * 6); g.lineTo(x + Math.sin(h - 2.5) * 6, z + Math.cos(h - 2.5) * 6);
      g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  }
  function mostrarFim(res) {
    var el = $('resultado');
    if (!res) { el.classList.add('escondido'); for (var k in jogadores) if (rede && k !== 'teclado') rede.enviar(k, { fim: 0 }); for (k in artilheiros) if (rede) rede.enviar(k, { fim: 0 }); return; }
    var min = Math.floor(res.tempo / 60), seg = res.tempo % 60;
    if (res.modo === 'corrida') {
      var hc = '<h2 class="titulo">' + (res.chegada[0] ? res.chegada[0].nome.toUpperCase() + ' VENCEU!' : 'FIM DA CORRIDA') + '</h2><table><tr><th>POS.</th><th></th><th>TEMPO</th></tr>';
      for (var q = 0; q < res.chegada.length; q++) { var c = res.chegada[q]; hc += '<tr><td>' + c.pos + 'º</td><td style="color:' + c.cor + '">' + c.nome + '</td><td>' + (c.tempo ? Math.floor(c.tempo / 60) + ':' + ('0' + c.tempo % 60).slice(-2) : '—') + '</td></tr>'; }
      el.innerHTML = hc + '</table><div class="resumo">Nova rodada liberada em alguns segundos…</div>'; el.classList.remove('escondido');
      for (var k2 in jogadores) if (rede && k2 !== 'teclado') rede.enviar(k2, { fim: res });
      for (k2 in artilheiros) if (rede) rede.enviar(k2, { fim: res });
      return;
    }
    var h = '<h2 class="titulo">' + (res.vitoria ? 'VITÓRIA!' : 'DERROTA') + '</h2>' +
      '<div class="resumo">' + (res.modo === 'comboio' ? (res.vitoria ? 'O caminhão chegou com ' + res.caminhao + '% de vida' : 'O comboio caiu') : res.vitoria ? 'As 5 ondas foram vencidas' : 'Chegaram até a onda ' + res.onda) + ' · ' + res.abates + ' bots destruídos · ' + min + ' min ' + seg + ' s</div>' +
      '<table><tr><th></th><th>DESTRUIU</th><th>DANO</th><th>MORREU</th></tr>';
    for (var i = 0; i < res.placar.length; i++) {
      var p = res.placar[i];
      h += '<tr><td style="color:' + p.cor + '">' + p.nome + '</td><td>' + p.abates + '</td><td>' + p.dano + '</td><td>' + p.mortes + '</td></tr>';
    }
    h += '</table><div class="resumo">Nova rodada liberada em alguns segundos…</div>';
    el.innerHTML = h; el.classList.remove('escondido');
    for (k in jogadores) if (rede && k !== 'teclado') rede.enviar(k, { fim: res });
    for (k in artilheiros) if (rede) rede.enviar(k, { fim: res });
  }

  // ---------------- laço principal
  var ultimoMapa = 0, ultimoHud = 0, fq = 0, fDesde = 0, ultimoFpsSalvo = 0, fpsAtual = 0;
  function quadro(dt, t) {
    var lista = Incursao.veiculos(), k, j;
    for (k in jogadores) {
      j = jogadores[k];
      if (j.morto > 0 || j.fora) continue;
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
    Incursao.atualizar(dt, t);
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
        j.ui.nitro.parentNode.className = 'barra nitro' + (j.ve.usandoNitro ? ' ativo' : '');
        var h = Incursao.hud(j);
        j.ui.vida.style.width = h.hp + '%';
        j.ui.vida.parentNode.className = 'barra vida' + (h.hp < 35 ? ' baixa' : '');
        j.ui.itens.textContent = 'MÍSSIL ' + h.m + ' · ESCUDO ' + (h.e === 'pronto' ? 'OK' : h.e === 'ativo' ? 'ATIVO' : h.e + 's');
        var tipoTxt = NOMES_CARRO[j.m.tipo] + (h.pos ? ' · ' + h.pos + 'º LUGAR · VOLTA ' + h.volta + '/3' : j.artilheiro ? ' · PILOTO & ARTILHEIRO' : '');
        if (j.ui.tipo.textContent !== tipoTxt) j.ui.tipo.textContent = tipoTxt;
        if (rede && Math.floor(t * 4) !== j.ultimoEnvio) {
          j.ultimoEnvio = Math.floor(t * 4);
          h.v = kmh; h.c = Math.round(j.ve.cargas * 100) / 100; h.b = j.ve.usandoNitro ? 1 : 0;
          if (k !== 'teclado') rede.enviar(k, { hud: h });
          if (j.artilheiro) rede.enviar(j.artilheiro.key, { hud: h });
        }
      }
    }
    if (t - ultimoMapa > 0.2) { ultimoMapa = t; desenharMapa(); placar(); }
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
      Incursao.iniciar({
        T: T, cena: cena, mundo: mundo, som: Som,
        jogadores: function () { return ordenados(); },
        enviar: function (key, msg) { if (rede && key !== 'teclado') rede.enviar(key, msg); },
        aviso: aviso, mensagem: mensagem, tremer: tremer, fim: mostrarFim,
        corCss: function (j) { return CORES_CSS[j.slot]; }, corHex: function (j) { return CORES[j.slot]; }
      });
      prepararMapa();
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
      proximo(loop);
    }
    // ?timer=1: roda por timer (para testar com a aba escondida, onde o navegador pausa a animação)
    var proximo = param('timer', '') === '1' ? function (f) { setTimeout(function () { f(performance.now()); }, 33); } : requestAnimationFrame.bind(window);
    proximo(loop);
  }, 50);
})();
