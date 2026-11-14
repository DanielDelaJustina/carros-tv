// CARROS: modelos (buggy e muscle car) e física de arcade.
// Modelos montados no código com perfis extrudados, tubos e rodas com cravos; peças juntadas por material
// para poucas chamadas de desenho. Frente do carro = +z.
// Uso: var m = Carros.modelo(THREE, 'buggy', 0x3aa0ff);  var v = new Carros.Veiculo(mundo, m);  v.atualizar(dt, entrada, outros);
(function () {
  var T;

  // ------------------------------------------------ materiais compartilhados
  var MAT = null;
  function materiais() {
    if (MAT) return MAT;
    MAT = {
      escuro: new T.MeshLambertMaterial({ color: 0x2a2826 }),
      grafite: new T.MeshLambertMaterial({ color: 0x3d3b39 }),
      metal: new T.MeshLambertMaterial({ color: 0x8d8a86 }),
      cromo: new T.MeshLambertMaterial({ color: 0xc9c4bc, emissive: 0x222018 }),
      pneu: new T.MeshLambertMaterial({ color: 0x1a1817 }),
      vidro: new T.MeshLambertMaterial({ color: 0x1d2a33, emissive: 0x0a1218 }),
      farol: new T.MeshBasicMaterial({ color: 0xfff3d0 }),
      ferrugem: new T.MeshLambertMaterial({ color: 0x6e4430 }),
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
  Montador.prototype.malhas = function (grupo) {
    for (var id in this.porMat) {
      var lista = this.porMat[id], tot = 0, q;
      for (q = 0; q < lista.length; q++) tot += lista[q].attributes.position.count;
      var P = new Float32Array(tot * 3), o = 0;
      for (q = 0; q < lista.length; q++) { P.set(lista[q].attributes.position.array, o); o += lista[q].attributes.position.array.length; }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(P, 3));
      g.computeVertexNormals();
      grupo.add(new T.Mesh(g, this.mats[id]));
    }
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
    var g = new T.CylinderGeometry(r, r, w, 28, 1);
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
    var lado = x > 0 ? 1 : -1;
    var aro = new T.Mesh(cil(10), corAro || M.metal); aro.rotation.z = Math.PI / 2; aro.scale.set(r * 0.58, w * 1.04, r * 0.58); gira.add(aro);
    var cubo = new T.Mesh(cil(6), M.escuro); cubo.rotation.z = Math.PI / 2; cubo.scale.set(r * 0.2, w * 1.12, r * 0.2); gira.add(cubo);
    // raios do aro (mostram o giro)
    for (var k = 0; k < 3; k++) {
      var raio = new T.Mesh(BOX, M.escuro); raio.scale.set(w * 1.08, r * 0.9, r * 0.1); raio.rotation.x = k * Math.PI / 3; gira.add(raio);
    }
    return { pivo: pivo, gira: gira, frente: frente, r: r, lado: lado };
  }

  // ------------------------------------------------ BUGGY (gaiola + metralhadora giratória)
  function buggy(cor) {
    var M = materiais(), g = new T.Group(), mt = new Montador();
    var mCor = new T.MeshLambertMaterial({ color: cor });
    var mFreio = new T.MeshBasicMaterial({ color: 0x551010 });
    // banheira / assoalho
    mt.perfil(mCor, forma([[-1.75, 0.55], [-1.85, 1.05], [-0.9, 1.15], [0.7, 1.15], [1.75, 0.95], [2.05, 0.7], [1.6, 0.5]]), 1.7, 0.05, 0, 0, 0);
    mt.caixa(M.escuro, 1.9, 0.12, 3.6, 0, 0.5, 0);
    // motor traseiro exposto
    mt.caixa(M.grafite, 1.1, 0.55, 0.9, 0, 1.35, -1.25);
    mt.caixa(M.metal, 0.9, 0.12, 0.7, 0, 1.68, -1.25);
    for (var i = 0; i < 4; i++) mt.cil(M.cromo, 0.07, 0.5, -0.36 + i * 0.24, 1.78, -1.25 + (i % 2) * 0.12, 0, 0, 0, 6);
    mt.tubo(M.cromo, 0.45, 1.3, -1.6, 0.6, 1.9, -2.0, 0.08); mt.tubo(M.cromo, -0.45, 1.3, -1.6, -0.6, 1.9, -2.0, 0.08);
    // bancos
    mt.caixa(M.escuro, 0.55, 0.5, 0.55, 0.38, 1.35, -0.25, -0.2); mt.caixa(M.escuro, 0.55, 0.5, 0.55, -0.38, 1.35, -0.25, -0.2);
    // gaiola
    var cg = M.escuro, R = 0.075, xs = [-0.82, 0.82];
    for (i = 0; i < 2; i++) {
      var x = xs[i];
      mt.tubo(cg, x, 1.1, 0.75, x * 0.85, 2.05, 0.15, R);      // coluna da frente
      mt.tubo(cg, x, 1.1, -0.85, x * 0.85, 2.05, -0.65, R);    // coluna de trás
      mt.tubo(cg, x * 0.85, 2.05, 0.15, x * 0.85, 2.05, -0.65, R); // teto lateral
      mt.tubo(cg, x, 1.1, 0.75, x * 0.95, 0.85, 1.95, R);       // para a frente
      mt.tubo(cg, x, 1.1, -0.85, x * 0.9, 1.15, -1.9, R);       // para trás
      mt.tubo(cg, x * 0.85, 2.05, -0.65, x * 0.9, 1.15, -1.9, R);
    }
    mt.tubo(cg, -0.7, 2.05, 0.15, 0.7, 2.05, 0.15, R); mt.tubo(cg, -0.7, 2.05, -0.65, 0.7, 2.05, -0.65, R);
    mt.tubo(cg, -0.7, 2.05, 0.15, 0.7, 2.05, -0.65, R);
    // para-choque de tubo e faróis
    mt.tubo(M.cromo, -0.95, 0.75, 2.1, 0.95, 0.75, 2.1, 0.09); mt.tubo(M.cromo, -0.6, 0.6, 2.15, -0.6, 1.0, 2.0, 0.07); mt.tubo(M.cromo, 0.6, 0.6, 2.15, 0.6, 1.0, 2.0, 0.07);
    mt.cil(M.farol, 0.13, 0.08, -0.45, 2.12, 0.25, Math.PI / 2); mt.cil(M.farol, 0.13, 0.08, 0.45, 2.12, 0.25, Math.PI / 2);
    mt.cil(M.cromo, 0.16, 0.06, -0.45, 2.1, 0.22, Math.PI / 2); mt.cil(M.cromo, 0.16, 0.06, 0.45, 2.1, 0.22, Math.PI / 2);
    // estepe atrás
    mt.add(geoPneu(0.45, 0.3, true), M.pneu, 0, 1.55, -2.05, 0, Math.PI / 2, 0);
    // placa
    mt.caixa(M.cromo, 0.6, 0.22, 0.04, 0, 0.75, -1.92);
    mt.malhas(g);
    // luzes de freio
    var f1 = new T.Mesh(BOX, mFreio); f1.scale.set(0.3, 0.12, 0.05); f1.position.set(-0.6, 1.02, -1.88); g.add(f1);
    var f2 = f1.clone(); f2.position.x = 0.6; g.add(f2);
    // metralhadora giratória no teto
    var arma = new T.Group(); arma.position.set(0, 2.18, -0.25); g.add(arma);
    var am = new Montador();
    am.caixa(M.grafite, 0.5, 0.3, 0.6, 0, 0, 0); am.caixa(M.ferrugem, 0.35, 0.28, 0.45, 0.42, 0, -0.1);
    am.cil(M.grafite, 0.16, 0.4, 0, 0.05, 0.45, Math.PI / 2);
    am.malhas(arma);
    var canos = new T.Group(); canos.position.set(0, 0.05, 0.6); arma.add(canos);
    var cm = new Montador();
    for (i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2; cm.cil(M.escuro, 0.035, 1.1, Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.55, Math.PI / 2, 0, 0, 5); }
    cm.cil(M.metal, 0.13, 0.08, 0, 0, 0.3, Math.PI / 2); cm.cil(M.metal, 0.13, 0.08, 0, 0, 1.0, Math.PI / 2);
    cm.malhas(canos);
    var rodas = [
      roda(g, M, -1.2, 0.72, 1.35, 0.72, 0.56, true, true), roda(g, M, 1.2, 0.72, 1.35, 0.72, 0.56, true, true),
      roda(g, M, -1.22, 0.76, -1.3, 0.76, 0.62, true, false), roda(g, M, 1.22, 0.76, -1.3, 0.76, 0.62, true, false)
    ];
    return finalizar(g, rodas, mFreio, [[0.6, 1.9, -2.05], [-0.6, 1.9, -2.05]], [0, 0.3, 1], arma, canos, 'buggy', mCor);
  }

  // ------------------------------------------------ MUSCLE CAR (espinhos + lançador de foguetes)
  function muscle(cor) {
    var M = materiais(), g = new T.Group(), mt = new Montador();
    var mCor = new T.MeshLambertMaterial({ color: 0x2b2a2c });
    var mFaixa = new T.MeshLambertMaterial({ color: cor });
    var mFreio = new T.MeshBasicMaterial({ color: 0x551010 });
    var P = Math.PI;
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
    // compressor saindo do capô
    mt.caixa(M.cromo, 0.7, 0.3, 0.6, 0, 1.25, 1.2); mt.caixa(M.escuro, 0.8, 0.2, 0.45, 0, 1.5, 1.22);
    for (var i = 0; i < 2; i++) mt.cil(M.cromo, 0.12, 0.25, -0.18 + i * 0.36, 1.68, 1.22, 0, 0, 0, 8);
    // aerofólio
    mt.caixa(mFaixa, 1.9, 0.07, 0.4, 0, 1.38, -2.05); mt.caixa(M.escuro, 0.08, 0.3, 0.25, -0.75, 1.2, -2.05); mt.caixa(M.escuro, 0.08, 0.3, 0.25, 0.75, 1.2, -2.05);
    // grade e para-choque com espinhos
    mt.caixa(M.escuro, 1.6, 0.3, 0.06, 0, 0.62, 2.43);
    mt.caixa(M.metal, 2.1, 0.22, 0.25, 0, 0.42, 2.45);
    var cone = new T.ConeGeometry(1, 1, 6);
    for (i = 0; i < 5; i++) mt.add(cone, M.cromo, -0.8 + i * 0.4, 0.42, 2.72, P / 2, 0, 0, 0.07, 0.4, 0.07);
    // espinhos nas laterais e no teto
    for (i = 0; i < 6; i++) {
      var zz = -1.6 + i * 0.6;
      mt.add(cone, M.cromo, 1.08, 0.75, zz, 0, 0, -P / 2, 0.06, 0.35, 0.06);
      mt.add(cone, M.cromo, -1.08, 0.75, zz, 0, 0, P / 2, 0.06, 0.35, 0.06);
    }
    for (i = 0; i < 3; i++) mt.add(cone, M.cromo, -0.5 + i * 0.5, 1.82, -0.75, -0.3, 0, 0, 0.05, 0.3, 0.05);
    // escapamentos laterais
    mt.cil(M.cromo, 0.09, 1.3, 1.08, 0.35, -0.2, P / 2, 0, 0, 8); mt.cil(M.cromo, 0.09, 1.3, -1.08, 0.35, -0.2, P / 2, 0, 0, 8);
    // faróis
    mt.cil(M.farol, 0.12, 0.05, -0.68, 0.74, 2.42, P / 2); mt.cil(M.farol, 0.12, 0.05, 0.68, 0.74, 2.42, P / 2);
    mt.malhas(g);
    var f1 = new T.Mesh(BOX, mFreio); f1.scale.set(0.55, 0.14, 0.05); f1.position.set(-0.6, 0.85, -2.38); g.add(f1);
    var f2 = f1.clone(); f2.position.x = 0.6; g.add(f2);
    // lançador de foguetes no teto
    var arma = new T.Group(); arma.position.set(0, 1.85, -0.2); g.add(arma);
    var am = new Montador();
    am.caixa(M.grafite, 0.35, 0.18, 0.5, 0, -0.05, 0);
    am.cil(M.grafite, 0.2, 1.7, 0, 0.22, 0.1, P / 2, 0, 0, 10);
    am.cil(M.escuro, 0.22, 0.12, 0, 0.22, -0.72, P / 2, 0, 0, 10);
    am.add(cone, M.ferrugem, 0, 0.22, 1.1, P / 2, 0, 0, 0.2, 0.4, 0.2);
    am.caixa(mFaixa, 0.06, 0.12, 0.6, 0.2, 0.22, 0.2);
    am.malhas(arma);
    var rodas = [
      roda(g, M, -1.0, 0.46, 1.45, 0.46, 0.42, false, true, M.cromo), roda(g, M, 1.0, 0.46, 1.45, 0.46, 0.42, false, true, M.cromo),
      roda(g, M, -1.02, 0.5, -1.45, 0.5, 0.52, false, false, M.cromo), roda(g, M, 1.02, 0.5, -1.45, 0.5, 0.52, false, false, M.cromo)
    ];
    return finalizar(g, rodas, mFreio, [[1.08, 0.35, -0.85], [-1.08, 0.35, -0.85]], [1, 0.0, 0], arma, null, 'muscle', mFaixa);
  }

  // chamas do nitro + sombra falsa
  var texSombra = null;
  function finalizar(g, rodas, mFreio, escapes, dirChama, arma, canos, tipo, mCor) {
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
    return { obj: raiz, corpo: corpo, rodas: rodas, freio: mFreio, chamas: chamas, arma: arma, canos: canos, sombra: sombra, tipo: tipo, matCor: mCor };
  }

  // ================================================================ FÍSICA (arcade)
  var PARAM = {
    buggy: { vmax: 34, acel: 24, giro: 2.3, aderencia: 7.5, foraEstrada: 0.93, massa: 1 },
    muscle: { vmax: 41, acel: 19, giro: 1.9, aderencia: 3.6, foraEstrada: 0.78, massa: 1.3 }
  };

  function Veiculo(mundo, modelo) {
    this.m = modelo; this.mundo = mundo;
    this.p = PARAM[modelo.tipo];
    this.x = 0; this.z = 0; this.y = 0; this.h = 0;
    this.v = 0; this.vl = 0; this.dir = 0; this.nitro = 1; this.usandoNitro = false;
    this.pitch = 0; this.roll = 0; this.giroRoda = 0; this.batida = 0; this.derrapando = 0;
  }
  Veiculo.prototype.colocar = function (x, z, h) {
    this.x = x; this.z = z; this.h = h; this.v = 0; this.vl = 0;
    this.y = this.mundo.altura(x, z);
  };
  // entrada: {x: -1..1 (direção), a: 0/1 acelera, r: 0/1 freio/ré, n: 0/1 nitro}
  Veiculo.prototype.atualizar = function (dt, e, outros) {
    var p = this.p, mundo = this.mundo, batida = 0;
    var ep = mundo.estradaPerto(this.x, this.z);
    var naEstrada = ep.d < 7.5;
    var sup = naEstrada ? 1 : p.foraEstrada;

    // nitro
    this.usandoNitro = !!(e.n && this.nitro > 0.02 && e.a); // three.js exige booleano em .visible
    if (this.usandoNitro) this.nitro = Math.max(0, this.nitro - dt * 0.33);
    else this.nitro = Math.min(1, this.nitro + dt * 0.07);
    var vmax = p.vmax * sup * (this.usandoNitro ? 1.45 : 1);

    // aceleração, freio e ré
    if (e.a && !e.r) {
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
    var taxa = this.dir * p.giro * Math.min(1, vel / 9) * (1 - 0.35 * Math.min(1, vel / p.vmax)) * (this.v < 0 ? -1 : 1);
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
    if ((hNovo - hAtual) / passo > 0.7 || hNovo - this.y > 2) {
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
    var yAlvo = (hf + hb + hr + hl) / 4;
    if (yAlvo > this.y) this.y += (yAlvo - this.y) * Math.min(1, dt * 18); else this.y += (yAlvo - this.y) * Math.min(1, dt * 7);
    this.pitch += (Math.atan2(hb - hf, 3.2) - this.pitch) * Math.min(1, dt * 10);
    this.roll += (Math.atan2(hl - hr, 2.2) - this.roll) * Math.min(1, dt * 10);
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
    for (var i = 0; i < m.rodas.length; i++) {
      var r = m.rodas[i];
      r.gira.rotation.x = this.giroRoda / r.r;
      if (r.frente) r.pivo.rotation.y = -this.dir * 0.45;
    }
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
    modelo: function (tipo, cor) { return tipo === 'muscle' ? muscle(cor) : buggy(cor); },
    Veiculo: Veiculo,
    PARAM: PARAM
  };
})();
