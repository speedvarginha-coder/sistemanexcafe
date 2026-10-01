const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const { readBill, boletoFromText } = require("../server/pdf-conta");

// PDF minimo com o texto compactado (FlateDecode), como os PDFs de conta reais.
function makePdf(lines) {
  const content = `BT /F1 10 Tf 50 800 Td ${lines.map(line => `(${line}) Tj 0 -14 Td`).join(" ")} ET`;
  const stream = zlib.deflateSync(Buffer.from(content, "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj << /Type /Page /Resources << /Font << /F1 3 0 R >> >> /Contents 2 0 R >> endobj\n2 0 obj << /Length " + stream.length + " /Filter /FlateDecode >>\nstream\n", "latin1"),
    stream,
    Buffer.from("\nendstream\nendobj\n3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n%%EOF", "latin1")
  ]);
}

test("conta de energia: categoria, valor e vencimento", () => {
  const result = readBill(makePdf(["CEMIG DISTRIBUICAO S.A.", "Consumo 350 kWh", "Vencimento 10/10/2026", "Total a pagar R$ 1.245,67"]));
  assert.equal(result.scanned, false);
  assert.equal(result.suggestion.category, "Energia");
  assert.equal(result.suggestion.amountCents, 124567);
  assert.equal(result.suggestion.dueDate, "2026-10-10");
});

test("aluguel e internet reconhecidos pelo texto", () => {
  assert.equal(readBill(makePdf(["Recibo de aluguel", "Imobiliaria Central", "Valor R$ 2.935,00"])).suggestion.category, "Aluguel");
  assert.equal(readBill(makePdf(["Fatura Internet Fibra 500 Mbps", "Valor a pagar 99,90"])).suggestion.amountCents, 9990);
});

test("linha digitavel do boleto da o valor e o vencimento exatos", () => {
  // Fator 1582 = 22/02/2025 + 582 dias = 2026-09-27; valor 0000012345 = R$ 123,45.
  const boleto = boletoFromText("34191.79001 01043.510047 91020.150008 1 15820000012345");
  assert.equal(boleto.amountCents, 12345);
  assert.equal(boleto.dueDate, "2026-09-27");
});

test("PDF digitalizado (sem texto) avisa para preencher a mao", () => {
  const result = readBill(Buffer.from("%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF", "latin1"));
  assert.equal(result.scanned, true);
});

test("extrato PJ: saidas viram despesas, entradas de venda ficam desmarcadas, comissao entra", () => {
  const { analyzeText } = require("../server/pdf-conta");
  const text = `EXTRATO CONTA CORRENTE
SALDO ANTERIOR 500,00C
02/09/2026 PIX RECEB.OUTRA IF 120,00C
04/09/2026 DEB.CONV.DAS SIMPLES 210,33D
10/09/2026 TED RECEBIDA BANCO PAN COMISSAO 800,00C
30/09/2026 PAGTO ALUGUEL IMOVEL 2.935,00D`;
  const r = analyzeText(text, new Date("2026-10-01"));
  assert.equal(r.kind, "statement");
  assert.deepEqual(r.items.map(i => [i.type, i.date, i.amountCents, i.category, i.include]), [
    ["in", "2026-09-02", 12000, "Vendas (já no caixa)", false],
    ["out", "2026-09-04", 21033, "Impostos", true],
    ["in", "2026-09-10", 80000, "Comissão Speed Financeira", true],
    ["out", "2026-09-30", 293500, "Aluguel", true]
  ]);
});

test("extrato CSV Nubank: transferencia com o CNPJ da loja fica de fora, Pix para o CPF do dono e retirada", () => {
  const { parseBankCsv } = require("../server/pdf-conta");
  const csv = `Data,Valor,Identificador,Descrição
05/05/2026,2400.00,a1,Transferência recebida pelo Pix - SPEED SERVICOS - 29.497.887/0001-57 - SUMUP (0404) Agência: 1 Conta: 1
04/05/2026,1200.00,a2,Depósito Recebido por Boleto
07/05/2026,-67.99,a3,Transferência enviada pelo Pix - HOSTGATOR - 15.754.475/0001-40 - ITAÚ (0341) Agência: 1 Conta: 2
10/05/2026,-2900.00,a4,Transferência enviada pelo Pix - GLEISON SANTOS - •••.780.546-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 3
13/05/2026,-746.34,a5,Transferência enviada pelo Pix - SPEED SERVICOS - 29.497.887/0001-57 - SUMUP (0404) Agência: 1 Conta: 1
14/05/2026,-3000.00,a6,Pagamento de boleto efetuado - BRUNO MARITAN LOREDO LTDA`;
  const items = parseBankCsv(csv);
  assert.deepEqual(items.map(i => [i.bankRef, i.type, i.amountCents, i.category, i.include]), [
    ["a1", "in", 240000, "Movimentação entre contas", false],
    ["a2", "in", 120000, "Vendas (já no caixa)", false],
    ["a3", "out", 6799, "Sistemas e assinaturas", true],
    ["a4", "out", 290000, "Retirada do dono", true],
    ["a5", "out", 74634, "Movimentação entre contas", false],
    ["a6", "out", 300000, "Aluguel", true]
  ]);
});
