// Integracao Nexcafe: os dados do painel de marketing (chaves "speed_*" do localStorage)
// passam a ser guardados no servidor do Nexcafe (banco + backup diario e externo).
// O servidor injeta window.__NEXCAFE_MARKETING__ com os dados salvos antes dos scripts do painel.
(function () {
  "use strict";
  var PREFIX = "speed_";
  var store = window.localStorage;
  var setItem = Storage.prototype.setItem, removeItem = Storage.prototype.removeItem, clear = Storage.prototype.clear;
  var saved = window.__NEXCAFE_MARKETING__ || {};

  // O servidor e a fonte da verdade: substitui o que estiver no navegador.
  for (var i = store.length - 1; i >= 0; i--) {
    var key = store.key(i);
    if (key && key.indexOf(PREFIX) === 0 && !(key in saved)) removeItem.call(store, key);
  }
  Object.keys(saved).forEach(function (key) { try { setItem.call(store, key, saved[key]); } catch (e) { } });

  var pending = { set: {}, remove: {} }, timer = null;
  function flush(keepalive) {
    timer = null;
    var body = { set: pending.set, remove: Object.keys(pending.remove) };
    if (!Object.keys(body.set).length && !body.remove.length) return;
    pending = { set: {}, remove: {} };
    fetch("/api/marketing/store", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: !!keepalive && JSON.stringify(body).length < 60000 })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); })
      .catch(function () {
        // Falhou: devolve para a fila e tenta de novo.
        Object.keys(body.set).forEach(function (k) { if (!(k in pending.set) && !pending.remove[k]) pending.set[k] = body.set[k]; });
        body.remove.forEach(function (k) { if (!(k in pending.set)) pending.remove[k] = true; });
        schedule(5000);
      });
  }
  function schedule(ms) { if (!timer) timer = setTimeout(flush, ms || 700); }

  Storage.prototype.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (this === store && String(key).indexOf(PREFIX) === 0) { pending.set[key] = String(value); delete pending.remove[key]; schedule(); }
  };
  Storage.prototype.removeItem = function (key) {
    removeItem.call(this, key);
    if (this === store && String(key).indexOf(PREFIX) === 0) { delete pending.set[key]; pending.remove[key] = true; schedule(); }
  };
  Storage.prototype.clear = function () {
    if (this === store) for (var i = store.length - 1; i >= 0; i--) { var k = store.key(i); if (k && k.indexOf(PREFIX) === 0) { delete pending.set[k]; pending.remove[k] = true; } }
    clear.call(this);
    if (this === store) schedule();
  };
  window.addEventListener("pagehide", function () { if (timer) { clearTimeout(timer); flush(true); } });
})();
