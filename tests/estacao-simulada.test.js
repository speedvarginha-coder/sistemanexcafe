// Instalacao completa numa estacao simulada (so roda no Windows): executa o LanHouseAgent.ps1 real
// contra um servidor de teste. Ver tests/estacao-simulada.ps1.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createApp } = require("../server/app");

test("estacao simulada: reinstalar, proteger conta e capturar sem erros", { skip: process.platform !== "win32" }, async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "lhm-estacao-"));
  const dataDir = path.join(work, "server-data");
  const server = createApp({ dataDir, backupDir: "" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const key = (await request("/api/installer-config")).payload.installKey;
    // Estacao ja vinculada numa instalacao anterior.
    const previous = await request("/api/agent/enroll-by-key", { key, id: "tempname", name: "Máquina 11" });
    fs.mkdirSync(path.join(work, "pendrive"), { recursive: true });
    fs.writeFileSync(path.join(work, "pendrive", "install-config.json"), JSON.stringify({ serverUrl: base, installKey: key, stationIds: { 11: "tempname" } }));
    fs.writeFileSync(path.join(work, "config-anterior.json"), JSON.stringify({ ServerUrl: base, MachineId: "tempname", MachineName: "Máquina 11", AgentToken: previous.payload.token, ProtectedUsers: "Usuário" }));

    const script = path.join(__dirname, "estacao-simulada.ps1");
    const agent = path.join(__dirname, "..", "client-agent", "LanHouseAgent.ps1");
    await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Work", work, "-AgentSource", agent], { timeout: 120000 }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stdout}\n${stderr}`)) : resolve()));
    const result = JSON.parse(fs.readFileSync(path.join(work, "resultado.json"), "utf8").replace(/^﻿/, ""));

    assert.equal(result.install, "ok", result.install);
    assert.equal(result.capture, "ok", result.capture);
    assert.match(result.run, /^ok/, `agente inicia depois da instalacao: ${result.run}`);
    assert.match(result.calls.join("\n"), /Tela de bloqueio aberta/, "estacao sem sessao abre o bloqueio");
    assert.deepEqual(result.protectedUsers, ["Usuário"], "usuario inteiro, com acento");
    assert.deepEqual(result.protectedFolders, ["Desktop", "Downloads", "Documents", "Pictures", "Videos", "Music"]);
    assert.ok(result.lastCapture, "captura registrada na configuracao");
    assert.equal(result.startupBat, true);
    assert.equal(result.installedScriptMatches, true, "script instalado e o do pendrive");
    assert.match(result.fileAcl, /Usu.rios:\(I\)\(RX\)/, "arquivos legiveis pelos clientes (herdado)");
    assert.doesNotMatch(result.fileAcl, /Usu.rios:\(I\)\(F\)|Usu.rios:\(I\)\(M\)/, "clientes sem escrita");
    assert.deepEqual(result.adminsAfter, ["Administrador", "Tecnico"], "Tecnico administrador; Usuario deixou de ser");
    const calls = result.calls.join("\n");
    assert.match(calls, /Conta criada: Tecnico/);
    assert.match(calls, /registro: HKU\\S-1-5-21-[\d-]+\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System/);
    assert.doesNotMatch(calls, /reg\.exe BLOQUEADO/, "instalador nao depende do reg.exe (bloqueado pela propria politica)");
    assert.deepEqual(result.policies, { DisableTaskMgr: 1, DisableRegistryTools: 1, DisableCMD: 2, NoRun: 1, DisallowRun1: "powershell.exe" }, "politicas gravadas de verdade");
    assert.match(calls, /Grupo Administradores - Usuário/);
    assert.match(calls, /Defender exclusao/);

    // O token novo gravado pela reinstalacao funciona; o anterior foi substituido.
    assert.notEqual(result.token, previous.payload.token);
    assert.equal((await request("/api/client/tempname/command", undefined, result.token)).status, 200);
    assert.equal((await request("/api/client/tempname/command", undefined, previous.payload.token)).status, 401);
    const state = (await request("/api/state")).payload;
    const machine = state.machines.find(row => row.id === "tempname");
    assert.equal(machine.name, "Máquina 11");
    assert.ok(state.events.some(row => row.title === "Agente iniciado" && row.machineId === "tempname"), "agente conversou com o servidor");
  } finally {
    await new Promise(resolve => server.close(resolve));
    const resolved = path.resolve(work);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()), "limpeza limitada ao diretorio temporario");
    assert.ok(path.basename(resolved).startsWith("lhm-estacao-"), "limpeza limitada ao teste");
    if (!process.env.LHM_KEEP) fs.rmSync(resolved, { recursive: true, force: true }); else console.log("pasta:", resolved);
  }
});

test("telas do agente abrem mesmo com a pasta atual removida (pendrive retirado)", { skip: process.platform !== "win32" }, async () => {
  const script = path.join(__dirname, "pasta-removida.ps1");
  const agent = path.join(__dirname, "..", "client-agent", "LanHouseAgent.ps1");
  const output = await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-AgentFile", agent, "-Label", "agente"], { timeout: 60000 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
  assert.match(output, /agente -> abriu: ok LockScreen/, output);
});

test("lancador do pendrive: eleva pelo cmd.exe, repassa argumentos com acento e grava o erro", { skip: process.platform !== "win32" }, async () => {
  const script = path.join(__dirname, "lancador-elevado.ps1");
  const output = await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { timeout: 90000 }, (error, stdout) => error ? reject(error) : resolve(stdout)));
  assert.match(output, /instalar: retorno=0/, output);
  assert.match(output, /acento correto: True/, output);
  assert.match(output, /capturar: retorno=1 \| arquivo de erro: ERRO: falha simulada na captura/, output);
});
