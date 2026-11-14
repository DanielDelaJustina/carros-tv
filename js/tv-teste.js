// Teste da TV: mede quantos quadros por segundo a TV aguenta (2D e 3D) e o atraso do controle
// pelo celular (Firebase e WebRTC). Estilo antigo de JS (var/function) por causa do navegador de 2019.
// Parâmetros: ?pular=1 (pula o desempenho)  ?rapido=1 (etapas curtas, para testar no computador)
(function () {
  var SALA = 'PNEUS';
  var BASE = 'salas/' + SALA;
  var params = location.search;
  var PULAR = params.indexOf('pular=1') >= 0;
  var SEG = params.indexOf('rapido=1') >= 0 ? 2 : 6; // segundos medidos em cada etapa

  function $(id) { return document.getElementById(id); }

  var res = {
    hora: new Date().toISOString(),
    ua: navigator.userAgent,
    janela: window.innerWidth + 'x' + window.innerHeight,
    tela: screen.width + 'x' + screen.height,
    dpr: window.devicePixelRatio || 1,
    rtc: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection),
    fps: {},
    erros: []
  };

  function erro(t) {
    var d = document.createElement('div');
    d.textContent = '⚠ ' + t;
    $('erros').appendChild(d);
    res.erros.push(String(t));
  }
  window.onerror = function (msg, src, linha) { erro(msg + ' (' + String(src || '').split('/').pop() + ':' + linha + ')'); };

  function etapa(t) { $('etapa').textContent = t; }

  // ---------------------------------------------------------------- contador de fps
  var fpsQuadros = 0, fpsDesde = 0;
  function contarFps(t) {
    fpsQuadros++;
    if (t - fpsDesde >= 1000) {
      $('fps').textContent = Math.round(fpsQuadros * 1000 / (t - fpsDesde)) + ' fps';
      fpsQuadros = 0; fpsDesde = t;
    }
  }

  // ---------------------------------------------------------------- informações do WebGL
  function infoWebGL() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return null;
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var c2 = document.createElement('canvas');
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        webgl2: !!c2.getContext('webgl2')
      };
    } catch (e) { return { erro: String(e) }; }
  }

  // ---------------------------------------------------------------- carrega o Three.js (r128, se falhar tenta r110)
  function carregarScript(url, cb) {
    var s = document.createElement('script');
    s.src = url;
    s.onload = function () { cb(true); };
    s.onerror = function () { cb(false); };
    document.body.appendChild(s);
  }
  function carregarThree(cb) {
    carregarScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', function () {
      if (window.THREE && window.THREE.WebGLRenderer) { res.three = 'r128'; return cb(true); }
      erro('Three r128 não carregou, tentando r110');
      carregarScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r110/three.min.js', function () {
        res.three = window.THREE ? 'r110' : 'nenhum';
        cb(!!window.THREE);
      });
    });
  }

  // ---------------------------------------------------------------- mede fps de uma etapa
  // roda desenhar(dt, t) por 1 s de aquecimento + SEG segundos, e devolve {fps, lentos%}
  function medir(desenhar, fim) {
    var t0 = null, ultimo = 0, quadros = 0, lentos = 0, inicioMedida = 0;
    function quadro(t) {
      if (t0 === null) { t0 = t; ultimo = t; }
      var dt = (t - ultimo) / 1000;
      ultimo = t;
      contarFps(t);
      desenhar(Math.min(dt, 0.1), t / 1000);
      var dec = (t - t0) / 1000;
      if (dec >= 1) {
        if (!inicioMedida) inicioMedida = t;
        else { quadros++; if (dt > 0.05) lentos++; }
      }
      if (dec < 1 + SEG) requestAnimationFrame(quadro);
      else fim({ fps: quadros && t > inicioMedida ? Math.round(quadros * 1000 / (t - inicioMedida)) : 0, lentos: quadros ? Math.round(lentos * 100 / quadros) : 0 });
    }
    requestAnimationFrame(quadro);
  }

  // ================================================================ cena 2D (canvas)
  var c2, ctx, chao2d, sprites2d = [], carros2d = [], poeira2d = [];
  function montar2D() {
    c2 = $('c2d');
    c2.width = 1920; c2.height = 1080;
    ctx = c2.getContext('2d');

    chao2d = document.createElement('canvas');
    chao2d.width = 1920; chao2d.height = 1080;
    var g = chao2d.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 1080);
    gr.addColorStop(0, '#d9a066'); gr.addColorStop(1, '#b97a45');
    g.fillStyle = gr; g.fillRect(0, 0, 1920, 1080);
    for (var i = 0; i < 4000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,50,20,.12)' : 'rgba(255,230,190,.12)';
      g.fillRect(Math.random() * 1920, Math.random() * 1080, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    g.strokeStyle = '#6e5a4a'; g.lineWidth = 140;
    g.beginPath(); g.ellipse ? g.ellipse(960, 540, 700, 380, 0, 0, Math.PI * 2) : g.arc(960, 540, 400, 0, Math.PI * 2); g.stroke();
    for (i = 0; i < 60; i++) { // pedras
      var x = Math.random() * 1920, y = Math.random() * 1080, r = 10 + Math.random() * 30;
      g.fillStyle = '#7a4a2a'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#a0683e'; g.beginPath(); g.arc(x - r * .25, y - r * .25, r * .6, 0, Math.PI * 2); g.fill();
    }

    var cores = ['#3b3b3b', '#2b2b2b', '#b8352b', '#c98a12'];
    for (i = 0; i < cores.length; i++) {
      var s = document.createElement('canvas'); s.width = 60; s.height = 104;
      var sg = s.getContext('2d');
      sg.fillStyle = '#111'; sg.fillRect(2, 12, 12, 24); sg.fillRect(46, 12, 12, 24); sg.fillRect(2, 70, 12, 24); sg.fillRect(46, 70, 12, 24);
      sg.fillStyle = cores[i]; sg.fillRect(10, 4, 40, 96);
      sg.fillStyle = '#9fc4d8'; sg.fillRect(14, 28, 32, 16);
      sg.fillStyle = '#555'; sg.fillRect(26, 46, 8, 34);
      sprites2d.push(s);
    }
    for (i = 0; i < 120; i++) carros2d.push({ x: Math.random() * 1920, y: Math.random() * 1080, a: Math.random() * 6.28, v: 120 + Math.random() * 200, s: sprites2d[i % 4] });
    for (i = 0; i < 400; i++) poeira2d.push({ x: Math.random() * 1920, y: Math.random() * 1080, r: 4 + Math.random() * 14, vx: -20 + Math.random() * 40, vy: -20 + Math.random() * 40 });
  }
  function desenhar2D(dt, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(chao2d, 0, 0);
    var i, c;
    for (i = 0; i < carros2d.length; i++) {
      c = carros2d[i];
      c.a += dt * 0.8;
      c.x += Math.sin(c.a) * c.v * dt; c.y -= Math.cos(c.a) * c.v * dt;
      if (c.x < -60) c.x += 2040; if (c.x > 1980) c.x -= 2040; if (c.y < -60) c.y += 1200; if (c.y > 1140) c.y -= 1200;
      ctx.setTransform(Math.cos(c.a), Math.sin(c.a), -Math.sin(c.a), Math.cos(c.a), c.x, c.y);
      ctx.drawImage(c.s, -30, -52);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e8c79a';
    for (i = 0; i < poeira2d.length; i++) {
      c = poeira2d[i];
      c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x < 0) c.x += 1920; if (c.x > 1920) c.x -= 1920; if (c.y < 0) c.y += 1080; if (c.y > 1080) c.y -= 1080;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================ cena 3D (Three.js)
  var T, renderer, cena, camera, sol, carros3d = [], poeira, poeiraVel, eu;
  var RAIO = 70; // raio da estrada

  function ruido(x, z) {
    return Math.sin(x * 0.05) * Math.cos(z * 0.043) * 3 + Math.sin(x * 0.13 + z * 0.1) * 1.2 + Math.cos(z * 0.21 - x * 0.07) * 0.6;
  }
  function suave(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function altura(x, z) {
    var r = Math.sqrt(x * x + z * z);
    var h = ruido(x, z) * suave(5, 16, Math.abs(r - RAIO));
    if (r > 120) h += (r - 120) * 0.9; // paredes do cânion
    return h;
  }
  function setAttr(g, nome, attr) { if (g.setAttribute) g.setAttribute(nome, attr); else g.addAttribute(nome, attr); }
  function geo(nome) { return T[nome + 'BufferGeometry'] || T[nome + 'Geometry']; }

  function montar3D() {
    T = window.THREE;
    var VC = T.VertexColors !== undefined ? T.VertexColors : true;
    renderer = new T.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xe8b98a);
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    $('gl').appendChild(renderer.domElement);

    cena = new T.Scene();
    cena.fog = new T.Fog(0xe8b98a, 50, 190);
    camera = new T.PerspectiveCamera(60, 16 / 9, 0.5, 400);

    cena.add(new T.HemisphereLight(0xfff1dd, 0x8a5a3a, 0.75));
    sol = new T.DirectionalLight(0xffe2b8, 0.9);
    sol.position.set(60, 100, 40);
    sol.shadow.mapSize.width = 1024; sol.shadow.mapSize.height = 1024;
    var sc = sol.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 260;
    cena.add(sol); cena.add(sol.target);

    // chão
    var TAM = 320, N = 110;
    var g = new (geo('Plane'))(TAM, TAM, N, N);
    g.rotateX(-Math.PI / 2);
    var pos = g.attributes.position, cores = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i), h = altura(x, z);
      pos.setY(i, h);
      var v = 0.9 + Math.random() * 0.12 + h * 0.01;
      cores[i * 3] = 0.85 * v; cores[i * 3 + 1] = 0.6 * v; cores[i * 3 + 2] = 0.38 * v;
    }
    g.computeVertexNormals();
    setAttr(g, 'color', new T.BufferAttribute(cores, 3));
    var chao = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: VC }));
    chao.receiveShadow = true;
    cena.add(chao);

    // estrada
    var estrada = new T.Mesh(new (geo('Ring'))(RAIO - 5, RAIO + 5, 160, 1), new T.MeshLambertMaterial({ color: 0x6b5a4c }));
    estrada.rotation.x = -Math.PI / 2; estrada.position.y = 0.06; estrada.receiveShadow = true;
    cena.add(estrada);

    // pedras
    var gPedra = new (geo('Dodecahedron'))(1, 0);
    var mats = [0x8a4f2c, 0xa5653a, 0x6e3f24].map(function (c) { return new T.MeshLambertMaterial({ color: c, flatShading: true }); });
    for (i = 0; i < 170; i++) {
      var ang = Math.random() * 6.283, r = 10 + Math.random() * 140;
      if (Math.abs(r - RAIO) < 10) r += 20;
      var p = new T.Mesh(gPedra, mats[i % 3]);
      var e = 0.5 + Math.random() * Math.random() * 5;
      p.scale.set(e * (0.8 + Math.random() * 0.5), e * (0.6 + Math.random()), e);
      p.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      p.position.y = altura(p.position.x, p.position.z) + e * 0.3;
      p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      p.castShadow = true; p.receiveShadow = true;
      cena.add(p);
    }
    // mesas do cânion
    var gMesa = new (geo('Cylinder'))(7, 11, 30, 7);
    for (i = 0; i < 14; i++) {
      ang = i / 14 * 6.283 + Math.random() * 0.2;
      var m = new T.Mesh(gMesa, mats[i % 3]);
      m.position.set(Math.cos(ang) * 112, 10, Math.sin(ang) * 112);
      m.scale.set(1, 0.6 + Math.random() * 0.8, 1);
      m.castShadow = true;
      cena.add(m);
    }
    // refinaria abandonada
    var mMetal = new T.MeshLambertMaterial({ color: 0x7d7268 });
    for (i = 0; i < 6; i++) {
      var tq = new T.Mesh(new (geo('Cylinder'))(2 + i % 2, 2 + i % 2, 8 + i * 3, 10), mMetal);
      tq.position.set(30 + i * 4.5, (8 + i * 3) / 2, -25 + (i % 2) * 5);
      tq.castShadow = true;
      cena.add(tq);
    }

    // carros
    var coresCarro = [0x3a3a3a, 0x222222, 0xb8352b, 0xb8352b, 0xc98a12, 0xc98a12];
    for (i = 0; i < 6; i++) {
      var c = carro(coresCarro[i]);
      c.ang = i * 0.12; c.vel = 24 + i * 1.5; c.lat = (i % 2 ? 2.5 : -2.5);
      c.x = 0; c.z = 0; c.h = 0; c.v = 0;
      cena.add(c.obj);
      carros3d.push(c);
    }
    eu = carros3d[0];

    // poeira
    var NP = 600, gp = new T.BufferGeometry(), pp = new Float32Array(NP * 3);
    poeiraVel = new Float32Array(NP * 4); // vx, vy, vz, vida
    for (i = 0; i < NP; i++) { pp[i * 3 + 1] = -100; }
    setAttr(gp, 'position', new T.BufferAttribute(pp, 3));
    poeira = new T.Points(gp, new T.PointsMaterial({ color: 0xe0c090, size: 1.6, transparent: true, opacity: 0.55, depthWrite: false }));
    poeira.frustumCulled = false;
    cena.add(poeira);
  }

  function carro(cor) {
    var o = new T.Group();
    var mCorpo = new T.MeshLambertMaterial({ color: cor });
    var mEsc = new T.MeshLambertMaterial({ color: 0x151515 });
    var corpo = new T.Mesh(new (geo('Box'))(2.2, 0.8, 4.2), mCorpo); corpo.position.y = 0.9; corpo.castShadow = true; o.add(corpo);
    var cab = new T.Mesh(new (geo('Box'))(1.7, 0.6, 1.8), mEsc); cab.position.set(0, 1.6, -0.3); cab.castShadow = true; o.add(cab);
    var arma = new T.Mesh(new (geo('Box'))(0.3, 0.3, 1.6), mEsc); arma.position.set(0, 2.05, 0.4); o.add(arma);
    var gr = new (geo('Cylinder'))(0.55, 0.55, 0.45, 10);
    var rodas = [];
    for (var i = 0; i < 4; i++) {
      var r = new T.Mesh(gr, mEsc);
      r.rotation.z = Math.PI / 2;
      r.position.set(i % 2 ? 1.2 : -1.2, 0.55, i < 2 ? 1.4 : -1.4);
      o.add(r); rodas.push(r);
    }
    return { obj: o, rodas: rodas };
  }

  var ctrl = { x: 0, a: 0, s: 0 }, livre = false, teclas = {};
  var proxPoeira = 0;
  function emitirPoeira(c, dt) {
    if (Math.abs(c.v) < 4) return;
    var pos = poeira.geometry.attributes.position.array;
    var n = pos.length / 3;
    for (var k = 0; k < 2; k++) {
      var i = proxPoeira; proxPoeira = (proxPoeira + 1) % n;
      pos[i * 3] = c.x - Math.sin(c.h) * 2.2 + (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = altura(c.x, c.z) + 0.5;
      pos[i * 3 + 2] = c.z - Math.cos(c.h) * 2.2 + (Math.random() - 0.5) * 2;
      poeiraVel[i * 4] = (Math.random() - 0.5) * 3; poeiraVel[i * 4 + 1] = 1 + Math.random() * 2; poeiraVel[i * 4 + 2] = (Math.random() - 0.5) * 3;
      poeiraVel[i * 4 + 3] = 1.5;
    }
  }
  function desenhar3D(dt, t) {
    var i, c;
    // jogador livre (controlado pelo celular ou teclado)
    if (livre) {
      var x = ctrl.x, a = ctrl.a;
      if (teclas[37]) x = -1; if (teclas[39]) x = 1; if (teclas[38]) a = 1;
      var alvo = a ? 30 : 0;
      eu.v += (alvo - eu.v) * Math.min(1, dt * (a ? 0.9 : 1.6));
      eu.h -= x * dt * 1.9 * Math.min(1, eu.v / 8);
      eu.x += Math.sin(eu.h) * eu.v * dt;
      eu.z += Math.cos(eu.h) * eu.v * dt;
      var rr = Math.sqrt(eu.x * eu.x + eu.z * eu.z);
      if (rr > 125) { eu.x *= 125 / rr; eu.z *= 125 / rr; eu.v *= 0.9; }
    }
    for (i = 0; i < carros3d.length; i++) {
      c = carros3d[i];
      if (!(livre && c === eu)) {
        c.ang += c.vel * dt / RAIO;
        var raio = RAIO + c.lat + Math.sin(t * 0.7 + i) * 1.5;
        c.x = Math.cos(c.ang) * raio; c.z = Math.sin(c.ang) * raio;
        c.h = Math.atan2(-Math.sin(c.ang), Math.cos(c.ang));
        c.v = c.vel;
      }
      c.obj.position.set(c.x, altura(c.x, c.z), c.z);
      c.obj.rotation.y = c.h;
      for (var k = 0; k < 4; k++) c.rodas[k].rotation.x += c.v * dt / 0.55;
      emitirPoeira(c, dt);
    }
    var pos = poeira.geometry.attributes.position.array;
    for (i = 0; i < poeiraVel.length / 4; i++) {
      if (poeiraVel[i * 4 + 3] <= 0) continue;
      poeiraVel[i * 4 + 3] -= dt;
      pos[i * 3] += poeiraVel[i * 4] * dt; pos[i * 3 + 1] += poeiraVel[i * 4 + 1] * dt; pos[i * 3 + 2] += poeiraVel[i * 4 + 2] * dt;
      if (poeiraVel[i * 4 + 3] <= 0) pos[i * 3 + 1] = -100;
    }
    poeira.geometry.attributes.position.needsUpdate = true;

    // câmera atrás do meu carro
    var fx = Math.sin(eu.h), fz = Math.cos(eu.h);
    var cx = eu.x - fx * 11, cz = eu.z - fz * 11;
    camera.position.set(cx, Math.max(altura(cx, cz), altura(eu.x, eu.z)) + 5, cz);
    camera.lookAt(eu.x + fx * 6, altura(eu.x, eu.z) + 1.5, eu.z + fz * 6);
    sol.position.set(eu.x + 40, 90, eu.z + 30);
    sol.target.position.set(eu.x, 0, eu.z);
    renderer.render(cena, camera);
  }
  function resolucao(h, sombras) {
    renderer.setSize(Math.round(h * 16 / 9), h, false);
    if (renderer.shadowMap.enabled !== sombras) {
      renderer.shadowMap.enabled = sombras;
      sol.castShadow = sombras;
      cena.traverse(function (o) { if (o.material) o.material.needsUpdate = true; });
    }
  }

  // ================================================================ painel de resultados
  var linhas = [
    { id: 'c2d', nome: '2D (canvas) em 1080p' },
    { id: 'p540', nome: '3D em 540p' },
    { id: 'p720', nome: '3D em 720p' },
    { id: 'p1080', nome: '3D em 1080p' },
    { id: 'p720s', nome: '3D em 720p + sombras' }
  ];
  function selo(r) {
    if (!r) return '<span class="selo esp">…</span>';
    if (r.na) return '<span class="selo esp">n/d</span>';
    var cls = r.fps >= 45 ? 'bom' : r.fps >= 28 ? 'ok' : 'ruim';
    var txt = r.fps >= 45 ? 'liso' : r.fps >= 28 ? 'jogável' : 'travando';
    return '<span class="selo ' + cls + '">' + txt + '</span>';
  }
  function painel() {
    var h = '';
    for (var i = 0; i < linhas.length; i++) {
      var r = res.fps[linhas[i].id];
      h += '<tr><td>' + linhas[i].nome + '</td><td class="n">' + (r && !r.na ? r.fps + ' fps' : '') + '</td><td>' +
        (r && !r.na ? r.lentos + '% quadros lentos' : '') + '</td><td>' + selo(r) + '</td></tr>';
    }
    $('tabela').innerHTML = h;
    var w = res.webgl;
    $('info').innerHTML = 'Placa: ' + (w ? (w.renderer || w.erro) + ' · textura máx ' + w.maxTex + (w.webgl2 ? ' · WebGL2' : ' · só WebGL1') : 'SEM WebGL') +
      '<br>Tela ' + res.janela + ' (dpr ' + res.dpr + ') · WebRTC: ' + (res.rtc ? 'existe' : 'NÃO existe') + ' · Three ' + (res.three || '-');
  }

  function salvar() { FB.put(BASE + '/tv', res)['catch'](function (e) { erro('salvar: ' + e); }); }

  // ================================================================ sequência do teste
  function rodarDesempenho(fim) {
    $('painel').classList.remove('escondido');
    painel();
    var fila = [];
    fila.push(function (prox) {
      etapa('2D em 1080p');
      $('c2d').classList.remove('escondido'); $('gl').classList.add('escondido');
      medir(desenhar2D, function (r) { res.fps.c2d = r; painel(); prox(); });
    });
    var etapas3d = [['p540', 540, false, '3D em 540p'], ['p720', 720, false, '3D em 720p'], ['p1080', 1080, false, '3D em 1080p'], ['p720s', 720, true, '3D em 720p com sombras']];
    etapas3d.forEach(function (e) {
      fila.push(function (prox) {
        if (!renderer) { res.fps[e[0]] = { na: true }; painel(); return prox(); }
        etapa(e[3]);
        $('c2d').classList.add('escondido'); $('gl').classList.remove('escondido');
        resolucao(e[1], e[2]);
        medir(desenhar3D, function (r) { res.fps[e[0]] = r; painel(); prox(); });
      });
    });
    var i = 0;
    function prox() { if (i < fila.length) fila[i++](prox); else fim(); }
    prox();
  }

  function melhorResolucao() {
    var op = [[1080, 'p1080'], [720, 'p720'], [540, 'p540']];
    for (var i = 0; i < op.length; i++) { var r = res.fps[op[i][1]]; if (r && r.fps >= 45) return op[i][0]; }
    for (i = 0; i < op.length; i++) { r = res.fps[op[i][1]]; if (r && r.fps >= 28) return op[i][0]; }
    return 540;
  }

  // ================================================================ modo controle (celular dirige o carro)
  var canal = 'Firebase', ultimoPing = null, ultimoQuer = null, pc = null, dc = null, rtcQuer = null, respondido = false, rtcEstado = '-';
  var resCel = null, rtcEstadoCel = null;
  var RTCPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;

  function aplicarCtrl(d) {
    if (!d || d.s === undefined || d.s <= ctrl.s) return;
    ctrl.x = d.x || 0; ctrl.a = d.a || 0; ctrl.s = d.s;
  }

  function mostrarCtl() {
    var h = 'Controle chegando por: <b>' + canal + '</b><br>';
    if (resCel) {
      h += 'Atraso pelo <b>Firebase</b>: ' + (resCel.fb ? resCel.fb.med + ' ms ida e volta (≈' + Math.round(resCel.fb.med / 2) + ' ms só ida)' : '—') + '<br>';
      h += 'Atraso pelo <b>WebRTC</b>: ' + (resCel.rtc ? resCel.rtc.med + ' ms ida e volta (≈' + Math.round(resCel.rtc.med / 2) + ' ms só ida)' : (resCel.rtcEstado || '—')) + '<br>';
    } else h += 'Esperando o celular entrar…<br>';
    h += '<span style="color:#9b8a78">WebRTC na TV: ' + (RTCPC ? rtcEstado : 'não existe') + '</span>';
    $('ctl').innerHTML = h;
  }

  function esperarICE(p, ms) {
    return new Promise(function (ok) {
      if (p.iceGatheringState === 'complete') return ok();
      var t = setTimeout(ok, ms);
      p.onicecandidate = function (e) { if (!e.candidate) { clearTimeout(t); ok(); } };
    });
  }
  function desc(d) { return window.RTCSessionDescription ? new RTCSessionDescription({ type: d.type, sdp: d.sdp }) : { type: d.type, sdp: d.sdp }; }

  function iniciarRTC(quer) {
    if (!RTCPC) { FB.put(BASE + '/t/offer', { quer: quer, erro: 'TV sem WebRTC' }); return; }
    if (pc) { try { pc.close(); } catch (e) {} }
    rtcQuer = quer; respondido = false; rtcEstado = 'criando oferta';
    mostrarCtl();
    pc = new RTCPC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    var meu = pc;
    dc = pc.createDataChannel('c', { ordered: false, maxRetransmits: 0 });
    dc.onopen = function () { canal = 'WebRTC'; rtcEstado = 'conectado'; mostrarCtl(); };
    dc.onclose = function () { if (meu === pc) { canal = 'Firebase'; rtcEstado = 'fechado'; mostrarCtl(); } };
    dc.onmessage = function (e) {
      var m = JSON.parse(e.data);
      if (m.ping !== undefined) { try { dc.send(JSON.stringify({ pong: m.ping })); } catch (er) {} }
      if (m.ctrl) aplicarCtrl(m.ctrl);
    };
    pc.oniceconnectionstatechange = function () { if (meu === pc) { rtcEstado = 'ICE ' + pc.iceConnectionState; mostrarCtl(); } };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return esperarICE(meu, 4000); })
      .then(function () {
        rtcEstado = 'oferta enviada'; mostrarCtl();
        return FB.put(BASE + '/t/offer', { quer: quer, type: meu.localDescription.type, sdp: meu.localDescription.sdp });
      })['catch'](function (e) { rtcEstado = 'erro: ' + e; erro('WebRTC: ' + e); FB.put(BASE + '/t/offer', { quer: quer, erro: String(e) }); mostrarCtl(); });
  }

  function aoMudarC(d) {
    if (!d) return;
    if (d.ctrl && canal === 'Firebase') aplicarCtrl(d.ctrl);
    if (d.ping !== undefined && d.ping !== ultimoPing) { ultimoPing = d.ping; FB.put(BASE + '/t/pong', d.ping); }
    if (d.quer && d.quer !== ultimoQuer) { ultimoQuer = d.quer; iniciarRTC(d.quer); }
    if (d.answer && pc && d.answer.quer === rtcQuer && !respondido) {
      respondido = true; rtcEstado = 'resposta recebida';
      pc.setRemoteDescription(desc(d.answer))['catch'](function (e) { erro('WebRTC resposta: ' + e); });
    }
    if (d.res) { resCel = d.res; res.celular = d.res; mostrarCtl(); }
  }

  var ultimoSalvo = 0;
  function modoControle() {
    etapa('Agora pegue o celular');
    painel();
    $('repetir').classList.remove('escondido');
    $('qrbox').classList.remove('escondido');
    $('ctl').classList.remove('escondido');
    var link = location.href.replace(/tv-teste\.html.*$/, 'celular-teste.html');
    $('link').textContent = link.replace(/^https?:\/\//, '');
    if (window.QRCode) new QRCode($('qr'), { text: link, width: 300, height: 300 });
    mostrarCtl();

    if (renderer) {
      $('c2d').classList.add('escondido'); $('gl').classList.remove('escondido');
      $('painel').className = 'painel mini';
      resolucao(melhorResolucao(), false);
      livre = true;
      eu.x = RAIO; eu.z = 0; eu.h = Math.PI; eu.v = 0;
      var loop = function (t) {
        contarFps(t);
        desenhar3D(Math.min((t - (loop.u || t)) / 1000, 0.1), t / 1000);
        loop.u = t;
        if (resCel && t - ultimoSalvo > 5000) { ultimoSalvo = t; salvar(); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    FB.listen(BASE + '/c', aoMudarC);
    $('repetir').focus();
  }

  // ================================================================ início
  document.addEventListener('keydown', function (e) { teclas[e.keyCode] = true; });
  document.addEventListener('keyup', function (e) { teclas[e.keyCode] = false; });
  $('repetir').onclick = function () { location.href = location.pathname + '?r=' + Date.now(); };

  res.webgl = infoWebGL();
  painel();
  etapa('Limpando a sala…');
  FB.del(BASE)['catch'](function () {}).then(function () {
    etapa('Carregando o 3D…');
    montar2D();
    carregarThree(function (ok) {
      if (ok && res.webgl) {
        try { montar3D(); } catch (e) { erro('montar 3D: ' + e); renderer = null; }
      }
      if (PULAR) { modoControle(); return; }
      rodarDesempenho(function () {
        salvar();
        etapa('Desempenho medido!');
        setTimeout(modoControle, 4000);
      });
    });
  });
})();
