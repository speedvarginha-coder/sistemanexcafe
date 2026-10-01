const fs = require("node:fs");
const path = require("node:path");
const { createApp } = require("./app");

// Registra a causa de qualquer queda: a tarefa agendada religa o servidor em ate 1 minuto.
const logFile = path.join(process.env.LHM_DATA_DIR || path.join(__dirname, "data"), "servidor.log");
function log(message) {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`); } catch {}
}
process.on("uncaughtException", (error) => { log(`QUEDA: ${error && error.stack || error}`); process.exit(1); });
process.on("unhandledRejection", (error) => { log(`ERRO NAO TRATADO: ${error && error.stack || error}`); });

const port = Number(process.env.LHM_PORT || 4780);
const server = createApp({ dataDir: process.env.LHM_DATA_DIR, port });
// Reinicio: o processo antigo pode levar alguns segundos para soltar a porta; espera em vez de cair.
let listenTries = 0;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && ++listenTries <= 15) { setTimeout(() => server.listen(port, "0.0.0.0"), 1000); return; }
  log(`QUEDA: ${error.stack || error}`); process.exit(1);
});
server.listen(port, "0.0.0.0", () => {
  log(`Servidor iniciado (pid ${process.pid})`);
  console.log(`LanHouseManager: http://localhost:${port}`);
});

// Busca na rede: a estacao que perdeu o servidor (endereco mudou) pergunta "LHM?" em broadcast e recebe a porta.
const dgram = require("node:dgram");
const finder = dgram.createSocket({ type: "udp4", reuseAddr: true });
finder.on("message", (msg, rinfo) => { if (String(msg).trim() === "LHM?") finder.send(`LHM:${port}`, rinfo.port, rinfo.address); });
let finderTries = 0;
finder.on("error", (error) => {
  if (++finderTries <= 15) { setTimeout(() => { try { finder.bind(port + 1); } catch { } }, 1000); return; }
  log(`Busca na rede indisponivel: ${error.message}`);
});
finder.bind(port + 1);
