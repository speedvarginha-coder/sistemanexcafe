// ficha_saude.js — Saúde da ficha no Google: nota de 0 a 100, alterações no perfil, potencial de crescimento e NAP.
// Dados vêm de /api/marketing/ficha-saude (server/ficha-saude.js, adaptado do Local Ninja, MIT).

const FichaState = { dados: null, ocupado: '', mensagem: '' };
const FICHA_IMPORTANCIA = { necessary: ['Essencial', 'ficha-tag-alta'], important: ['Importante', 'ficha-tag-media'], nice: ['Bom ter', 'ficha-tag-baixa'] };
const FICHA_ORDEM = { necessary: 0, important: 1, nice: 2 };
const fichaData = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

function fichaStatus(texto, classe) {
  const el = document.getElementById('fichaSaudeStatus');
  if (el) { el.textContent = texto; el.className = `status-badge text-[10px] whitespace-nowrap ${classe}`; }
}

function fichaItem(c) {
  const [tag, classe] = FICHA_IMPORTANCIA[c.importance] || ['', ''];
  const isFail = c.status === 'fail';
  const icone = c.status === 'pass'
    ? 'fa-circle-check text-emerald-600'
    : isFail
      ? 'fa-circle-exclamation text-amber-500'
      : 'fa-circle-question text-gray-400';
  const borderClass = isFail ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-emerald-500';

  return `<li class="ficha-card-modern ${borderClass}">
    <div class="flex items-start justify-between gap-2 mb-1.5">
      <div class="flex items-start gap-1.5 min-w-0">
        <i class="fas ${icone} text-xs mt-0.5 shrink-0" aria-hidden="true"></i>
        <h4 class="font-bold text-xs text-gray-900 leading-snug break-words">${escaparHtml(c.title)}</h4>
      </div>
      <span class="ficha-tag ${classe} shrink-0">${tag}</span>
    </div>
    <p class="text-[11px] text-gray-600 leading-relaxed mb-2.5">${escaparHtml(c.detail)}</p>
    ${c.fix ? `<div class="ficha-fix-box"><i class="fas fa-wrench text-[10px] text-emerald-700 mr-1.5"></i><span class="font-semibold text-emerald-950">Onde corrigir:</span> ${escaparHtml(c.fix)}</div>` : ''}
  </li>`;
}

function fichaAlteracoes(d) {
  const blocos = [];
  const novas = d.changes.filter(c => !c.seen);

  const sidebarBadge = document.getElementById('gmbSidebarBadge');
  if (sidebarBadge) {
    if (novas.length > 0) {
      sidebarBadge.textContent = String(novas.length);
      sidebarBadge.classList.remove('hidden');
    } else {
      sidebarBadge.classList.add('hidden');
    }
  }

  if (novas.length) {
    blocos.push(`<div class="ficha-alerta-modern">
      <div class="ficha-alerta-icon">
        <i class="fas fa-triangle-exclamation"></i>
      </div>
      <div class="ficha-alerta-body">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <span class="ficha-alerta-title">Alteração Detectada no Perfil</span>
          <span class="ficha-alerta-tag">${novas.length} ${novas.length === 1 ? 'campo alterado' : 'campos alterados'}</span>
        </div>
        <p class="ficha-alerta-desc">Se ninguém da loja mexeu, pode ter sido o Google ou sugestão de terceiros aceita:</p>
        <ul class="ficha-alerta-list">${novas.map(c => `<li>
          <span class="font-bold text-gray-800">${escaparHtml(c.label)}</span>
          <span class="text-gray-400 text-[10px]">(${fichaData(c.at)})</span>:
          <span class="line-through text-red-500 bg-red-50 px-1 py-0.5 rounded text-[11px]">${escaparHtml(c.before)}</span>
          <span class="text-gray-400 mx-1">→</span>
          <span class="font-semibold text-emerald-800 bg-emerald-50 px-1 py-0.5 rounded text-[11px]">${escaparHtml(c.after)}</span>
        </li>`).join('')}</ul>
      </div>
      <div class="ficha-alerta-action">
        <button type="button" data-ficha="visto" class="ficha-alerta-btn">
          <i class="fas fa-check"></i>
          <span>Já conferi, marcar como visto</span>
        </button>
      </div>
    </div>`);
  }
  if (d.googleDiff?.length) {
    blocos.push(`<div class="ficha-aviso-modern">
      <div class="ficha-aviso-icon">
        <i class="fas fa-pen-to-square"></i>
      </div>
      <div class="ficha-aviso-body">
        <div class="flex items-center gap-2 mb-1">
          <span class="ficha-aviso-title">Divergência de Cadastro</span>
        </div>
        <ul class="ficha-alerta-list">${d.googleDiff.filter(g => g.google).map(g => `<li><strong>${escaparHtml(g.label)}</strong> no Google: <span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[11px]">${escaparHtml(g.google)}</span></li>`).join('')}</ul>
        <p class="ficha-alerta-desc mt-1.5">Abra o Perfil da Empresa para aceitar ou recusar as edições sugeridas.</p>
      </div>
    </div>`);
  }
  return blocos.join('');
}

function fichaPotencial(d) {
  const h = d.health;
  if (!h.actions) return `<p class="text-[11px] text-gray-500">Sem métricas de desempenho${h.actionsError ? ` (${escaparHtml(h.actionsError)})` : ''}.</p>`;
  const a = h.actions;
  const linhas = d.growth.map(g => `<tr><td>${escaparHtml(g.term)}</td><td class="text-center">${g.outside} de ${g.points}</td><td class="text-center font-black ${g.high ? 'text-green-800' : 'text-gray-500'}">${g.high ? `+${g.low} a +${g.high}` : 'já no top 3'}</td></tr>`).join('');
  return `<p class="text-[11px] text-gray-600 mb-2">Base: <strong>${a.total} ações</strong> de ${new Date(a.start + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(a.end + 'T12:00').toLocaleDateString('pt-BR')} (${a.calls} ${a.calls === 1 ? 'ligação' : 'ligações'}, ${a.directions} ${a.directions === 1 ? 'rota' : 'rotas'}, ${a.website} ${a.website === 1 ? 'clique' : 'cliques'} no site${a.conversations ? `, ${a.conversations} conversas` : ''}).</p>
    ${linhas ? `<table class="ficha-tabela"><thead><tr><th>Termo (último GeoGrid)</th><th>Pontos fora do top 3</th><th>Ações a mais por mês</th></tr></thead><tbody>${linhas}</tbody></table>
    <p class="text-[10px] text-gray-500 mt-1">Estimativa, não promessa: se todos os pontos fora do top 3 entrassem no top 3, pela participação de cliques do pacote local (BrightLocal, 2018) aplicada às ações da própria ficha.</p>` : '<p class="text-[11px] text-gray-500">Meça o GeoGrid para ver o potencial por termo.</p>'}`;
}

// Mensagem para pedir avaliação: só pede a opinião, sem brinde nem desconto (o Google proíbe incentivo).
function fichaAvaliacao(d) {
  if (!d.reviewUrl) return '<p class="text-[11px] text-gray-500">Configure o GeoGrid (ID da ficha no Maps) para gerar o link de avaliação.</p>';
  const texto = `Olá! Aqui é da Speed Financeira, em Varginha. Obrigado por ser atendido com a gente! Se puder, conte como foi o seu atendimento no Google. Leva menos de 1 minuto e ajuda outras pessoas da cidade a escolher com segurança: ${d.reviewUrl}`;
  const zap = 'https://wa.me/?text=' + encodeURIComponent(texto);
  return `<p class="text-[11px] text-gray-600 mb-2">Mande para todo cliente atendido, no mesmo dia. Não ofereça brinde, desconto ou sorteio em troca: o Google proíbe e pode apagar as avaliações.</p>
    <div class="ficha-aviso" style="color:#1f2937;background:#f8fafc;border-color:#e5e7eb;"><p class="text-[12px] whitespace-pre-line">${escaparHtml(texto)}</p></div>
    <div class="flex flex-wrap gap-2"><button type="button" data-ficha-copiar="${escaparHtml(texto)}" class="gmb-btn-primario">Copiar mensagem</button>
    <a href="${escaparHtml(zap)}" target="_blank" rel="noopener noreferrer" class="gmb-btn-link">Enviar pelo WhatsApp</a>
    <a href="${escaparHtml(d.reviewUrl)}" target="_blank" rel="noopener noreferrer" class="gmb-btn-link">Testar o link</a></div>`;
}

function fichaNap(d) {
  const nap = d.nap;
  const botao = `<button type="button" data-ficha="nap" class="gmb-btn-primario" ${FichaState.ocupado || !d.health ? 'disabled' : ''}>${FichaState.ocupado === 'nap' ? 'Conferindo diretórios...' : 'Conferir diretórios agora'}</button>`;
  if (!nap) return `<p class="text-[11px] text-gray-600 mb-2">Abre cada diretório da Central de Correção NAP e compara nome, endereço e telefone com a ficha. Procura também o telefone desativado 3113-0458.</p>${botao}`;
  const rotulo = { match: ['Certo', 'text-green-800 bg-green-50'], mismatch: ['Com erro', 'text-red-800 bg-red-50'], not_found: ['Não confirmado', 'text-gray-700 bg-gray-100'], unreadable: ['Não abriu', 'text-gray-700 bg-gray-100'] };
  const campo = { match: 'certo', mismatch: 'diferente', not_found: 'não achado' };
  const linhas = nap.results.map(r => {
    const [texto, classe] = rotulo[r.result] || rotulo.not_found;
    const detalhe = r.result === 'unreadable' ? escaparHtml(r.message || '') : [r.oldPhone ? '<strong class="text-red-700">telefone antigo 3113-0458 na página</strong>' : '', ...['name', 'address', 'phone'].filter(k => r.fields?.[k]).map(k => `${{ name: 'nome', address: 'endereço', phone: 'telefone' }[k]} ${campo[r.fields[k]]}`)].filter(Boolean).join(' • ');
    return `<tr><td><a href="${escaparHtml(r.url)}" target="_blank" rel="noopener noreferrer">${escaparHtml(r.name)}</a></td><td><span class="ficha-tag ${classe}">${texto}</span></td><td>${detalhe}</td></tr>`;
  }).join('');
  return `<p class="text-[11px] text-gray-600 mb-2">Conferido em ${fichaData(nap.at)} contra ${escaparHtml(nap.official.name)}, ${escaparHtml(nap.official.phone)}. "Não confirmado" quer dizer que a página não mostrou o dado de forma legível: abra e confira.</p>
    <table class="ficha-tabela"><thead><tr><th>Diretório</th><th>Resultado</th><th>Detalhe</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="mt-2">${botao}</div>`;
}

function renderFicha() {
  const conteudo = document.getElementById('fichaSaudeConteudo');
  const d = FichaState.dados;
  if (!conteudo || !d) return;
  const mensagem = FichaState.mensagem ? `<p class="geogrid-mensagem">${escaparHtml(FichaState.mensagem)}</p>` : '';
  const erro = d.lastError ? `<p class="geogrid-erro">Última conferência (${fichaData(d.lastError.at)}) falhou: ${escaparHtml(d.lastError.message)}</p>` : '';
  const conferir = `<button type="button" data-ficha="conferir" class="gmb-btn-primario w-full sm:w-auto" ${FichaState.ocupado || !d.connected ? 'disabled' : ''}><i class="fas ${FichaState.ocupado === 'conferir' ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'} mr-1"></i>${FichaState.ocupado === 'conferir' ? 'Conferindo...' : 'Conferir agora'}</button>`;
  if (!d.connected) { fichaStatus('Sem conexão', 'bg-gray-100 text-gray-700'); conteudo.innerHTML = '<p class="text-[11px] text-gray-600">Conecte a ficha no cartão acima para o servidor conferir a saúde dela todo dia.</p>'; return; }
  if (!d.health) { fichaStatus('Ainda não conferida', 'bg-yellow-100 text-yellow-800'); conteudo.innerHTML = `<p class="text-[11px] text-gray-600 mb-2">O servidor confere a ficha uma vez por dia. Faça a primeira conferência agora.</p>${conferir}${mensagem}${erro}`; return; }

  const h = d.health, s = h.score;
  const corBg = s.percent >= 85 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : s.percent >= 65 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900';
  const corNumero = s.percent >= 85 ? 'text-emerald-700' : s.percent >= 65 ? 'text-amber-700' : 'text-red-700';
  const badgeTexto = s.percent >= 85 ? 'Excelente Saúde' : s.percent >= 65 ? 'Bom Estado' : 'Atenção Necessária';

  fichaStatus(d.unseenChanges ? `${d.unseenChanges} ${d.unseenChanges === 1 ? 'alteração' : 'alterações'}` : `Nota ${s.percent}`, d.unseenChanges ? 'bg-red-100 text-red-800' : s.percent >= 85 ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800');
  const anterior = d.history.length > 1 ? d.history[d.history.length - 2] : null;
  const variacao = anterior && anterior.percent !== s.percent ? ` <span class="text-xs font-bold ${s.percent > anterior.percent ? 'text-emerald-700' : 'text-red-600'}">(${s.percent > anterior.percent ? '+' : ''}${s.percent - anterior.percent})</span>` : '';
  const checks = [...h.checks].sort((a, b) => FICHA_ORDEM[a.importance] - FICHA_ORDEM[b.importance]);
  const falhas = checks.filter(c => c.status === 'fail'), naoLidos = checks.filter(c => c.status === 'unknown'), certos = checks.filter(c => c.status === 'pass');
  const p = h.profile;

  conteudo.innerHTML = `
    ${fichaAlteracoes(d)}
    <div class="ficha-dashboard-grid">
      <!-- Card Score -->
      <div class="ficha-score-box ${corBg}">
        <div class="flex items-baseline justify-center gap-1">
          <span class="text-4xl font-black ${corNumero} leading-none tracking-tight">${s.percent}</span>
          <span class="text-xs font-bold text-gray-400">/100</span>
        </div>
        <div class="mt-1 font-black text-[11px] tracking-wide uppercase">${badgeTexto}</div>
        <div class="text-[10px] text-gray-600 font-medium mt-0.5">${s.passed} de ${s.total} itens aprovados${variacao}</div>
        <div class="mt-3 w-full">${conferir}</div>
      </div>

      <!-- Quick Stats Grid -->
      <div class="ficha-stats-grid">
        <div class="ficha-stat-card">
          <div class="ficha-stat-label"><i class="fas fa-building text-gray-400 mr-1"></i> Categoria Principal</div>
          <div class="ficha-stat-value font-bold text-gray-900 truncate" title="${escaparHtml(p.primaryCategory || '-')}">${escaparHtml(p.primaryCategory || '-')}</div>
          ${p.additionalCategories.length ? `<div class="text-[10px] text-gray-500 mt-1 truncate" title="${escaparHtml(p.additionalCategories.join(', '))}">Adicionais: ${escaparHtml(p.additionalCategories.join(', '))}</div>` : ''}
        </div>

        <div class="ficha-stat-card">
          <div class="ficha-stat-label"><i class="fas fa-star text-amber-400 mr-1"></i> Avaliações no Maps</div>
          <div class="flex items-baseline gap-1.5 mt-0.5">
            <span class="text-sm font-black text-gray-900">${h.reviews?.avgRating ?? '-'} ★</span>
            <span class="text-[11px] text-gray-500">(${h.reviews?.total ?? 0} avaliações)</span>
          </div>
          <div class="text-[10px] text-gray-500 mt-1">${h.reviews?.newInWindow ?? 0} novas nos últimos 30 dias</div>
        </div>

        <div class="ficha-stat-card">
          <div class="ficha-stat-label"><i class="fas fa-magnifying-glass text-gray-400 mr-1"></i> Termos Mais Buscados</div>
          <div class="flex flex-wrap gap-1 mt-1">
            ${h.keywords?.length ? h.keywords.slice(0, 3).map(k => `<span class="ficha-chip">${escaparHtml(k.term)} (${k.approx ? '<' : ''}${k.count})</span>`).join('') : '<span class="text-[10px] text-gray-400">Sem dados</span>'}
          </div>
        </div>

        <div class="ficha-stat-card">
          <div class="ficha-stat-label"><i class="fas fa-clock-rotate-left text-gray-400 mr-1"></i> Última Conferência</div>
          <div class="text-[11px] font-bold text-gray-800 mt-0.5">${fichaData(h.at)}</div>
          <div class="text-[10px] text-gray-500 mt-0.5">${h.trigger === 'manual' ? 'Conferência manual' : 'Rotina automática diária do servidor'}</div>
        </div>
      </div>
    </div>

    ${mensagem}${erro}

    ${falhas.length ? `
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <h4 class="ficha-section-title text-amber-900"><i class="fas fa-triangle-exclamation text-amber-500 mr-1.5"></i> Itens a Corrigir (${falhas.length})</h4>
          <span class="text-[10px] text-gray-500 font-medium">Recomendações prioritárias para subir a nota</span>
        </div>
        <ul class="ficha-lista">${falhas.map(fichaItem).join('')}</ul>
      </div>
    ` : '<div class="ficha-alerta-sucesso mb-4"><i class="fas fa-circle-check text-emerald-600 mr-2 text-base"></i> Parabéns! Nenhum item pendente de correção na ficha.</div>'}

    ${naoLidos.length ? `
      <div class="mb-4">
        <h4 class="ficha-section-title text-gray-700 mb-2"><i class="fas fa-circle-info text-gray-400 mr-1.5"></i> Não lidos (${naoLidos.length}) <span class="text-[10px] font-normal text-gray-500">(fora da nota)</span></h4>
        <ul class="ficha-lista">${naoLidos.map(fichaItem).join('')}</ul>
      </div>
    ` : ''}

    <details class="ficha-details-card mb-4">
      <summary class="ficha-details-summary">
        <span><i class="fas fa-circle-check text-emerald-600 mr-1.5"></i> Ver itens corretos e aprovados (${certos.length})</span>
        <i class="fas fa-chevron-down text-xs text-gray-400"></i>
      </summary>
      <ul class="ficha-lista p-3 pt-2 border-t border-gray-100">${certos.map(fichaItem).join('')}</ul>
    </details>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
      <div class="ficha-box-auxiliar">
        <h4 class="font-bold text-xs text-gray-900 mb-2 flex items-center gap-1.5"><i class="fab fa-whatsapp text-emerald-600"></i> Pedir Avaliação aos Clientes</h4>
        ${fichaAvaliacao(d)}
      </div>

      <div class="ficha-box-auxiliar">
        <h4 class="font-bold text-xs text-gray-900 mb-2 flex items-center gap-1.5"><i class="fas fa-chart-line text-blue-600"></i> Potencial de Crescimento no Maps</h4>
        ${fichaPotencial(d)}
      </div>
    </div>

    <div class="ficha-box-auxiliar mt-4">
      <h4 class="font-bold text-xs text-gray-900 mb-2 flex items-center gap-1.5"><i class="fas fa-address-book text-indigo-600"></i> Nome, Endereço e Telefone nos Diretórios (NAP)</h4>
      ${fichaNap(d)}
    </div>

    ${d.changes.some(c => c.seen) ? `
      <details class="ficha-details-card mt-3">
        <summary class="ficha-details-summary">
          <span><i class="fas fa-history text-gray-400 mr-1.5"></i> Histórico de alterações anteriores</span>
          <i class="fas fa-chevron-down text-xs text-gray-400"></i>
        </summary>
        <ul class="text-[11px] text-gray-600 space-y-1.5 p-3 pt-2 border-t border-gray-100">
          ${d.changes.filter(c => c.seen).map(c => `<li><span class="text-gray-400">${fichaData(c.at)}</span> • <strong>${escaparHtml(c.label)}</strong>: <span class="line-through text-gray-400">${escaparHtml(c.before)}</span> → <span class="text-emerald-800 font-medium">${escaparHtml(c.after)}</span></li>`).join('')}
        </ul>
      </details>
    ` : ''}`;
}

async function carregarFicha() {
  const conteudo = document.getElementById('fichaSaudeConteudo');
  if (!conteudo) return;
  try { FichaState.dados = (await geogridApi('/api/marketing/ficha-saude')).ficha; renderFicha(); }
  catch {
    fichaStatus('Indisponível', 'bg-gray-100 text-gray-700');
    conteudo.innerHTML = '<p class="results-empty">A saúde da ficha funciona com o painel aberto pelo Nexcafe (Speed Marketing), logado como administrador.</p>';
  }
}

async function fichaAcao(tipo, rota, sucesso) {
  FichaState.ocupado = tipo; FichaState.mensagem = ''; renderFicha();
  try {
    const resposta = await geogridApi(rota, {});
    FichaState.dados = resposta.ficha;
    if (sucesso) mostrarToast(sucesso);
  } catch (erro) { FichaState.mensagem = `${erro.message}.`; }
  finally { FichaState.ocupado = ''; renderFicha(); }
}

function setupFicha() {
  const painel = document.getElementById('fichaSaudePainel');
  if (!painel || painel.dataset.pronto) return;
  painel.dataset.pronto = '1';
  painel.addEventListener('click', ev => {
    const copiar = ev.target.closest('[data-ficha-copiar]');
    if (copiar) { navigator.clipboard?.writeText(copiar.dataset.fichaCopiar).then(() => mostrarToast('Mensagem copiada.'), () => mostrarToast('Não deu para copiar; selecione o texto.')); return; }
    const botao = ev.target.closest('[data-ficha]');
    if (!botao || FichaState.ocupado) return;
    const acao = botao.dataset.ficha;
    if (acao === 'conferir') fichaAcao('conferir', '/api/marketing/ficha-saude/run', 'Ficha conferida.');
    else if (acao === 'nap') fichaAcao('nap', '/api/marketing/ficha-saude/nap', 'Diretórios conferidos.');
    else if (acao === 'visto') fichaAcao('visto', '/api/marketing/ficha-saude/changes/seen');
  });
}

document.addEventListener('DOMContentLoaded', () => { setupFicha(); carregarFicha(); });
