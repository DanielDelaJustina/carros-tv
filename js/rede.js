// REDE: sala no Firebase + WebRTC direto entre cada celular e a TV (Firebase só apresenta e serve de reserva).
//
// Caminhos (sempre dentro de salas/<COD>):
//   c/<key>  celular → TV: { nome, carro, quer, answer, ctrl, ping, t }
//   t/<key>  TV → celular: { slot, cor, offer, pong, estado }
//   publico  { jogo: 'carros', criado }
// Mensagens pelo DataChannel: celular → TV  {c:[x, a, r, n, seq]}  {ping}  {reset:1}
//                             TV → celular  {pong}  {vib:ms}  {hud:{...}}
(function () {
  var RTCPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  var ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  function esperarICE(p, ms) {
    return new Promise(function (ok) {
      if (p.iceGatheringState === 'complete') return ok();
      var t = setTimeout(ok, ms);
      p.onicecandidate = function (e) { if (!e.candidate) { clearTimeout(t); ok(); } };
    });
  }
  function desc(d) { return window.RTCSessionDescription ? new RTCSessionDescription({ type: d.type, sdp: d.sdp }) : { type: d.type, sdp: d.sdp }; }

  function novoCodigo() {
    var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 5; i++) s += letras.charAt(Math.floor(Math.random() * letras.length));
    return s;
  }

  // ================================================================ TV
  // cb: { entrou(key, info), mudou(key, info), saiu(key), ctrl(key, c), reset(key), canal(key, nome) }
  function TV(cod, cb) {
    this.cod = cod; this.cb = cb; this.base = 'salas/' + cod;
    this.jog = {}; // key → { info, pc, dc, quer, respondido, ultimoPing, canal, seq }
    var self = this;
    FB.put(this.base + '/publico', { jogo: 'carros', criado: Date.now() })['catch'](function () {});
    FB.listen(this.base + '/c', function (d) { self.aoMudar(d || {}); });
  }
  TV.prototype.aoMudar = function (todos) {
    for (var k in this.jog) if (!todos[k] || !todos[k].nome) { var sj = this.jog[k]; if (sj.pc) { try { sj.pc.close(); } catch (e) {} } delete this.jog[k]; this.cb.saiu(k); }
    for (var key in todos) {
      var d = todos[key]; if (!d || !d.nome) continue;
      var j = this.jog[key];
      if (!j) {
        j = this.jog[key] = { key: key, quer: null, ultimoPing: null, canal: 'Firebase', seq: 0, ultimoReset: d.reset || 0 };
        j.info = { nome: d.nome, carro: d.carro };
        this.cb.entrou(key, j.info);
      } else if (d.nome !== j.info.nome || d.carro !== j.info.carro) {
        j.info.nome = d.nome; j.info.carro = d.carro;
        this.cb.mudou(key, j.info);
      }
      if (d.quer && d.quer !== j.quer) this.iniciarRTC(j, d.quer);
      if (d.answer && j.pc && d.answer.quer === j.quer && !j.respondido) {
        j.respondido = true;
        j.pc.setRemoteDescription(desc(d.answer))['catch'](function (e) { console.log('answer', e); });
      }
      if (d.ctrl && !this.rtcAberto(j) && d.ctrl[4] > j.seq) { j.seq = d.ctrl[4]; this.cb.ctrl(key, d.ctrl); }
      if (d.reset && d.reset !== j.ultimoReset) { if (j.ultimoReset !== undefined) this.cb.reset(key); j.ultimoReset = d.reset; }
      if (d.ping !== undefined && d.ping !== j.ultimoPing) { j.ultimoPing = d.ping; FB.put(this.base + '/t/' + key + '/pong', d.ping); }
    }
  };
  TV.prototype.rtcAberto = function (j) { return j.dc && j.dc.readyState === 'open'; };
  TV.prototype.iniciarRTC = function (j, quer) {
    var self = this, caminho = this.base + '/t/' + j.key + '/offer';
    j.quer = quer; j.respondido = false;
    if (!RTCPC) { FB.put(caminho, { quer: quer, erro: 'TV sem WebRTC' }); return; }
    if (j.pc) { try { j.pc.close(); } catch (e) {} }
    var pc = j.pc = new RTCPC(ICE);
    var dc = j.dc = pc.createDataChannel('c', { ordered: false, maxRetransmits: 0 });
    dc.onopen = function () { j.canal = 'WebRTC'; self.cb.canal(j.key, 'WebRTC'); };
    dc.onclose = function () { if (j.pc === pc) { j.canal = 'Firebase'; self.cb.canal(j.key, 'Firebase'); } };
    dc.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (er) { return; }
      if (m.c && m.c[4] > j.seq) { j.seq = m.c[4]; self.cb.ctrl(j.key, m.c); }
      if (m.ping !== undefined) { try { dc.send(JSON.stringify({ pong: m.ping })); } catch (er) {} }
      if (m.reset) self.cb.reset(j.key);
    };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return esperarICE(pc, 4000); })
      .then(function () { return FB.put(caminho, { quer: quer, type: pc.localDescription.type, sdp: pc.localDescription.sdp }); })
      ['catch'](function (e) { FB.put(caminho, { quer: quer, erro: String(e) }); });
  };
  // manda algo para o celular (pelo WebRTC se possível)
  TV.prototype.enviar = function (key, msg) {
    var j = this.jog[key];
    if (j && this.rtcAberto(j)) { try { j.dc.send(JSON.stringify(msg)); } catch (e) {} }
  };
  TV.prototype.publicarJogador = function (key, dados) { FB.patch(this.base + '/t/' + key, dados)['catch'](function () {}); };
  TV.prototype.remover = function (key) {
    var j = this.jog[key]; if (!j) return;
    if (j.pc) { try { j.pc.close(); } catch (e) {} }
    delete this.jog[key];
    FB.del(this.base + '/c/' + key)['catch'](function () {});
    FB.del(this.base + '/t/' + key)['catch'](function () {});
  };

  // ================================================================ CELULAR
  // cb: { estado(texto), info(dados de t/<key>), msg(m), latencia(ms, canal) }
  function Celular(cod, key, cb) {
    this.cod = cod; this.key = key; this.cb = cb;
    this.base = 'salas/' + cod;
    this.pc = null; this.dc = null; this.quer = null; this.ofertaTratada = false;
    this.seq = Date.now(); this.emVoo = false; this.pend = {}; this.pendFb = {};
    var self = this;
    FB.listen(this.base + '/t/' + key, function (d) {
      if (!d) return;
      self.cb.info(d);
      if (d.offer && d.offer.quer === self.quer && !self.ofertaTratada) { self.ofertaTratada = true; self.responder(d.offer); }
      if (d.pong !== undefined && self.pendFb[d.pong]) { self.cb.latencia(performance.now() - self.pendFb[d.pong], 'Firebase'); delete self.pendFb[d.pong]; }
    });
    // pings para medir o atraso
    setInterval(function () {
      var id = Date.now();
      if (self.aberto()) { self.pend[id] = performance.now(); self.mandar({ ping: id }); }
      else if (self.entrou) { self.pendFb[id] = performance.now(); FB.patch(self.base + '/c/' + key, { ping: id })['catch'](function () {}); }
    }, 1500);
  }
  Celular.prototype.aberto = function () { return this.dc && this.dc.readyState === 'open'; };
  Celular.prototype.entrar = function (nome, carro) {
    this.entrou = true;
    var self = this;
    return FB.patch(this.base + '/c/' + this.key, { nome: nome, carro: carro, t: Date.now() }).then(function () {
      if (!self.aberto()) self.conectar();
    });
  };
  Celular.prototype.conectar = function () {
    var self = this;
    if (!RTCPC) { this.cb.estado('sem WebRTC, usando Firebase'); return; }
    if (this.pc) { try { this.pc.close(); } catch (e) {} }
    this.pc = null; this.dc = null;
    this.quer = 'q' + Date.now(); this.ofertaTratada = false;
    this.cb.estado('conectando…');
    FB.patch(this.base + '/c/' + this.key, { quer: this.quer });
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { if (!self.aberto()) self.cb.estado('sem conexão direta, usando Firebase'); }, 12000);
  };
  Celular.prototype.responder = function (o) {
    var self = this;
    if (o.erro) { this.cb.estado('TV: ' + o.erro); return; }
    var quer = o.quer, pc = this.pc = new RTCPC(ICE);
    pc.ondatachannel = function (e) {
      var dc = self.dc = e.channel;
      dc.onopen = function () { self.cb.estado('conectado'); };
      dc.onclose = function () { if (self.pc === pc) self.cb.estado('desconectado'); };
      dc.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (er) { return; }
        if (m.pong !== undefined && self.pend[m.pong]) { self.cb.latencia(performance.now() - self.pend[m.pong], 'WebRTC'); delete self.pend[m.pong]; }
        else self.cb.msg(m);
      };
    };
    pc.setRemoteDescription({ type: o.type, sdp: o.sdp })
      .then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return esperarICE(pc, 4000); })
      .then(function () { return FB.patch(self.base + '/c/' + self.key, { answer: { quer: quer, type: pc.localDescription.type, sdp: pc.localDescription.sdp } }); })
      ['catch'](function (e) { self.cb.estado('erro: ' + e); });
  };
  Celular.prototype.mandar = function (m) { if (this.aberto()) { try { this.dc.send(JSON.stringify(m)); return true; } catch (e) {} } return false; };
  // controle: [x, a, r, n]; pelo WebRTC sempre, pelo Firebase só um envio por vez
  Celular.prototype.controle = function (x, a, r, n, forcar) {
    var c = [x, a, r, n, ++this.seq];
    if (this.mandar({ c: c })) return;
    if (this.emVoo && !forcar) { this.seq--; return; }
    var self = this; this.emVoo = true;
    FB.patch(this.base + '/c/' + this.key, { ctrl: c }).then(function () { self.emVoo = false; }, function () { self.emVoo = false; });
  };
  Celular.prototype.sair = function () {
    this.entrou = false;
    if (this.pc) { try { this.pc.close(); } catch (e) {} }
    this.pc = null; this.dc = null; this.quer = null;
    return FB.del(this.base + '/c/' + this.key)['catch'](function () {});
  };

  window.Rede = { TV: TV, Celular: Celular, novoCodigo: novoCodigo };
})();
