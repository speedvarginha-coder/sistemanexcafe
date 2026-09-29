// Criador local de artes para a Speed Financeira. Sem envio de fotos a servidores.
(function () {
  'use strict';

  const STORAGE_KEY = 'speed_artes_rascunho_v1';
  const MAX_SLIDES = 10;
  const LOGO_BASE = 'assets/img/';
  const state = {
    postId: null,
    mode: 'single',
    format: 'portrait',
    template: 'brand',
    selected: 0,
    slides: [{ ...newSlide('Crédito com orientação clara', 'Compare condições, taxas e CET antes de contratar.', 'Fale com a Speed Financeira'), composition: 'portrait', imageSource: 'sample' }]
  };
  const logos = {};
  let samplePhoto;
  let ui;

  function draftKey() {
    return state.postId ? `${STORAGE_KEY}_post_${encodeURIComponent(state.postId)}` : STORAGE_KEY;
  }

  function newSlide(title = '', body = '', cta = '') {
    return { title, body, cta, composition: 'editorial', imageSource: 'none', photoFocus: 'center', photo: null };
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey()) || 'null');
      if (!saved || !Array.isArray(saved.slides) || !saved.slides.length) return false;
      state.mode = saved.mode === 'carousel' ? 'carousel' : 'single';
      state.format = saved.format === 'square' ? 'square' : 'portrait';
      state.template = ['brand', 'offer', 'clean'].includes(saved.template) ? saved.template : 'brand';
      state.slides = saved.slides.slice(0, MAX_SLIDES).map(slide => ({
        ...newSlide(String(slide.title || '').slice(0, 140), String(slide.body || '').slice(0, 400), String(slide.cta || '').slice(0, 90)),
        composition: ['editorial', 'portrait', 'scene'].includes(slide.composition) ? slide.composition : (slide.photoLayout === 'person' ? 'portrait' : 'editorial'),
        imageSource: ['sample', 'custom'].includes(slide.imageSource) ? slide.imageSource : 'none',
        photoFocus: ['left', 'right'].includes(slide.photoFocus) ? slide.photoFocus : 'center'
      }));
      state.selected = Math.min(Math.max(Number(saved.selected) || 0, 0), state.slides.length - 1);
      if (state.mode === 'single') state.selected = 0;
      return true;
    } catch (error) {
      console.warn('Rascunho de artes inválido; iniciando um novo.', error);
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(draftKey(), JSON.stringify({
        mode: state.mode,
        format: state.format,
        template: state.template,
        selected: state.selected,
        slides: state.slides.map(({ title, body, cta, composition, imageSource, photoFocus }) => ({ title, body, cta, composition, imageSource, photoFocus }))
      }));
    } catch (error) {
      setStatus('Não foi possível salvar o rascunho neste navegador. Exporte as artes antes de sair.');
    }
  }

  function setStatus(message) {
    if (ui) ui.status.textContent = message;
  }

  function visibleSlides() {
    return state.mode === 'single' ? state.slides.slice(0, 1) : state.slides;
  }

  function currentSlide() {
    return state.slides[state.selected];
  }

  function buildImagePrompt() {
    const slide = currentSlide();
    const composition = {
      editorial: 'Composição editorial de grande impacto, tipografia expressiva e formas geométricas com bastante espaço negativo.',
      portrait: 'Fotografia editorial realista de uma pessoa brasileira adulta em contexto profissional ou cotidiano plausível, com expressão natural. Divida a composição entre retrato e mensagem, preservando o rosto e uma área clara para a manchete. A pessoa é ilustrativa, não um cliente real.',
      scene: 'Cena ou objeto concreto que traduza a ideia do post, com fotografia ou ilustração refinada e área separada para o texto.'
    }[slide.composition] || 'Composição editorial clara.';
    const palette = {
      brand: 'Verde profundo e amarelo da identidade Speed, com branco para contraste.',
      offer: 'Verde Speed, amarelo mais presente e branco; contraste forte sem excesso de efeitos.',
      clean: 'Base clara, verde Speed e pequenos acentos amarelos; aparência editorial sóbria.'
    }[state.template];
    const size = state.format === 'square' ? 'quadrado 1080 × 1080 px' : 'vertical 1080 × 1350 px';
    const sequence = state.mode === 'carousel'
      ? `Este é o slide ${state.selected + 1} de ${visibleSlides().length}. Sequência planejada: ${visibleSlides().map((item, index) => `${index + 1}) ${item.title || 'título pendente'}`).join(' | ')}. Mantenha a mesma linguagem visual e, se houver personagem recorrente, sua aparência consistente; varie enquadramento e organização dos elementos para que os slides não sejam cópias uns dos outros.`
      : 'Peça única: deve comunicar a ideia sem depender de outros slides.';
    return `Crie uma arte publicitária original e refinada para Instagram da Speed Financeira, em formato ${size}.\n\nTÍTULO EXATO: ${slide.title || 'Crédito com orientação clara'}\nTEXTO DE APOIO EXATO: ${slide.body || 'Compare condições antes de decidir.'}\nCHAMADA EXATA: ${slide.cta || 'Fale com a Speed Financeira'}\n\nDIREÇÃO DE ARTE: ${composition} ${palette} Aparência de campanha profissional, fotografia natural, título dominante legível em miniatura, contraste alto, poucos textos e respiro. Pode usar pequenos cartões com ícones simples quando eles ajudarem a explicar a ideia; não acrescente informações novas. Use detalhes gráficos discretos em verde e amarelo para conectar a série, com ritmo visual entre foto, tipografia e blocos de informação. ${sequence}\n\nINTEGRIDADE: use apenas as afirmações fornecidas acima. Não invente vantagens, taxas, prazos, aprovação, depoimentos ou resultados; não represente pessoas geradas como clientes ou funcionários reais. Reserve uma área discreta para o logotipo oficial e dados de contato serem inseridos depois. Não gere logo, uniforme, crachá, telefone ou endereço. Não copie peças de concorrentes. Se algum texto não puder ser reproduzido corretamente, entregue a composição sem esse texto e preserve espaço para acrescentá-lo manualmente. Não use moldura de celular, interface do Instagram ou marca d'água.`;
  }

  function openForPost(post) {
    if (!post) return;
    if (state.postId !== post.id) {
      saveDraft();
      state.postId = post.id;
      if (ui.prompt) ui.prompt.value = '';
      state.mode = /carrossel/i.test(post.formato || '') ? 'carousel' : 'single';
      state.format = 'portrait';
      state.template = 'brand';
      state.selected = 0;
      state.slides = [newSlide(post.manchete || post.titulo || '', post.sub || '', post.cta || 'Fale com a Speed')];
      if (state.mode === 'carousel') state.slides.push(newSlide('Entenda a ideia', 'Explique um ponto por slide.', 'Continue lendo'));
      loadDraft();
    }
    const context = document.getElementById('artPostContext');
    if (context) context.textContent = `Arte vinculada ao post: ${post.manchete || post.titulo || 'Sem título'}${post.calendarioDiaNome ? ` · ${post.calendarioDiaNome}` : ''}. Rascunho salvo separadamente neste navegador.`;
    syncForm();
    setStatus('Revise a arte antes de exportar. O PNG não é anexado automaticamente ao post.');
  }

  function syncForm() {
    if (ui.prompt) ui.prompt.value = '';
    const slide = currentSlide();
    ui.mode.value = state.mode;
    ui.format.value = state.format;
    ui.template.value = state.template;
    ui.title.value = slide.title;
    ui.body.value = slide.body;
    ui.cta.value = slide.cta;
    ui.composition.value = slide.composition;
    ui.imageSource.value = slide.imageSource;
    ui.photoFocus.value = slide.photoFocus;
    ui.compositionHint.textContent = {
      editorial: 'Título forte e formas gráficas. Funciona sem foto.',
      portrait: 'Pessoas em destaque ao lado da mensagem. Requer imagem.',
      scene: 'Cena ou produto em destaque, com texto em faixa própria. Requer imagem.'
    }[slide.composition];
    ui.photo.value = '';
    ui.removePhoto.disabled = slide.imageSource === 'none';
    ui.removePhoto.classList.toggle('opacity-40', slide.imageSource === 'none');
    ui.photoFocus.disabled = slide.imageSource === 'none';
    ui.addSlide.disabled = state.slides.length >= MAX_SLIDES;
    ui.addSlide.classList.toggle('opacity-40', ui.addSlide.disabled);
    ui.removeSlide.disabled = visibleSlides().length <= 1;
    ui.removeSlide.classList.toggle('opacity-40', ui.removeSlide.disabled);
    ui.count.textContent = `(${visibleSlides().length}/${MAX_SLIDES})`;
    ui.current.textContent = String(state.selected + 1);
    ui.downloadAll.textContent = state.mode === 'single' ? 'Baixar pacote em ZIP' : 'Baixar carrossel em ZIP';
    ui.size.textContent = state.format === 'square' ? '1080 × 1080 px' : '1080 × 1350 px';
    renderSlideList();
    renderPreview();
  }

  function renderSlideList() {
    ui.list.replaceChildren();
    visibleSlides().forEach((slide, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = index === state.selected
        ? 'px-3 py-2 rounded-lg bg-green-700 text-white text-xs font-bold'
        : 'px-3 py-2 rounded-lg bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-200';
      button.textContent = `${index + 1}. ${slide.title.trim().slice(0, 19) || 'Sem título'}`;
      button.setAttribute('aria-pressed', String(index === state.selected));
      button.addEventListener('click', () => {
        state.selected = index;
        ui.prompt.value = '';
        saveDraft();
        syncForm();
      });
      ui.list.append(button);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Imagem indisponível'));
      img.src = src;
    });
  }

  function getLogo(kind) {
    if (!logos[kind]) {
      const file = kind === 'light' ? 'logo-branca.png' : 'logo-verde.png';
      logos[kind] = loadImage(LOGO_BASE + file).catch(() => null);
    }
    return logos[kind];
  }

  function getSamplePhoto() {
    if (!samplePhoto) samplePhoto = loadImage(LOGO_BASE + 'casal-idosos.jpg').catch(() => null);
    return samplePhoto;
  }

  function getSlideImage(slide) {
    if (slide.imageSource === 'sample') return getSamplePhoto();
    return Promise.resolve(slide.imageSource === 'custom' ? slide.photo : null);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawCoverRect(ctx, img, x, y, width, height, focus = 'center') {
    const scale = Math.max(width / img.width, height / img.height);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const availableX = img.width - sourceWidth;
    const sourceX = focus === 'left' ? 0 : focus === 'right' ? availableX : availableX / 2;
    ctx.drawImage(img, sourceX, (img.height - sourceHeight) / 2,
      sourceWidth, sourceHeight, x, y, width, height);
  }

  function wrapLines(ctx, text, maxWidth) {
    const result = [];
    for (const paragraph of String(text || '').split(/\r?\n/)) {
      if (!paragraph.trim()) { result.push(''); continue; }
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const proposed = line ? `${line} ${word}` : word;
        if (ctx.measureText(proposed).width <= maxWidth) { line = proposed; continue; }
        if (line) { result.push(line); line = ''; }
        if (ctx.measureText(word).width <= maxWidth) { line = word; continue; }
        let segment = '';
        for (const char of word) {
          if (segment && ctx.measureText(segment + char).width > maxWidth) {
            result.push(segment);
            segment = char;
          } else segment += char;
        }
        line = segment;
      }
      if (line) result.push(line);
    }
    return result;
  }

  function drawTextBlock(ctx, text, x, y, maxWidth, maxLines, lineHeight) {
    const lines = wrapLines(ctx, text, maxWidth);
    const truncated = lines.length > maxLines;
    lines.slice(0, maxLines).forEach((line, index) => {
      if (truncated && index === maxLines - 1) {
        while (line && ctx.measureText(line + '…').width > maxWidth) line = line.slice(0, -1);
        line += '…';
      }
      ctx.fillText(line, x, y + index * lineHeight);
    });
    return { nextY: y + Math.min(lines.length, maxLines) * lineHeight, truncated };
  }

  function fitText(ctx, text, maxWidth, maxLines, preferredSize, minimumSize, weight) {
    let size = preferredSize;
    do {
      ctx.font = `${weight} ${size}px "Space Grotesk", Inter, Arial, sans-serif`;
      if (wrapLines(ctx, text, maxWidth).length <= maxLines) break;
      size -= 4;
    } while (size >= minimumSize);
    return Math.max(size, minimumSize);
  }

  function drawPattern(ctx, width, height, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let radius = 125; radius <= 820; radius += 94) {
      ctx.beginPath();
      ctx.arc(width + 100, height * 0.59, radius, Math.PI * 0.66, Math.PI * 1.52);
      ctx.stroke();
    }
    ctx.restore();
  }


  async function drawArt(canvas, slide, index, total) {
    const width = 1080;
    const height = state.format === 'square' ? 1080 : 1350;
    const square = height === 1080;
    const margin = 76;
    const contentWidth = width - margin * 2;
    const green = '#063f2d';
    const deepGreen = '#082e23';
    const yellow = '#ffe143';
    const composition = ['portrait', 'scene'].includes(slide.composition) ? slide.composition : 'editorial';
    const image = await getSlideImage(slide);
    const missingImage = composition !== 'editorial' && !image;
    const titleText = slide.title?.trim() || 'Seu título aqui';
    const bodyText = slide.body?.trim() || 'Texto de apoio da arte.';
    const ctaText = slide.cta?.trim() || 'Fale com a Speed Financeira';
    const offer = state.template === 'offer';
    const clean = state.template === 'clean';
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    let ink = '#ffffff';
    let logoKind = 'light';
    let buttonFill = yellow;
    let buttonInk = green;
    let footerInk = '#ffffff';
    let titleResult = { truncated: false };
    let bodyResult = { truncated: false };

    if (composition === 'editorial') {
      if (offer) {
        ctx.fillStyle = yellow;
        ctx.fillRect(0, 0, width, height);
        ink = green;
      } else if (clean) {
        ctx.fillStyle = '#f6f7f1';
        ctx.fillRect(0, 0, width, height);
        ink = green;
      } else {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#073d2c');
        gradient.addColorStop(1, '#05784b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
      logoKind = ink === '#ffffff' ? 'light' : 'dark';
      footerInk = ink;
      buttonFill = ink === '#ffffff' ? yellow : green;
      buttonInk = ink === '#ffffff' ? green : '#ffffff';
      ctx.fillStyle = offer ? 'rgba(6, 63, 45, 0.10)' : clean ? 'rgba(6, 63, 45, 0.07)' : 'rgba(255, 225, 67, 0.12)';
      ctx.beginPath(); ctx.arc(1125, square ? 525 : 620, 410, 0, Math.PI * 2); ctx.fill();
      drawPattern(ctx, width, height, ink === '#ffffff' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(6, 63, 45, 0.12)');
      ctx.fillStyle = ink === '#ffffff' ? 'rgba(255, 225, 67, 0.95)' : 'rgba(6, 63, 45, 0.92)';
      ctx.beginPath();
      ctx.moveTo(width - 260, height - 345);
      ctx.lineTo(width, height - 500);
      ctx.lineTo(width, height - 315);
      ctx.closePath(); ctx.fill();
    } else if (composition === 'portrait') {
      ctx.fillStyle = offer ? '#ffe760' : clean ? '#ffffff' : '#f2f6ef';
      ctx.fillRect(0, 0, width, height);
      const photoX = square ? 535 : 520;
      const photoY = square ? 192 : 230;
      const photoWidth = width - photoX;
      const photoHeight = square ? 612 : 698;
      ctx.fillStyle = yellow;
      roundedRect(ctx, photoX - 18, photoY - 18, photoWidth + 18, photoHeight + 18, 46);
      ctx.fill();
      ctx.save();
      roundedRect(ctx, photoX, photoY, photoWidth, photoHeight, 38);
      ctx.clip();
      if (image) drawCoverRect(ctx, image, photoX, photoY, photoWidth, photoHeight, slide.photoFocus);
      else {
        ctx.fillStyle = '#dbe8dd'; ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
        ctx.fillStyle = green; ctx.font = '700 36px Inter, Arial, sans-serif';
        ctx.fillText('ADICIONE UMA FOTO', photoX + 35, photoY + photoHeight / 2);
      }
      ctx.restore();
      ctx.fillStyle = deepGreen;
      ctx.fillRect(0, height - 254, width, 254);
      ink = green;
      logoKind = 'dark';
      footerInk = '#ffffff';
      if (slide.imageSource === 'sample' && image) {
        ctx.fillStyle = 'rgba(8, 46, 35, 0.76)';
        roundedRect(ctx, photoX + 22, photoY + photoHeight - 62, 300, 39, 12);
        ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '600 22px Inter, Arial, sans-serif';
        ctx.fillText('IMAGEM ILUSTRATIVA', photoX + 40, photoY + photoHeight - 36);
      }
    } else {
      const panelTop = square ? 550 : 708;
      if (image) drawCoverRect(ctx, image, 0, 0, width, panelTop + 110, slide.photoFocus);
      else {
        ctx.fillStyle = '#dbe8dd'; ctx.fillRect(0, 0, width, panelTop + 110);
        ctx.fillStyle = green; ctx.font = '700 42px Inter, Arial, sans-serif';
        ctx.fillText('ADICIONE UMA IMAGEM', margin, panelTop / 2);
      }
      const topShade = ctx.createLinearGradient(0, 0, 0, 225);
      topShade.addColorStop(0, 'rgba(4, 36, 26, 0.82)');
      topShade.addColorStop(1, 'rgba(4, 36, 26, 0)');
      ctx.fillStyle = topShade;
      ctx.fillRect(0, 0, width, 225);
      ctx.fillStyle = offer ? yellow : clean ? '#f7f8f2' : deepGreen;
      ctx.beginPath();
      ctx.moveTo(0, panelTop + 34); ctx.lineTo(width, panelTop - 44);
      ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
      ink = offer || clean ? green : '#ffffff';
      logoKind = 'light';
      footerInk = ink;
      buttonFill = ink === '#ffffff' ? yellow : green;
      buttonInk = ink === '#ffffff' ? green : '#ffffff';
      if (slide.imageSource === 'sample' && image) {
        ctx.fillStyle = 'rgba(8, 46, 35, 0.75)';
        roundedRect(ctx, margin, panelTop - 92, 294, 39, 12); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = '600 22px Inter, Arial, sans-serif';
        ctx.fillText('IMAGEM ILUSTRATIVA', margin + 16, panelTop - 66);
      }
    }

    const logo = await getLogo(logoKind);
    if (logo) {
      const logoWidth = 398;
      ctx.drawImage(logo, margin, 58, logoWidth, logoWidth * logo.height / logo.width);
    } else {
      ctx.fillStyle = composition === 'scene' ? '#ffffff' : ink;
      ctx.font = '700 46px Inter, Arial, sans-serif';
      ctx.fillText('SPEED FINANCEIRA', margin, 118);
    }
    ctx.fillStyle = composition === 'scene' ? 'rgba(8, 46, 35, 0.62)' : (ink === '#ffffff' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(6, 63, 45, 0.12)');
    roundedRect(ctx, width - 212, 74, 136, 60, 30); ctx.fill();
    ctx.fillStyle = composition === 'scene' ? '#ffffff' : ink;
    ctx.font = '700 29px Inter, Arial, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText((index + 1) + ' / ' + total, width - 105, 114); ctx.textAlign = 'left';

    if (composition === 'editorial') {
      const accent = ink === '#ffffff' ? yellow : green;
      ctx.fillStyle = accent;
      roundedRect(ctx, margin, square ? 242 : 296, 96, 10, 5); ctx.fill();
      ctx.font = '700 27px Inter, Arial, sans-serif';
      ctx.fillText('CONTEÚDO SPEED', margin, square ? 292 : 346);
      const maxLines = square ? 3 : 4;
      const titleSize = fitText(ctx, titleText, contentWidth, maxLines, square ? 91 : 104, 68, 700);
      const titleLineHeight = Math.round(titleSize * 1.05);
      const titleLines = Math.min(wrapLines(ctx, titleText, contentWidth).length, maxLines);
      ctx.font = (square ? '500 38px' : '500 42px') + ' Inter, Arial, sans-serif';
      const bodyLines = Math.min(wrapLines(ctx, bodyText, contentWidth - 80).length, 2);
      const groupHeight = titleLines * titleLineHeight + 25 + bodyLines * (square ? 51 : 56);
      const groupStart = square ? 342 : 403;
      const groupEnd = height - 296;
      const titleY = groupStart + Math.max(0, (groupEnd - groupStart - groupHeight) / 2);
      ctx.fillStyle = ink;
      ctx.font = '700 ' + titleSize + 'px "Space Grotesk", Inter, Arial, sans-serif';
      titleResult = drawTextBlock(ctx, titleText, margin, titleY, contentWidth, maxLines, titleLineHeight);
      ctx.fillStyle = accent;
      roundedRect(ctx, margin, titleResult.nextY + 2, 72, 8, 4); ctx.fill();
      ctx.fillStyle = ink;
      ctx.font = (square ? '500 38px' : '500 42px') + ' Inter, Arial, sans-serif';
      bodyResult = drawTextBlock(ctx, bodyText, margin, titleResult.nextY + 61, contentWidth - 70, 2, square ? 51 : 56);
    } else if (composition === 'portrait') {
      const titleWidth = 430;
      ctx.fillStyle = green;
      roundedRect(ctx, margin, square ? 230 : 288, 76, 9, 5); ctx.fill();
      ctx.font = '700 25px Inter, Arial, sans-serif';
      ctx.fillText('CRÉDITO COM CLAREZA', margin, square ? 278 : 337);
      const titleSize = fitText(ctx, titleText, titleWidth, 4, square ? 69 : 78, 54, 700);
      ctx.fillStyle = green;
      ctx.font = '700 ' + titleSize + 'px "Space Grotesk", Inter, Arial, sans-serif';
      titleResult = drawTextBlock(ctx, titleText, margin, square ? 343 : 405, titleWidth, 4, Math.round(titleSize * 1.08));
      ctx.font = (square ? '500 32px' : '500 36px') + ' Inter, Arial, sans-serif';
      bodyResult = drawTextBlock(ctx, bodyText, margin, titleResult.nextY + 15, titleWidth, 2, square ? 44 : 48);
    } else {
      const panelTop = square ? 550 : 708;
      const maxLines = square ? 2 : 3;
      ctx.fillStyle = ink === '#ffffff' ? yellow : green;
      roundedRect(ctx, margin, panelTop + 44, 80, 9, 4); ctx.fill();
      ctx.font = '700 25px Inter, Arial, sans-serif';
      ctx.fillText('SPEED FINANCEIRA', margin, panelTop + 87);
      const titleSize = fitText(ctx, titleText, contentWidth, maxLines, square ? 64 : 70, 55, 700);
      ctx.fillStyle = ink;
      ctx.font = '700 ' + titleSize + 'px "Space Grotesk", Inter, Arial, sans-serif';
      titleResult = drawTextBlock(ctx, titleText, margin, panelTop + (square ? 120 : 130), contentWidth, maxLines, Math.round(titleSize * 1.06));
      ctx.font = (square ? '500 31px' : '500 35px') + ' Inter, Arial, sans-serif';
      const bodyMax = wrapLines(ctx, titleText, contentWidth).length >= maxLines ? 1 : 2;
      bodyResult = drawTextBlock(ctx, bodyText, margin, titleResult.nextY + 18, contentWidth - 30, bodyMax, square ? 42 : 47);
    }

    const ctaY = height - (composition === 'editorial' ? 232 : 210);
    ctx.font = '700 38px Inter, Arial, sans-serif';
    const buttonWidth = Math.min(contentWidth, Math.max(430, ctx.measureText(ctaText).width + 158));
    ctx.fillStyle = buttonFill;
    roundedRect(ctx, margin, ctaY, buttonWidth, 90, 45); ctx.fill();
    ctx.fillStyle = buttonInk;
    const ctaTruncated = wrapLines(ctx, ctaText, buttonWidth - 146).length > 1;
    drawTextBlock(ctx, ctaText, margin + 34, ctaY + 59, buttonWidth - 146, 1, 42);
    ctx.beginPath(); ctx.arc(margin + buttonWidth - 53, ctaY + 45, 29, 0, Math.PI * 2);
    ctx.fillStyle = buttonInk === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(6,63,45,0.12)'; ctx.fill();
    ctx.fillStyle = buttonInk;
    ctx.textAlign = 'center'; ctx.font = '700 43px Inter, Arial, sans-serif';
    ctx.fillText('→', margin + buttonWidth - 53, ctaY + 59); ctx.textAlign = 'left';
    ctx.strokeStyle = footerInk === '#ffffff' ? 'rgba(255,255,255,0.35)' : 'rgba(6,63,45,0.25)';
    ctx.beginPath(); ctx.moveTo(margin, height - 94); ctx.lineTo(width - margin, height - 94); ctx.stroke();
    ctx.fillStyle = footerInk;
    ctx.font = '600 27px Inter, Arial, sans-serif';
    ctx.fillText('Varginha, MG', margin, height - 44);
    ctx.textAlign = 'right'; ctx.fillText('(35) 3067-5017', width - margin, height - 44); ctx.textAlign = 'left';
    return { truncated: titleResult.truncated || bodyResult.truncated || ctaTruncated, missingImage };
  }

  let previewToken = 0;
  async function renderPreview() {
    const token = ++previewToken;
    try {
      const canvas = document.createElement('canvas');
      const result = await drawArt(canvas, currentSlide(), state.selected, visibleSlides().length);
      if (token !== previewToken) return;
      ui.canvas.width = canvas.width;
      ui.canvas.height = canvas.height;
      ui.canvas.getContext('2d').drawImage(canvas, 0, 0);
      if (state.postId && typeof AppState !== 'undefined') {
        const post = AppState.posts.find(item => item.id === state.postId);
        if (post) {
          post.artePreview = canvas.toDataURL('image/jpeg', 0.78);
          if (AppState.selectedPost?.id === post.id) {
            renderMockup();
            renderPosts();
          }
        }
      }
      ui.downloadSlide.disabled = result.missingImage;
      ui.downloadAll.disabled = visibleSlides().some(needsImage);
      setStatus(result.missingImage
        ? 'Esta composição precisa de imagem. Escolha a foto ilustrativa ou envie uma foto própria.'
        : result.truncated
          ? 'Parte do texto foi abreviada na arte. Reduza o conteúdo para exibi-lo por completo.'
          : 'Prévia atualizada. Revise texto, taxas e condições antes de publicar.');
    } catch (error) {
      if (token !== previewToken) return;
      console.error(error);
      setStatus('Não foi possível mostrar a prévia. Confira a imagem selecionada.');
    }
  }

  function needsImage(slide) {
    return slide.composition !== 'editorial' && (slide.imageSource === 'none' || (slide.imageSource === 'custom' && !slide.photo));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar PNG')), 'image/png');
    });
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosDate = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const bytes = file.bytes;
      const checksum = crc32(bytes);
      const local = new Uint8Array(30 + name.length);
      const head = new DataView(local.buffer);
      head.setUint32(0, 0x04034b50, true);
      head.setUint16(4, 20, true);
      head.setUint16(10, dosTime, true);
      head.setUint16(12, dosDate, true);
      head.setUint32(14, checksum, true);
      head.setUint32(18, bytes.length, true);
      head.setUint32(22, bytes.length, true);
      head.setUint16(26, name.length, true);
      local.set(name, 30);
      chunks.push(local, bytes);

      const entry = new Uint8Array(46 + name.length);
      const index = new DataView(entry.buffer);
      index.setUint32(0, 0x02014b50, true);
      index.setUint16(4, 20, true);
      index.setUint16(6, 20, true);
      index.setUint16(12, dosTime, true);
      index.setUint16(14, dosDate, true);
      index.setUint32(16, checksum, true);
      index.setUint32(20, bytes.length, true);
      index.setUint32(24, bytes.length, true);
      index.setUint16(28, name.length, true);
      index.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry);
      offset += local.length + bytes.length;
    }
    const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
    const end = new Uint8Array(22);
    const footer = new DataView(end.buffer);
    footer.setUint32(0, 0x06054b50, true);
    footer.setUint16(8, files.length, true);
    footer.setUint16(10, files.length, true);
    footer.setUint32(12, centralSize, true);
    footer.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  async function exportArt(all) {
    ui.downloadSlide.disabled = true;
    ui.downloadAll.disabled = true;
    setStatus('Gerando arquivos...');
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const entries = all ? visibleSlides().map((slide, index) => ({ slide, index })) : [{ slide: currentSlide(), index: state.selected }];
      const files = [];
      for (const { slide, index } of entries) {
        const canvas = document.createElement('canvas');
        const result = await drawArt(canvas, slide, index, visibleSlides().length);
        if (result.missingImage) throw new Error('missing-image');
        const blob = await canvasBlob(canvas);
        files.push({ name: `speed_arte_${String(index + 1).padStart(2, '0')}.png`, bytes: new Uint8Array(await blob.arrayBuffer()), blob });
      }
      if (all) downloadBlob(buildZip(files), state.mode === 'carousel' ? 'speed_carrossel.zip' : 'speed_arte.zip');
      else downloadBlob(files[0].blob, files[0].name);
      setStatus(`${files.length} ${files.length === 1 ? 'arte gerada' : 'artes geradas'} com sucesso.`);
    } catch (error) {
      console.error(error);
      setStatus(error.message === 'missing-image'
        ? 'Há um slide sem imagem. Escolha uma foto antes de exportar.'
        : 'Não foi possível exportar. Confira a foto enviada e tente novamente.');
    } finally {
      ui.downloadSlide.disabled = needsImage(currentSlide());
      ui.downloadAll.disabled = visibleSlides().some(needsImage);
    }
  }

  function init() {
    const root = document.getElementById('tab-artes');
    if (!root) return;
    const mount = document.getElementById('socialArtMount');
    if (mount) {
      mount.append(root);
      root.classList.remove('tab-panel', 'hidden');
      root.removeAttribute('role');
      root.removeAttribute('aria-labelledby');
      root.classList.add('social-art-section');
    }
    ui = {
      mode: document.getElementById('artMode'), format: document.getElementById('artFormat'),
      template: document.getElementById('artTemplate'), list: document.getElementById('artSlideList'),
      count: document.getElementById('artSlideCount'), current: document.getElementById('artCurrentSlide'),
      title: document.getElementById('artTitle'), body: document.getElementById('artBody'),
      cta: document.getElementById('artCta'), photo: document.getElementById('artPhoto'),
      composition: document.getElementById('artComposition'), compositionHint: document.getElementById('artCompositionHint'),
      imageSource: document.getElementById('artImageSource'), photoFocus: document.getElementById('artPhotoFocus'),
      removePhoto: document.getElementById('artRemovePhoto'), addSlide: document.getElementById('artAddSlide'),
      duplicateSlide: document.getElementById('artDuplicateSlide'), removeSlide: document.getElementById('artRemoveSlide'),
      fromPost: document.getElementById('artFromPost'), canvas: document.getElementById('artCanvas'),
      size: document.getElementById('artPreviewSize'), status: document.getElementById('artStatus'),
      downloadSlide: document.getElementById('artDownloadSlide'), downloadAll: document.getElementById('artDownloadAll')
    };
    ui.prompt = document.getElementById('artImagePrompt');
    ui.generatePrompt = document.getElementById('artGeneratePrompt');
    ui.copyPrompt = document.getElementById('artCopyPrompt');
    loadDraft();
    ui.mode.addEventListener('change', () => {
      state.mode = ui.mode.value;
      state.selected = 0;
      if (state.mode === 'carousel' && state.slides.length === 1) {
        state.slides.push(newSlide('Entenda sua proposta', 'Confira taxa, CET e prazo antes de decidir.', 'Compare com calma'));
        state.slides.push(newSlide('Conte com a Speed', 'Nossa equipe ajuda você a avaliar as opções disponíveis.', 'Visite nossa loja'));
      }
      saveDraft(); syncForm();
    });
    ui.format.addEventListener('change', () => { state.format = ui.format.value; saveDraft(); syncForm(); });
    ui.template.addEventListener('change', () => { state.template = ui.template.value; saveDraft(); syncForm(); });
    ui.composition.addEventListener('change', () => { currentSlide().composition = ui.composition.value; saveDraft(); syncForm(); });
    ui.imageSource.addEventListener('change', () => {
      currentSlide().imageSource = ui.imageSource.value;
      saveDraft(); syncForm();
    });
    ui.photoFocus.addEventListener('change', () => { currentSlide().photoFocus = ui.photoFocus.value; saveDraft(); renderPreview(); });
    for (const [field, element] of [['title', ui.title], ['body', ui.body], ['cta', ui.cta]]) {
      element.addEventListener('input', () => {
        currentSlide()[field] = element.value;
        ui.prompt.value = '';
        saveDraft(); renderSlideList(); renderPreview();
      });
    }
    ui.addSlide.addEventListener('click', () => {
      if (state.slides.length >= MAX_SLIDES) return;
      state.mode = 'carousel';
      state.slides.push(newSlide('Novo slide', 'Escreva aqui a próxima ideia.', 'Fale com a Speed'));
      state.selected = state.slides.length - 1;
      saveDraft(); syncForm();
    });
    ui.duplicateSlide.addEventListener('click', () => {
      if (state.slides.length >= MAX_SLIDES) { setStatus('Limite de 10 slides por carrossel.'); return; }
      const copy = { ...currentSlide() };
      state.mode = 'carousel';
      state.slides.splice(state.selected + 1, 0, copy);
      state.selected++;
      saveDraft(); syncForm();
    });
    ui.removeSlide.addEventListener('click', () => {
      if (visibleSlides().length <= 1) return;
      state.slides.splice(state.selected, 1);
      state.selected = Math.min(state.selected, state.slides.length - 1);
      saveDraft(); syncForm();
    });
    ui.fromPost.addEventListener('click', () => {
      const post = typeof AppState !== 'undefined' ? AppState.selectedPost : null;
      if (!post) { setStatus('Selecione um post na guia Social Mídia antes de importar o texto.'); return; }
      openForPost(post);
      const slide = currentSlide();
      slide.title = String(post.manchete || post.titulo || '').slice(0, 140);
      slide.body = String(post.sub || '').slice(0, 400);
      slide.cta = String(post.cta || '').slice(0, 90);
      saveDraft(); syncForm();
      setStatus('Texto do post selecionado importado. Revise antes de exportar.');
    });
    ui.photo.addEventListener('change', () => {
      const file = ui.photo.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
        ui.photo.value = '';
        setStatus('Use PNG, JPG ou WebP de até 8 MB.');
        return;
      }
      const reader = new FileReader();
      const target = currentSlide();
      reader.onload = async () => {
        try {
          target.photo = await loadImage(reader.result);
          target.imageSource = 'custom';
          saveDraft();
          syncForm();
          setStatus('Foto aplicada ao slide. Ela não será salva após fechar a página.');
        } catch (error) { setStatus('Não foi possível abrir esta imagem.'); }
      };
      reader.onerror = () => setStatus('Não foi possível ler esta imagem.');
      reader.readAsDataURL(file);
    });
    ui.removePhoto.addEventListener('click', () => {
      currentSlide().photo = null;
      currentSlide().imageSource = 'none';
      saveDraft(); syncForm();
    });
    ui.downloadSlide.addEventListener('click', () => exportArt(false));
    ui.downloadAll.addEventListener('click', () => exportArt(true));
    ui.generatePrompt.addEventListener('click', () => {
      ui.prompt.value = buildImagePrompt();
      setStatus('Comando gerado. Você pode ajustá-lo antes de copiar.');
    });
    ui.copyPrompt.addEventListener('click', async () => {
      if (!ui.prompt.value.trim()) ui.prompt.value = buildImagePrompt();
      try {
        await navigator.clipboard.writeText(ui.prompt.value);
        setStatus('Comando copiado. Cole no ChatGPT Imagem e revise o resultado.');
      } catch (error) {
        ui.prompt.focus();
        ui.prompt.select();
        setStatus('Selecionei o comando. Copie com Ctrl+C para usar no ChatGPT Imagem.');
      }
    });
    const STORE_PRESETS = {
      curriculo: {
        title: 'Precisa Imprimir seu Currículo?',
        body: 'Impressão a laser nítida e rápida em papel de qualidade. Se precisar, ajudamos na formatação e digitação para você não perder oportunidades!',
        cta: 'Venha imprimir ou mande no WhatsApp',
        composition: 'editorial',
        template: 'brand'
      },
      foto3x4: {
        title: 'Foto 3x4 Pronta em Minutos',
        body: 'Fotos com padrão oficial para Carteira de Trabalho, Passaporte, CNH, RG e matrículas escolares. Fundo branco impecável e corte profissional.',
        cta: 'Tire sua foto 3x4 hoje',
        composition: 'editorial',
        template: 'offer'
      },
      segundavia: {
        title: 'Tiramos sua 2ª Via sem Fila',
        body: 'Água (COPASA), luz (CEMIG), telefone, IPTU, certidões negativas, situação cadastral do CPF e antecedentes criminais impressos na hora.',
        cta: 'Resolva seus documentos aqui',
        composition: 'editorial',
        template: 'brand'
      },
      plastificacao: {
        title: 'Plastificação & Encadernação',
        body: 'Proteja seus documentos importantes contra umidade, rasgos e desgaste. Também fazemos encadernação de apostilas, manuais e trabalhos.',
        cta: 'Proteja seus documentos agora',
        composition: 'editorial',
        template: 'clean'
      },
      internet: {
        title: 'Lan House com Internet Rápida',
        body: 'Computadores modernos para estudo, concursos, emissão de guias do GOV.BR, agendamentos, digitação de contratos e pesquisas.',
        cta: 'Estações climatizadas e prontas',
        composition: 'editorial',
        template: 'brand'
      },
      scan: {
        title: 'Digitalização & Envio de Arquivos',
        body: 'Transforme fotos e papéis físicos em PDF de alta qualidade. Enviamos direto para seu e-mail ou WhatsApp com agilidade e sigilo.',
        cta: 'Digitalize seus arquivos aqui',
        composition: 'editorial',
        template: 'clean'
      }
    };
    document.querySelectorAll('#artStorePresets [data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = STORE_PRESETS[btn.dataset.preset];
        if (!p) return;
        const target = currentSlide();
        target.title = p.title;
        target.body = p.body;
        target.cta = p.cta;
        target.composition = p.composition;
        state.template = p.template;
        saveDraft();
        syncForm();
        setStatus(`Modelo "${btn.textContent.trim()}" carregado com sucesso!`);
      });
    });
    document.addEventListener('speed:edit-art', event => {
      const post = typeof AppState !== 'undefined' ? AppState.posts.find(item => item.id === event.detail?.postId) : null;
      openForPost(post);
    });
    window.refreshArtPreview = renderPreview;
    syncForm();
    if (document.fonts?.ready) document.fonts.ready.then(renderPreview);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
