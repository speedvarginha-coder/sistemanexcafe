// simulador.js — Minicalculadora de Balcão, Correção NAP & Backup/Restore
// Speed Financeira | Varginha/MG

// ─── ESTADO DOS SIMULADORES ──────────────────────────────────────────────────
const SimuladorState = {
  fgts: {
    saldo: 3000,
    valorLiberado: 0
  },
  portabilidade: {
    parcela: 350,
    prazoRestante: 60,
    saldoDevedor: 12000,
    taxaNovaMensal: 1.50,
    reducaoMensal: 0,
    trocoPix: 0,
    novaParcela: 0,
    economiaTotal: 0
  }
};

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────────────────
function initSimuladoresEBackup() {
  setupSimuladoresListeners();
  calcularSimuladorFGTS();
  calcularSimuladorPortabilidade();
  renderCentralCorrecaoNAP();
}

// ─── SIMULADOR 1: SAQUE-ANIVERSÁRIO FGTS ────────────────────────────────────
function setupSimuladoresListeners() {
  const inputFgts = document.getElementById('simFgtsSaldo');
  if (inputFgts) {
    inputFgts.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      SimuladorState.fgts.saldo = val;
      calcularSimuladorFGTS();
    });
  }

  const inputPortParcela = document.getElementById('simPortParcela');
  if (inputPortParcela) {
    inputPortParcela.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      SimuladorState.portabilidade.parcela = val;
      calcularSimuladorPortabilidade();
    });
  }

  const selectPortPrazo = document.getElementById('simPortPrazo');
  if (selectPortPrazo) {
    selectPortPrazo.addEventListener('change', (e) => {
      SimuladorState.portabilidade.prazoRestante = parseInt(e.target.value, 10) || 60;
      calcularSimuladorPortabilidade();
    });
  }

  const inputPortSaldo = document.getElementById('simPortSaldo');
  if (inputPortSaldo) {
    inputPortSaldo.addEventListener('input', (e) => {
      SimuladorState.portabilidade.saldoDevedor = parseFloat(e.target.value) || 0;
      calcularSimuladorPortabilidade();
    });
  }

  const inputPortTaxa = document.getElementById('simPortTaxaNova');
  if (inputPortTaxa) {
    inputPortTaxa.addEventListener('input', (e) => {
      SimuladorState.portabilidade.taxaNovaMensal = parseFloat(e.target.value) || 0;
      calcularSimuladorPortabilidade();
    });
  }
}

function setSaldoFgtsRapido(valor) {
  const inputFgts = document.getElementById('simFgtsSaldo');
  if (inputFgts) {
    inputFgts.value = valor;
    SimuladorState.fgts.saldo = valor;
    calcularSimuladorFGTS();
  }
}

function calcularSaqueAniversarioAnual(saldo) {
  if (saldo <= 0) return 0;
  if (saldo <= 500) return saldo * 0.50;
  if (saldo <= 1000) return saldo * 0.40 + 50;
  if (saldo <= 5000) return saldo * 0.30 + 150;
  if (saldo <= 10000) return saldo * 0.20 + 650;
  if (saldo <= 15000) return saldo * 0.15 + 1150;
  if (saldo <= 20000) return saldo * 0.10 + 1900;
  return saldo * 0.05 + 2900;
}

function obterLimitePeriodosFgts(agora = new Date()) {
  const inicioRegraTresPeriodos = new Date(2026, 10, 1);
  return agora < inicioRegraTresPeriodos ? 5 : 3;
}

// Teto regulatório bruto. O valor líquido depende das taxas da instituição.
function calcularSimuladorFGTS() {
  const saldo = SimuladorState.fgts.saldo;
  let valorLiberado = 0;
  const periodos = obterLimitePeriodosFgts();

  if (saldo > 0) {
    const direitoAnual = calcularSaqueAniversarioAnual(saldo);
    const parcelaElegivel = direitoAnual >= 100 ? Math.min(direitoAnual, 500) : 0;
    valorLiberado = parcelaElegivel * periodos;
  }

  SimuladorState.fgts.valorLiberado = valorLiberado;

  const elValor = document.getElementById('simFgtsValorLiberado');
  if (elValor) {
    elValor.innerText = valorLiberado > 0 
      ? `R$ ${valorLiberado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
      : 'R$ 0,00';
  }

  const elRegra = document.getElementById('simFgtsRegra');
  if (elRegra) {
    elRegra.innerText = valorLiberado > 0
      ? `Até ${periodos} períodos de no máximo R$ 500. Valor líquido sujeito a juros e análise.`
      : 'Saldo informado não gera parcela mínima elegível de R$ 100.';
  }
}

function copiarPropostaFGTSWhatsApp() {
  const saldo = SimuladorState.fgts.saldo;
  const valor = SimuladorState.fgts.valorLiberado;

  const periodos = obterLimitePeriodosFgts();
  const texto = `Olá! Tudo bem? Fiz um cálculo preliminar com base no saldo aproximado de FGTS de R$ ${saldo.toLocaleString('pt-BR')}:

Teto bruto indicativo para até ${periodos} períodos: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.

O valor líquido pode ser menor porque depende de juros, saldo elegível, prazo, autorização no App FGTS e análise da instituição financeira. Não há promessa de aprovação ou liberação imediata.

Se quiser, posso orientar a consulta oficial no aplicativo FGTS e solicitar uma proposta com taxa e CET para você avaliar.

Speed Financeira | Rua Santa Cruz, 696 - Centro, Varginha`;

  copiarTexto(texto, 'Mensagem preliminar de FGTS copiada para o WhatsApp.');
}

// ─── SIMULADOR 2: PORTABILIDADE DE CONSIGNADO ──────────────────────────────
function calcularSimuladorPortabilidade() {
  const parcela = SimuladorState.portabilidade.parcela;
  const prazo = SimuladorState.portabilidade.prazoRestante;
  const saldo = SimuladorState.portabilidade.saldoDevedor;
  const taxa = SimuladorState.portabilidade.taxaNovaMensal / 100;
  const fatorPresente = taxa > 0 ? (1 - Math.pow(1 + taxa, -prazo)) / taxa : prazo;
  const novaParcela = saldo > 0 && fatorPresente > 0 ? saldo / fatorPresente : 0;
  const reducao = Math.max(parcela - novaParcela, 0);
  const economiaTotal = reducao * prazo;
  const principalSuportado = parcela * fatorPresente;
  const troco = Math.max(principalSuportado - saldo, 0);

  SimuladorState.portabilidade.reducaoMensal = reducao;
  SimuladorState.portabilidade.trocoPix = troco;
  SimuladorState.portabilidade.novaParcela = novaParcela;
  SimuladorState.portabilidade.economiaTotal = economiaTotal;

  const elNovaParcela = document.getElementById('simPortNovaParcela');
  const elEconomiaTotal = document.getElementById('simPortEconomiaTotal');
  const elTrocoPix = document.getElementById('simPortTrocoPix');

  if (elNovaParcela) elNovaParcela.innerText = `R$ ${novaParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês`;
  if (elEconomiaTotal) elEconomiaTotal.innerText = `Economia de R$ ${economiaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} no contrato`;
  if (elTrocoPix) elTrocoPix.innerText = `R$ ${troco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} no Pix`;
}

function copiarPropostaPortabilidadeWhatsApp() {
  const parcela = SimuladorState.portabilidade.parcela;
  const prazo = SimuladorState.portabilidade.prazoRestante;
  const saldo = SimuladorState.portabilidade.saldoDevedor;
  const taxa = SimuladorState.portabilidade.taxaNovaMensal;
  const novaParcela = SimuladorState.portabilidade.novaParcela;
  const troco = SimuladorState.portabilidade.trocoPix;

  const texto = `Olá! Tudo bem? Montei um cenário matemático preliminar para seu contrato, considerando parcela de R$ ${parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, saldo devedor informado de R$ ${saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${prazo} meses e taxa estimada de ${taxa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% ao mês:

Opção 1, mantendo a parcela: troco matemático indicativo de até R$ ${troco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.

Opção 2, sem troco: parcela matemática aproximada de R$ ${novaParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.

Os valores reais dependem da confirmação do saldo devedor, margem, taxa, CET, prazo e aprovação da instituição financeira. Esta mensagem não constitui proposta ou garantia de liberação.

Posso solicitar a proposta oficial para você comparar com segurança?

Speed Financeira | Rua Santa Cruz, 696 - Centro, Varginha`;

  copiarTexto(texto, 'Cenário preliminar de portabilidade copiado para o WhatsApp.');
}

// ─── CENTRAL DE CORREÇÃO NAP (9 TELEFONES ERRADOS) ──────────────────────────
function renderCentralCorrecaoNAP() {
  const container = document.getElementById('centralCorrecaoNapContainer');
  if (!container || !window.SPEED_NAP_ERROS) return;

  const salvos = lerJsonStorage('speed_nap_correcoes', {});
  container.innerHTML = '';

  let totalCorrigidos = 0;

  window.SPEED_NAP_ERROS.forEach(item => {
    const isCorrigido = !!salvos[item.id];
    if (isCorrigido) totalCorrigidos++;

    const div = document.createElement('div');
    div.className = `p-4 rounded-xl border transition-all ${isCorrigido ? 'bg-green-50/50 border-green-200' : 'bg-white border-gray-200 hover:border-red-300'}`;
    
    div.innerHTML = `
      <div class="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-2">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs ${isCorrigido ? 'bg-green-600 text-white' : 'bg-red-100 text-red-600 font-bold'}">
            ${isCorrigido ? '<i class="fas fa-check"></i>' : '<i class="fas fa-phone-slash"></i>'}
          </span>
          <h4 class="text-xs font-bold text-gray-900 ${isCorrigido ? 'line-through text-gray-400' : ''}">${item.diretorio}</h4>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.gravidade_cor} whitespace-nowrap">${item.gravidade_label}</span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <a href="${item.url_ficha}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg transition flex items-center gap-1 whitespace-nowrap">
            <i class="fas fa-external-link-alt text-[10px]"></i> Abrir Ficha
          </a>
          <button onclick="toggleNapCorrecao('${item.id}')" class="text-xs font-bold px-2.5 py-1 rounded-lg border transition whitespace-nowrap ${isCorrigido ? 'bg-green-600 text-white border-green-600' : 'bg-white text-green-700 border-green-300 hover:bg-green-50'}">
            ${isCorrigido ? '✓ Corrigido' : 'Marcar Corrigido'}
          </button>
        </div>
      </div>

      <div class="text-[11px] text-gray-600 space-y-1 pl-8">
        <p><strong class="text-red-700">Telefone incorreto publicado:</strong> <span class="font-mono font-bold whitespace-nowrap">${item.telefone_errado}</span></p>
        <p><strong>Problema:</strong> ${item.motivo}</p>
        <p class="text-gray-500"><strong>Ação:</strong> ${item.acao_recomendada}</p>
      </div>

      <div class="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between pl-8 gap-2">
        <span class="text-[10px] text-gray-400 truncate">Texto pronto para envio ao suporte/ficha:</span>
        <button onclick="copiarTexto('${item.texto_solicitacao.replace(/'/g, "\\'")}')" class="text-[10px] font-bold text-gray-700 hover:text-green-700 bg-gray-100 hover:bg-green-50 border border-gray-200 px-2 py-1 rounded transition flex items-center gap-1 shrink-0 whitespace-nowrap">
          <i class="fas fa-copy"></i> Copiar Mensagem de Correção
        </button>
      </div>
    `;

    container.appendChild(div);
  });

  // Atualiza indicadores de progresso NAP
  const elContador = document.getElementById('napErrosContador');
  if (elContador) {
    const restantes = window.SPEED_NAP_ERROS.length - totalCorrigidos;
    elContador.innerText = `${restantes} pendentes • ${totalCorrigidos} corrigidos`;
  }

  // Recalcula o NAP Score simulado com os itens corrigidos
  const scoreBase = 18.2;
  const incrementoPorItem = (60 - 18.2) / window.SPEED_NAP_ERROS.length;
  const novoScore = Math.min(Math.round((scoreBase + (totalCorrigidos * incrementoPorItem)) * 10) / 10, 100);

  const bar = document.getElementById('napScoreBar');
  const label = document.getElementById('napScoreLabel');
  if (bar) bar.style.width = novoScore + '%';
  if (label) label.innerText = novoScore.toFixed(1) + '%';
}

function toggleNapCorrecao(id) {
  const salvos = lerJsonStorage('speed_nap_correcoes', {});
  salvos[id] = !salvos[id];
  localStorage.setItem('speed_nap_correcoes', JSON.stringify(salvos));
  renderCentralCorrecaoNAP();
  mostrarToast('Status de correção do diretório atualizado!');
}

// ─── BACKUP E RESTAURAÇÃO COMPLETA ──────────────────────────────────────────
function exportarBackupDashboard() {
  const backup = {
    versao: "2.0",
    data_exportacao: new Date().toISOString(),
    empresa: "Speed Financeira - Varginha/MG",
    dados: {
      speed_posts_custom: lerJsonStorage('speed_posts_custom', null),
      speed_gmb_checklist: lerJsonStorage('speed_gmb_checklist', null),
      speed_roi_settings: lerJsonStorage('speed_roi_settings', null),
      speed_resultados_reais_v1: lerJsonStorage('speed_resultados_reais_v1', []),
      speed_nap_correcoes: lerJsonStorage('speed_nap_correcoes', null)
    }
  };

  // Coleta também chaves dinâmicas do calendário e fotos
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('speed_cal_') || key.startsWith('speed_gmb_foto_')) {
      backup.dados[key] = localStorage.getItem(key);
    }
  }

  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const dataFormatada = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = `speed_financeira_marketing_backup_${dataFormatada}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  mostrarToast('Backup completo baixado com sucesso!');
}

function chaveBackupPermitida(chave) {
  const fixas = new Set(['speed_posts_custom', 'speed_gmb_checklist', 'speed_roi_settings', 'speed_nap_correcoes', 'speed_resultados_reais_v1']);
  return fixas.has(chave) || /^speed_cal_\d{4}_W\d{1,2}$/.test(chave) || /^speed_gmb_foto_[a-zA-Z0-9 _-]{1,30}$/.test(chave);
}

function objetoSimples(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) && Object.getPrototypeOf(valor) === Object.prototype;
}

function validarValorBackup(chave, valor) {
  if (chave === 'speed_resultados_reais_v1') {
    const origens = new Set(['google_ads', 'meta_ads', 'google_maps', 'social_organico', 'site_organico', 'indicacao', 'outros']);
    const numericos = ['spend', 'clicks', 'qualified', 'proposals', 'contracts', 'commission'];
    return Array.isArray(valor) && valor.length <= 1000 && valor.every(row =>
      objetoSimples(row) && typeof row.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(row.id) &&
      typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
      origens.has(row.source) && typeof row.campaign === 'string' && row.campaign.length <= 80 &&
      numericos.every(campo => row[campo] === null || (Number.isFinite(row[campo]) && row[campo] >= 0 && row[campo] <= 100000000 && (!['clicks', 'qualified', 'proposals', 'contracts'].includes(campo) || Number.isInteger(row[campo]))))
    );
  }
  if (chave === 'speed_posts_custom') {
    return Array.isArray(valor) && valor.length <= 500 && valor.every(post => {
      if (!objetoSimples(post) || !/^[a-zA-Z0-9_-]{1,100}$/.test(String(post.id || ''))) return false;
      return Object.values(post).every(campo => {
        if (campo === null || typeof campo === 'boolean' || typeof campo === 'number') return true;
        if (typeof campo === 'string') return campo.length <= 20000;
        return false;
      });
    });
  }
  if (chave === 'speed_roi_settings') {
    if (!objetoSimples(valor)) return false;
    const limites = { orcamento: [0, 1000000], cpc: [0.01, 10000], taxaConversaoLead: [0, 100], taxaFechamento: [0, 100], ticketComissao: [0, 1000000] };
    return Object.entries(limites).every(([campo, [min, max]]) => Number.isFinite(valor[campo]) && valor[campo] >= min && valor[campo] <= max);
  }
  if (chave === 'speed_gmb_checklist') {
    return objetoSimples(valor) && Object.values(valor).every(status => status === 'ok' || status === 'pendente');
  }
  if (chave === 'speed_nap_correcoes') {
    return objetoSimples(valor) && Object.values(valor).every(status => typeof status === 'boolean');
  }
  if (/^speed_cal_/.test(chave)) {
    const progresso = typeof valor === 'string' ? (() => { try { return JSON.parse(valor); } catch { return null; } })() : valor;
    return objetoSimples(progresso) && Object.values(progresso).every(status => typeof status === 'boolean');
  }
  if (/^speed_gmb_foto_/.test(chave)) return valor === 'ok' || valor === 'pendente';
  return false;
}

function importarBackupDashboard(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('O backup excede o limite de 2 MB.');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (!objetoSimples(backup) || backup.versao !== '2.0' || !objetoSimples(backup.dados)) {
        alert('Arquivo de backup inválido.');
        return;
      }

      const chaves = Object.keys(backup.dados);
      if (!chaves.every(chave => chaveBackupPermitida(chave) && validarValorBackup(chave, backup.dados[chave]))) {
        alert('O backup contém chaves ou valores inválidos e não foi restaurado.');
        return;
      }

      chaves.forEach(key => {
        const val = backup.dados[key];
        if (val !== null && val !== undefined) {
          if (typeof val === 'object') {
            localStorage.setItem(key, JSON.stringify(val));
          } else {
            localStorage.setItem(key, val);
          }
        }
      });

      mostrarToast('Backup restaurado com sucesso! Atualizando tela...');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      alert('Erro ao ler o arquivo de backup: ' + err.message);
    } finally {
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}
