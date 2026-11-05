// gmb_api.js — Conexão do servidor do Nexcafe com a ficha no Google (Business Profile API)
// Dados vêm de /api/marketing/gmb-api. A chave secreta e o acesso ficam só no servidor e nunca voltam para a tela.

const GmbApiState = { dados: null, editando: false, ocupado: false, mensagem: '', posts: null };

function gmbApiStatus(texto, classe) {
  const el = document.getElementById('gmbApiStatus');
  if (el) { el.textContent = texto; el.className = `status-badge text-[10px] whitespace-nowrap ${classe}`; }
}

function gmbApiFormulario(dados) {
  return `
    <ol class="geogrid-passos">
      <li>No <a href="https://console.cloud.google.com/auth/clients?project=effortless-gate-423314-c7" target="_blank" rel="noopener noreferrer">Google Cloud, em Clientes</a> (projeto My First Project), crie ou abra o cliente <strong>Nexcafe servidor - Perfil da Empresa</strong>, do tipo Aplicativo da Web.</li>
      <li>Em URIs de redirecionamento autorizados, ele precisa ter exatamente <code>${escaparHtml(dados.redirectUri)}</code>.</li>
      <li>Copie o ID do cliente e a chave secreta que o Google mostra ao criar e cole abaixo.</li>
    </ol>
    <form id="gmbApiForm" class="geogrid-config" autocomplete="off">
      <label class="text-xs font-bold text-gray-700">ID do cliente
        <input id="gmbApiClientId" name="gmb-oauth-client-id" type="text" class="art-input mt-1" placeholder="...apps.googleusercontent.com" autocomplete="off" spellcheck="false" required>
      </label>
      <label class="text-xs font-bold text-gray-700 mt-2 block">Chave secreta do cliente
        <input id="gmbApiSecret" name="gmb-oauth-client-secret" type="password" class="art-input mt-1" placeholder="Cole aqui a chave secreta" autocomplete="new-password" required>
      </label>
      <div class="flex flex-wrap gap-2 mt-2">
        <button type="submit" class="gmb-btn-primario" ${GmbApiState.ocupado ? 'disabled' : ''}>Salvar cliente</button>
        ${dados.clientConfigured ? '<button type="button" data-gmb-api="cancelar" class="gmb-btn-link">Cancelar</button>' : ''}
      </div>
      <p class="text-[11px] text-gray-500 mt-1">A chave secreta fica só no servidor do Nexcafe e nunca volta para a tela.</p>
    </form>`;
}

function renderGmbApi() {
  const conteudo = document.getElementById('gmbApiConteudo');
  const dados = GmbApiState.dados;
  if (!conteudo || !dados) return;
  const mensagem = GmbApiState.mensagem ? `<p class="geogrid-mensagem">${escaparHtml(GmbApiState.mensagem)}</p>` : '';
  const erro = dados.lastError ? `<p class="geogrid-erro">Última tentativa (${new Date(dados.lastError.at).toLocaleString('pt-BR')}) falhou: ${escaparHtml(dados.lastError.message)}</p>` : '';

  if (!dados.clientConfigured || GmbApiState.editando) {
    gmbApiStatus(dados.clientConfigured ? 'Trocando cliente' : 'A configurar', 'bg-yellow-100 text-yellow-800');
    conteudo.innerHTML = gmbApiFormulario(dados) + mensagem + erro;
    return;
  }

  const acoes = `
    <div class="flex flex-wrap items-center gap-2 mt-3">
      ${dados.connected
        ? `<button type="button" data-gmb-api="testar" class="gmb-btn-primario" ${GmbApiState.ocupado ? 'disabled' : ''}>${GmbApiState.ocupado ? 'Testando...' : 'Testar conexão'}</button>
           <button type="button" data-gmb-api="conectar" class="gmb-btn-link">Conectar de novo</button>`
        : `<button type="button" data-gmb-api="conectar" class="gmb-btn-primario" ${GmbApiState.ocupado ? 'disabled' : ''}>Conectar com a conta Google da ficha</button>
           <button type="button" data-gmb-api="atualizar" class="gmb-btn-link">Já autorizei, atualizar</button>`}
      <button type="button" data-gmb-api="trocar" class="gmb-btn-link">Trocar cliente</button>
      <button type="button" data-gmb-api="remover" class="gmb-btn-link gmb-btn-perigo">Desconectar</button>
    </div>`;

  if (dados.connected) {
    gmbApiStatus('Conectada', 'bg-green-100 text-green-800');
    const posts = GmbApiState.posts;
    const lista = posts ? (posts.length
      ? `<ul class="geogrid-lideres mt-2">${posts.map(post => `<li>${escaparHtml(post.summary || '(sem texto)')}${post.state ? ` <span class="text-gray-500">(${escaparHtml(post.state)})</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="text-[11px] text-gray-500 mt-2">A API respondeu, sem posts publicados na lista.</p>') : '';
    conteudo.innerHTML = `
      <p class="text-[11px] text-gray-600"><strong>Ficha:</strong> ${escaparHtml(dados.title)} • ${escaparHtml(dados.address)}</p>
      <p class="text-[11px] text-gray-500">Conectada em ${new Date(dados.connectedAt).toLocaleString('pt-BR')} • cliente ${escaparHtml(dados.clientIdHint)}</p>
      ${acoes}${mensagem}${erro}${posts ? `<p class="text-[11px] font-bold text-gray-700 mt-3">Últimos posts que a API enxerga (${posts.length})</p>${lista}` : ''}`;
    return;
  }

  gmbApiStatus('Falta autorizar', 'bg-yellow-100 text-yellow-800');
  conteudo.innerHTML = `
    <p class="text-[11px] text-gray-600">Cliente salvo (${escaparHtml(dados.clientIdHint)}). Falta autorizar: clique em Conectar, entre com a conta Google que administra a ficha e aceite o acesso ao Perfil da Empresa. Se o Google avisar que o app não foi verificado, use Avançado e continue: o app é o do próprio projeto da loja.</p>
    <p class="text-[11px] text-gray-500 mt-1">Faça isto no computador do servidor: a volta da autorização é para ${escaparHtml(dados.redirectUri)}.</p>
    ${acoes}${mensagem}${erro}`;
}

async function carregarGmbApi() {
  const conteudo = document.getElementById('gmbApiConteudo');
  if (!conteudo) return;
  try {
    GmbApiState.dados = (await geogridApi('/api/marketing/gmb-api')).gmb;
    renderGmbApi();
    // A esteira de posts mostra se o servidor publicou ou falhou: redesenha com o resultado.
    if (typeof renderGmbPostsPlano === 'function') renderGmbPostsPlano();
    if (typeof renderGmbCicloResumo === 'function') renderGmbCicloResumo();
  } catch {
    gmbApiStatus('Indisponível', 'bg-gray-100 text-gray-700');
    conteudo.innerHTML = '<p class="results-empty">A conexão com a ficha funciona com o painel aberto pelo Nexcafe (Speed Marketing), logado como administrador.</p>';
  }
}

async function gmbApiAcao(executar, sucesso) {
  GmbApiState.ocupado = true;
  GmbApiState.mensagem = '';
  renderGmbApi();
  try {
    const resposta = await executar();
    if (resposta.gmb) GmbApiState.dados = resposta.gmb;
    if (sucesso) mostrarToast(sucesso);
    return resposta;
  } catch (erro) {
    GmbApiState.mensagem = `${erro.message}.`;
    try { GmbApiState.dados = (await geogridApi('/api/marketing/gmb-api')).gmb; } catch { }
    return null;
  } finally {
    GmbApiState.ocupado = false;
    renderGmbApi();
  }
}

function setupGmbApi() {
  const painel = document.getElementById('gmbApiPainel');
  if (!painel || painel.dataset.pronto) return;
  painel.dataset.pronto = '1';
  painel.addEventListener('submit', async ev => {
    if (ev.target.id !== 'gmbApiForm') return;
    ev.preventDefault();
    const clientId = document.getElementById('gmbApiClientId').value.trim();
    const clientSecret = document.getElementById('gmbApiSecret').value.trim();
    if (!clientId || !clientSecret) return;
    const ok = await gmbApiAcao(() => geogridApi('/api/marketing/gmb-api/config', { clientId, clientSecret }), 'Cliente OAuth salvo.');
    if (ok) { GmbApiState.editando = false; GmbApiState.posts = null; renderGmbApi(); }
  });
  painel.addEventListener('click', async ev => {
    const botao = ev.target.closest('[data-gmb-api]');
    if (!botao || GmbApiState.ocupado) return;
    const acao = botao.dataset.gmbApi;
    if (acao === 'conectar') {
      // Abre a aba antes da chamada: o navegador bloqueia janela aberta depois de um await.
      const janela = window.open('', '_blank');
      const resposta = await gmbApiAcao(() => geogridApi('/api/marketing/gmb-api/connect', {}));
      if (resposta?.url && janela) { janela.location = resposta.url; GmbApiState.mensagem = 'Autorize na aba que abriu. Depois volte aqui e clique em Já autorizei, atualizar.'; renderGmbApi(); }
      else if (resposta?.url) window.location.href = resposta.url;
      else if (janela) janela.close();
    } else if (acao === 'atualizar') {
      await gmbApiAcao(() => geogridApi('/api/marketing/gmb-api'));
    } else if (acao === 'testar') {
      const resposta = await gmbApiAcao(() => geogridApi('/api/marketing/gmb-api/check', {}), 'A API do Perfil da Empresa respondeu.');
      if (resposta) { GmbApiState.posts = resposta.posts || []; renderGmbApi(); }
    } else if (acao === 'trocar') { GmbApiState.editando = true; renderGmbApi(); }
    else if (acao === 'cancelar') { GmbApiState.editando = false; renderGmbApi(); }
    else if (acao === 'remover' && confirm('Desconectar a ficha e apagar o cliente OAuth salvo no servidor?')) {
      GmbApiState.posts = null;
      await gmbApiAcao(() => geogridApi('/api/marketing/gmb-api/config', { remove: true }), 'Ficha desconectada.');
    }
  });
  // Ao voltar para a aba do painel depois de autorizar, atualiza sozinho.
  window.addEventListener('focus', () => { if (GmbApiState.dados && !GmbApiState.dados.connected && GmbApiState.dados.clientConfigured && !GmbApiState.ocupado) carregarGmbApi(); });
}

document.addEventListener('DOMContentLoaded', () => { setupGmbApi(); carregarGmbApi(); });
