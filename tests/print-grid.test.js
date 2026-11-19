const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

test("pdf-tools: comando grid junta 2 imagens em 1 folha A4 em grade 9x13", () => {
  const script = path.join(__dirname, "..", "server", "pdf-tools.py");
  const tempDir = path.join(process.env.TEMP || "C:\\Windows\\Temp", `test-grid-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Cria 2 imagens de teste de 800x1200
  const img1 = path.join(tempDir, "img1.png");
  const img2 = path.join(tempDir, "img2.png");
  const outPdf = path.join(tempDir, "saida.pdf");

  execFileSync("python", ["-c", `
from PIL import Image
Image.new('RGB', (800, 1200), (200, 50, 50)).save(r'${img1}')
Image.new('RGB', (800, 1200), (50, 50, 200)).save(r'${img2}')
  `]);

  const raw = execFileSync("python", [script, "grid", outPdf, img1, img2], { encoding: "utf8" });
  const result = JSON.parse(raw.trim());

  assert.equal(result.ok, true);
  assert.equal(result.pages, 1);
  assert.equal(result.imagesCount, 2);
  assert.equal(fs.existsSync(outPdf), true);

  // Limpeza
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("pdf-tools: comando grid funciona para 1 imagem no quadrante 9x13", () => {
  const script = path.join(__dirname, "..", "server", "pdf-tools.py");
  const tempDir = path.join(process.env.TEMP || "C:\\Windows\\Temp", `test-grid-single-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const img1 = path.join(tempDir, "cnh.jpg");
  const outPdf = path.join(tempDir, "cnh.pdf");

  execFileSync("python", ["-c", `
from PIL import Image
Image.new('RGB', (1000, 1500), (50, 150, 50)).save(r'${img1}')
  `]);

  const raw = execFileSync("python", [script, "grid", outPdf, img1], { encoding: "utf8" });
  const result = JSON.parse(raw.trim());

  assert.equal(result.ok, true);
  assert.equal(result.pages, 1);
  assert.equal(result.imagesCount, 1);
  assert.equal(fs.existsSync(outPdf), true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("pdf-tools: comando rotate gira imagem em 90 graus", () => {
  const script = path.join(__dirname, "..", "server", "pdf-tools.py");
  const tempDir = path.join(process.env.TEMP || "C:\\Windows\\Temp", `test-rotate-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const img = path.join(tempDir, "foto.jpg");
  execFileSync("python", ["-c", `
from PIL import Image
Image.new('RGB', (1200, 800), (100, 100, 100)).save(r'${img}')
  `]);

  const raw = execFileSync("python", [script, "rotate", img, "90"], { encoding: "utf8" });
  const result = JSON.parse(raw.trim());

  assert.equal(result.ok, true);
  assert.equal(result.width, 800);
  assert.equal(result.height, 1200);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
