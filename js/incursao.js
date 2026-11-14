// INCURSÃO: o jogo de verdade. Ondas de carros-robô, metralhadora que mira sozinha, mísseis teleguiados,
// escudo, vida, vidas da equipe, explosões e placar. A TV é o juiz: tudo roda aqui.
// Uso (em jogar.js): Incursao.iniciar(ctx); Incursao.prepararJogador(j); Incursao.atualizar(dt, t) a cada quadro.
(function () {
  var T, ctx, mundo, cena;
  var ONDAS = 5, VIDAS = 6;
  var E = { fase: 'livre', onda: 0, vidas: VIDAS, abates: 0, tempo: 0, fila: 0, espera: 0, conta: 0, fimT: 0, resultado: null };
  var bots = [], misseis = [], destrocos = [], flashes = [];
  var R = Math.random;
  var v3 = null;

  function ang(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function vivos() { var l = ctx.jogadores(), r = []; for (var i = 0; i < l.length; i++) if (!l[i].morto && !l[i].fora) r.push(l[i]); return r; }

  // ================================================================ efeitos
  var texBrilho, texMira, geoMissil, geoNariz, geoDestroco, matDestroco, matMissil;
  function prepararEfeitos() {
    texBrilho = mundo.texFogo;
    var c = document.createElement('canvas'); c.width = 64; c.height = 64;
    var g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.arc(32, 32, 20, 0, 6.29); g.stroke();
    g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 18); g.moveTo(32, 46); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(18, 32); g.moveTo(46, 32); g.lineTo(62, 32); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 3, 0, 6.29); g.fill();
    texMira = new T.Texture(c); texMira.needsUpdate = true;
    geoMissil = new T.CylinderGeometry(0.13, 0.13, 1.1, 8); geoMissil.rotateX(Math.PI / 2);
    geoNariz = new T.ConeGeometry(0.13, 0.35, 8); geoNariz.rotateX(Math.PI / 2); geoNariz.translate(0, 0, 0.72);
    matMissil = new T.MeshLambertMaterial({ color: 0x8a8580 });
    geoDestroco = new T.BoxGeometry(0.5, 0.25, 0.7);
    matDestroco = new T.MeshLambertMaterial({ color: 0x2a2522 });
    for (var i = 0; i < 24; i++) {
      var d = new T.Mesh(geoDestroco, matDestroco); d.visible = false; cena.add(d);
      destrocos.push({ m: d, vida: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0 });
    }
    for (i = 0; i < 10; i++) {
      var s = new T.Sprite(new T.SpriteMaterial({ map: texBrilho, color: 0xffb060, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; cena.add(s);
      flashes.push({ s: s, vida: 0, max: 1, tam: 1 });
    }
  }
  function flash(x, y, z, tam, cor, vida) {
    var f = null, i;
    for (i = 0; i < flashes.length; i++) if (flashes[i].vida <= 0) { f = flashes[i]; break; }
    if (!f) f = flashes[0];
    f.s.position.set(x, y, z); f.s.material.color.setHex(cor); f.vida = f.max = vida; f.tam = tam; f.s.visible = true;
  }
  function explosao(x, y, z, forca) {
    var fogo = mundo.fx.fogo, fum = mundo.fx.fumaca, i;
    flash(x, y + 1, z, 9 * forca, 0xffa040, 0.45);
    for (i = 0; i < 26 * forca; i++) {
      var a = R() * 6.28, v = 4 + R() * 9 * forca;
      fogo.emitir(x, y + 1 + R(), z, Math.cos(a) * v, 2 + R() * 7, Math.sin(a) * v, 0.4 + R() * 0.5, 3.5 * forca, 1, 1, 1, 0.5 + R() * 0.3, 0.15);
    }
    for (i = 0; i < 12 * forca; i++) {
      var cz = 0.12 + R() * 0.12;
      fum.emitir(x + (R() - 0.5) * 3, y + 1, z + (R() - 0.5) * 3, (R() - 0.5) * 4, 3 + R() * 4, (R() - 0.5) * 4, 2.5 + R() * 2, 4, 14 * forca, 0.8, cz, cz, cz);
    }
    var n = Math.round(5 * forca);
    for (i = 0; i < destrocos.length && n > 0; i++) {
      var d = destrocos[i]; if (d.vida > 0) continue;
      n--; d.vida = 2.5; d.m.visible = true; d.m.position.set(x, y + 1, z);
      d.vx = (R() - 0.5) * 18; d.vy = 7 + R() * 9; d.vz = (R() - 0.5) * 18; d.rx = (R() - 0.5) * 12; d.rz = (R() - 0.5) * 12;
    }
    ctx.som.explosao(forca);
    ctx.tremer(x, z, forca);
  }
  function faisca(x, y, z) {
    var fogo = mundo.fx.fogo;
    for (var i = 0; i < 3; i++) fogo.emitir(x, y, z, (R() - 0.5) * 10, R() * 6, (R() - 0.5) * 10, 0.15 + R() * 0.15, 0.9, 0.3, 1, 1, 0.8, 0.4);
  }
  // traçante: um ponto de luz voando do cano até o alvo
  function tracante(x0, y0, z0, x1, y1, z1, cor) {
    var dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, vel = 240;
    mundo.fx.fogo.emitir(x0, y0, z0, dx / d * vel, dy / d * vel, dz / d * vel, d / vel, 1.3, 1.1, 1, cor[0], cor[1], cor[2]);
  }
  function atualizarEfeitos(dt) {
    var i;
    for (i = 0; i < flashes.length; i++) {
      var f = flashes[i]; if (f.vida <= 0) continue;
      f.vida -= dt; var k = 1 - f.vida / f.max;
      f.s.scale.set(f.tam * (0.5 + k), f.tam * (0.5 + k), 1); f.s.material.opacity = Math.max(0, 1 - k);
      if (f.vida <= 0) f.s.visible = false;
    }
    for (i = 0; i < destrocos.length; i++) {
      var d = destrocos[i]; if (d.vida <= 0) continue;
      d.vida -= dt; d.vy -= 25 * dt;
      var p = d.m.position; p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
      var chao = mundo.altura(p.x, p.z) + 0.15;
      if (p.y < chao) { p.y = chao; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5; }
      d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
      if (d.vida <= 0) d.m.visible = false;
    }
  }

  // ================================================================ barras de vida dos robôs (sprite com canvas)
  function etiquetaBot(nome) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 40;
    var tx = new T.Texture(c);
    var s = new T.Sprite(new T.SpriteMaterial({ map: tx, depthWrite: false, transparent: true }));
    s.scale.set(3.6, 1.12, 1);
    var et = { s: s, c: c, tx: tx, nome: nome, ultimo: -1 };
    desenharEtiqueta(et, 1);
    return et;
  }
  function desenharEtiqueta(et, frac) {
    var q = Math.round(frac * 40); if (q === et.ultimo) return; et.ultimo = q;
    var g = et.c.getContext('2d');
    g.clearRect(0, 0, 128, 40);
    g.font = 'bold 18px Arial, sans-serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)';
    g.strokeText(et.nome, 64, 17); g.fillStyle = '#ff5a48'; g.fillText(et.nome, 64, 17);
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(14, 24, 100, 10);
    g.fillStyle = frac > 0.5 ? '#ff5a48' : '#ffb347'; g.fillRect(16, 26, 96 * frac, 6);
    et.tx.needsUpdate = true;
  }

  // ================================================================ robôs
  var contBot = 0;
  function Bot(chefe) {
    var tipo = chefe ? 'muscle' : (R() < 0.5 ? 'buggy' : 'muscle');
    this.chefe = chefe;
    this.m = Carros.modeloBot(tipo, chefe ? 0x8a1a12 : (R() < 0.5 ? 0xb8352b : 0xc0602a));
    if (chefe) this.m.obj.scale.set(1.4, 1.4, 1.4);
    cena.add(this.m.obj); cena.add(this.m.sombra);
    this.ve = new Carros.Veiculo(mundo, this.m);
    this.ve.p.vmax *= chefe ? 0.8 : 0.84; this.ve.p.acel *= 0.9;
    this.hpMax = this.hp = chefe ? 750 : 95 + E.onda * 30;
    contBot++;
    this.nome = chefe ? 'CHEFÃO' : 'BOT_' + (contBot < 10 ? '0' : '') + contBot;
    this.et = etiquetaBot(this.nome); cena.add(this.et.s);
    this.lado = R() < 0.5 ? -1 : 1;
    this.tiroT = 1 + R(); this.missilT = 4 + R() * 4; this.presoT = 0; this.reT = 0;
    this.ent = { x: 0, a: 1, r: 0 };
    this.ultimoAtacante = null; this.morto = false;
  }
  Bot.prototype.pensar = function (dt, alvos) {
    var ve = this.ve, alvo = null, md = 1e9, i;
    for (i = 0; i < alvos.length; i++) {
      var dx0 = alvos[i].ve.x - ve.x, dz0 = alvos[i].ve.z - ve.z, d0 = dx0 * dx0 + dz0 * dz0;
      if (d0 < md) { md = d0; alvo = alvos[i]; }
    }
    this.alvo = alvo;
    if (!alvo) { this.ent.a = 0; this.ent.x = 0; return; }
    var dist = Math.sqrt(md), tx, tz;
    if (dist > 50) { // longe: segue a estrada na direção do jogador
      var e = mundo.estrada, a = mundo.estradaPerto(ve.x, ve.z), b = mundo.estradaPerto(alvo.ve.x, alvo.ve.z);
      var dif = ((b.i - a.i) % e.n + e.n * 1.5) % e.n - e.n / 2, passo = dif > 0 ? 14 : -14;
      var k = ((a.i + passo) % e.n + e.n) % e.n;
      tx = e.px[k] - e.tz[k] * this.lado * 2.5; tz = e.pz[k] + e.tx[k] * this.lado * 2.5;
    } else { // perto: vai para cima, mirando um pouco à frente e de lado
      var fx = Math.sin(alvo.ve.h), fz = Math.cos(alvo.ve.h);
      tx = alvo.ve.x + fx * Math.min(12, alvo.ve.v * 0.4) - fz * this.lado * 4;
      tz = alvo.ve.z + fz * Math.min(12, alvo.ve.v * 0.4) + fx * this.lado * 4;
    }
    var desejo = Math.atan2(tx - ve.x, tz - ve.z), dif2 = ang(desejo - ve.h);
    this.ent.x = Math.max(-1, Math.min(1, -dif2 * 2.2));
    this.ent.a = 1; this.ent.r = 0;
    if (dist < 9 && Math.abs(dif2) > 1.2) this.ent.a = 0;
    // preso: dá ré virando
    if (Math.abs(ve.v) < 2 && this.reT <= 0) { this.presoT += dt; if (this.presoT > 1.4) { this.reT = 1.3; this.presoT = 0; } } else this.presoT = 0;
    if (this.reT > 0) { this.reT -= dt; this.ent.a = 0; this.ent.r = 1; this.ent.x = -this.ent.x || 1; }
    // atira para a frente
    var dirAlvo = Math.atan2(alvo.ve.x - ve.x, alvo.ve.z - ve.z), mira = Math.abs(ang(dirAlvo - ve.h));
    this.tiroT -= dt;
    if (dist < 48 && mira < 0.4 && this.tiroT <= 0) {
      this.tiroT = this.chefe ? 0.12 : 0.26;
      var bx = ve.x + Math.sin(ve.h) * 2.4, bz = ve.z + Math.cos(ve.h) * 2.4, by = ve.y + 1.4;
      var acerta = R() < (this.chefe ? 0.6 : 0.5);
      var ex = alvo.ve.x + (acerta ? 0 : (R() - 0.5) * 6), ez = alvo.ve.z + (acerta ? 0 : (R() - 0.5) * 6);
      tracante(bx, by, bz, ex, alvo.ve.y + 1, ez, [1, 0.35, 0.2]);
      if (acerta) { danoJogador(alvo, (this.chefe ? 4 : 2.2) + E.onda * 0.5, this); faisca(alvo.ve.x, alvo.ve.y + 1.2, alvo.ve.z); }
      ctx.som.tiro(0.5);
    }
    // mísseis (da onda 3 em diante, e o chefão sempre)
    this.missilT -= dt;
    if ((E.onda >= 3 || this.chefe) && this.missilT <= 0 && dist < 70 && mira < 0.7) {
      this.missilT = this.chefe ? 3.5 : 7 + R() * 3;
      lancarMissil(this, alvo, ve.x + Math.sin(ve.h) * 2.5, ve.y + 2, ve.z + Math.cos(ve.h) * 2.5, ve.h);
    }
  };
  function danoBot(b, d, autor) {
    if (b.morto) return;
    b.hp -= d; if (autor) { b.ultimoAtacante = autor; autor.dano = (autor.dano || 0) + d; }
    desenharEtiqueta(b.et, Math.max(0, b.hp / b.hpMax));
    if (b.hp <= 0) matarBot(b);
  }
  function matarBot(b) {
    b.morto = true; b.mortoT = 5;
    explosao(b.ve.x, b.ve.y, b.ve.z, b.chefe ? 2 : 1.3);
    E.abates++;
    var a = b.ultimoAtacante;
    if (a && a.key) { a.abates = (a.abates || 0) + 1; ctx.aviso(a.info.nome + ' destruiu ' + b.nome, ctx.corCss(a)); ctx.enviar(a.key, { vib: 120 }); }
    b.et.s.visible = false;
    // vira carcaça escura soltando fumaça
    b.m.obj.traverse(function (o) { if (o.material && o.material.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.25); } });
  }
  function removerBot(b) {
    cena.remove(b.m.obj); cena.remove(b.m.sombra); cena.remove(b.et.s);
  }
  function criarBot(chefe) {
    var l = vivos(); if (!l.length) return;
    var p = l[Math.floor(R() * l.length)], e = mundo.estrada, ep = mundo.estradaPerto(p.ve.x, p.ve.z);
    var lado = R() < 0.5 ? 1 : -1, i = ((ep.i + lado * (55 + Math.floor(R() * 35))) % e.n + e.n) % e.n;
    var b = new Bot(chefe), l2 = (R() - 0.5) * 6;
    var x = e.px[i] - e.tz[i] * l2, z = e.pz[i] + e.tx[i] * l2;
    b.ve.colocar(x, z, Math.atan2(e.tx[i], e.tz[i]) + (lado > 0 ? Math.PI : 0));
    bots.push(b);
    if (chefe) ctx.mensagem('O CHEFÃO CHEGOU!', 2.5);
  }

  // ================================================================ mísseis
  function lancarMissil(dono, alvo, x, y, z, h) {
    var g = new T.Group();
    g.add(new T.Mesh(geoMissil, matMissil)); g.add(new T.Mesh(geoNariz, matMissil));
    var ch = new T.Sprite(new T.SpriteMaterial({ map: texBrilho, color: 0xffa040, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
    ch.position.z = -0.7; ch.scale.set(1.2, 1.2, 1); g.add(ch);
    g.position.set(x, y, z); cena.add(g);
    misseis.push({ g: g, dono: dono, alvo: alvo, x: x, y: y, z: z, h: h, vida: 3.2, vel: 62 });
    ctx.som.missil();
  }
  function atualizarMisseis(dt) {
    for (var i = misseis.length - 1; i >= 0; i--) {
      var m = misseis[i], a = m.alvo, alvoVe = a && !a.morto ? a.ve : null;
      m.vida -= dt; m.vel = Math.min(95, m.vel + 60 * dt);
      var ty = m.y;
      if (alvoVe) {
        var desejo = Math.atan2(alvoVe.x - m.x, alvoVe.z - m.z), d = ang(desejo - m.h);
        m.h += Math.max(-3.2 * dt, Math.min(3.2 * dt, d));
        ty = alvoVe.y + 1;
      } else ty = Math.max(m.y, mundo.altura(m.x, m.z) + 1.5);
      m.y += (ty - m.y) * Math.min(1, dt * 4);
      m.x += Math.sin(m.h) * m.vel * dt; m.z += Math.cos(m.h) * m.vel * dt;
      m.g.position.set(m.x, m.y, m.z); m.g.rotation.y = m.h;
      if (R() < 0.9) mundo.fx.fumaca.emitir(m.x - Math.sin(m.h), m.y, m.z - Math.cos(m.h), 0, 0.5, 0, 1.2, 0.8, 3.5, 0.6, 0.75, 0.73, 0.7);
      // acertou alguém?
      var bateu = m.vida <= 0 || m.y < mundo.altura(m.x, m.z) + 0.2;
      var deJogador = !!m.dono.key, l = deJogador ? bots : vivos(), k;
      for (k = 0; k < l.length && !bateu; k++) {
        if (l[k].morto) continue;
        var dx = l[k].ve.x - m.x, dz = l[k].ve.z - m.z, dy = l[k].ve.y + 1 - m.y;
        if (dx * dx + dz * dz + dy * dy < 7) bateu = true;
      }
      if (!bateu) continue;
      explosao(m.x, m.y - 1, m.z, 0.9);
      for (k = 0; k < l.length; k++) {
        if (l[k].morto) continue;
        var ddx = l[k].ve.x - m.x, ddz = l[k].ve.z - m.z, dist = Math.sqrt(ddx * ddx + ddz * ddz);
        if (dist < 7) {
          var dano = (dist < 2.8 ? 45 : 0) + 22 * (1 - dist / 7);
          if (deJogador) danoBot(l[k], dano, m.dono); else danoJogador(l[k], dano * 0.6, m.dono);
          l[k].ve.v *= 0.5; l[k].ve.vl += (R() - 0.5) * 10;
        }
      }
      cena.remove(m.g);
      misseis.splice(i, 1);
    }
  }

  // ================================================================ jogadores
  function prepararJogador(j) {
    j.hp = 100; j.misseis = 3; j.escudoT = 0; j.escudoCd = 0; j.morto = 0; j.fora = false;
    j.abates = 0; j.dano = 0; j.mortes = 0; j.tiroT = 0; j.alvo = null;
    var esc = new T.Mesh(new T.SphereGeometry(3.3, 16, 10), new T.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.25, blending: T.AdditiveBlending, depthWrite: false }));
    esc.position.y = 1.1; esc.visible = false; j.m.obj.add(esc); j.escMesh = esc;
    var boca = new T.Sprite(new T.SpriteMaterial({ map: texBrilho, color: 0xffd080, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
    boca.scale.set(1.3, 1.3, 1); boca.visible = false;
    boca.position.set(0, j.m.tipo === 'buggy' ? 0.05 : 0.22, j.m.tipo === 'buggy' ? 1.8 : 1.4);
    j.m.arma.add(boca); j.boca = boca;
    var mira = new T.Sprite(new T.SpriteMaterial({ map: texMira, color: ctx.corHex(j), depthWrite: false, depthTest: false, transparent: true }));
    mira.scale.set(2.6, 2.6, 1); mira.visible = false; cena.add(mira); j.mira = mira;
  }
  function removerJogador(j) { if (j.mira) cena.remove(j.mira); }
  function danoJogador(j, d, fonte) {
    if (E.fase !== 'jogando' || j.morto || j.fora || j.escudoT > 0) return;
    j.hp -= d;
    if (!j.vibT || j.vibT < Date.now()) { ctx.enviar(j.key, { vib: 35 }); j.vibT = Date.now() + 250; }
    if (j.hp <= 0) morrer(j);
  }
  function morrer(j) {
    j.hp = 0; j.mortes++;
    explosao(j.ve.x, j.ve.y, j.ve.z, 1.4);
    j.m.obj.visible = false; j.m.sombra.visible = false; j.mira.visible = false;
    ctx.enviar(j.key, { vib: [200, 80, 200] });
    if (E.vidas > 0) { E.vidas--; j.morto = 3; ctx.aviso(j.info.nome + ' foi destruído! Volta em 3 s', ctx.corCss(j)); }
    else { j.fora = true; j.morto = 0; ctx.aviso(j.info.nome + ' está fora (acabaram as vidas)', ctx.corCss(j)); }
  }
  function renascer(j) {
    var l = vivos(), ref = l.length ? l[0] : j, e = mundo.estrada, ep = mundo.estradaPerto(ref.ve.x, ref.ve.z);
    var i = ((ep.i - 8) % e.n + e.n) % e.n;
    j.ve.colocar(e.px[i], e.pz[i], Math.atan2(e.tx[i], e.tz[i]) + (ref !== j && Math.cos(ref.ve.h - ep.h) < 0 ? Math.PI : 0));
    j.hp = 100; j.morto = 0; j.escudoT = 3;
    j.m.obj.visible = true; j.m.sombra.visible = true;
  }
  function missil(j) {
    if (j.morto || j.fora || j.misseis < 1) return;
    j.misseis--;
    var alvo = j.alvo || alvoNaFrente(j, 1.0, 110);
    var p = pontoArma(j, 1.2);
    lancarMissil(j, alvo, p.x, p.y + 0.2, p.z, j.ve.h + (j.m.arma ? j.m.arma.rotation.y * 0 : 0));
  }
  function escudo(j) {
    if (j.morto || j.fora || j.escudoCd > 0) return;
    j.escudoT = 4; j.escudoCd = 24;
    ctx.som.escudo();
  }
  function pontoArma(j, frente) {
    v3.set(0, j.m.tipo === 'buggy' ? 0.05 : 0.22, frente);
    j.m.arma.updateMatrixWorld(true);
    return j.m.arma.localToWorld(v3);
  }
  function alvoNaFrente(j, cone, alcance) {
    var melhor = null, nota = 1e9, ve = j.ve;
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i]; if (b.morto) continue;
      var dx = b.ve.x - ve.x, dz = b.ve.z - ve.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d > alcance) continue;
      var a = Math.abs(ang(Math.atan2(dx, dz) - ve.h));
      if (a > cone) continue;
      var n = d + a * 25;
      if (n < nota) { nota = n; melhor = b; }
    }
    return melhor;
  }
  function armasJogador(j, dt) {
    var buggy = j.m.tipo === 'buggy', ve = j.ve;
    j.misseis = Math.min(3, j.misseis + dt / 7);
    if (j.escudoT > 0) j.escudoT -= dt;
    if (j.escudoCd > 0) j.escudoCd -= dt;
    j.escMesh.visible = j.escudoT > 0;
    if (j.escudoT > 0) j.escMesh.material.opacity = 0.18 + Math.sin(Date.now() / 80) * 0.07;
    // escolhe alvo: buggy gira a torre (cone largo), muscle só mira para a frente
    j.alvo = alvoNaFrente(j, buggy ? 2.4 : 0.55, buggy ? 62 : 70);
    var arma = j.m.arma, giro = 0;
    if (j.alvo) giro = ang(Math.atan2(j.alvo.ve.x - ve.x, j.alvo.ve.z - ve.z) - ve.h);
    if (!buggy) giro = Math.max(-0.35, Math.min(0.35, giro));
    arma.rotation.y += (giro - arma.rotation.y) * Math.min(1, dt * 9);
    j.mira.visible = !!j.alvo;
    if (j.alvo) j.mira.position.set(j.alvo.ve.x, j.alvo.ve.y + 1.3, j.alvo.ve.z);
    // metralhadora automática
    j.tiroT -= dt;
    var atirando = j.alvo && Math.abs(ang(giro - arma.rotation.y)) < 0.25;
    j.boca.visible = !!atirando && R() < 0.6;
    if (atirando && j.m.canos) j.m.canos.rotation.z += dt * 30;
    if (atirando && j.tiroT <= 0) {
      j.tiroT = buggy ? 0.09 : 0.12;
      var p = pontoArma(j, buggy ? 1.8 : 1.4), b = j.alvo, acerta = R() < 0.7;
      var ex = b.ve.x + (acerta ? 0 : (R() - 0.5) * 5), ez = b.ve.z + (acerta ? 0 : (R() - 0.5) * 5);
      tracante(p.x, p.y, p.z, ex, b.ve.y + 1, ez, [1, 0.85, 0.4]);
      if (acerta) { danoBot(b, buggy ? 5 : 6.5, j); if (R() < 0.5) faisca(b.ve.x, b.ve.y + 1.2, b.ve.z); }
      ctx.som.tiro(1);
    }
  }
  // pancadas entre jogadores e robôs
  var batidas = {};
  function pancadas() {
    var l = vivos(), agora = Date.now();
    for (var i = 0; i < l.length; i++) for (var k = 0; k < bots.length; k++) {
      var j = l[i], b = bots[k]; if (b.morto) continue;
      var dx = j.ve.x - b.ve.x, dz = j.ve.z - b.ve.z;
      if (dx * dx + dz * dz > 4.6 * 4.6) continue;
      var id = j.key + b.nome; if (batidas[id] && batidas[id] > agora) continue;
      batidas[id] = agora + 600;
      var forca = Math.max(Math.abs(j.ve.v), Math.abs(b.ve.v));
      if (forca < 7) continue;
      danoBot(b, forca * 0.9 * (j.m.tipo === 'muscle' ? 2 : 1), j);
      danoJogador(j, forca * (j.m.tipo === 'muscle' ? 0.22 : 0.35), b);
      faisca((j.ve.x + b.ve.x) / 2, j.ve.y + 1, (j.ve.z + b.ve.z) / 2);
    }
  }

  // ================================================================ fases: livre → contagem → jogando → fim
  function comecar() {
    if (E.fase !== 'livre' || !ctx.jogadores().length) return;
    limpar();
    E.fase = 'contagem'; E.conta = 3.99; E.onda = 0; E.vidas = VIDAS; E.abates = 0; E.tempo = 0; contBot = 0;
    var l = ctx.jogadores(), e = mundo.estrada;
    for (var i = 0; i < l.length; i++) {
      var j = l[i]; j.hp = 100; j.misseis = 3; j.escudoT = 0; j.escudoCd = 0; j.morto = 0; j.fora = false; j.abates = 0; j.dano = 0; j.mortes = 0;
      j.m.obj.visible = true; j.m.sombra.visible = true;
      var k = 30 - i * 5, p = mundo.aoLado(k, i % 2 ? 1 : -1, 3.2);
      j.ve.colocar(p.x, p.z, Math.atan2(e.tx[k], e.tz[k]));
    }
    ctx.som.entrada();
  }
  function limpar() {
    for (var i = 0; i < bots.length; i++) removerBot(bots[i]);
    bots = [];
    for (i = 0; i < misseis.length; i++) cena.remove(misseis[i].g);
    misseis = [];
  }
  function proximaOnda() {
    E.onda++;
    E.fila = E.onda === ONDAS ? 6 : 2 + E.onda;
    E.espera = 0; E.spawnT = 1;
    ctx.mensagem('ONDA ' + E.onda + ' de ' + ONDAS, 2.2);
  }
  function terminar(vitoria) {
    E.fase = 'fim'; E.fimT = 14;
    var l = ctx.jogadores(), placar = [];
    for (var i = 0; i < l.length; i++) placar.push({ nome: l[i].info.nome, cor: ctx.corCss(l[i]), abates: l[i].abates || 0, dano: Math.round(l[i].dano || 0), mortes: l[i].mortes || 0 });
    E.resultado = { vitoria: vitoria, onda: E.onda, abates: E.abates, tempo: Math.round(E.tempo), placar: placar };
    ctx.fim(E.resultado);
  }
  function voltarLivre() {
    limpar(); E.fase = 'livre'; E.onda = 0; E.resultado = null;
    var l = ctx.jogadores();
    for (var i = 0; i < l.length; i++) { var j = l[i]; j.hp = 100; j.morto = 0; j.fora = false; j.m.obj.visible = true; j.m.sombra.visible = true; }
    ctx.fim(null);
  }

  function atualizar(dt, t) {
    var l = ctx.jogadores(), i;
    if (E.fase !== 'livre' && !l.length) voltarLivre();
    for (i = 0; i < l.length; i++) {
      var j = l[i];
      if (j.morto > 0) { j.morto -= dt; if (j.morto <= 0) renascer(j); continue; }
      if (j.fora) continue;
      armasJogador(j, dt);
    }
    if (E.fase === 'contagem') {
      var antes = Math.ceil(E.conta); E.conta -= dt; var agora = Math.ceil(E.conta);
      if (agora !== antes) ctx.mensagem(agora > 0 ? String(agora) : 'VAI!', 0.9);
      if (E.conta <= 0) { E.fase = 'jogando'; proximaOnda(); }
    } else if (E.fase === 'jogando') {
      E.tempo += dt;
      var vivosBots = 0;
      for (i = 0; i < bots.length; i++) if (!bots[i].morto) vivosBots++;
      if (E.fila > 0) {
        E.spawnT -= dt;
        if (E.spawnT <= 0 && vivosBots < 5) { E.fila--; E.spawnT = 1.6; criarBot(E.onda === ONDAS && E.fila === 0); }
      } else if (vivosBots === 0) {
        if (E.onda >= ONDAS) terminar(true);
        else {
          E.espera += dt;
          if (E.espera > 0.1 && E.espera - dt <= 0.1) { ctx.mensagem('ONDA ' + E.onda + ' LIMPA!', 2); for (i = 0; i < l.length; i++) if (!l[i].fora && !l[i].morto) l[i].hp = Math.min(100, l[i].hp + 35); }
          if (E.espera > 4) proximaOnda();
        }
      }
      var todosFora = l.length > 0;
      for (i = 0; i < l.length; i++) if (!l[i].fora) todosFora = false;
      if (todosFora) terminar(false);
      pancadas();
    } else if (E.fase === 'fim') {
      E.fimT -= dt; if (E.fimT <= 0) voltarLivre();
    }
    // robôs
    var alvos = vivos(), todos = veiculos();
    for (i = bots.length - 1; i >= 0; i--) {
      var b = bots[i];
      if (b.morto) {
        b.mortoT -= dt;
        if (R() < 0.3) mundo.fx.fumaca.emitir(b.ve.x, b.ve.y + 1.2, b.ve.z, (R() - 0.5), 3, (R() - 0.5), 2.5, 2, 9, 0.6, 0.15, 0.14, 0.13);
        if (b.mortoT <= 0) { removerBot(b); bots.splice(i, 1); }
        continue;
      }
      b.pensar(dt, E.fase === 'jogando' ? alvos : []);
      b.ve.atualizar(dt, b.ent, todos);
      b.ve.desenhar(dt, t, b.ent.r);
      b.et.s.position.set(b.ve.x, b.ve.y + (b.chefe ? 4.6 : 3.6), b.ve.z);
      if (R() < 0.5) mundo.poeiraCarro(b.ve.x - Math.sin(b.ve.h) * 2, b.ve.y, b.ve.z - Math.cos(b.ve.h) * 2, Math.abs(b.ve.v));
    }
    atualizarMisseis(dt);
    atualizarEfeitos(dt);
  }
  // todos os veículos que colidem entre si
  function veiculos() {
    var r = [], l = ctx.jogadores(), i;
    for (i = 0; i < l.length; i++) if (!l[i].morto && !l[i].fora) r.push(l[i].ve);
    for (i = 0; i < bots.length; i++) if (!bots[i].morto) r.push(bots[i].ve);
    return r;
  }
  function hud(j) {
    var e = j.escudoT > 0 ? 'ativo' : j.escudoCd > 0 ? Math.ceil(j.escudoCd) : 'pronto';
    return { hp: Math.max(0, Math.round(j.hp)), m: Math.floor(j.misseis), e: e, f: E.fase, o: E.onda, morto: j.morto > 0 ? Math.ceil(j.morto) : 0, fora: j.fora ? 1 : 0 };
  }

  window.Incursao = {
    iniciar: function (c) { ctx = c; T = c.T; mundo = c.mundo; cena = c.cena; v3 = new T.Vector3(); prepararEfeitos(); },
    prepararJogador: prepararJogador, removerJogador: removerJogador,
    comecar: comecar, missil: missil, escudo: escudo,
    atualizar: atualizar, veiculos: veiculos, hud: hud,
    estado: E, bots: function () { return bots; }, ONDAS: ONDAS
  };
})();
