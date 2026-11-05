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
  const icone = c.status === 'pass' ? 'fa-circle-check text-green-600' : c.status === 'fail' ? 'fa-circle-xmark text-red-600' : 'fa-circle-question text-gray-400';
  return `<li class="ficha-item">
    <i class="fas ${icone} mt-0.5" aria-hidden="true"></i>
    <div><p class="font-bold text-gray-900">${escaparHtml(c.title)} <span class="ficha-tag ${classe}">${tag}</span></p>
    <p class="text-gray-600">${escaparHtml(c.detail)}</p>
    ${c.fix ? `<p class="text-green-800 font-semibold">Onde corrigir: ${escaparHtml(c.fix)}</p>` : ''}</div></li>`;
}

function fichaAlteracoes(d) {
  const blocos = [];
  const novas = d.changes.filter(c => !c.seen);
  if (novas.length) {
    blocos.push(`<div class="ficha-alerta">
      <p class="font-black text-red-800"><i class="fas fa-triangle-exclamation mr-1"></i>A ficha mudou desde a conferência anterior</p>
      <p class="text-[11px] text-red-700 mb-2">Se ninguém da loja mexeu, pode ter sido o Google ou uma sugestão de terceiros aceita. Confira na ficha.</p>
      <ul class="space-y-1">${novas.map(c => `<li><strong>${escaparHtml(c.label)}</strong> (${fichaData(c.at)}): <span class="line-through text-gray-500">${escaparHtml(c.before)}</span> → ${escaparHtml(c.after)}</li>`).join('')}</ul>
      <button type="button" data-ficha="visto" class="gmb-btn-link mt-2">Já conferi, marcar como visto</button>
    </div>`);
  }
  if (d.googleDiff?.length) {
    blocos.push(`<div class="ficha-aviso">
      <p class="font-black text-amber-900"><i class="fas fa-pen-to-square mr-1"></i>O Google mostra uma versão diferente da sua em: ${d.googleDiff.map(g => escaparHtml(g.label)).join(', ')}</p>
      <ul class="text-[11px] text-amber-900 mt-1">${d.googleDiff.filter(g => g.google).map(g => `<li>${escaparHtml(g.label)} no Google: ${escaparHtml(g.google)}</li>`).join('')}</ul>
      <p class="text-[11px] text-amber-800 mt-1">Abra o Perfil da Empresa: ele mostra as edições do Google para aceitar ou recusar.</p>
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
  const conferir = `<button type="button" data-ficha="conferir" class="gmb-btn-primario" ${FichaState.ocupado || !d.connected ? 'disabled' : ''}>${FichaState.ocupado === 'conferir' ? 'Conferindo...' : 'Conferir agora'}</button>`;
  if (!d.connected) { fichaStatus('Sem conexão', 'bg-gray-100 text-gray-700'); conteudo.innerHTML = '<p class="text-[11px] text-gray-600">Conecte a ficha no cartão acima para o servidor conferir a saúde dela todo dia.</p>'; return; }
  if (!d.health) { fichaStatus('Ainda não conferida', 'bg-yellow-100 text-yellow-800'); conteudo.innerHTML = `<p class="text-[11px] text-gray-600 mb-2">O servidor confere a ficha uma vez por dia. Faça a primeira conferência agora.</p>${conferir}${mensagem}${erro}`; return; }

  const h = d.health, s = h.score;
  const cor = s.percent >= 85 ? 'text-green-700' : s.percent >= 65 ? 'text-amber-600' : 'text-red-600';
  fichaStatus(d.unseenChanges ? `${d.unseenChanges} ${d.unseenChanges === 1 ? 'alteração' : 'alterações'}` :`Nota ${s.percent}`, d.unseenChanges ? 'bg-red-100 text-red-800' : s.percent >= 85 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800');
  const anterior = d.history.length > 1 ? d.history[d.history.length - 2] : null;
  const variacao = anterior && anterior.percent !== s.percent ? ` <span class="text-xs font-bold ${s.percent > anterior.percent ? 'text-green-700' : 'text-red-600'}">${s.percent > anterior.percent ? '+' : ''}${s.percent - anterior.percent} desde ${fichaData(anterior.at)}</span>` : '';
  const checks = [...h.checks].sort((a, b) => FICHA_ORDEM[a.importance] - FICHA_ORDEM[b.importance]);
  const falhas = checks.filter(c => c.status === 'fail'), naoLidos = checks.filter(c => c.status === 'unknown'), certos = checks.filter(c => c.status === 'pass');
  const p = h.profile;
  conteudo.innerHTML = `
    ${fichaAlteracoes(d)}
    <div class="ficha-topo">
      <div><p class="text-5xl font-black ${cor} leading-none">${s.percent}</p><p class="text-[11px] text-gray-600 mt-1">${s.passed} de ${s.total} itens certos${variacao}</p></div>
      <div class="text-[11px] text-gray-600">
        <p><strong>Categoria principal:</strong> ${escaparHtml(p.primaryCategory || '-')}${p.additionalCategories.length ? ` • adicionais: ${escaparHtml(p.additionalCategories.join(', '))}` : ''}</p>
        ${h.reviews ? `<p><strong>Avaliações:</strong> ${h.reviews.avgRating ?? '-'} estrelas em ${h.reviews.total}; ${h.reviews.newInWindow} nos últimos 30 dias</p>` : ''}
        ${h.keywords?.length ? `<p><strong>Mais buscados (3 meses):</strong> ${h.keywords.slice(0, 6).map(k => `${escaparHtml(k.term)} (${k.approx ? 'menos de ' : ''}${k.count})`).join(', ')}</p>` : ''}
        <p class="text-gray-500 mt-1">Conferida em ${fichaData(h.at)} (${h.trigger === 'manual' ? 'manual' : 'automática, todo dia'}).</p>
      </div>
      <div class="ml-auto">${conferir}</div>
    </div>
    ${mensagem}${erro}
    ${falhas.length ? `<p class="ficha-subtitulo">A corrigir (${falhas.length})</p><ul class="ficha-lista">${falhas.map(fichaItem).join('')}</ul>` : '<p class="ficha-subtitulo text-green-800">Nenhum item a corrigir.</p>'}
    ${naoLidos.length ? `<p class="ficha-subtitulo">Não lidos (${naoLidos.length}), fora da nota</p><ul class="ficha-lista">${naoLidos.map(fichaItem).join('')}</ul>` : ''}
    <details class="mt-2"><summary class="ficha-subtitulo cursor-pointer">Itens certos (${certos.length})</summary><ul class="ficha-lista">${certos.map(fichaItem).join('')}</ul></details>
    <p class="ficha-subtitulo mt-4">Pedir avaliação aos clientes</p>${fichaAvaliacao(d)}
    <p class="ficha-subtitulo mt-4">Potencial de crescimento no Maps</p>${fichaPotencial(d)}
    <p class="ficha-subtitulo mt-4">Nome, endereço e telefone nos diretórios</p>${fichaNap(d)}
    ${d.changes.some(c => c.seen) ? `<details class="mt-3"><summary class="ficha-subtitulo cursor-pointer">Alterações anteriores</summary><ul class="text-[11px] text-gray-600 space-y-1 mt-1">${d.changes.filter(c => c.seen).map(c => `<li>${fichaData(c.at)} • <strong>${escaparHtml(c.label)}</strong>: ${escaparHtml(c.before)} → ${escaparHtml(c.after)}</li>`).join('')}</ul></details>` : ''}`;
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
