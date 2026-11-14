// Passeio pelo mundo: um carro provisório roda pela estrada e a câmera acompanha.
// Controle remoto: ◀ ▶ troca a câmera, ▲ ▼ velocidade, OK pausa.
// Parâmetros: ?r=540|720|1080 (resolução, padrão 720)  ?q=0 (versão leve)
// Grava os fps no Firebase (salas/PNEUS/mundo) para o Claude ler depois.
(function () {
  function $(id) { return document.getElementById(id); }
  function param(n, pad) { var m = new RegExp('[?&]' + n + '=([^&]*)').exec(location.search); return m ? m[1] : pad; }
  window.onerror = function (msg, src, linha) {
    var d = document.createElement('div'); d.textContent = '⚠ ' + msg + ' (' + String(src || '').split('/').pop() + ':' + linha + ')';
    $('erros').appendChild(d);
    erros.push(String(msg) + ':' + linha);
  };
  var erros = [];
  var BASE = 'salas/PNEUS/mundo';
  var RES = parseInt(param('r', '720'), 10), Q = parseInt(param('q', '1'), 10);

  var T = window.THREE;
  var renderer = new T.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(RES * 16 / 9), RES, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  $('gl').appendChild(renderer.domElement);
  var cena = new T.Scene();
  var camera = new T.PerspectiveCamera(60, 16 / 9, 0.5, 2200);

  var mundo, carro, sombra;

  function montarCarro() {
    var o = new T.Group();
    var mC = new T.MeshLambertMaterial({ color: 0x4a4440 }), mE = new T.MeshLambertMaterial({ color: 0x171514 });
    var mV = new T.MeshLambertMaterial({ color: 0x8a2a20 });
    function cx(w, h, d, x, y, z, m) { var b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); o.add(b); return b; }
    cx(2.2, 0.7, 4.3, 0, 0.95, 0, mC); cx(1.8, 0.6, 1.9, 0, 1.6, -0.3, mE); cx(2.25, 0.18, 0.5, 0, 1.0, 2.1, mV);
    cx(0.3, 0.3, 1.5, 0, 2.1, 0.3, mE); cx(0.5, 0.5, 0.5, 0, 2.0, -0.2, mE);
    var rodas = [], gR = new T.CylinderGeometry(0.6, 0.6, 0.5, 12);
    for (var i = 0; i < 4; i++) {
      var r = new T.Mesh(gR, mE); r.rotation.z = Math.PI / 2; r.position.set(i % 2 ? 1.25 : -1.25, 0.6, i < 2 ? 1.45 : -1.4);
      o.add(r); rodas.push(r);
    }
    cena.add(o);
    // sombra falsa (mancha escura)
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    var tx = new T.Texture(c); tx.needsUpdate = true;
    sombra = new T.Mesh(new T.PlaneGeometry(3.6, 6), new T.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2;
    cena.add(sombra);
    return { obj: o, rodas: rodas, s: 0, v: 26, h: 0, x: 0, y: 0, z: 0 };
  }

  // posição na estrada por distância percorrida
  function naEstrada(s, lado) {
    var e = mundo.estrada, f = ((s % e.total) + e.total) % e.total / e.total * e.n;
    var i = Math.floor(f), j = (i + 1) % e.n, k = f - i;
    var tx = e.tx[i] + (e.tx[j] - e.tx[i]) * k, tz = e.tz[i] + (e.tz[j] - e.tz[i]) * k;
    var x = e.px[i] + (e.px[j] - e.px[i]) * k - tz * lado, z = e.pz[i] + (e.pz[j] - e.pz[i]) * k + tx * lado;
    return { x: x, z: z, y: e.ph[i] + (e.ph[j] - e.ph[i]) * k + 0.3, h: Math.atan2(tx, tz) };
  }

  var CAMS = ['Atrás do carro', 'Rasante na lateral', 'Vista aérea', 'Volta cinematográfica', 'Parada na beira da estrada'];
  var cam = 0, pausa = false, orb = 0, alvo = new T.Vector3(), alvoSuave = new T.Vector3(), posCam = new T.Vector3(), primeiro = true;
  var parada = null;

  function trocarCam(d) {
    cam = (cam + d + CAMS.length) % CAMS.length;
    $('cam').textContent = CAMS[cam];
    primeiro = true;
    if (cam === 4) { var p = naEstrada(carro.s + 140, -11); parada = new T.Vector3(p.x, mundo.altura(p.x, p.z) + 1.7, p.z); }
  }

  function quadro(dt, t) {
    if (!pausa) {
      carro.s += carro.v * dt;
      var p = naEstrada(carro.s, 3);
      carro.x = p.x; carro.y = p.y; carro.z = p.z;
      // suaviza a direção
      var dh = p.h - carro.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      carro.h += dh * Math.min(1, dt * 8);
      carro.obj.position.set(carro.x, carro.y, carro.z);
      carro.obj.rotation.y = carro.h;
      carro.obj.position.y += Math.sin(t * 13) * 0.03;
      for (var i = 0; i < 4; i++) carro.rodas[i].rotation.x += carro.v * dt / 0.6;
      sombra.position.set(carro.x, carro.y + 0.05, carro.z); sombra.rotation.z = carro.h;
      var fx = Math.sin(carro.h), fz = Math.cos(carro.h);
      mundo.poeiraCarro(carro.x - fx * 2.2 + fz * 1.1, carro.y, carro.z - fz * 2.2 - fx * 1.1, carro.v);
      mundo.poeiraCarro(carro.x - fx * 2.2 - fz * 1.1, carro.y, carro.z - fz * 2.2 + fx * 1.1, carro.v);
      mundo.atualizar(dt, camera);
      orb += dt * 0.22;
    }
    fx = Math.sin(carro.h); fz = Math.cos(carro.h);
    var cx, cy, cz, lk = 1 - Math.exp(-dt * 4);
    alvo.set(carro.x + fx * 6, carro.y + 1.5, carro.z + fz * 6);
    if (cam === 0) { cx = carro.x - fx * 12; cz = carro.z - fz * 12; cy = carro.y + 5; }
    else if (cam === 1) { cx = carro.x + fz * 6 + fx * 3; cz = carro.z - fx * 6 + fz * 3; cy = carro.y + 1.3; alvo.set(carro.x + fx * 2, carro.y + 1.2, carro.z + fz * 2); }
    else if (cam === 2) { cx = carro.x - fx * 45; cz = carro.z - fz * 45; cy = carro.y + 55; alvo.set(carro.x + fx * 20, carro.y, carro.z + fz * 20); }
    else if (cam === 3) { cx = carro.x + Math.cos(orb) * 18; cz = carro.z + Math.sin(orb) * 18; cy = carro.y + 4 + Math.sin(orb * 0.7) * 3; alvo.set(carro.x, carro.y + 1.2, carro.z); }
    else { cx = parada.x; cy = parada.y; cz = parada.z; alvo.set(carro.x, carro.y + 1, carro.z); lk = 1;
      if (parada.distanceTo(alvo) > 150) { var pq = naEstrada(carro.s + 140, -11); parada.set(pq.x, mundo.altura(pq.x, pq.z) + 1.7, pq.z); }
      cx = parada.x; cy = parada.y; cz = parada.z; }
    cy = Math.max(cy, mundo.altura(cx, cz) + 1.2);
    if (primeiro) { posCam.set(cx, cy, cz); alvoSuave.copy(alvo); primeiro = false; }
    else { posCam.x += (cx - posCam.x) * lk; posCam.y += (cy - posCam.y) * lk; posCam.z += (cz - posCam.z) * lk; alvoSuave.lerp(alvo, lk); }
    camera.position.copy(posCam);
    camera.lookAt(alvoSuave);
    renderer.render(cena, camera);
  }

  // ---------------- fps e relatório
  var fq = 0, fDesde = 0, janela = [], k = 0, desde10 = 0;
  function medir(t) {
    fq++;
    if (t - fDesde >= 1000) {
      var f = Math.round(fq * 1000 / (t - fDesde));
      $('fps').textContent = f + ' fps';
      janela.push(f); fq = 0; fDesde = t;
    }
    if (t - desde10 >= 10000 && janela.length) {
      desde10 = t;
      var soma = 0, pior = 999;
      for (var i = 0; i < janela.length; i++) { soma += janela[i]; pior = Math.min(pior, janela[i]); }
      if (!pausa) FB.put(BASE + '/s' + (k++ % 40), { med: Math.round(soma / janela.length), pior: pior, cam: CAMS[cam], t: Math.round(t / 1000) })['catch'](function () {});
      janela = [];
    }
  }

  document.addEventListener('keydown', function (e) {
    var c = e.keyCode;
    if (c === 37) trocarCam(-1);
    else if (c === 39) trocarCam(1);
    else if (c === 38) carro.v = Math.min(60, carro.v + 6);
    else if (c === 40) carro.v = Math.max(0, carro.v - 6);
    else if (c === 13 || c === 32) pausa = !pausa;
    else return;
    e.preventDefault();
  });
  document.addEventListener('click', function () { trocarCam(1); });

  setTimeout(function () {
    try {
      mundo = Mundo.criar(T, cena, { q: Q });
    } catch (e) { window.onerror(String(e && e.stack || e), '', 0); return; }
    mundo.escalaParticulas(RES, 60);
    carro = montarCarro();
    trocarCam(0);
    $('carregando').style.display = 'none';
    FB.del(BASE)['catch'](function () {}).then(function () {
      FB.put(BASE + '/info', { ua: navigator.userAgent, r: RES, q: Q, ms: mundo.msMontagem, erros: erros, hora: new Date().toISOString() });
    });
    var ultimo = 0;
    function loop(t) {
      var dt = ultimo ? Math.min((t - ultimo) / 1000, 0.1) : 0.016;
      ultimo = t;
      medir(t);
      quadro(dt, t / 1000);
      requestAnimationFrame(loop);
    }
    // aquece partículas para a fumaça já estar subindo
    for (var i = 0; i < 120; i++) mundo.atualizar(0.1, null);
    requestAnimationFrame(loop);
  }, 50);
})();
