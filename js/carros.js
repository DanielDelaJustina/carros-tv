// CARROS: modelos (buggy e muscle car) e física de arcade.
// Modelos montados no código com perfis extrudados, tubos e rodas com cravos; peças juntadas por material
// para poucas chamadas de desenho. Frente do carro = +z.
// Uso: var m = Carros.modelo(THREE, 'buggy', 0x3aa0ff);  var v = new Carros.Veiculo(mundo, m);  v.atualizar(dt, entrada, outros);
(function () {
  var T;

  // ------------------------------------------------ materiais compartilhados
  var MAT = null, CEU = null;
  // reflexo: um "céu" pequeno em 6 lados (azul em cima, névoa quente no horizonte, areia embaixo)
  function ceuReflexo() {
    if (CEU) return CEU;
    function lado(tipo) {
      var c = document.createElement('canvas'); c.width = 64; c.height = 64;
      var g = c.getContext('2d'), gr;
      if (tipo === 'cima') { g.fillStyle = '#5f8cc4'; g.fillRect(0, 0, 64, 64); }
      else if (tipo === 'baixo') { g.fillStyle = '#b98a5c'; g.fillRect(0, 0, 64, 64); }
      else {
        gr = g.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, '#6f97c9'); gr.addColorStop(0.45, '#f0c896'); gr.addColorStop(0.52, '#c98a52'); gr.addColorStop(1, '#8a5c3a');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        g.fillStyle = 'rgba(150,80,45,.7)'; // morros no horizonte
        g.beginPath(); g.moveTo(0, 34); for (var x = 0; x <= 64; x += 8) g.lineTo(x, 26 + Math.random() * 8); g.lineTo(64, 40); g.lineTo(0, 40); g.fill();
      }
      return c;
    }
    CEU = new T.CubeTexture([lado('l'), lado('l'), lado('cima'), lado('baixo'), lado('l'), lado('l')]);
    CEU.needsUpdate = true;
    return CEU;
  }
  function phong(cor, brilho, reflexo, espec) {
    return new T.MeshPhongMaterial({ color: cor, shininess: brilho, specular: espec === undefined ? 0x444444 : espec, envMap: ceuReflexo(), reflectivity: reflexo, combine: T.MixOperation });
  }
  // versão do material com cores por vértice (sombra embaixo + poeira), usada nas peças juntadas
  var VC = {};
  function comVertice(mat) {
    if (VC[mat.uuid]) return VC[mat.uuid];
    var m = mat.clone(); m.vertexColors = true; VC[mat.uuid] = m;
    return m;
  }
  function materiais() {
    if (MAT) return MAT;
    MAT = {
      escuro: phong(0x2a2826, 18, 0.06, 0x222222),
      grafite: phong(0x45423f, 30, 0.12, 0x333333),
      metal: phong(0x9a968f, 50, 0.3, 0x666666),
      cromo: phong(0xd8d4cc, 90, 0.7, 0xffffff),
      pneu: new T.MeshLambertMaterial({ color: 0x1c1a19 }),
      vidro: phong(0x18222b, 90, 0.55, 0xbbbbbb),
      farol: new T.MeshBasicMaterial({ color: 0xfff3d0 }),
      ferrugem: phong(0x7a4a32, 10, 0.04, 0x221100),
      chapa: phong(0x5d5852, 25, 0.15, 0x333333),
      chama: new T.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }),
      chama2: new T.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })
    };
    return MAT;
  }

  // ------------------------------------------------ montador: junta peças por material
  function Montador() { this.porMat = {}; this.mats = {}; }
  var tmpO = null;
  Montador.prototype.add = function (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    if (!tmpO) tmpO = new T.Object3D();
    tmpO.position.set(x || 0, y || 0, z || 0); tmpO.rotation.set(rx || 0, ry || 0, rz || 0);
    tmpO.scale.set(sx || 1, sy || 1, sz || 1); tmpO.updateMatrix();
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(tmpO.matrix);
    var id = mat.uuid;
    (this.porMat[id] = this.porMat[id] || []).push(g);
    this.mats[id] = mat;
  };
  var BOX, CIL = {};
  function cil(n) { return CIL[n] || (CIL[n] = new T.CylinderGeometry(1, 1, 1, n)); }
  Montador.prototype.caixa = function (mat, w, h, d, x, y, z, rx, ry, rz) { this.add(BOX, mat, x, y, z, rx, ry, rz, w, h, d); };
  Montador.prototype.cil = function (mat, r, h, x, y, z, rx, ry, rz, seg) { this.add(cil(seg || 10), mat, x, y, z, rx, ry, rz, r, h, r); };
  // tubo entre dois pontos
  var vA, vB, qT, UP;
  Montador.prototype.tubo = function (mat, x1, y1, z1, x2, y2, z2, r, seg) {
    vA.set(x2 - x1, y2 - y1, z2 - z1);
    var len = vA.length(); vA.normalize();
    qT.setFromUnitVectors(UP, vA);
    tmpO.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); tmpO.quaternion.copy(qT); tmpO.scale.set(r, len, r); tmpO.updateMatrix();
    var g = cil(seg || 6).toNonIndexed(); g.applyMatrix4(tmpO.matrix);
    (this.porMat[mat.uuid] = this.porMat[mat.uuid] || []).push(g); this.mats[mat.uuid] = mat;
  };
  // perfil lateral (pontos [x=comprimento, y]) extrudado na largura; frente em +z
  Montador.prototype.perfil = function (mat, forma, largura, bisel, x, y, z) {
    var g = new T.ExtrudeGeometry(forma, { depth: largura, bevelEnabled: !!bisel, bevelThickness: bisel || 0, bevelSize: bisel || 0, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -largura / 2);
    g.rotateY(-Math.PI / 2);
    this.add(g, mat, x, y, z);
  };
  var SIMPLES = false; // robôs: cada carro vira 1 malha só (cores por vértice), sem enfeites
  var MAT_SIMPLES = null;
  Montador.prototype.malhas = function (grupo) {
    if (SIMPLES) return this.malhaUnica(grupo);
    for (var id in this.porMat) {
      var lista = this.porMat[id], tot = 0, q;
      for (q = 0; q < lista.length; q++) tot += lista[q].attributes.position.count;
      var P = new Float32Array(tot * 3), o = 0;
      for (q = 0; q < lista.length; q++) { P.set(lista[q].attributes.position.array, o); o += lista[q].attributes.position.array.length; }
      // cor por vértice: mais escuro e empoeirado perto do chão (dá peso e "sujeira de estrada")
      var C = new Float32Array(P.length), b0 = this.base || 0;
      for (var v = 0; v < P.length; v += 3) {
        var y = P[v + 1] + b0, luz = 0.55 + 0.45 * Math.min(1, Math.max(0, (y - 0.25) / 1.2));
        var po = Math.max(0, 1 - Math.max(0, (y - 0.3) / 0.8)) * 0.4;
        C[v] = luz * (1 - po) + 0.78 * po; C[v + 1] = luz * (1 - po) + 0.62 * po; C[v + 2] = luz * (1 - po) + 0.46 * po;
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(P, 3));
      g.setAttribute('color', new T.BufferAttribute(C, 3));
      g.computeVertexNormals();
      grupo.add(new T.Mesh(g, comVertice(this.mats[id])));
    }
  };
  Montador.prototype.malhaUnica = function (grupo) {
    var tot = 0, id, q, lista;
    for (id in this.porMat) for (q = 0; q < this.porMat[id].length; q++) tot += this.porMat[id][q].attributes.position.count;
    var P = new Float32Array(tot * 3), C = new Float32Array(tot * 3), o = 0, b0 = this.base || 0;
    for (id in this.porMat) {
      lista = this.porMat[id]; var cor = this.mats[id].color || { r: 1, g: 1, b: 1 };
      for (q = 0; q < lista.length; q++) {
        var a = lista[q].attributes.position.array;
        P.set(a, o);
        for (var v = 0; v < a.length; v += 3) {
          var luz = 0.55 + 0.45 * Math.min(1, Math.max(0, (a[v + 1] + b0 - 0.25) / 1.2));
          C[o + v] = cor.r * luz; C[o + v + 1] = cor.g * luz; C[o + v + 2] = cor.b * luz;
        }
        o += a.length;
      }
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3));
    g.setAttribute('color', new T.BufferAttribute(C, 3));
    g.computeVertexNormals();
    if (!MAT_SIMPLES) MAT_SIMPLES = new T.MeshLambertMaterial({ vertexColors: true });
    grupo.add(new T.Mesh(g, MAT_SIMPLES));
  };
  function forma(pts) {
    var s = new T.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i];
      if (p.length === 5) s.absarc(p[0], p[1], p[2], p[3], p[4], false); else s.lineTo(p[0], p[1]);
    }
    return s;
  }

  // ------------------------------------------------ rodas com cravos
  function geoPneu(r, w, cravos) {
    var g = new T.CylinderGeometry(r, r, w, SIMPLES ? 12 : 28, 1);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), z = p.getZ(i), y = p.getY(i), rr = Math.sqrt(x * x + z * z);
      if (rr > r * 0.98 && cravos) {
        var a = Math.atan2(z, x), k = Math.floor((a + Math.PI) / (Math.PI * 2) * 14);
        var f = k % 2 ? 1.07 : 1.0;
        p.setX(i, x * f); p.setZ(i, z * f);
      }
    }
    g.rotateZ(Math.PI / 2);
    return g;
  }
  function roda(grupo, M, x, y, z, r, w, cravos, frente, corAro) {
    var pivo = new T.Group(); pivo.position.set(x, y, z); grupo.add(pivo);
    var gira = new T.Group(); pivo.add(gira);
    gira.add(new T.Mesh(geoPneu(r, w, cravos), M.pneu));
    if (SIMPLES) return { pivo: pivo, gira: gira, frente: frente, r: r, lado: x > 0 ? 1 : -1 };
    var lado = x > 0 ? 1 : -1;
    var aro = new T.Mesh(cil(10), corAro || M.metal); aro.rotation.z = Math.PI / 2; aro.scale.set(r * 0.58, w * 1.04, r * 0.58); gira.add(aro);
    var cubo = new T.Mesh(cil(6), M.escuro); cubo.rotation.z = Math.PI / 2; cubo.scale.set(r * 0.2, w * 1.12, r * 0.2); gira.add(cubo);
    // raios do aro (mostram o giro)
    for (var k = 0; k < 3; k++) {
      var raio = new T.Mesh(BOX, M.escuro); raio.scale.set(w * 1.08, r * 0.9, r * 0.1); raio.rotation.x = k * Math.PI / 3; gira.add(raio);
    }
    return { pivo: pivo, gira: gira, frente: frente, r: r, lado: lado };
  }

  // ------------------------------------------------ enfeites: número na porta, antena com bandeira, brilho dos faróis
  var texBrilho = null;
  function brilho() {
    if (texBrilho) return texBrilho;
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    texBrilho = new T.Texture(c); texBrilho.needsUpdate = true;
    return texBrilho;
  }
  function luzes(g, lista, cor, opac, tam) {
    if (SIMPLES) return { opacity: 0 };
    var mat = new T.SpriteMaterial({ map: brilho(), color: cor, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: opac });
    for (var i = 0; i < lista.length; i++) {
      var s = new T.Sprite(mat); s.position.set(lista[i][0], lista[i][1], lista[i][2]); s.scale.set(tam, tam, 1); g.add(s);
    }
    return mat;
  }
  function cssCor(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }
  function decal(g, num, cor, x, y, z, tam) {
    if (SIMPLES) return;
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var cx = c.getContext('2d');
    cx.beginPath(); cx.arc(64, 64, 58, 0, 6.29); cx.fillStyle = '#f2ece2'; cx.fill();
    cx.lineWidth = 10; cx.strokeStyle = cssCor(cor); cx.stroke();
    cx.fillStyle = '#1b1612'; cx.font = 'bold 84px Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(String(num), 64, 70);
    var tx = new T.Texture(c); tx.needsUpdate = true;
    var mat = new T.MeshLambertMaterial({ map: tx, transparent: true, alphaTest: 0.3 });
    for (var s = -1; s <= 1; s += 2) {
      var p = new T.Mesh(new T.PlaneGeometry(tam, tam), mat);
      p.position.set(x * s, y, z); p.rotation.y = s * Math.PI / 2; g.add(p);
    }
  }
  function antena(g, mt, M, cor, x, y, z) {
    if (SIMPLES) return null;
    mt.cil(M.escuro, 0.018, 1.6, x, y + 0.8, z, 0, 0, 0, 5);
    var geo = new T.PlaneGeometry(0.62, 0.36, 8, 1); geo.translate(0.31, 0, 0);
    var b = new T.Mesh(geo, new T.MeshLambertMaterial({ color: cor, side: T.DoubleSide }));
    b.position.set(x, y + 1.42, z); b.rotation.y = Math.PI / 2; // tremula para trás
    g.add(b);
    return { mesh: b, base: new Float32Array(geo.attributes.position.array) };
  }

  // ------------------------------------------------ BUGGY (gaiola + metralhadora giratória)
  function buggy(cor, num) {
    var M = materiais(), g = new T.Group(), mt = new Montador();
    var mCor = phong(cor, 70, 0.22, 0x777777);
    var mFreio = new T.MeshBasicMaterial({ color: 0x551010 });
    var P = Math.PI, i;
    // banheira / assoalho
    mt.perfil(mCor, forma([[-1.75, 0.55], [-1.85, 1.05], [-0.9, 1.15], [0.7, 1.15], [1.75, 0.95], [2.05, 0.7], [1.6, 0.5]]), 1.7, 0.05, 0, 0, 0);
    mt.caixa(M.escuro, 1.9, 0.12, 3.6, 0, 0.5, 0);
    // chapas de blindagem laterais com rebites
    for (var s = -1; s <= 1; s += 2) {
      mt.caixa(M.chapa, 0.05, 0.42, 1.5, s * 0.93, 0.82, -0.75);
      for (i = 0; i < 5; i++) mt.cil(M.cromo, 0.035, 0.04, s * 0.96, 0.98, -1.35 + i * 0.3, 0, 0, P / 2, 6);
      mt.caixa(M.escuro, 0.5, 0.45, 0.04, s * 1.22, 0.62, -1.98);              // para-barro
      mt.caixa(M.ferrugem, 0.28, 0.42, 0.2, s * 0.62, 1.32, -1.8);             // galões
    }
    mt.caixa(M.chapa, 1.5, 0.07, 0.65, 0, 0.58, 2.02, -0.45);                    // protetor de cárter
    mt.caixa(M.chapa, 1.25, 0.05, 0.75, 0, 1.08, 1.25, 0.19);                    // capô de chapa
    // motor traseiro exposto
    mt.caixa(M.grafite, 1.1, 0.55, 0.9, 0, 1.35, -1.25);
    mt.caixa(M.metal, 0.9, 0.12, 0.7, 0, 1.68, -1.25);
    for (i = 0; i < 4; i++) mt.cil(M.cromo, 0.07, 0.5, -0.36 + i * 0.24, 1.78, -1.25 + (i % 2) * 0.12, 0, 0, 0, 6);
    mt.tubo(M.cromo, 0.45, 1.3, -1.6, 0.6, 1.9, -2.0, 0.08); mt.tubo(M.cromo, -0.45, 1.3, -1.6, -0.6, 1.9, -2.0, 0.08);
    // bancos e volante
    mt.caixa(M.escuro, 0.55, 0.5, 0.55, 0.38, 1.35, -0.25, -0.2); mt.caixa(M.escuro, 0.55, 0.5, 0.55, -0.38, 1.35, -0.25, -0.2);
    mt.cil(M.escuro, 0.18, 0.04, -0.38, 1.55, 0.35, -1.0, 0, 0, 10);
    // gaiola
    var cg = M.escuro, R = 0.075, xs = [-0.82, 0.82];
    for (i = 0; i < 2; i++) {
      var x = xs[i];
      mt.tubo(cg, x, 1.1, 0.75, x * 0.85, 2.05, 0.15, R);
      mt.tubo(cg, x, 1.1, -0.85, x * 0.85, 2.05, -0.65, R);
      mt.tubo(cg, x * 0.85, 2.05, 0.15, x * 0.85, 2.05, -0.65, R);
      mt.tubo(cg, x, 1.1, 0.75, x * 0.95, 0.85, 1.95, R);
      mt.tubo(cg, x, 1.1, -0.85, x * 0.9, 1.15, -1.9, R);
      mt.tubo(cg, x * 0.85, 2.05, -0.65, x * 0.9, 1.15, -1.9, R);
    }
    mt.tubo(cg, -0.7, 2.05, 0.15, 0.7, 2.05, 0.15, R); mt.tubo(cg, -0.7, 2.05, -0.65, 0.7, 2.05, -0.65, R);
    mt.tubo(cg, -0.7, 2.05, 0.15, 0.7, 2.05, -0.65, R);
    // barra de faróis no teto
    for (i = 0; i < 4; i++) {
      var fx = -0.54 + i * 0.36;
      mt.cil(M.grafite, 0.11, 0.16, fx, 2.17, 0.2, P / 2, 0, 0, 8);
      mt.cil(M.farol, 0.085, 0.02, fx, 2.17, 0.29, P / 2, 0, 0, 8);
    }
    // para-choque de tubo e faróis baixos
    mt.tubo(M.cromo, -0.95, 0.75, 2.1, 0.95, 0.75, 2.1, 0.09); mt.tubo(M.cromo, -0.6, 0.6, 2.15, -0.6, 1.0, 2.0, 0.07); mt.tubo(M.cromo, 0.6, 0.6, 2.15, 0.6, 1.0, 2.0, 0.07);
    mt.cil(M.cromo, 0.15, 0.1, -0.55, 0.95, 1.98, P / 2); mt.cil(M.cromo, 0.15, 0.1, 0.55, 0.95, 1.98, P / 2);
    mt.cil(M.farol, 0.12, 0.02, -0.55, 0.95, 2.04, P / 2); mt.cil(M.farol, 0.12, 0.02, 0.55, 0.95, 2.04, P / 2);
    // estepe atrás e placa
    mt.add(geoPneu(0.45, 0.3, true), M.pneu, 0, 1.55, -2.05, 0, P / 2, 0);
    mt.caixa(M.cromo, 0.6, 0.22, 0.04, 0, 0.75, -1.92);
    var band = antena(g, mt, M, cor, -0.8, 2.05, -0.65);
    mt.malhas(g);
    decal(g, num, cor, 0.965, 0.82, -0.75, 0.42);
    var luzFarol = luzes(g, [[-0.55, 0.95, 2.1], [0.55, 0.95, 2.1], [-0.54, 2.17, 0.33], [-0.18, 2.17, 0.33], [0.18, 2.17, 0.33], [0.54, 2.17, 0.33]], 0xfff1c8, 0.8, 0.75);
    // luzes de freio
    var f1 = new T.Mesh(BOX, mFreio); f1.scale.set(0.3, 0.12, 0.05); f1.position.set(-0.6, 1.02, -1.88); g.add(f1);
    var f2 = f1.clone(); f2.position.x = 0.6; g.add(f2);
    var luzFreio = luzes(g, [[-0.6, 1.02, -1.95], [0.6, 1.02, -1.95]], 0xff2a10, 0.2, 0.8);
    // metralhadora giratória no teto
    var arma = new T.Group(); arma.position.set(0, 2.32, -0.3); g.add(arma);
    var am = new Montador(); am.base = 2;
    am.caixa(M.grafite, 0.5, 0.3, 0.6, 0, 0, 0); am.caixa(M.ferrugem, 0.35, 0.28, 0.45, 0.42, 0, -0.1);
    am.cil(M.grafite, 0.16, 0.4, 0, 0.05, 0.45, P / 2);
    am.caixa(M.chapa, 0.7, 0.4, 0.05, 0, 0.12, 0.3, -0.15);               // escudo do atirador
    am.cil(M.escuro, 0.05, 0.4, 0, -0.3, 0, 0, 0, 0, 6);
    am.malhas(arma);
    var canos = new T.Group(); canos.position.set(0, 0.05, 0.6); arma.add(canos);
    var cm = new Montador(); cm.base = 2;
    for (i = 0; i < 6; i++) { var a = i / 6 * P * 2; cm.cil(M.escuro, 0.035, 1.1, Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.55, P / 2, 0, 0, 5); }
    cm.cil(M.metal, 0.13, 0.08, 0, 0, 0.3, P / 2); cm.cil(M.metal, 0.13, 0.08, 0, 0, 1.0, P / 2);
    cm.malhas(canos);
    var rodas = [
      roda(g, M, -1.2, 0.72, 1.35, 0.72, 0.56, true, true), roda(g, M, 1.2, 0.72, 1.35, 0.72, 0.56, true, true),
      roda(g, M, -1.22, 0.76, -1.3, 0.76, 0.62, true, false), roda(g, M, 1.22, 0.76, -1.3, 0.76, 0.62, true, false)
    ];
    return finalizar(g, rodas, mFreio, [[0.6, 1.9, -2.05], [-0.6, 1.9, -2.05]], arma, canos, 'buggy', mCor, { bandeira: band, luzFreio: luzFreio, luzFarol: luzFarol });
  }

  // ------------------------------------------------ MUSCLE CAR (espinhos + lançador de foguetes)
  function muscle(cor, num) {
    var M = materiais(), g = new T.Group(), mt = new Montador();
    var mCor = phong(0x1c1b1f, 90, 0.12, 0x999999);
    var mFaixa = phong(cor, 70, 0.25, 0x777777);
    var mFreio = new T.MeshBasicMaterial({ color: 0x551010 });
    var P = Math.PI, i, s;
    var corpo = forma([
      [-2.3, 0.32], [-2.38, 0.98], [-1.75, 1.1], [-0.6, 1.1], [0.9, 1.08], [2.2, 0.98], [2.42, 0.78], [2.38, 0.32],
      [1.97, 0.32], [1.45, 0.42, 0.52, 0, P], [-0.93, 0.32], [-1.45, 0.42, 0.52, 0, P], [-2.3, 0.32]
    ]);
    mt.perfil(mCor, corpo, 2.0, 0.07, 0, 0, 0);
    // cabine (vidros) e teto
    mt.perfil(M.vidro, forma([[-1.55, 1.08], [-0.85, 1.58], [0.25, 1.6], [0.95, 1.08]]), 1.62, 0.04, 0, 0, 0);
    mt.caixa(mCor, 1.5, 0.08, 1.05, 0, 1.64, -0.3);
    // faixas na cor do jogador (capô, teto, porta-malas)
    mt.caixa(mFaixa, 0.28, 0.03, 1.5, -0.32, 1.13, 1.55, -0.08); mt.caixa(mFaixa, 0.28, 0.03, 1.5, 0.32, 1.13, 1.55, -0.08);
    mt.caixa(mFaixa, 0.28, 0.03, 1.0, -0.32, 1.69, -0.3); mt.caixa(mFaixa, 0.28, 0.03, 1.0, 0.32, 1.69, -0.3);
    mt.caixa(mFaixa, 0.28, 0.03, 0.6, -0.32, 1.13, -1.95); mt.caixa(mFaixa, 0.28, 0.03, 0.6, 0.32, 1.13, -1.95);
    // compressor saindo do capô
    mt.caixa(M.cromo, 0.7, 0.3, 0.6, 0, 1.25, 1.2); mt.caixa(M.escuro, 0.8, 0.2, 0.45, 0, 1.5, 1.22);
    for (i = 0; i < 2; i++) mt.cil(M.cromo, 0.12, 0.25, -0.18 + i * 0.36, 1.68, 1.22, 0, 0, 0, 8);
    for (i = 0; i < 4; i++) mt.caixa(M.cromo, 0.03, 0.04, 0.5, -0.27 + i * 0.18, 1.63, 1.22);
    // grade no para-brisa e chapas nas janelas laterais (blindagem)
    for (i = 0; i < 5; i++) mt.tubo(M.escuro, -0.56 + i * 0.28, 1.12, 0.98, -0.5 + i * 0.25, 1.6, 0.3, 0.03, 5);
    for (s = -1; s <= 1; s += 2) {
      mt.caixa(M.chapa, 0.05, 0.38, 1.25, s * 0.83, 1.32, -0.32, 0, 0, -s * 0.2);
      for (i = 0; i < 3; i++) mt.caixa(M.escuro, 0.06, 0.05, 1.0, s * 0.845, 1.22 + i * 0.1, -0.32, 0, 0, -s * 0.2);
      mt.caixa(mCor, 0.2, 0.1, 0.12, s * 1.1, 1.18, 0.75); mt.caixa(M.cromo, 0.04, 0.12, 0.14, s * 1.2, 1.18, 0.75); // retrovisor
    }
    // aerofólio
    mt.caixa(mFaixa, 1.9, 0.07, 0.4, 0, 1.38, -2.05); mt.caixa(M.escuro, 0.08, 0.3, 0.25, -0.75, 1.2, -2.05); mt.caixa(M.escuro, 0.08, 0.3, 0.25, 0.75, 1.2, -2.05);
    // grade, para-choques e espinhos
    mt.caixa(M.escuro, 1.6, 0.3, 0.06, 0, 0.62, 2.43);
    for (i = 0; i < 6; i++) mt.caixa(M.cromo, 0.03, 0.26, 0.04, -0.6 + i * 0.24, 0.62, 2.45);
    mt.caixa(M.metal, 2.1, 0.22, 0.25, 0, 0.42, 2.45);
    mt.caixa(M.cromo, 2.0, 0.16, 0.18, 0, 0.42, -2.42);
    var cone = new T.ConeGeometry(1, 1, 6);
    for (i = 0; i < 5; i++) mt.add(cone, M.cromo, -0.8 + i * 0.4, 0.42, 2.72, P / 2, 0, 0, 0.07, 0.4, 0.07);
    for (i = 0; i < 6; i++) {
      var zz = -1.6 + i * 0.6;
      mt.add(cone, M.cromo, 1.08, 0.75, zz, 0, 0, -P / 2, 0.06, 0.35, 0.06);
      mt.add(cone, M.cromo, -1.08, 0.75, zz, 0, 0, P / 2, 0.06, 0.35, 0.06);
    }
    for (i = 0; i < 3; i++) mt.add(cone, M.cromo, -0.5 + i * 0.5, 1.82, -0.75, -0.3, 0, 0, 0.05, 0.3, 0.05);
    // escapamentos laterais
    mt.cil(M.cromo, 0.09, 1.3, 1.08, 0.35, -0.2, P / 2, 0, 0, 8); mt.cil(M.cromo, 0.09, 1.3, -1.08, 0.35, -0.2, P / 2, 0, 0, 8);
    // faróis com grade de proteção
    mt.cil(M.farol, 0.12, 0.05, -0.68, 0.74, 2.42, P / 2); mt.cil(M.farol, 0.12, 0.05, 0.68, 0.74, 2.42, P / 2);
    for (s = -1; s <= 1; s += 2) { mt.caixa(M.escuro, 0.32, 0.03, 0.04, s * 0.68, 0.79, 2.47); mt.caixa(M.escuro, 0.32, 0.03, 0.04, s * 0.68, 0.69, 2.47); }
    var band = antena(g, mt, M, cor, -0.85, 1.1, -1.85);
    mt.malhas(g);
    decal(g, num, cor, 1.085, 0.72, 0.1, 0.48);
    var luzFarol = luzes(g, [[-0.68, 0.74, 2.5], [0.68, 0.74, 2.5]], 0xfff1c8, 0.85, 0.9);
    var f1 = new T.Mesh(BOX, mFreio); f1.scale.set(0.55, 0.14, 0.05); f1.position.set(-0.6, 0.85, -2.38); g.add(f1);
    var f2 = f1.clone(); f2.position.x = 0.6; g.add(f2);
    var luzFreio = luzes(g, [[-0.6, 0.85, -2.45], [0.6, 0.85, -2.45]], 0xff2a10, 0.2, 0.9);
    // lançador de foguetes no teto
    var arma = new T.Group(); arma.position.set(0, 1.85, -0.2); g.add(arma);
    var am = new Montador(); am.base = 1.8;
    am.caixa(M.grafite, 0.35, 0.18, 0.5, 0, -0.05, 0);
    am.cil(M.grafite, 0.2, 1.7, 0, 0.22, 0.1, P / 2, 0, 0, 10);
    am.cil(M.escuro, 0.22, 0.12, 0, 0.22, -0.72, P / 2, 0, 0, 10);
    am.cil(M.escuro, 0.22, 0.08, 0, 0.22, 0.4, P / 2, 0, 0, 10);
    am.add(cone, M.ferrugem, 0, 0.22, 1.1, P / 2, 0, 0, 0.2, 0.4, 0.2);
    am.caixa(mFaixa, 0.06, 0.12, 0.6, 0.2, 0.22, 0.2);
    am.malhas(arma);
    var rodas = [
      roda(g, M, -1.0, 0.46, 1.45, 0.46, 0.42, false, true, M.cromo), roda(g, M, 1.0, 0.46, 1.45, 0.46, 0.42, false, true, M.cromo),
      roda(g, M, -1.02, 0.5, -1.45, 0.5, 0.52, false, false, M.cromo), roda(g, M, 1.02, 0.5, -1.45, 0.5, 0.52, false, false, M.cromo)
    ];
    return finalizar(g, rodas, mFreio, [[1.08, 0.35, -0.85], [-1.08, 0.35, -0.85]], arma, null, 'muscle', mFaixa, { bandeira: band, luzFreio: luzFreio, luzFarol: luzFarol });
  }

  // chamas do nitro + sombra falsa
  var texSombra = null;
  function finalizar(g, rodas, mFreio, escapes, arma, canos, tipo, mCor, extras) {
    var M = materiais(), chamas = [];
    var cone = new T.ConeGeometry(1, 1, 8); cone.translate(0, 0.5, 0); // base no escapamento, ponta para fora
    for (var i = 0; i < escapes.length; i++) {
      var e = escapes[i], c1 = new T.Mesh(cone, M.chama), c2 = new T.Mesh(cone, M.chama2);
      var grupo = new T.Group(); grupo.position.set(e[0], e[1], e[2]);
      grupo.rotation.x = tipo === 'buggy' ? -1.1 : -Math.PI / 2; // buggy: para trás e para cima
      c1.scale.set(0.16, 1.1, 0.16); c2.scale.set(0.09, 0.7, 0.09);
      grupo.add(c1); grupo.add(c2); grupo.visible = false;
      g.add(grupo); chamas.push(grupo);
    }
    if (!texSombra) {
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      var cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 6, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
      texSombra = new T.Texture(cv); texSombra.needsUpdate = true;
    }
    var sombra = new T.Mesh(new T.PlaneGeometry(3.4, 5.6), new T.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false }));
    sombra.rotation.x = -Math.PI / 2;
    var corpo = new T.Group(); // corpo inclina (suspensão) dentro do objeto
    while (g.children.length) corpo.add(g.children[0]);
    var raiz = new T.Group(); raiz.add(corpo);
    // rodas ficam fora do corpo inclinado
    for (i = 0; i < rodas.length; i++) raiz.add(rodas[i].pivo);
    for (i = 0; i < rodas.length; i++) { rodas[i].baseY = rodas[i].pivo.position.y; rodas[i].lx = rodas[i].pivo.position.x; rodas[i].lz = rodas[i].pivo.position.z; }
    return { obj: raiz, corpo: corpo, rodas: rodas, freio: mFreio, chamas: chamas, arma: arma, canos: canos, sombra: sombra, tipo: tipo, matCor: mCor,
      bandeira: extras.bandeira, luzFreio: extras.luzFreio, luzFarol: extras.luzFarol };
  }

  // ================================================================ FÍSICA (arcade)
  var PARAM = {
    buggy: { vmax: 34, acel: 24, giro: 2.3, aderencia: 7.5, foraEstrada: 0.93, massa: 1 },
    muscle: { vmax: 41, acel: 19, giro: 1.9, aderencia: 3.6, foraEstrada: 0.78, massa: 1.3 }
  };

  function Veiculo(mundo, modelo) {
    this.m = modelo; this.mundo = mundo;
    var pb = PARAM[modelo.tipo]; this.p = {};
    for (var kk in pb) this.p[kk] = pb[kk];
    this.x = 0; this.z = 0; this.y = 0; this.h = 0;
    this.v = 0; this.vl = 0; this.dir = 0; this.nitro = 1; this.usandoNitro = false;
    this.cargas = NITRO_MAX; this.tempoNitro = 0; this.noAr = false; this.vy = 0; this.vySubida = 0;
    this.pitch = 0; this.roll = 0; this.giroRoda = 0; this.batida = 0; this.derrapando = 0;
  }
  var NITRO_MAX = 3, NITRO_SEG = 3, NITRO_RECARGA = 9; // 3 cargas, 3 s cada, 1 carga volta a cada 9 s
  // um toque no nitro: devolve true se ativou
  Veiculo.prototype.acionarNitro = function () {
    if (this.tempoNitro > 0 || this.cargas < 1) return false;
    this.cargas -= 1; this.tempoNitro = NITRO_SEG;
    return true;
  };
  Veiculo.prototype.colocar = function (x, z, h) {
    this.x = x; this.z = z; this.h = h; this.v = 0; this.vl = 0; this.noAr = false; this.vy = 0;
    this.y = this.mundo.altura(x, z);
  };
  // entrada: {x: -1..1 (direção), a: 0/1 acelera, r: 0/1 freio/ré, n: 0/1 nitro}
  Veiculo.prototype.atualizar = function (dt, e, outros) {
    var p = this.p, mundo = this.mundo, batida = 0;
    var ep = mundo.estradaPerto(this.x, this.z);
    var naEstrada = ep.d < 7.5;
    var sup = naEstrada ? 1 : p.foraEstrada;

    // nitro: cada toque gasta 1 carga e dura NITRO_SEG segundos, acelerando sozinho
    if (this.tempoNitro > 0) this.tempoNitro -= dt;
    this.usandoNitro = this.tempoNitro > 0 && !e.r; // booleano de verdade (three.js usa visible === false)
    if (!this.usandoNitro) this.cargas = Math.min(NITRO_MAX, this.cargas + dt / NITRO_RECARGA);
    this.nitro = this.cargas / NITRO_MAX;
    var vmax = p.vmax * sup * (this.usandoNitro ? 1.45 : 1);

    // aceleração, freio e ré
    if ((e.a || this.usandoNitro) && !e.r && !this.noAr) {
      var ac = p.acel * (this.usandoNitro ? 1.9 : 1);
      if (this.v < vmax) this.v += ac * dt * Math.max(0.15, 1 - this.v / vmax);
      else this.v += (vmax - this.v) * dt * 1.5;
    } else if (e.r) {
      if (this.v > 0.5) this.v -= 38 * dt;
      else this.v = Math.max(-11, this.v - 14 * dt);
    } else {
      this.v -= this.v * dt * 0.55 + (this.v > 0 ? 1 : this.v < 0 ? -1 : 0) * Math.min(Math.abs(this.v), 2.5 * dt);
    }
    if (this.v > vmax && !this.usandoNitro) this.v -= (this.v - vmax) * dt * 2;

    // direção
    this.dir += (e.x - this.dir) * Math.min(1, dt * 9);
    var vel = Math.abs(this.v);
    var taxa = (this.noAr ? 0.25 : 1) * this.dir * p.giro * Math.min(1, vel / 9) * (1 - 0.35 * Math.min(1, vel / p.vmax)) * (this.v < 0 ? -1 : 1);
    this.h -= taxa * dt;

    // derrapagem: velocidade lateral nasce na curva e some pela aderência
    this.vl += this.v * taxa * dt * (1.15 - p.aderencia / 10) * (e.r && vel > 10 ? 1.8 : 1);
    this.vl *= Math.exp(-p.aderencia * dt * (naEstrada ? 1 : 0.8));
    this.derrapando = Math.abs(this.vl);

    var fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    var nx = this.x + (fx * this.v + rx * this.vl) * dt;
    var nz = this.z + (fz * this.v + rz * this.vl) * dt;

    // paredes do cânion: subida muito íngreme bloqueia
    var hAtual = mundo.altura(this.x, this.z), hNovo = mundo.altura(nx, nz);
    var passo = Math.sqrt((nx - this.x) * (nx - this.x) + (nz - this.z) * (nz - this.z)) || 0.001;
    if (!(this.noAr && this.y > hNovo + 0.4) && ((hNovo - hAtual) / passo > 0.7 || hNovo - this.y > 2)) {
      batida = Math.abs(this.v);
      nx = this.x; nz = this.z;
      this.v *= -0.25; this.vl *= 0.3;
    }
    // limite do mundo
    var rr = Math.sqrt(nx * nx + nz * nz);
    if (rr > 425) { nx *= 425 / rr; nz *= 425 / rr; this.v *= 0.5; }

    // obstáculos (círculos)
    var col = mundo.colisores, RC = 1.9;
    for (var i = 0; i < col.length; i++) {
      var c = col[i], dx = nx - c.x, dz = nz - c.z, lim = c.r + RC;
      if (dx * dx + dz * dz < lim * lim) {
        var d = Math.sqrt(dx * dx + dz * dz) || 0.01, ux = dx / d, uz = dz / d;
        nx = c.x + ux * lim; nz = c.z + uz * lim;
        // perde a velocidade que ia contra o obstáculo
        var vxw = fx * this.v + rx * this.vl, vzw = fz * this.v + rz * this.vl, contra = vxw * ux + vzw * uz;
        if (contra < 0) {
          batida = Math.max(batida, -contra);
          vxw -= ux * contra * 1.3; vzw -= uz * contra * 1.3;
          this.v = vxw * fx + vzw * fz; this.vl = vxw * rx + vzw * rz;
          this.v *= 0.85;
        }
      }
    }
    // outros carros
    if (outros) for (i = 0; i < outros.length; i++) {
      var o = outros[i]; if (o === this) continue;
      dx = nx - o.x; dz = nz - o.z;
      var d2 = dx * dx + dz * dz;
      if (d2 < 3.8 * 3.8) {
        d = Math.sqrt(d2) || 0.01; var emp = (3.8 - d) / 2; ux = dx / d; uz = dz / d;
        nx += ux * emp; nz += uz * emp; o.x -= ux * emp; o.z -= uz * emp;
        var tr = (this.v - o.v) * 0.3;
        if (Math.abs(tr) > 1) batida = Math.max(batida, Math.abs(tr) * 2);
        this.v -= tr / p.massa; o.v += tr / o.p.massa;
        this.vl += ux * rx * 3 + uz * rz * 3;
      }
    }
    this.x = nx; this.z = nz;

    // suspensão: altura e inclinação pelas 4 rodas
    var hf = mundo.altura(this.x + fx * 1.6, this.z + fz * 1.6), hb = mundo.altura(this.x - fx * 1.6, this.z - fz * 1.6);
    var hr = mundo.altura(this.x + rx * 1.1, this.z + rz * 1.1), hl = mundo.altura(this.x - rx * 1.1, this.z - rz * 1.1);
    if (naEstrada && ep.d < 7) { var ye = ep.y; hf = Math.max(hf, ye); hb = Math.max(hb, ye); hr = Math.max(hr, ye); hl = Math.max(hl, ye); }
    var yAlvo = (hf + hb + hr + hl) / 4, yAntes = this.y;
    // saltos: sai do chão quando o chão some embaixo subindo rápido (rampa, crista de duna)
    if (this.noAr) {
      this.vy -= 30 * dt; this.y += this.vy * dt;
      if (this.y <= yAlvo) {
        if (this.vy < -9) batida = Math.max(batida, -this.vy * 0.5);
        this.y = yAlvo; this.noAr = false; this.vy = 0;
      }
    } else {
      if (yAlvo > this.y) this.y += (yAlvo - this.y) * Math.min(1, dt * 18);
      else if (this.y - yAlvo > 0.25 && this.vyMem > 3) { this.noAr = true; this.vy = this.vyMem * 1.15; }
      else this.y += (yAlvo - this.y) * Math.min(1, dt * 9);
      this.vySubida = (this.y - yAntes) / Math.max(dt, 0.001);
      this.vyMem = Math.max(this.vySubida, (this.vyMem || 0) - 25 * dt); // lembra que estava subindo (rampa)
    }
    var pitchAlvo = this.noAr ? -Math.atan2(this.vy, Math.max(8, Math.abs(this.v))) * 0.6 : Math.atan2(hb - hf, 3.2);
    this.pitch += (pitchAlvo - this.pitch) * Math.min(1, dt * (this.noAr ? 3 : 10));
    this.roll += (Math.atan2(hl - hr, 2.2) - this.roll) * Math.min(1, dt * 10);
    this.naEstrada = naEstrada && ep.d < 7; this.yEstrada = ep.y;
    this.batida = batida;
    return batida;
  };
  // aplica o estado no modelo 3D
  Veiculo.prototype.desenhar = function (dt, t, freando) {
    var m = this.m;
    m.obj.position.set(this.x, this.y, this.z);
    m.obj.rotation.set(0, this.h, 0);
    // corpo: inclinação do terreno + balanço da aceleração e da curva
    var bal = Math.sin(t * 17 + this.x) * 0.01 * Math.min(1, Math.abs(this.v) / 20);
    m.corpo.rotation.set(this.pitch - (freando ? -0.04 : 0) - (this.usandoNitro ? 0.05 : 0), 0, this.roll + this.dir * Math.min(1, Math.abs(this.v) / 25) * 0.06 + bal);
    this.giroRoda += this.v * dt;
    var ch = Math.cos(this.h), sh = Math.sin(this.h), k = Math.min(1, dt * 20);
    for (var i = 0; i < m.rodas.length; i++) {
      var r = m.rodas[i];
      r.gira.rotation.x = this.giroRoda / r.r;
      if (r.frente) r.pivo.rotation.y = -this.dir * 0.45;
      // cada roda acompanha o chão embaixo dela
      var wx = this.x + r.lx * ch + r.lz * sh, wz = this.z - r.lx * sh + r.lz * ch, chao = this.mundo.altura(wx, wz);
      if (this.naEstrada) chao = Math.max(chao, this.yEstrada);
      var off = Math.max(-0.3, Math.min(0.35, chao + r.r - this.y - r.baseY));
      r.pivo.position.y += (r.baseY + off - r.pivo.position.y) * k;
    }
    if (m.bandeira) { // bandeira tremulando
      var bp = m.bandeira.mesh.geometry.attributes.position, bb = m.bandeira.base, vel = Math.min(1, Math.abs(this.v) / 20) * 0.6 + 0.15;
      for (var q = 0; q < bp.count; q++) { var bx = bb[q * 3]; bp.array[q * 3 + 2] = Math.sin(t * 9 - bx * 7) * bx * vel * 0.35; }
      bp.needsUpdate = true;
    }
    if (m.luzFreio) m.luzFreio.opacity = freando ? 0.95 : 0.2;
    m.freio.color.setHex(freando ? 0xff2a1a : 0x551010);
    for (i = 0; i < m.chamas.length; i++) {
      m.chamas[i].visible = this.usandoNitro;
      if (this.usandoNitro) { var s = 0.8 + Math.random() * 0.5; m.chamas[i].scale.set(s, s * (1 + Math.random() * 0.4), s); }
    }
    m.sombra.position.set(this.x, this.mundo.altura(this.x, this.z) + 0.08, this.z);
    m.sombra.rotation.z = this.h;
  };

  window.Carros = {
    iniciar: function (THREE) {
      T = THREE; BOX = new T.BoxGeometry(1, 1, 1); tmpO = new T.Object3D();
      vA = new T.Vector3(); vB = new T.Vector3(); qT = new T.Quaternion(); UP = new T.Vector3(0, 1, 0);
    },
    // robô inimigo: mesmo formato, mas leve (poucas malhas)
    modeloBot: function (tipo, cor) {
      SIMPLES = true;
      try { return tipo === 'muscle' ? muscle(cor, 0) : buggy(cor, 0); } finally { SIMPLES = false; }
    },
    modelo: function (tipo, cor, num) { return tipo === 'muscle' ? muscle(cor, num || 1) : buggy(cor, num || 1); },
    Veiculo: Veiculo,
    PARAM: PARAM
  };
})();
