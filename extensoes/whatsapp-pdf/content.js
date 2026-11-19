// Baixa automaticamente PDFs recebidos em conversas INDIVIDUAIS do WhatsApp Web.
//
// Como funciona: roda no mundo da propria pagina para usar o objeto WPP que a
// extensao WaSpeed ja carrega no WhatsApp Web. O WPP avisa quando chega mensagem
// nova; aqui filtramos PDF, ignoramos grupos e mensagens enviadas por nos,
// baixamos o arquivo salvando com o NOME DO CLIENTE na frente
// ("Maria - boleto.pdf"), para a fila de impressao do Nexcafe mostrar de quem e.
// O Chrome salva na pasta de downloads configurada
// (L:\Meu Drive\Rotina Diaria\Recebimento de Arquivos).
(() => {
  "use strict";
  if (window.__nexcafePdfAtivo) return;
  window.__nexcafePdfAtivo = true;

  const vistos = new Set();
  const espera = ms => new Promise(resolve => setTimeout(resolve, ms));

  function nomeSeguro(nome) {
    const limpo = String(nome || "").replace(/[\\/:*?"<>|]+/g, "-").trim().replace(/[.\s]+$/, "").slice(0, 120);
    return /\.pdf$/i.test(limpo) ? limpo : `${limpo || "documento"}.pdf`;
  }

  // Nome do cliente da conversa: a fila de impressao mostra de quem e o arquivo.
  function nomeDoCliente(msg) {
    const chat = msg.chat || {};
    const contato = chat.contact || {};
    const candidato = chat.name || contato.pushname || contato.formattedName || contato.name
      || msg.sender?.pushname || msg.sender?.formattedName || "";
    return String(candidato || "").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 30);
  }

  function salvar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeSeguro(nome);
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function nomeDoArquivo(msg) {
    return msg.mediaData?.filename || msg.filename || msg.body || `whatsapp-${Date.now()}.pdf`;
  }

  function parecePdf(msg) {
    const mimetype = String(msg.mimetype || msg.mediaData?.mimetype || "").toLowerCase();
    const nome = String(nomeDoArquivo(msg));
    return msg.type === "document" || mimetype === "application/pdf" || /\.pdf$/i.test(nome);
  }

  async function ehBlobPdf(blob, nome) {
    if (/pdf/i.test(String(blob.type || "")) || /\.pdf$/i.test(String(nome || ""))) return true;
    try {
      const cabecalho = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      return cabecalho[0] === 0x25 && cabecalho[1] === 0x50 && cabecalho[2] === 0x44 && cabecalho[3] === 0x46;
    } catch {
      return false;
    }
  }

  function ehGrupo(msg) {
    const id = String(msg.id?._serialized || msg.id || "");
    return Boolean(msg.isGroupMsg) || /@g\.us/i.test(id) || /@broadcast/i.test(id) || /@newsletter/i.test(id);
  }

  async function baixar(msg) {
    let id = "";
    try {
      id = msg.id?._serialized || String(msg.id || "");
      if (!id || vistos.has(id)) return;
      const deMim = Boolean(msg.fromMe ?? msg.id?.fromMe);
      if (deMim || ehGrupo(msg) || !parecePdf(msg)) return;

      // Marca antes de baixar para nao repetir quando o WhatsApp reenvia o evento.
      vistos.add(id);
      const nome = nomeDoArquivo(msg);
      const cliente = nomeDoCliente(msg);
      const nomeFinal = cliente ? `${cliente} - ${nome}` : nome;

      for (let tentativa = 1; tentativa <= 5; tentativa++) {
        try {
          const blob = await window.WPP.chat.downloadMedia(id);
          if (blob && blob.size > 0) {
            if (!(await ehBlobPdf(blob, nome))) {
              console.log(`[Nexcafe] ignorado (nao e PDF): ${nome}`);
              return;
            }
            salvar(blob, nomeFinal);
            console.log(`[Nexcafe] PDF baixado: ${nomeFinal} (${blob.size} bytes)`);
            return;
          }
        } catch (erro) {
          if (tentativa === 5) console.warn(`[Nexcafe] nao consegui baixar ${nome}:`, erro?.message || erro);
        }
        await espera(1000 * tentativa);
      }
    } catch (erro) {
      console.warn("[Nexcafe] erro ao tratar mensagem:", erro?.message || erro, id);
    }
  }

  function iniciar() {
    if (!window.WPP?.on || !window.WPP?.chat?.downloadMedia) return false;
    window.WPP.on("chat.new_message", baixar);
    console.log("[Nexcafe] download automatico de PDF ativo (somente conversas individuais).");
    return true;
  }

  if (!iniciar()) {
    // O WaSpeed injeta o WPP alguns segundos depois de a pagina abrir.
    const timer = setInterval(() => {
      if (iniciar()) clearInterval(timer);
    }, 1000);
    setTimeout(() => clearInterval(timer), 90000);
  }
})();
