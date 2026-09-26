// Garante que mudancas de layout no painel nao removam elementos que o app.js usa.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("painel: todo elemento usado pelo app.js existe no index.html", () => {
  const dir = path.join(__dirname, "..", "server", "public");
  const js = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const used = new Set([...js.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map(match => match[1]));
  const createdByScript = new Set([...js.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(match => match[1]));
  const missing = [...used].filter(id => !html.includes(`id="${id}"`) && !createdByScript.has(id));
  assert.deepEqual(missing, [], `IDs usados pelo app.js e ausentes no index.html: ${missing.join(", ")}`);
});
