// Controle de teste: dirige o carro da TV e mede o atraso ida e volta pelo Firebase e pelo WebRTC.
(function () {
  var BASE = 'salas/PNEUS';
  function $(id) { return document.getElementById(id); }
  function agora() { return performance.now(); }

  var ctrl = { x: 0, a: 0 }, seq = Date.now(), mudou = true;
  var fb = [], rtc = [];                 // últimas medidas (ms)
  var pendFb = {}, pendRtc = {};         // pings esperando resposta
  var pc = null, dc = null, minhaQuer = null, ofertaTratada = false, rtcEstado = 'esperando', soFirebase = false, rtcTimer = null;
  var RTCPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;

  // ---------------- estatística
  function stats(a) {
    if (!a.length) return null;
    var s = a.slice().sort(function (x, y) { return x - y; });
    return { med: Math.round(s[Math.floor(s.length / 2)]), min: Math.round(s[0]), max: Math.round(s[s.length - 1]), n: s.length };
  }
  function guardar(a, v) { a.push(v); if (a.length > 40) a.shift(); }

  function rtcAberto() { return dc && dc.readyState === 'open' && !soFirebase; }

  function mostrar() {
    var f = stats(fb), r = stats(rtc);
    $('med').innerHTML =
      'Firebase: ' + (f ? '<b>' + f.med + ' ms</b> ida e volta (min ' + f.min + ', máx ' + f.max + ')' : 'medindo…') + '<br>' +
      'WebRTC: ' + (r ? '<b>' + r.med + ' ms</b> ida e volta (min ' + r.min + ', máx ' + r.max + ')' : rtcEstado) + '<br>' +
      'Controle indo por: <b>' + (rtcAberto() ? 'WebRTC' : 'Firebase') + '</b>';
  }

  // ---------------- Firebase: escuta respostas da TV
  FB.listen(BASE + '/t', function (d) {
    if (!d) return;
    if (d.pong !== undefined && pendFb[d.pong]) { guardar(fb, agora() - pendFb[d.pong]); delete pendFb[d.pong]; mostrar(); }
    if (d.offer && d.offer.quer === minhaQuer && !ofertaTratada) { ofertaTratada = true; responderOferta(d.offer); }
  });

  // ---------------- envio do controle
  var emVoo = false, ultimoEnvio = 0;
  setInterval(function () {
    var t = agora();
    if (rtcAberto()) {
      if (mudou || t - ultimoEnvio > 200) {
        try { dc.send(JSON.stringify({ ctrl: { x: ctrl.x, a: ctrl.a, s: ++seq } })); } catch (e) {}
        mudou = false; ultimoEnvio = t;
      }
      return;
    }
    if (emVoo || !(mudou || t - ultimoEnvio > 1000)) return;
    emVoo = true; mudou = false; ultimoEnvio = t;
    FB.patch(BASE + '/c', { ctrl: { x: ctrl.x, a: ctrl.a, s: ++seq } }).then(function () { emVoo = false; }, function () { emVoo = false; });
  }, 33);

  // ---------------- pings
  setInterval(function () {
    var id = Date.now();
    pendFb[id] = agora();
    FB.patch(BASE + '/c', { ping: id });
    if (dc && dc.readyState === 'open') {
      pendRtc[id] = agora();
      try { dc.send(JSON.stringify({ ping: id })); } catch (e) {}
    }
  }, 700);

  // ---------------- resultados para a TV (e para o Claude ler depois)
  setInterval(function () {
    FB.patch(BASE + '/c', { res: { fb: stats(fb), rtc: stats(rtc), rtcEstado: rtcEstado, ua: navigator.userAgent } });
  }, 3000);

  // ---------------- WebRTC
  function esperarICE(p, ms) {
    return new Promise(function (ok) {
      if (p.iceGatheringState === 'complete') return ok();
      var t = setTimeout(ok, ms);
      p.onicecandidate = function (e) { if (!e.candidate) { clearTimeout(t); ok(); } };
    });
  }
  function testarRTC() {
    if (!RTCPC) { rtcEstado = 'celular sem WebRTC'; mostrar(); return; }
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null; dc = null; rtc = [];
    minhaQuer = 'q' + Date.now(); ofertaTratada = false;
    rtcEstado = 'pedindo oferta à TV…'; mostrar();
    FB.patch(BASE + '/c', { quer: minhaQuer });
    clearTimeout(rtcTimer);
    rtcTimer = setTimeout(function () {
      if (!dc || dc.readyState !== 'open') { rtcEstado = 'NÃO conectou (' + rtcEstado + ')'; mostrar(); }
    }, 15000);
  }
  function responderOferta(o) {
    if (o.erro) { rtcEstado = 'TV: ' + o.erro; mostrar(); return; }
    var quer = o.quer;
    pc = new RTCPC({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    var meu = pc;
    pc.ondatachannel = function (e) {
      dc = e.channel;
      dc.onopen = function () { rtcEstado = 'conectado'; mostrar(); };
      dc.onclose = function () { if (meu === pc) { rtcEstado = 'fechou'; mostrar(); } };
      dc.onmessage = function (ev) {
        var m = JSON.parse(ev.data);
        if (m.pong !== undefined && pendRtc[m.pong]) { guardar(rtc, agora() - pendRtc[m.pong]); delete pendRtc[m.pong]; mostrar(); }
      };
    };
    pc.oniceconnectionstatechange = function () { if (meu === pc && (!dc || dc.readyState !== 'open')) { rtcEstado = 'ICE ' + pc.iceConnectionState; mostrar(); } };
    rtcEstado = 'respondendo…'; mostrar();
    pc.setRemoteDescription({ type: o.type, sdp: o.sdp })
      .then(function () { return pc.createAnswer(); })
      .then(function (a) { return pc.setLocalDescription(a); })
      .then(function () { return esperarICE(meu, 4000); })
      .then(function () {
        rtcEstado = 'resposta enviada, conectando…'; mostrar();
        return FB.patch(BASE + '/c', { answer: { quer: quer, type: meu.localDescription.type, sdp: meu.localDescription.sdp } });
      })['catch'](function (e) { rtcEstado = 'erro: ' + e; mostrar(); });
  }

  // ---------------- botões
  $('btRtc').onclick = function () { soFirebase = false; $('btFb').textContent = 'Usar só Firebase'; testarRTC(); };
  $('btFb').onclick = function () {
    soFirebase = !soFirebase;
    this.textContent = soFirebase ? 'Voltar ao WebRTC' : 'Usar só Firebase';
    mudou = true; mostrar();
  };

  // acelerador
  var acel = $('acel');
  function setA(v) { if (ctrl.a !== v) { ctrl.a = v; mudou = true; } acel.className = v ? 'on' : ''; }
  acel.addEventListener('touchstart', function (e) { e.preventDefault(); setA(1); });
  acel.addEventListener('touchend', function (e) { e.preventDefault(); setA(0); });
  acel.addEventListener('touchcancel', function () { setA(0); });
  acel.addEventListener('mousedown', function () { setA(1); });
  acel.addEventListener('mouseup', function () { setA(0); });
  acel.addEventListener('mouseleave', function () { setA(0); });

  // volante (arrastar na horizontal)
  var vol = $('volante'), pino = $('pino'), arrastando = false;
  function setX(px) {
    var r = vol.getBoundingClientRect();
    var x = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (r.width / 2 - 32)));
    if (Math.abs(x) < 0.08) x = 0;
    x = Math.round(x * 20) / 20;
    if (x !== ctrl.x) { ctrl.x = x; mudou = true; }
    pino.style.left = (50 + x * (50 - 3200 / r.width)) + '%';
  }
  function soltar() { arrastando = false; ctrl.x = 0; mudou = true; pino.style.left = '50%'; }
  vol.addEventListener('touchstart', function (e) { e.preventDefault(); setX(e.targetTouches[0].clientX); });
  vol.addEventListener('touchmove', function (e) { e.preventDefault(); setX(e.targetTouches[0].clientX); });
  vol.addEventListener('touchend', function (e) { e.preventDefault(); soltar(); });
  vol.addEventListener('mousedown', function (e) { arrastando = true; setX(e.clientX); });
  window.addEventListener('mousemove', function (e) { if (arrastando) setX(e.clientX); });
  window.addEventListener('mouseup', function () { if (arrastando) soltar(); });

  mostrar();
  setTimeout(testarRTC, 1500);
})();
