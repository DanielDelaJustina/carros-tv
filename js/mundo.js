// O MUNDO: cânion no deserto com estrada fechada, refinaria abandonada, torres de petróleo,
// carcaças, postes, fumaça e poeira. Tudo gerado no código (sem baixar modelos).
// Para a TV fraca: iluminação "assada" nas cores dos vértices (MeshBasicMaterial), sem sombras em tempo real,
// pedras/moitas/capim instanciados, objetos fixos juntados numa malha só.
// Uso: var m = Mundo.criar(THREE, cena, { q: 1 });  m.altura(x, z);  m.atualizar(dt, camera);
(function () {
  // ================================================================ utilidades
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(i, j) {
    var n = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) & 0xffff) / 65535;
  }
  function ruido(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oit) { // -1..1
    var s = 0, a = 0.5, f = 1, t = 0;
    for (var k = 0; k < oit; k++) { s += a * ruido(x * f + k * 17.3, y * f - k * 9.1); t += a; a *= 0.5; f *= 2.03; }
    return (s / t) * 2 - 1;
  }
  function suave(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function mix3(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function terraco(h, p) { var k = Math.floor(h / p), f = h / p - k; return (k + suave(0.45, 1, f)) * p; }

  // sol baixo, contra a câmera em boa parte da volta (luz de fim de tarde)
  var SOL = (function () { var x = -0.45, y = 0.42, z = -0.79, l = Math.sqrt(x * x + y * y + z * z); return { x: x / l, y: y / l, z: z / l }; })();
  // luz assada: ambiente azulado + sol quente
  function luz(nx, ny, nz) {
    var dif = Math.max(0, nx * SOL.x + ny * SOL.y + nz * SOL.z);
    var amb = 0.5 + 0.17 * ny;
    return [amb * 0.86 + dif * 0.74, amb * 0.88 + dif * 0.64, amb * 1.0 + dif * 0.48];
  }

  var PAL_ROCHA = [[0.78, 0.45, 0.28], [0.66, 0.34, 0.21], [0.84, 0.58, 0.38], [0.6, 0.3, 0.19], [0.87, 0.68, 0.48], [0.55, 0.3, 0.2], [0.74, 0.42, 0.26]];
  function corRocha(y, x, z) {
    var b = Math.floor((y + fbm(x * 0.03, z * 0.03, 2) * 2.5) / 3.1);
    return PAL_ROCHA[((b % 7) + 7) % 7];
  }

  function textura(T, w, h, desenhar) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    desenhar(c.getContext('2d'), w, h);
    var t = new T.Texture(c); t.needsUpdate = true;
    return t;
  }

  // ================================================================ partículas (fumaça, fogo, poeira)
  var VS_P = [
    'attribute float tam; attribute float alfa; attribute vec3 cor;',
    'uniform float escala; uniform float fogNear; uniform float fogFar;',
    'varying float vA; varying vec3 vC; varying float vF;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = min(tam * escala / -mv.z, 300.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  vA = alfa; vC = cor; vF = smoothstep(fogNear, fogFar, -mv.z);',
    '}'].join('\n');
  var FS_P = [
    'uniform sampler2D mapa; uniform vec3 fogCor; uniform float aditivo;',
    'varying float vA; varying vec3 vC; varying float vF;',
    'void main() {',
    '  vec4 t = texture2D(mapa, gl_PointCoord);',
    '  vec3 c = mix(vC * t.rgb, fogCor, vF * (1.0 - aditivo));',
    '  float a = t.a * vA * (1.0 - vF * 0.7);',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(c * mix(1.0, a, aditivo), mix(a, 1.0, aditivo));',
    '}'].join('\n');

  function Particulas(T, n, aditivo, mapa, fog) {
    this.n = n; this.prox = 0;
    var g = new T.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.tam = new Float32Array(n); this.alfa = new Float32Array(n); this.cor = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3); this.vida = new Float32Array(n); this.vmax = new Float32Array(n);
    this.t0 = new Float32Array(n); this.t1 = new Float32Array(n); this.a0 = new Float32Array(n); this.sobe = new Float32Array(n);
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    g.setAttribute('tam', new T.BufferAttribute(this.tam, 1));
    g.setAttribute('alfa', new T.BufferAttribute(this.alfa, 1));
    g.setAttribute('cor', new T.BufferAttribute(this.cor, 3));
    this.g = g;
    this.mat = new T.ShaderMaterial({
      uniforms: { mapa: { value: mapa }, escala: { value: 620 }, fogNear: { value: fog.near }, fogFar: { value: fog.far },
        fogCor: { value: fog.color }, aditivo: { value: aditivo ? 1 : 0 } },
      vertexShader: VS_P, fragmentShader: FS_P, transparent: true, depthWrite: false,
      blending: aditivo ? T.AdditiveBlending : T.NormalBlending
    });
    this.obj = new T.Points(g, this.mat);
    this.obj.frustumCulled = false;
  }
  Particulas.prototype.emitir = function (x, y, z, vx, vy, vz, vida, t0, t1, a, r, g, b) {
    var i = this.prox; this.prox = (i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.vida[i] = vida; this.vmax[i] = vida; this.t0[i] = t0; this.t1[i] = t1; this.a0[i] = a;
    this.cor[i * 3] = r; this.cor[i * 3 + 1] = g; this.cor[i * 3 + 2] = b;
  };
  Particulas.prototype.atualizar = function (dt, vento) {
    for (var i = 0; i < this.n; i++) {
      if (this.vida[i] <= 0) { this.alfa[i] = 0; continue; }
      this.vida[i] -= dt;
      var k = 1 - this.vida[i] / this.vmax[i];
      this.pos[i * 3] += (this.vel[i * 3] + vento.x * k) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + vento.z * k) * dt;
      this.tam[i] = this.t0[i] + (this.t1[i] - this.t0[i]) * k;
      this.alfa[i] = this.vida[i] <= 0 ? 0 : this.a0[i] * Math.min(1, k * 5) * (1 - k);
    }
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.tam.needsUpdate = true;
    this.g.attributes.alfa.needsUpdate = true;
    this.g.attributes.cor.needsUpdate = true;
  };

  // ================================================================ criação do mundo
  function criar(T, cena, op) {
    op = op || {};
    var Q = op.q === 0 ? 0 : 1;
    var R = rng(20261114);
    var t0 = Date.now();

    // ------------------------------------------------ estrada (laço fechado)
    var N = 900, ctrl = [], k, i;
    for (k = 0; k < 11; k++) {
      var ang = k / 11 * Math.PI * 2, rr = 235 + (R() - 0.5) * 130;
      ctrl.push(new T.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr));
    }
    var curva = new T.CatmullRomCurve3(ctrl, true, 'centripetal');
    var pts = curva.getSpacedPoints(N);
    var total = curva.getLength();
    var px = new Float32Array(N), pz = new Float32Array(N), ph = new Float32Array(N), tx = new Float32Array(N), tz = new Float32Array(N);
    for (i = 0; i < N; i++) {
      px[i] = pts[i].x; pz[i] = pts[i].z;
      ph[i] = 2.5 * Math.sin(i / N * Math.PI * 6) + 1.5 * Math.sin(i / N * Math.PI * 14 + 1);
    }
    for (i = 0; i < N; i++) {
      var a1 = (i + N - 1) % N, a2 = (i + 1) % N;
      var dx = px[a2] - px[a1], dz = pz[a2] - pz[a1], l = Math.sqrt(dx * dx + dz * dz);
      tx[i] = dx / l; tz[i] = dz / l;
    }
    // baldes para achar o ponto da estrada mais perto
    var CEL = 25, baldes = {};
    function chave(cx, cz) { return (cx + 200) * 1000 + (cz + 200); }
    for (i = 0; i < N; i++) {
      var ch = chave(Math.floor(px[i] / CEL), Math.floor(pz[i] / CEL));
      (baldes[ch] = baldes[ch] || []).push(i);
    }
    var pertoIdx = -1;
    function perto(x, z) {
      var cx = Math.floor(x / CEL), cz = Math.floor(z / CEL), melhor = 1e12, mi = -1;
      for (var r = 0; r <= 7; r++) {
        for (var ddx = -r; ddx <= r; ddx++) for (var ddz = -r; ddz <= r; ddz++) {
          if (Math.max(Math.abs(ddx), Math.abs(ddz)) !== r) continue;
          var lista = baldes[chave(cx + ddx, cz + ddz)];
          if (!lista) continue;
          for (var q = 0; q < lista.length; q++) {
            var j = lista[q], ex = px[j] - x, ez = pz[j] - z, d2 = ex * ex + ez * ez;
            if (d2 < melhor) { melhor = d2; mi = j; }
          }
        }
        if (mi >= 0 && r >= 1 && Math.sqrt(melhor) < r * CEL) break;
      }
      pertoIdx = mi;
      return mi < 0 ? 260 : Math.sqrt(melhor);
    }

    // ------------------------------------------------ atalhos de terra (cortam o miolo do circuito)
    var ATALHOS = [[0.12, 0.36, 1], [0.44, 0.66, -1], [0.72, 0.97, 1]], AM = 110;
    var apx = [], apz = [], aph = [], adx = [], adz = [], aBaldes = {};
    for (k = 0; k < ATALHOS.length; k++) {
      var i0 = Math.floor(ATALHOS[k][0] * N), i1 = Math.floor(ATALHOS[k][1] * N);
      var ax0 = px[i0], az0 = pz[i0], ax1 = px[i1], az1 = pz[i1];
      var cdx = ax1 - ax0, cdz = az1 - az0, cl = Math.sqrt(cdx * cdx + cdz * cdz), pxp = -cdz / cl, pzp = cdx / cl;
      for (var s = 0; s < AM; s++) {
        var tt = s / (AM - 1), curva2 = Math.sin(tt * Math.PI) * 28 * ATALHOS[k][2] + Math.sin(tt * Math.PI * 3) * 7;
        apx.push(ax0 + cdx * tt + pxp * curva2); apz.push(az0 + cdz * tt + pzp * curva2);
        aph.push(mix(ph[i0], ph[i1], tt) + 0.4);
      }
    }
    for (i = 0; i < apx.length; i++) {
      var ii2 = Math.min(i + 1, apx.length - 1), ii1 = Math.max(i - 1, 0);
      if (Math.floor(ii2 / AM) !== Math.floor(i / AM)) ii2 = i;
      if (Math.floor(ii1 / AM) !== Math.floor(i / AM)) ii1 = i;
      var ddx = apx[ii2] - apx[ii1], ddz = apz[ii2] - apz[ii1], dl = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
      adx.push(ddx / dl); adz.push(ddz / dl);
      var cha = chave(Math.floor(apx[i] / CEL), Math.floor(apz[i] / CEL));
      (aBaldes[cha] = aBaldes[cha] || []).push(i);
    }
    function pertoAtalho(x, z) {
      var cx = Math.floor(x / CEL), cz = Math.floor(z / CEL), melhor = 1e12, mi = -1;
      for (var ddx2 = -2; ddx2 <= 2; ddx2++) for (var ddz2 = -2; ddz2 <= 2; ddz2++) {
        var lista = aBaldes[chave(cx + ddx2, cz + ddz2)]; if (!lista) continue;
        for (var q = 0; q < lista.length; q++) { var j = lista[q], ex = apx[j] - x, ez = apz[j] - z, d2 = ex * ex + ez * ez; if (d2 < melhor) { melhor = d2; mi = j; } }
      }
      return mi < 0 ? { d: 999, h: 0, i: -1 } : { d: Math.sqrt(melhor), h: aph[mi], i: mi };
    }

    // ------------------------------------------------ terreno (grade de alturas)
    var TAM = 900, G = Q ? 144 : 108, NV = G + 1, CT = TAM / G;
    var H = new Float32Array(NV * NV), D = new Float32Array(NV * NV), M = new Float32Array(NV * NV);
    for (var gj = 0; gj < NV; gj++) for (var gi = 0; gi < NV; gi++) {
      var x = -TAM / 2 + gi * CT, z = -TAM / 2 + gj * CT;
      var d = perto(x, z), hr = pertoIdx >= 0 ? ph[pertoIdx] : 0;
      var dAt = pertoAtalho(x, z);
      if (dAt.d * 1.25 < d) { d = dAt.d * 1.25; hr = dAt.h; }
      var duna = fbm(x * 0.018, z * 0.018, 3) * 5 + fbm(x * 0.07, z * 0.07, 2) * 1.1;
      var chao = mix(hr - 0.45, hr + duna, suave(8, 32, d));
      var borda = d + fbm(x * 0.008 + 5, z * 0.008, 3) * 30;
      var m = suave(44, 100, borda);
      var alto = (50 + fbm(x * 0.012, z * 0.012 + 9, 3) * 28) * m;
      // saliências e "dentes" nas paredes
      alto += m * Math.max(0, fbm(x * 0.04, z * 0.04, 2)) * 10;
      H[gj * NV + gi] = chao + terraco(alto, 7.5);
      D[gj * NV + gi] = d; M[gj * NV + gi] = m;
    }
    var rampas = []; // {x, z, dx, dz, L, W, H, base}
    function altura(x, z) {
      var h = alturaChao(x, z);
      for (var q = 0; q < rampas.length; q++) {
        var r = rampas[q], ox = x - r.x, oz = z - r.z, u = ox * r.dx + oz * r.dz, w = -ox * r.dz + oz * r.dx;
        if (u >= 0 && u <= r.L && w >= -r.W / 2 && w <= r.W / 2) h = Math.max(h, r.base + r.H * u / r.L);
      }
      return h;
    }
    function alturaChao(x, z) {
      var fx = (x + TAM / 2) / CT, fz = (z + TAM / 2) / CT;
      var ix = Math.floor(fx), iz = Math.floor(fz);
      if (ix < 0) { ix = 0; fx = 0; } if (iz < 0) { iz = 0; fz = 0; }
      if (ix > G - 1) { ix = G - 1; fx = G; } if (iz > G - 1) { iz = G - 1; fz = G; }
      fx -= ix; fz -= iz;
      var a = H[iz * NV + ix], b = H[iz * NV + ix + 1], c = H[(iz + 1) * NV + ix], dd = H[(iz + 1) * NV + ix + 1];
      if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
      return dd + (c - dd) * (1 - fx) + (b - dd) * (1 - fz);
    }

    // cores e luz assada em cada ponto da grade
    var COR = new Float32Array(NV * NV * 3);
    for (gj = 0; gj < NV; gj++) for (gi = 0; gi < NV; gi++) {
      var idx = gj * NV + gi;
      x = -TAM / 2 + gi * CT; z = -TAM / 2 + gj * CT;
      var hL = H[gj * NV + Math.max(0, gi - 1)], hR = H[gj * NV + Math.min(G, gi + 1)];
      var hB = H[Math.max(0, gj - 1) * NV + gi], hF = H[Math.min(G, gj + 1) * NV + gi];
      var nx = hL - hR, ny = 2 * CT, nz = hB - hF, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= nl; ny /= nl; nz /= nl;
      var h = H[idx];
      var v = 0.93 + fbm(x * 0.05, z * 0.05, 2) * 0.09 + (hash(gi, gj) - 0.5) * 0.04;
      var areia = [0.88 * v, 0.67 * v, 0.46 * v];
      d = D[idx];
      if (d < 12) areia = mix3([0.6, 0.48, 0.38], areia, suave(7, 12, d)); // acostamento batido
      var rocha = corRocha(h, x, z);
      var ingreme = 1 - suave(0.72, 0.93, ny);
      var c = mix3(areia, rocha, Math.max(ingreme, M[idx] * 0.35));
      // pé da parede um pouco mais escuro (oclusão falsa)
      var oc = 1 - 0.18 * ingreme * (1 - suave(0, 20, h - (D[idx] < 60 ? 0 : 10)));
      var L = luz(nx, ny, nz);
      COR[idx * 3] = c[0] * L[0] * oc; COR[idx * 3 + 1] = c[1] * L[1] * oc; COR[idx * 3 + 2] = c[2] * L[2] * oc;
    }

    var matTerreno = new T.MeshBasicMaterial({ vertexColors: true });
    var CH = 6, S = G / CH;
    for (var cj = 0; cj < CH; cj++) for (var ci = 0; ci < CH; ci++) {
      var pos = new Float32Array((S + 1) * (S + 1) * 3), col = new Float32Array((S + 1) * (S + 1) * 3), ind = [];
      for (var lj = 0; lj <= S; lj++) for (var li = 0; li <= S; li++) {
        var gx = ci * S + li, gz = cj * S + lj, o = (lj * (S + 1) + li) * 3, src = gz * NV + gx;
        pos[o] = -TAM / 2 + gx * CT; pos[o + 1] = H[src]; pos[o + 2] = -TAM / 2 + gz * CT;
        col[o] = COR[src * 3]; col[o + 1] = COR[src * 3 + 1]; col[o + 2] = COR[src * 3 + 2];
      }
      for (lj = 0; lj < S; lj++) for (li = 0; li < S; li++) {
        var a0 = lj * (S + 1) + li, b0 = a0 + 1, c0 = a0 + S + 1, d0 = c0 + 1;
        ind.push(a0, c0, b0, c0, d0, b0);
      }
      var gt = new T.BufferGeometry();
      gt.setAttribute('position', new T.BufferAttribute(pos, 3));
      gt.setAttribute('color', new T.BufferAttribute(col, 3));
      gt.setIndex(ind);
      gt.computeBoundingSphere();
      cena.add(new T.Mesh(gt, matTerreno));
    }

    // ------------------------------------------------ asfalto
    var texEstrada = textura(T, 256, 512, function (g, w, h) {
      var rr2 = rng(5);
      g.fillStyle = '#5a524b'; g.fillRect(0, 0, w, h);
      for (var n = 0; n < 7000; n++) {
        g.fillStyle = rr2() < 0.5 ? 'rgba(20,16,14,.12)' : 'rgba(200,185,165,.10)';
        g.fillRect(rr2() * w, rr2() * h, 1 + rr2() * 3, 1 + rr2() * 3);
      }
      for (n = 0; n < 9; n++) { // remendos
        g.fillStyle = 'rgba(30,26,24,.13)';
        g.beginPath(); g.ellipse(30 + rr2() * 196, rr2() * h, 10 + rr2() * 30, 14 + rr2() * 50, rr2() * 3, 0, 6.29); g.fill();
      }
      g.strokeStyle = 'rgba(22,18,16,.6)';
      for (n = 0; n < 26; n++) { // rachaduras
        var cx = rr2() * w, cy = rr2() * h;
        g.lineWidth = 0.8 + rr2() * 1.4; g.beginPath(); g.moveTo(cx, cy);
        for (var s = 0; s < 8; s++) { cx += (rr2() - 0.5) * 22; cy += (rr2() - 0.5) * 22; g.lineTo(cx, cy); }
        g.stroke();
      }
      // faixas laterais brancas gastas
      g.fillStyle = 'rgba(225,220,205,.7)'; g.fillRect(20, 0, 7, h); g.fillRect(229, 0, 7, h);
      // faixa central amarela tracejada
      g.fillStyle = 'rgba(214,170,60,.85)'; g.fillRect(124, 30, 8, 200); g.fillRect(124, 286, 8, 200);
      // desgaste nas faixas
      for (n = 0; n < 260; n++) { g.fillStyle = 'rgba(80,72,66,.85)'; g.fillRect(rr2() * w, rr2() * h, 3 + rr2() * 8, 2 + rr2() * 6); }
      // areia soprada nas bordas
      var gr = g.createLinearGradient(0, 0, 46, 0); gr.addColorStop(0, 'rgba(205,160,110,.85)'); gr.addColorStop(1, 'rgba(205,160,110,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 46, h);
      gr = g.createLinearGradient(w, 0, w - 46, 0); gr.addColorStop(0, 'rgba(205,160,110,.85)'); gr.addColorStop(1, 'rgba(205,160,110,0)');
      g.fillStyle = gr; g.fillRect(w - 46, 0, 46, h);
      for (n = 0; n < 50; n++) {
        g.fillStyle = 'rgba(205,160,110,.35)';
        g.beginPath(); g.ellipse(rr2() < 0.5 ? rr2() * 60 : w - rr2() * 60, rr2() * h, 6 + rr2() * 18, 10 + rr2() * 40, 0, 0, 6.29); g.fill();
      }
    });
    texEstrada.wrapT = T.RepeatWrapping;
    var LARG = 7;
    var ep = new Float32Array((N + 1) * 2 * 3), eu = new Float32Array((N + 1) * 2 * 2), ei = [];
    for (i = 0; i <= N; i++) {
      var j = i % N, sx = -tz[j], sz = tx[j], yy = ph[j] + 0.3;
      ep[i * 6] = px[j] + sx * LARG; ep[i * 6 + 1] = yy; ep[i * 6 + 2] = pz[j] + sz * LARG;
      ep[i * 6 + 3] = px[j] - sx * LARG; ep[i * 6 + 4] = yy; ep[i * 6 + 5] = pz[j] - sz * LARG;
      var vv = (i * total / N) / 28;
      eu[i * 4] = 0; eu[i * 4 + 1] = vv; eu[i * 4 + 2] = 1; eu[i * 4 + 3] = vv;
      if (i < N) ei.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    var ge = new T.BufferGeometry();
    ge.setAttribute('position', new T.BufferAttribute(ep, 3));
    ge.setAttribute('uv', new T.BufferAttribute(eu, 2));
    ge.setIndex(ei);
    cena.add(new T.Mesh(ge, new T.MeshBasicMaterial({ map: texEstrada, color: 0xe6dccf })));

    // ------------------------------------------------ céu, névoa e montanhas distantes
    var corHor = new T.Color(0.93, 0.77, 0.6);
    cena.fog = new T.Fog(corHor.getHex(), 70, 430);
    var ceu = new T.Mesh(new T.SphereGeometry(1400, 24, 12), new T.ShaderMaterial({
      uniforms: { sol: { value: new T.Vector3(SOL.x, SOL.y, SOL.z) }, cHor: { value: corHor }, cZen: { value: new T.Color(0.38, 0.55, 0.78) }, cSol: { value: new T.Color(1.0, 0.82, 0.55) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 sol; uniform vec3 cHor; uniform vec3 cZen; uniform vec3 cSol; varying vec3 vDir;',
        'void main(){ vec3 d = normalize(vDir); float y = max(d.y, 0.0);',
        '  vec3 c = mix(cHor, cZen, pow(y, 0.5));',
        '  float s = max(dot(d, sol), 0.0);',
        '  c += cSol * (pow(s, 900.0) * 2.5 + pow(s, 40.0) * 0.35 + pow(s, 4.0) * 0.18);',
        '  gl_FragColor = vec4(c, 1.0); }'].join('\n'),
      side: T.BackSide, depthWrite: false, fog: false
    }));
    ceu.renderOrder = -10;
    cena.add(ceu);

    function anelMontanhas(raio, hBase, hVar, corTopo, corBase, seed) {
      var K = 120, p = [], cc = [], ii = [];
      for (var q = 0; q <= K; q++) {
        var a = q / K * Math.PI * 2;
        var hh = hBase + (Math.sin(a * 3 + seed) * 0.5 + 0.5) * hVar * 0.5 + Math.abs(fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 4)) * hVar;
        var r = raio + fbm(Math.cos(a) * 5, Math.sin(a) * 5 + seed, 2) * 60;
        p.push(Math.cos(a) * r, -40, Math.sin(a) * r, Math.cos(a) * r, hh, Math.sin(a) * r);
        cc.push(corBase[0], corBase[1], corBase[2], corTopo[0], corTopo[1], corTopo[2]);
        if (q < K) ii.push(q * 2, q * 2 + 1, q * 2 + 2, q * 2 + 1, q * 2 + 3, q * 2 + 2);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(p), 3));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(cc), 3));
      g.setIndex(ii);
      var mm = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, fog: false, side: T.DoubleSide }));
      mm.renderOrder = -5;
      cena.add(mm);
    }
    anelMontanhas(1050, 120, 260, [0.74, 0.66, 0.68], [0.9, 0.76, 0.62], 4);
    anelMontanhas(760, 90, 170, [0.72, 0.56, 0.5], [0.9, 0.74, 0.6], 1);

    // ------------------------------------------------ montador de objetos fixos (vira uma malha só)
    var partes = [];
    var GBOX = new T.BoxGeometry(1, 1, 1);
    var GCIL = new T.CylinderGeometry(1, 1, 1, 12);
    var GCIL6 = new T.CylinderGeometry(1, 1, 1, 6);
    var obj = new T.Object3D();
    function Mont(x, y, z, ry, rx, rz) {
      this.b = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(1, 1, 1));
    }
    Mont.prototype.add = function (g, x, y, z, rx, ry, rz, sx, sy, sz, cor) {
      obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); obj.scale.set(sx, sy, sz); obj.updateMatrix();
      partes.push({ g: g, m: new T.Matrix4().multiplyMatrices(this.b, obj.matrix), cor: cor });
    };
    Mont.prototype.caixa = function (w, h, d, x, y, z, cor, rx, ry, rz) { this.add(GBOX, x, y, z, rx || 0, ry || 0, rz || 0, w, h, d, cor); };
    Mont.prototype.cil = function (r, h, x, y, z, cor, rx, ry, rz, g) { this.add(g || GCIL, x, y, z, rx || 0, ry || 0, rz || 0, r, h, r, cor); };
    var up = new T.Vector3(0, 1, 0), vtmp = new T.Vector3(), qtmp = new T.Quaternion();
    Mont.prototype.viga = function (x1, y1, z1, x2, y2, z2, e, cor) {
      vtmp.set(x2 - x1, y2 - y1, z2 - z1);
      var len = vtmp.length(); vtmp.normalize();
      qtmp.setFromUnitVectors(up, vtmp);
      obj.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); obj.quaternion.copy(qtmp); obj.scale.set(e, len, e); obj.updateMatrix();
      partes.push({ g: GBOX, m: new T.Matrix4().multiplyMatrices(this.b, obj.matrix), cor: cor });
    };
    function variar(c, q) { var f = 1 + (R() - 0.5) * (q || 0.18); return [c[0] * f, c[1] * f, c[2] * f]; }

    function juntar(lista) {
      var tot = 0, gs = [], q, a;
      for (q = 0; q < lista.length; q++) {
        var g = lista[q].g.index ? lista[q].g.toNonIndexed() : lista[q].g.clone();
        g.applyMatrix4(lista[q].m);
        g.computeVertexNormals();
        gs.push(g); tot += g.attributes.position.count;
      }
      var P = new Float32Array(tot * 3), C = new Float32Array(tot * 3), o = 0;
      for (q = 0; q < gs.length; q++) {
        var pa = gs[q].attributes.position.array, na = gs[q].attributes.normal.array, cor = lista[q].cor;
        for (a = 0; a < pa.length; a += 3) {
          var x = pa[a], y = pa[a + 1], z = pa[a + 2];
          var cc = typeof cor === 'function' ? cor(x, y, z) : cor;
          var L = luz(na[a], na[a + 1], na[a + 2]);
          var oc = 0.6 + 0.4 * suave(0, 3, y - altura(x, z));
          P[o] = x; P[o + 1] = y; P[o + 2] = z;
          C[o] = cc[0] * L[0] * oc; C[o + 1] = cc[1] * L[1] * oc; C[o + 2] = cc[2] * L[2] * oc;
          o += 3;
        }
      }
      var gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(P, 3));
      gg.setAttribute('color', new T.BufferAttribute(C, 3));
      gg.computeBoundingSphere();
      return new T.Mesh(gg, new T.MeshBasicMaterial({ vertexColors: true }));
    }

    // ponto ao lado da estrada: índice, lado (+1/-1), distância
    function aoLado(idx, lado, dist) {
      idx = ((idx % N) + N) % N;
      var x = px[idx] - tz[idx] * lado * dist, z = pz[idx] + tx[idx] * lado * dist;
      return { x: x, z: z, y: altura(x, z), rot: Math.atan2(tx[idx], tz[idx]) };
    }

    var emissores = [];
    var colisores = []; // círculos {x, z, r} que os carros não atravessam
    function colide(x, z, r) { colisores.push({ x: x, z: z, r: r }); }

    // ------------------------------------------------ mesas (rochedos isolados no vale)
    var nMesas = 0, tent = 0;
    while (nMesas < 10 && tent < 200) {
      tent++;
      var pm = aoLado(Math.floor(R() * N), R() < 0.5 ? 1 : -1, 28 + R() * 18);
      if (perto(pm.x, pm.z) < 24 || pertoAtalho(pm.x, pm.z).d < 22) continue;
      var raio = 5 + R() * 6, alt = 14 + R() * 22;
      var gm = new T.CylinderGeometry(raio * 0.8, raio * 1.2, alt, 9, 6);
      var pa = gm.attributes.position;
      var fase = R() * 6;
      for (var vq = 0; vq < pa.count; vq++) {
        var vx = pa.getX(vq), vz = pa.getZ(vq), vy = pa.getY(vq);
        var an = Math.atan2(vz, vx), fr = 1 + 0.18 * Math.sin(an * 3 + fase) + 0.1 * Math.sin(an * 7 + vy * 0.3);
        var deg = 1 + 0.12 * (Math.floor((vy / alt + 0.5) * 4) % 2);
        pa.setX(vq, vx * fr * deg); pa.setZ(vq, vz * fr * deg);
      }
      (function (base) {
        new Mont(pm.x, pm.y - 2 + alt / 2, pm.z, R() * 6).add(gm, 0, 0, 0, 0, 0, 0, 1, 1, 1, function (x, y, z) { return corRocha(y - base, x, z); });
      })(pm.y);
      colide(pm.x, pm.z, raio * 1.15);
      nMesas++;
    }

    // ------------------------------------------------ refinaria abandonada
    var ferr = [[0.55, 0.32, 0.2], [0.47, 0.35, 0.27], [0.6, 0.42, 0.3], [0.42, 0.3, 0.24]];
    var cinza = [0.45, 0.42, 0.4];
    var pr = aoLado(Math.floor(N * 0.06), 1, 40);
    var ref = new Mont(pr.x, pr.y, pr.z, pr.rot);
    ref.caixa(64, 5, 40, 0, -2.3, 0, [0.5, 0.45, 0.4]); // piso de concreto
    ref.cil(6, 11, -14, 5.5, 4, ferr[0]); ref.cil(6.15, 0.6, -14, 11.2, 4, ferr[3]);
    ref.cil(5, 9, -2, 4.5, -8, ferr[1]); ref.cil(5.15, 0.6, -2, 9.2, -8, ferr[3]);
    ref.cil(7, 13, 14, 6.5, 8, ferr[2]); ref.cil(7.15, 0.6, 14, 13.2, 8, ferr[3]);
    ref.cil(5, 10, -2, 3.2, 14, ferr[0], 0, 0.4, 1.35); // tanque tombado
    for (k = 0; k < 6; k++) ref.cil(1.9, 0.5, 26, 3 + k * 4.5, -6, cinza);
    ref.cil(1.6, 27, 26, 13.5, -6, [0.5, 0.47, 0.44]);
    ref.cil(1.2, 21, 31, 10.5, 1, [0.52, 0.45, 0.4]);
    ref.cil(1.4, 36, -26, 18, -12, [0.4, 0.37, 0.35]); ref.cil(1.5, 3, -26, 34.5, -12, [0.55, 0.22, 0.17]);
    ref.cil(0.5, 34, 8, 2.5, -15, ferr[3], 0, 0, Math.PI / 2);
    ref.cil(0.45, 26, 22, 4.5, 2, ferr[1], Math.PI / 2, 0, 0);
    ref.cil(0.4, 18, -10, 7, -4, ferr[2], 0, 0.8, Math.PI / 2);
    for (k = 0; k < 4; k++) { // andaime em volta da coluna
      var ax = 26 + (k % 2 ? 3 : -3), az = -6 + (k < 2 ? 3 : -3);
      ref.caixa(0.3, 24, 0.3, ax, 12, az, [0.3, 0.27, 0.25]);
    }
    for (k = 0; k < 5; k++) { ref.caixa(6.3, 0.25, 0.25, 26, 4 + k * 5, -3, [0.3, 0.27, 0.25]); ref.caixa(6.3, 0.25, 0.25, 26, 4 + k * 5, -9, [0.3, 0.27, 0.25]); }
    ref.caixa(16, 7, 10, -18, 3.5, -20, [0.62, 0.55, 0.47]);  // galpão
    ref.caixa(17, 0.4, 11, -18, 7.6, -19, [0.45, 0.33, 0.25], 0.18, 0, 0.08);
    for (k = 0; k < 14; k++) ref.cil(0.45, 1.1, -6 + R() * 26, 0.55, 18 + R() * 6, R() < 0.5 ? [0.5, 0.25, 0.15] : [0.25, 0.35, 0.45], R() < 0.2 ? Math.PI / 2 : 0, R() * 3, 0, GCIL6);
    function pontoMundo(mont, x, y, z) { var v3 = new T.Vector3(x, y, z).applyMatrix4(mont.b); return v3; }
    var chamine = pontoMundo(ref, -26, 36.5, -12);
    [[-14, 4, 6.3], [-2, -8, 5.3], [14, 8, 7.3], [26, -6, 3.4], [31, 1, 1.6], [-26, -12, 1.8], [-22, -20, 5.5], [-14, -20, 5.5], [-2, 10, 3.8], [-2, 18, 3.8]].forEach(function (c) {
      var v3 = pontoMundo(ref, c[0], 0, c[1]); colide(v3.x, v3.z, c[2]);
    });
    emissores.push({ tipo: 'fumaca', p: chamine, taxa: 5, t0: 4, t1: 26, vida: 9, cor: 0.3, vy: 5 });
    var tTomb = pontoMundo(ref, -2, 6, 14);
    emissores.push({ tipo: 'fogo', p: tTomb, taxa: 26, raio: 3 });
    emissores.push({ tipo: 'fumaca', p: tTomb, taxa: 4, t0: 5, t1: 22, vida: 7, cor: 0.18, vy: 5 });

    // ------------------------------------------------ torres de petróleo
    function torre(mont, h, cor) {
      var b0 = 3.2, b1 = 0.7, niveis = 6, q;
      var cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (q = 0; q < 4; q++) mont.viga(cs[q][0] * b0, 0, cs[q][1] * b0, cs[q][0] * b1, h, cs[q][1] * b1, 0.32, cor);
      for (var nv = 0; nv < niveis; nv++) {
        var ya = nv / niveis * h, yb = (nv + 1) / niveis * h, ra = mix(b0, b1, nv / niveis), rb = mix(b0, b1, (nv + 1) / niveis);
        for (q = 0; q < 4; q++) {
          var c1 = cs[q], c2 = cs[(q + 1) % 4];
          mont.viga(c1[0] * rb, yb, c1[1] * rb, c2[0] * rb, yb, c2[1] * rb, 0.2, cor);
          mont.viga(c1[0] * ra, ya, c1[1] * ra, c2[0] * rb, yb, c2[1] * rb, 0.14, cor);
        }
      }
      mont.caixa(2.2, 1.2, 2.2, 0, h + 0.6, 0, cor);
    }
    var lugaresTorre = [[0.3, -1, 34], [0.33, -1, 44], [0.55, 1, 30], [0.78, -1, 38]];
    for (k = 0; k < lugaresTorre.length; k++) {
      var pt = aoLado(Math.floor(N * lugaresTorre[k][0]), lugaresTorre[k][1], lugaresTorre[k][2]);
      var caida = k === 1;
      if (pertoAtalho(pt.x, pt.z).d < 12) continue;
      if (k !== 1) colide(pt.x, pt.z, 3.6);
      torre(new Mont(pt.x, pt.y + (caida ? 2.5 : 0), pt.z, R() * 3, 0, caida ? 1.35 : 0), 22, [0.32, 0.25, 0.21]);
      if (!caida) new Mont(pt.x, pt.y, pt.z, 0).caixa(5, 1.2, 5, 0, 0.3, 0, [0.5, 0.45, 0.4]);
    }

    // ------------------------------------------------ carcaças de carros
    for (k = 0; k < 9; k++) {
      var pw = aoLado(Math.floor(R() * N), R() < 0.5 ? 1 : -1, 11 + R() * 12);
      var vira = R() < 0.25;
      if (pertoAtalho(pw.x, pw.z).d < 7) continue;
      var wm = new Mont(pw.x, pw.y + (vira ? 1.5 : 0.5), pw.z, R() * 6, (R() - 0.5) * 0.2, vira ? Math.PI : (R() - 0.5) * 0.3);
      var cb = R() < 0.5 ? [0.2, 0.17, 0.15] : [0.42, 0.25, 0.16];
      wm.caixa(2.1, 0.8, 4.3, 0, 0.4, 0, cb);
      wm.caixa(1.8, 0.6, 1.9, 0, 1.1, -0.3, [0.12, 0.1, 0.09]);
      if (R() < 0.6) wm.cil(0.5, 0.4, 1.15, 0, 1.4, [0.1, 0.1, 0.1], 0, 0, Math.PI / 2);
      colide(pw.x, pw.z, 2.3);
      if (k < 3) {
        var pfw = pontoMundo(wm, 0, 1.3, 0.5);
        emissores.push({ tipo: 'fogo', p: pfw, taxa: 14, raio: 1 });
        emissores.push({ tipo: 'fumaca', p: pfw, taxa: 2.5, t0: 3, t1: 14, vida: 6, cor: 0.15, vy: 4 });
      }
    }

    // ------------------------------------------------ postes e fios
    var fios = [], anterior = null;
    for (i = 0; i < N; i += 32) {
      var pp = aoLado(i, -1, 13);
      var quebrado = (i / 32) % 7 === 5;
      if (pertoAtalho(pp.x, pp.z).d < 6) { anterior = null; continue; }
      colide(pp.x, pp.z, 0.5);
      var pm2 = new Mont(pp.x, pp.y, pp.z, pp.rot, quebrado ? 0.5 : 0, 0);
      pm2.caixa(0.35, 10, 0.35, 0, 5, 0, [0.36, 0.27, 0.2]);
      pm2.caixa(3.2, 0.25, 0.25, 0, 9.3, 0, [0.33, 0.25, 0.19]);
      if (quebrado) { anterior = null; continue; }
      var e1 = pontoMundo(pm2, -1.4, 9.4, 0), e2 = pontoMundo(pm2, 1.4, 9.4, 0);
      if (anterior) {
        for (var w2 = 0; w2 < 2; w2++) {
          var A = anterior[w2], B = w2 ? e2 : e1;
          for (var sg = 0; sg < 8; sg++) {
            var f1 = sg / 8, f2 = (sg + 1) / 8;
            fios.push(mix(A.x, B.x, f1), mix(A.y, B.y, f1) - 1.6 * 4 * f1 * (1 - f1), mix(A.z, B.z, f1));
            fios.push(mix(A.x, B.x, f2), mix(A.y, B.y, f2) - 1.6 * 4 * f2 * (1 - f2), mix(A.z, B.z, f2));
          }
        }
      }
      anterior = [e1, e2];
    }
    var gf = new T.BufferGeometry();
    gf.setAttribute('position', new T.BufferAttribute(new Float32Array(fios), 3));
    cena.add(new T.LineSegments(gf, new T.LineBasicMaterial({ color: 0x2a2220 })));

    function rampa(x, z, dx, dz, L, W, H) {
      var base = alturaChao(x, z);
      // começa rente ao chão (sem degrau na entrada); na estrada fica um pouco abaixo do asfalto no começo
      rampas.push({ x: x, z: z, dx: dx, dz: dz, L: L, W: W, H: H, base: base });
      var g = new T.BufferGeometry(), hw = W / 2;
      // prisma: rampa (topo inclinado), lados triangulares e a face de trás
      var p = [-hw, 0, 0, hw, 0, 0, hw, H, L, -hw, 0, 0, hw, H, L, -hw, H, L,
        -hw, 0, 0, -hw, H, L, -hw, 0, L, hw, 0, 0, hw, 0, L, hw, H, L,
        -hw, 0, L, -hw, H, L, hw, H, L, -hw, 0, L, hw, H, L, hw, 0, L];
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(p), 3));
      var mr = new Mont(x, base, z, Math.atan2(dx, dz));
      mr.add(g, 0, 0, 0, 0, 0, 0, 1, 1, 1, function (xx, yy, zz) { var f = (Math.floor((yy - base) * 3) % 2) ? 0.92 : 1; return [0.62 * f, 0.45 * f, 0.3 * f]; });
      for (var s2 = -1; s2 <= 1; s2 += 2) mr.viga(s2 * (hw - 0.2), 0.05, 0, s2 * (hw - 0.2), H + 0.05, L, 0.18, [0.55, 0.52, 0.5]);
      mr.caixa(W, 0.3, 0.3, 0, H - 0.1, L, [0.85, 0.7, 0.2]); // faixa amarela na ponta
    }
    var rE = [[0.17, 3.5], [0.52, -3.5]];
    for (k = 0; k < rE.length; k++) {
      var ri = Math.floor(rE[k][0] * N), rpx = px[ri] - tz[ri] * rE[k][1], rpz = pz[ri] + tx[ri] * rE[k][1];
      rampa(rpx, rpz, tx[ri], tz[ri], 9, 5, 2.3);
    }
    for (k = 0; k < ATALHOS.length; k++) {
      var ai = k * AM + Math.floor(AM * 0.5);
      rampa(apx[ai], apz[ai], adx[ai], adz[ai], 10, 6, 2.8);
    }
    cena.add(juntar(partes));

    // ------------------------------------------------ pedras, moitas e capim (instanciados)
    var luzHemi = new T.HemisphereLight(0xdfe3ff, 0x9a7458, 0.62);
    var luzSol = new T.DirectionalLight(0xffdcb0, 0.75);
    luzSol.position.set(SOL.x * 100, SOL.y * 100, SOL.z * 100);
    cena.add(luzHemi); cena.add(luzSol);

    var cTmp = new T.Color(), densos = [];
    function instanciar(geo, mat, n, colocar) {
      var im = new T.InstancedMesh(geo, mat, n);
      im.frustumCulled = false;
      for (var q = 0; q < n; q++) {
        var r = colocar(q);
        obj.position.set(r.x, r.y, r.z); obj.rotation.set(r.rx || 0, r.ry || 0, r.rz || 0); obj.scale.set(r.sx, r.sy, r.sz); obj.updateMatrix();
        im.setMatrixAt(q, obj.matrix);
        if (r.cor && im.setColorAt) { cTmp.setRGB(r.cor[0], r.cor[1], r.cor[2]); im.setColorAt(q, cTmp); }
      }
      cena.add(im);
      return im;
    }
    function geoPedra(seed, det) {
      var g = new T.IcosahedronGeometry(1, det), p = g.attributes.position, mapa = {}, rr3 = rng(seed);
      for (var q = 0; q < p.count; q++) {
        var key = Math.round(p.getX(q) * 100) + ',' + Math.round(p.getY(q) * 100) + ',' + Math.round(p.getZ(q) * 100);
        if (!mapa[key]) mapa[key] = 0.75 + rr3() * 0.45;
        var f = mapa[key];
        p.setXYZ(q, p.getX(q) * f, p.getY(q) * f * (p.getY(q) < 0 ? 0.6 : 1), p.getZ(q) * f);
      }
      g.computeVertexNormals();
      return g;
    }
    function lugarVale(dMin, dMax) {
      for (var t = 0; t < 30; t++) {
        var pv = aoLado(Math.floor(R() * N), R() < 0.5 ? 1 : -1, dMin + Math.pow(R(), 1.4) * (dMax - dMin));
        if (perto(pv.x, pv.z) > 10.5 && pertoAtalho(pv.x, pv.z).d > 7) return pv;
      }
      return pv;
    }
    var matPedra = new T.MeshLambertMaterial({ color: 0xffffff });
    var nP = Q ? 150 : 90;
    for (k = 0; k < 2; k++) {
      instanciar(geoPedra(11 + k, 0), matPedra, nP, function () {
        var pv = lugarVale(11, 75), s = 0.35 + Math.pow(R(), 3) * (R() < 0.15 ? 7 : 3.5);
        var sx = s * (0.8 + R() * 0.6), sz = s * (0.8 + R() * 0.5);
        if (s > 1.3) colide(pv.x, pv.z, Math.max(sx, sz) * 0.8);
        return { x: pv.x, y: pv.y + s * 0.15, z: pv.z, ry: R() * 6, rx: (R() - 0.5) * 0.5, rz: (R() - 0.5) * 0.5,
          sx: sx, sy: s * (0.5 + R() * 0.6), sz: sz, cor: variar(PAL_ROCHA[Math.floor(R() * 7)], 0.25) };
      });
    }
    var geoMoita = geoPedra(31, 1);
    densos.push(instanciar(geoMoita, new T.MeshLambertMaterial({ color: 0xffffff }), Q ? 420 : 220, function () {
      var pv = lugarVale(11, 60), s = 0.5 + R() * 0.9;
      var cores = [[0.48, 0.44, 0.26], [0.55, 0.47, 0.3], [0.42, 0.36, 0.24], [0.6, 0.52, 0.34]];
      return { x: pv.x, y: pv.y + s * 0.2, z: pv.z, ry: R() * 6, sx: s * (1 + R() * 0.6), sy: s * (0.5 + R() * 0.4), sz: s * (1 + R() * 0.6), cor: variar(cores[Math.floor(R() * 4)], 0.2) };
    }));
    // capim seco: 3 planos cruzados com textura recortada
    var texCapim = textura(T, 64, 64, function (g, w, h) {
      var rr4 = rng(9);
      for (var n = 0; n < 34; n++) {
        var bx = w / 2 + (rr4() - 0.5) * 16, ang = (rr4() - 0.5) * 1.6, len = 30 + rr4() * 30;
        g.strokeStyle = ['#c9a86a', '#b38f55', '#ddc08a', '#9c7c48'][n % 4]; g.lineWidth = 1.5 + rr4() * 1.5;
        g.beginPath(); g.moveTo(bx, h); g.quadraticCurveTo(bx + Math.sin(ang) * len * 0.3, h - len * 0.6, bx + Math.sin(ang) * len, h - Math.cos(ang) * len); g.stroke();
      }
    });
    var gCap = new T.BufferGeometry(), cp = [], cu = [], cn = [];
    for (k = 0; k < 3; k++) {
      var aa = k * Math.PI / 3, cxx = Math.cos(aa) * 0.8, czz = Math.sin(aa) * 0.8;
      cp.push(-cxx, 0, -czz, cxx, 0, czz, cxx, 1.1, czz, -cxx, 0, -czz, cxx, 1.1, czz, -cxx, 1.1, -czz);
      cu.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      for (var nn = 0; nn < 6; nn++) cn.push(0, 1, 0);
    }
    gCap.setAttribute('position', new T.BufferAttribute(new Float32Array(cp), 3));
    gCap.setAttribute('uv', new T.BufferAttribute(new Float32Array(cu), 2));
    gCap.setAttribute('normal', new T.BufferAttribute(new Float32Array(cn), 3));
    densos.push(instanciar(gCap, new T.MeshLambertMaterial({ map: texCapim, alphaTest: 0.5, side: T.DoubleSide }), Q ? 1100 : 500, function () {
      var pv = lugarVale(10, 55), s = 0.7 + R() * 0.9;
      return { x: pv.x, y: pv.y - 0.1, z: pv.z, ry: R() * 6, sx: s, sy: s * (0.7 + R() * 0.6), sz: s, cor: variar([1, 1, 1], 0.3) };
    }));
    for (k = 0; k < densos.length; k++) densos[k].total = densos[k].count;

    // ------------------------------------------------ partículas
    var texFumaca = textura(T, 64, 64, function (g, w, h) {
      var rr5 = rng(3);
      for (var n = 0; n < 9; n++) {
        var cx = 20 + rr5() * 24, cy = 20 + rr5() * 24, r = 12 + rr5() * 10;
        var gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    });
    var texFogo = textura(T, 32, 32, function (g, w, h) {
      var gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    var fumaca = new Particulas(T, Q ? 1100 : 600, false, texFumaca, cena.fog);
    var fogo = new Particulas(T, Q ? 700 : 400, true, texFogo, cena.fog);
    var poeira = new Particulas(T, Q ? 500 : 280, false, texFumaca, cena.fog);
    cena.add(poeira.obj); cena.add(fumaca.obj); cena.add(fogo.obj);

    // colunas de fumaça ao longe (como na imagem de referência)
    var longe = [[0.18, 1, 150], [0.46, -1, 170], [0.7, 1, 140]];
    for (k = 0; k < longe.length; k++) {
      var pl = aoLado(Math.floor(N * longe[k][0]), longe[k][1], longe[k][2]);
      emissores.push({ tipo: 'fumaca', p: new T.Vector3(pl.x, pl.y, pl.z), taxa: 3, t0: 18, t1: 70, vida: 14, cor: 0.24, vy: 9, grande: true });
      emissores.push({ tipo: 'fogo', p: new T.Vector3(pl.x, pl.y + 2, pl.z), taxa: 10, raio: 5, grande: true });
    }

    var vento = { x: 2.2, z: 1.2 };
    function atualizar(dt, camera) {
      for (var q = 0; q < emissores.length; q++) {
        var e = emissores[q];
        e.acc = (e.acc || 0) + dt * e.taxa;
        while (e.acc >= 1) {
          e.acc -= 1;
          if (e.tipo === 'fumaca') {
            var cz = e.cor + R() * 0.08;
            fumaca.emitir(e.p.x + (R() - 0.5) * 2, e.p.y, e.p.z + (R() - 0.5) * 2, (R() - 0.5) * 1.5, e.vy * (0.7 + R() * 0.6), (R() - 0.5) * 1.5,
              e.vida * (0.8 + R() * 0.4), e.t0, e.t1, e.grande ? 0.6 : 0.75, cz, cz * 0.95, cz * 0.9);
          } else {
            var rr6 = e.raio;
            fogo.emitir(e.p.x + (R() - 0.5) * rr6, e.p.y + R() * 0.5, e.p.z + (R() - 0.5) * rr6, (R() - 0.5), 3 + R() * 3, (R() - 0.5),
              0.5 + R() * 0.5, e.grande ? 7 : 2.6, e.grande ? 3 : 0.8, 0.9, 1.0, 0.42 + R() * 0.2, 0.12);
          }
        }
      }
      // poeira no ar perto da(s) câmera(s)
      var cams = !camera ? [] : camera.length !== undefined ? camera : [camera];
      if (cams.length) {
        poeira.acc = (poeira.acc || 0) + dt * 22;
        while (poeira.acc >= 1) {
          poeira.acc -= 1;
          var cm = cams[Math.floor(R() * cams.length)];
          var a = R() * 6.28, r = 16 + R() * 45, x = cm.position.x + Math.cos(a) * r, z = cm.position.z + Math.sin(a) * r;
          poeira.emitir(x, altura(x, z) + R() * 1.5, z, 3 + R() * 2, 0.3 + R() * 0.6, 1 + R(), 3 + R() * 2, 1.5, 5, 0.1, 0.92, 0.78, 0.6);
        }
        ceu.position.copy(cams[0].position);
      }
      fumaca.atualizar(dt, vento); fogo.atualizar(dt, { x: 0, z: 0 }); poeira.atualizar(dt, vento);
    }
    function escalaParticulas(alturaPx, fov) {
      var esc = alturaPx / 2 / Math.tan(fov * Math.PI / 360);
      fumaca.mat.uniforms.escala.value = esc; fogo.mat.uniforms.escala.value = esc; poeira.mat.uniforms.escala.value = esc;
    }
    // poeira levantada por um carro
    function poeiraCarro(x, y, z, vel) {
      if (R() > Math.min(1, vel / 25)) return;
      poeira.emitir(x + (R() - 0.5) * 1.5, y + 0.3, z + (R() - 0.5) * 1.5, (R() - 0.5) * 2, 0.8 + R(), (R() - 0.5) * 2, 1.4 + R(), 1.5, 7, 0.45, 0.88, 0.72, 0.55);
    }

    return {
      altura: altura,
      perto: perto,
      colisores: colisores,
      // ponto da estrada mais perto: {i, d, x, z, y, h}
      estradaPerto: function (x, z) { var d = perto(x, z), i = pertoIdx < 0 ? 0 : pertoIdx; return { i: i, d: d, x: px[i], z: pz[i], y: ph[i] + 0.3, h: Math.atan2(tx[i], tz[i]) }; },
      aoLado: aoLado,
      atalhos: { px: apx, pz: apz, n: AM, qtd: ATALHOS.length },
      rampas: rampas,
      pertoAtalho: pertoAtalho,
      estrada: { n: N, px: px, pz: pz, ph: ph, tx: tx, tz: tz, total: total, largura: LARG * 2 },
      sol: SOL,
      atualizar: atualizar,
      escalaParticulas: escalaParticulas,
      // céu acompanha a câmera que vai desenhar agora
      verCamera: function (cam) { ceu.position.copy(cam.position); },
      // fração de capim e moitas desenhados (1 = tudo)
      densidade: function (f) { for (var q = 0; q < densos.length; q++) densos[q].count = Math.max(1, Math.floor(densos[q].total * f)); },
      poeiraCarro: poeiraCarro,
      fx: { fogo: fogo, fumaca: fumaca, poeira: poeira },
      texFogo: texFogo,
      msMontagem: Date.now() - t0
    };
  }

  window.Mundo = { criar: criar };
})();
