// gmb_arte.js — Gerador das artes dos posts da ficha no Google (separado do criador das redes sociais)
// Formato 4:3 (1200 × 900), o que a ficha mostra sem corte. Layout das artes publicadas em out/2026:
// faixa branca com logo, bloco verde com título (palavra em destaque amarela), foto à direita com diagonal
// amarela, selo amarelo e rodapé branco com endereço e aviso legal.
(function () {
  'use strict';

  const W = 1200, H = 900;
  const FAIXA_TOPO = 205;   // faixa branca do logo
  const RODAPE = 790;       // início do rodapé branco
  const DIAG_TOPO = 690, DIAG_BASE = 860; // x da diagonal no topo e na base do bloco verde
  const VERDE = '#014b29', VERDE_MARCA = '#019652', AMARELO = '#f8db1f';
  const FONTE = 'Montserrat';
  const LEGAL = ['Correspondente bancário. Sujeito à análise e às', 'condições da instituição financeira.'];

  // Fotos reais do acervo; recorte vertical (0 a 1) para tirar textos da parte de baixo de algumas.
  const FOTOS = {
    casal: { src: 'assets/img/casal-idosos.jpg', x: 0.42 },
    balcao: { src: 'social/posts/promo-nap-091349-foto.png', x: 0.52, y: 0.42, zoom: 1.9 },
    homem: { src: 'social/posts/promo-refinanciamento-091642-foto.png', x: 0.62 },
    senhora: { src: 'social/posts/promo-refinanciamento-210319-foto.png', x: 0.55 },
    cozinha: { src: 'social/posts/promo-credito-pessoal-091701-foto.png', x: 0.52, box: [0.215, 0.2, 0.785, 0.77] }
  };

  const cache = {};
  function imagem(src) {
    cache[src] ||= new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Imagem não carregou: ${src}`));
      img.src = src;
    });
    return cache[src];
  }

  let fontesProntas;
  // Montserrat do Google Fonts: espera a folha de estilos chegar antes de pedir cada peso, senão o canvas usa a fonte padrão.
  function fontes() {
    fontesProntas ||= new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap';
      link.onload = resolve;
      link.onerror = () => reject(new Error('Fonte Montserrat não carregou'));
      document.head.appendChild(link);
    }).then(() => Promise.all(['900 80px', '800 30px', '600 17px'].map(f => document.fonts.load(`${f} ${FONTE}`))))
      .then(carregadas => {
        if (carregadas.some(lista => !lista.length)) throw new Error('Fonte Montserrat não carregou');
      });
    return fontesProntas;
  }

  function diagX(y) { return DIAG_TOPO + (DIAG_BASE - DIAG_TOPO) * (y / RODAPE); }

  // Foto cobrindo a área, centrada no ponto (x, y) da imagem (0 a 1); zoom > 1 aproxima.
  // "box" (x0, y0, x1, y1 de 0 a 1) limita a parte útil do arquivo, para fugir de molduras e textos.
  function cobrir(ctx, img, foto, x, y, w, h) {
    const [bx0, by0, bx1, by1] = foto.box || [0, 0, 1, foto.maxY || 1];
    const ox = img.width * bx0, oy = img.height * by0;
    const larg = img.width * (bx1 - bx0), alt = img.height * (by1 - by0);
    const escala = Math.max(w / larg, h / alt) * (foto.zoom || 1);
    const sw = w / escala, sh = h / escala;
    const sx = ox + Math.min(Math.max(img.width * foto.x - ox - sw / 2, 0), larg - sw);
    const sy = oy + Math.min(Math.max(img.height * (foto.y ?? (by0 + by1) / 2) - oy - sh / 2, 0), alt - sh);
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  // Título com palavras entre *asteriscos* em destaque; quebra de linha pela largura disponível.
  // estilo.marcador: destaque com fundo amarelo atrás do texto (variação 2, fundo claro).
  function titulo(ctx, texto, x, yTopo, larguraMax, estilo = { cor: '#ffffff', destaque: AMARELO }) {
    const palavras = texto.split(/\s+/).map(p => ({ texto: p.replace(/\*/g, ''), destaque: /\*/.test(p) }));
    let tamanho = 84, linhas;
    for (; tamanho >= 56; tamanho -= 4) {
      ctx.font = `900 ${tamanho}px ${FONTE}`;
      linhas = [[]];
      for (const p of palavras) {
        const atual = linhas[linhas.length - 1];
        const teste = [...atual, p].map(q => q.texto).join(' ');
        if (atual.length && ctx.measureText(teste).width > larguraMax) linhas.push([p]);
        else atual.push(p);
      }
      if (linhas.length <= 4) break;
    }
    const altura = Math.round(tamanho * 0.98);
    ctx.textBaseline = 'alphabetic';
    linhas.forEach((linha, i) => {
      let cx = x;
      const y = yTopo + tamanho * 0.82 + i * altura;
      linha.forEach((p, j) => {
        const t = p.texto + (j < linha.length - 1 ? ' ' : '');
        if (p.destaque && estilo.marcador) {
          ctx.fillStyle = estilo.marcador;
          retanguloArredondado(ctx, cx - 8, y - tamanho * 0.74, ctx.measureText(p.texto).width + 16, tamanho * 0.9, 10); ctx.fill();
        }
        ctx.fillStyle = p.destaque ? estilo.destaque : estilo.cor;
        ctx.fillText(t, cx, y);
        cx += ctx.measureText(t).width;
      });
    });
    return { fim: yTopo + linhas.length * altura, linhas: linhas.length, tamanho };
  }

  function retanguloArredondado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function pino(ctx, x, y, r, cor) {
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.quadraticCurveTo(x + r, y + r * 0.9, x, y + r * 2.1);
    ctx.quadraticCurveTo(x - r, y + r * 0.9, x - r, y);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, Math.PI * 2); ctx.fill();
  }

  async function render(arte) {
    await fontes();
    const foto = FOTOS[arte.foto] || FOTOS.casal;
    const [img, logo] = await Promise.all([imagem(foto.src), imagem('assets/img/logo-verde.png')]);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Layout "b" é o espelho: foto à esquerda, logo e bloco verde à direita (a foto não é espelhada).
    const espelho = arte.layout === 'b';
    const fotoX = DIAG_TOPO - 40;
    cobrir(ctx, img, foto, espelho ? 0 : fotoX, 0, W - fotoX, RODAPE);
    ctx.save();
    if (espelho) ctx.setTransform(-1, 0, 0, 1, W, 0);

    // Faixa branca do logo e bloco verde, cortados pela diagonal.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(diagX(0), 0); ctx.lineTo(diagX(FAIXA_TOPO), FAIXA_TOPO); ctx.lineTo(0, FAIXA_TOPO); ctx.closePath(); ctx.fill();
    const grad = ctx.createLinearGradient(0, FAIXA_TOPO, 0, RODAPE);
    grad.addColorStop(0, '#0a6a3a'); grad.addColorStop(1, VERDE);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, FAIXA_TOPO); ctx.lineTo(diagX(FAIXA_TOPO), FAIXA_TOPO); ctx.lineTo(diagX(RODAPE), RODAPE); ctx.lineTo(0, RODAPE); ctx.closePath(); ctx.fill();
    // Diagonal amarela: larga junto à faixa do logo, fina ao longo do bloco verde.
    ctx.fillStyle = AMARELO;
    ctx.beginPath(); ctx.moveTo(diagX(0), 0); ctx.lineTo(diagX(0) + 46, 0); ctx.lineTo(diagX(FAIXA_TOPO) + 18, FAIXA_TOPO); ctx.lineTo(diagX(FAIXA_TOPO), FAIXA_TOPO); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(diagX(FAIXA_TOPO), FAIXA_TOPO); ctx.lineTo(diagX(FAIXA_TOPO) + 10, FAIXA_TOPO); ctx.lineTo(diagX(RODAPE) + 10, RODAPE); ctx.lineTo(diagX(RODAPE), RODAPE); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Logo oficial.
    const logoW = 360, logoH = logo.height * logoW / logo.width;
    ctx.drawImage(logo, espelho ? W - 62 - logoW : 62, (FAIXA_TOPO - logoH) / 2 + 4, logoW, logoH);

    // Título e selo.
    const yTitulo = FAIXA_TOPO + 66;
    // No espelho o bloco verde alarga para baixo: a margem esquerda vale a do topo do título.
    const margem = espelho ? W - diagX(yTitulo) + 56 : 66;
    const limite = y => espelho ? W - 66 : diagX(y) - 50;
    const t = titulo(ctx, arte.titulo, margem, yTitulo, limite(yTitulo + 160) - margem);
    if (arte.selo) {
      ctx.font = `800 30px ${FONTE}`;
      const largura = Math.min(ctx.measureText(arte.selo).width + 52, limite(t.fim + 80) - margem + 20);
      const ySelo = Math.min(t.fim + 34, RODAPE - 120);
      ctx.fillStyle = AMARELO;
      retanguloArredondado(ctx, margem, ySelo, largura, 62, 12); ctx.fill();
      ctx.fillStyle = VERDE; ctx.textBaseline = 'middle';
      ctx.fillText(arte.selo, margem + 26, ySelo + 33, largura - 52);
      ctx.textBaseline = 'alphabetic';
    }

    // Rodapé branco: endereço e aviso legal.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, RODAPE, W, H - RODAPE);
    pino(ctx, 82, RODAPE + 40, 15, VERDE_MARCA);
    ctx.fillStyle = VERDE; ctx.font = `800 28px ${FONTE}`; ctx.textBaseline = 'middle';
    ctx.fillText('Varginha • Rua Santa Cruz, 696 • Centro', 116, RODAPE + 56);
    ctx.fillStyle = '#5b6b63'; ctx.font = `600 17px ${FONTE}`; ctx.textAlign = 'right';
    ctx.fillText(LEGAL[0], W - 44, RODAPE + 44);
    ctx.fillText(LEGAL[1], W - 44, RODAPE + 68);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    return { canvas, linhas: t.linhas, tamanho: t.tamanho, cabe: t.fim + (arte.selo ? 120 : 0) <= RODAPE - 20 };
  }

  // Variação 2: fundo claro, título verde com marcador amarelo, foto em moldura e faixa verde de contato.
  async function renderPanfleto(arte) {
    await fontes();
    const foto = FOTOS[arte.foto] || FOTOS.casal;
    const [img, logo] = await Promise.all([imagem(foto.src), imagem('assets/img/logo-verde.png')]);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const FAIXA = 734, LEGAL_Y = 866;

    ctx.fillStyle = '#f3f9f5'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(1, 150, 82, 0.07)';
    ctx.beginPath(); ctx.arc(150, 760, 420, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = AMARELO; ctx.fillRect(0, 0, W, 10);

    // Foto em moldura arredondada, com a sombra amarela da marca.
    const fx = 700, fy = 46, fw = 452, fh = FAIXA - 46 - 44;
    ctx.fillStyle = AMARELO; retanguloArredondado(ctx, fx + 18, fy + 18, fw, fh, 34); ctx.fill();
    ctx.save(); retanguloArredondado(ctx, fx, fy, fw, fh, 34); ctx.clip();
    // Moldura vertical e estreita: zoom menor para caber as duas pessoas da foto do balcão.
    cobrir(ctx, img, foto.zoom ? { ...foto, zoom: foto.zoom * 0.72, x: 0.56 } : foto, fx, fy, fw, fh);
    ctx.restore();

    const logoW = 300, logoH = logo.height * logoW / logo.width;
    ctx.drawImage(logo, 58, 52, logoW, logoH);

    const t = titulo(ctx, arte.titulo, 62, 190, 600, { cor: VERDE, destaque: VERDE, marcador: AMARELO });
    if (arte.selo) {
      const ySelo = Math.min(t.fim + 30, FAIXA - 70);
      ctx.fillStyle = VERDE_MARCA; retanguloArredondado(ctx, 62, ySelo, 10, 44, 5); ctx.fill();
      ctx.font = `800 30px ${FONTE}`; ctx.fillStyle = VERDE_MARCA; ctx.textBaseline = 'middle';
      ctx.fillText(arte.selo, 88, ySelo + 23, 560);
      ctx.textBaseline = 'alphabetic';
    }

    // Faixa verde: telefone à esquerda, loja à direita.
    const grad = ctx.createLinearGradient(0, FAIXA, W, LEGAL_Y);
    grad.addColorStop(0, '#0a6a3a'); grad.addColorStop(1, VERDE);
    ctx.fillStyle = grad; ctx.fillRect(0, FAIXA, W, LEGAL_Y - FAIXA);
    ctx.fillStyle = AMARELO; ctx.fillRect(0, FAIXA, W, 6);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff'; ctx.font = `800 18px ${FONTE}`;
    ctx.fillText('CONSULTE AS CONDIÇÕES', 62, FAIXA + 50);
    ctx.fillStyle = AMARELO; ctx.font = `900 40px ${FONTE}`;
    ctx.fillText('(35) 3067-5017', 60, FAIXA + 96);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fillRect(470, FAIXA + 30, 2, 76);
    pino(ctx, 522, FAIXA + 46, 13, AMARELO);
    ctx.fillStyle = '#ffffff'; ctx.font = `800 20px ${FONTE}`;
    ctx.fillText('SPEED FINANCEIRA', 552, FAIXA + 56);
    ctx.font = `600 19px ${FONTE}`;
    ctx.fillText('Rua Santa Cruz, 696 • Centro • Varginha/MG', 552, FAIXA + 90);

    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, LEGAL_Y, W, H - LEGAL_Y);
    ctx.fillStyle = '#5b6b63'; ctx.font = `600 17px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Correspondente bancário. Sujeito à análise e às condições da instituição financeira.', W / 2, LEGAL_Y + 19);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    return { canvas, linhas: t.linhas, tamanho: t.tamanho, cabe: t.fim + (arte.selo ? 74 : 0) <= FAIXA - 10 };
  }

  function toBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao gerar PNG')), 'image/png'));
  }

  window.SpeedGmbArte = { render, renderPanfleto, toBlob, FOTOS: Object.keys(FOTOS) };
})();
