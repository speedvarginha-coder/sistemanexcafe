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
server.on("error", (error) => { log(`QUEDA: ${error.stack || error}`); process.exit(1); });
server.listen(port, "0.0.0.0", () => {
  log(`Servidor iniciado (pid ${process.pid})`);
  console.log(`LanHouseManager: http://localhost:${port}`);
});
