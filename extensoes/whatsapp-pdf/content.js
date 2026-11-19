// Baixa automaticamente PDFs e IMAGENS recebidos em conversas INDIVIDUAIS do WhatsApp Web.
//
// Como funciona: roda no mundo da propria pagina para usar o objeto WPP que a
// extensao WaSpeed ja carrega no WhatsApp Web. O WPP avisa quando chega mensagem
// nova; aqui filtramos PDF e imagem (JPEG, PNG, WebP — foto de documento, RG,
// CNH, comprovante), ignoramos grupos, figurinhas (sticker), GIF e mensagens
// enviadas por nos, e baixamos o arquivo salvando com o NOME DO CLIENTE na
// frente ("Maria - boleto.pdf", "Beatriz - foto (1).jpeg"), para a fila de
// impressao do Nexcafe mostrar de quem e. O Chrome salva na pasta de downloads
// configurada (L:\Meu Drive\Rotina Diaria\Recebimento de Arquivos).
(() => {
  "use strict";
  if (window.__nexcafePdfAtivo) return;
  window.__nexcafePdfAtivo = true;

  const vistos = new Set();
  const espera = ms => new Promise(resolve => setTimeout(resolve, ms));

  const IMAGEM_MIME = /^image\/(jpeg|jpg|png|webp)$/i;
  const ARQUIVO_EXT = /\.(pdf|jpe?g|png|webp)$/i;

  function nomeSeguro(nome) {
    const limpo = String(nome || "").replace(/[\\/:*?"<>|]+/g, "-").trim().replace(/[.\s]+$/, "").slice(0, 120);
    return ARQUIVO_EXT.test(limpo) ? limpo : `${limpo || "arquivo"}.pdf`;
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
    const nome = String(msg.mediaData?.filename || msg.filename || "").trim();
    // Foto do WhatsApp vem sem nome de arquivo: o body carrega o base64 (comeca com /9j/, iVBOR ou data:).
    // Nesse caso inventa um nome limpo com dia e hora, como o atendente chamaria.
    if (nome && !/^data:|^\/9j\/|^iVBOR/i.test(nome)) return nome;
    if (msg.type === "image") {
      const agora = new Date();
      return `foto ${agora.toLocaleDateString("en-CA")} ${agora.toTimeString().slice(0, 5).replace(":", "h")}.jpeg`;
    }
    return `arquivo-${Date.now()}.pdf`;
  }

  // PDF ou foto do cliente: documento anexado, imagem solta (menos figurinha e GIF,
  // que nao sao coisa de imprimir).
  function pareceImprimivel(msg) {
    const mimetype = String(msg.mimetype || msg.mediaData?.mimetype || "").toLowerCase();
    const nome = String(nomeDoArquivo(msg));
    if (/^image\/(gif|tiff)$/i.test(mimetype)) return false;
    if (msg.type === "sticker" || msg.type === "video" || msg.type === "audio") return false;
    if (msg.type === "document" || msg.type === "image") return true;
    return mimetype === "application/pdf" || IMAGEM_MIME.test(mimetype) || ARQUIVO_EXT.test(nome);
  }

  async function ehBlobImprimivel(blob, nome) {
    const tipo = String(blob.type || "").toLowerCase();
    if (/pdf/i.test(tipo) || /\.pdf$/i.test(String(nome || ""))) return true;
    if (IMAGEM_MIME.test(tipo) || /\.(jpe?g|png|webp)$/i.test(String(nome || ""))) return true;
    try {
      const cabecalho = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (cabecalho[0] === 0x25 && cabecalho[1] === 0x50 && cabecalho[2] === 0x44 && cabecalho[3] === 0x46) return true; // %PDF
      if (cabecalho[0] === 0xff && cabecalho[1] === 0xd8) return true; // JPEG
      if (cabecalho[0] === 0x89 && cabecalho[1] === 0x50 && cabecalho[2] === 0x4e && cabecalho[3] === 0x47) return true; // PNG
      if (cabecalho[0] === 0x52 && cabecalho[1] === 0x49 && cabecalho[2] === 0x46 && cabecalho[3] === 0x46) return true; // RIFF (WebP)
    } catch {
      return false;
    }
    return false;
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
      if (deMim || ehGrupo(msg) || !pareceImprimivel(msg)) return;

      // Marca antes de baixar para nao repetir quando o WhatsApp reenvia o evento.
      vistos.add(id);
      const nome = nomeDoArquivo(msg);
      const cliente = nomeDoCliente(msg);
      const nomeFinal = cliente ? `${cliente} - ${nome}` : nome;

      for (let tentativa = 1; tentativa <= 5; tentativa++) {
        try {
          const blob = await window.WPP.chat.downloadMedia(id);
          if (blob && blob.size > 0) {
            if (!(await ehBlobImprimivel(blob, nome))) {
              console.log(`[Nexcafe] ignorado (nao e PDF nem foto): ${nome}`);
              return;
            }
            salvar(blob, nomeFinal);
            console.log(`[Nexcafe] arquivo baixado: ${nomeFinal} (${blob.size} bytes)`);
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
    console.log("[Nexcafe] download automatico de PDF e fotos ativo (somente conversas individuais).");
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
