// geogrid.js — GeoGrid da ficha no Google (Raio-X Local Avançado & Gestão de SEO)
// Dados vêm do servidor do Nexcafe (/api/marketing/geogrid), que mede pela Places API.

const BAIRROS_VARGINHA = [
  ["Alto dos Pinheiros / Rezende", "Vila Floresta / Sta. Maria", "Parque Mariela / Pinheiros", "Sion Norte / São Geraldo", "Canaã / São Sebastião"],
  ["Jardim Andere / Imaculada", "Vila Paiva / Bom Pastor", "Centro Norte / Rodoviária", "Jardim Alvorada / Bela Vista", "Vila Sion / Padre Victor"],
  ["Vila Pinto / Medicina", "Vila Isabel / Mercado", "Centro (Sede Speed)", "Jardim América / Sion Sul", "Parque Novo Horizonte"],
  ["Santana / Damasco", "Catanduvas / Vila Morani", "Vila Barcelona / Santa Luiza", "Parque Rinaldini / Vargem", "Jd. Mont Serrat / Carvalhos"],
  ["Polo Industrial / Princesa", "Três Bicas / Aeroporto", "Corcetti / Sagrado Coração", "Jardim Europa / Fátima", "Zona Sul / Trevo Varginha"]
];

const BAIRROS_SIGLAS = [
  ["Pinheiros", "Floresta", "Mariela", "Sion N.", "Canaã"],
  ["Andere", "Bom Pastor", "Rodoviária", "Alvorada", "Pe. Victor"],
  ["Vila Pinto", "Mercado", "SPEED", "Jd. América", "Novo Horiz."],
  ["Santana", "Catanduvas", "Barcelona", "Rinaldini", "Mont Serrat"],
  ["Industrial", "Aeroporto", "Corcetti", "Jd. Europa", "Zona Sul"]
];

const GeoGridState = {
  dados: null,
  termo: 0,
  medicao: null,
  editandoChave: false,
  ocupado: false,
  mensagem: '',
  pontoSelecionado: null, // { row, col }
  modoVisao: 'grid', // 'grid' | 'bairros' | 'comparativo'
  abaSecundaria: 'mapa', // 'mapa' | 'spam' | 'respostas_seo' | 'smart_ads' | 'termos_grade' | 'geotag'
  clienteNomeSeo: 'Cliente',
  clienteServicoSeo: 'Empréstimo Consignado INSS',
  termosCustomizados: null,
  tamanhoCustomizado: 5,
  espacamentoCustomizado: 1.0,
  fotoGpsProcessada: null
};

// Gerador de APP1 EXIF com coordenadas GPS da Speed Financeira (-21.5551923, -45.439385)
function buildSpeedExifApp1() {
  const tiff = [];
  function w16(val) { tiff.push(val & 0xff, (val >> 8) & 0xff); }
  function w32(val) { tiff.push(val & 0xff, (val >> 8) & 0xff, (val >> 16) & 0xff, (val >> 24) & 0xff); }
  
  // TIFF Header (offset 0, little-endian)
  tiff.push(0x49, 0x49, 0x2a, 0x00);
  w32(8); // Offset para IFD0
  
  const ifd0EntryCount = 2;
  const ifd0Offset = 8;
  const ifd0Size = 2 + ifd0EntryCount * 12 + 4;
  const gpsIfdOffset = ifd0Offset + ifd0Size;
  const gpsEntryCount = 6;
  const gpsIfdSize = 2 + gpsEntryCount * 12 + 4;
  const valuesOffset = gpsIfdOffset + gpsIfdSize;
  
  // IFD0
  w16(ifd0EntryCount);
  w16(0x0131); w16(2); w32(6); w32(valuesOffset); // Software: Speed\0
  w16(0x8825); w16(4); w32(1); w32(gpsIfdOffset); // GPS IFD pointer
  w32(0);
  
  // GPS IFD
  w16(gpsEntryCount);
  w16(0x0000); w16(1); w32(4); tiff.push(2, 3, 0, 0); // Versão 2.3.0.0
  w16(0x0001); w16(2); w32(2); tiff.push(0x53, 0x00, 0x00, 0x00); // LatRef: S
  w16(0x0002); w16(5); w32(3); w32(valuesOffset + 6); // Lat
  w16(0x0003); w16(2); w32(2); tiff.push(0x57, 0x00, 0x00, 0x00); // LngRef: W
  w16(0x0004); w16(5); w32(3); w32(valuesOffset + 30); // Lng
  w16(0x0006); w16(5); w32(1); w32(valuesOffset + 54); // Alt
  w32(0);
  
  // Valores:
  tiff.push(0x53, 0x70, 0x65, 0x65, 0x64, 0x00); // Speed\0
  // Lat: 21° 33' 18.69" S
  w32(21); w32(1);
  w32(33); w32(1);
  w32(1869); w32(100);
  // Lng: 45° 26' 21.79" W
  w32(45); w32(1);
  w32(26); w32(1);
  w32(2179); w32(100);
  // Alt: 920m
  w32(920); w32(1);
  
  const app1Payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = app1Payload.length + 2;
  return new Uint8Array([0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...app1Payload]);
}

async function processarFotoComGps(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await new Promise(resolve => { img.onload = resolve; });
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
  const buf = await blob.arrayBuffer();
  const u8 = new Uint8Array(buf);
  
  const app1 = buildSpeedExifApp1();
  let insertPos = 2;
  if (u8[2] === 0xff && u8[3] === 0xe0) {
    const jfifLen = (u8[4] << 8) | u8[5];
    insertPos = 2 + 2 + jfifLen;
  }
  
  const combined = new Uint8Array(u8.length + app1.length);
  combined.set(u8.subarray(0, insertPos), 0);
  combined.set(app1, insertPos);
  combined.set(u8.subarray(insertPos), insertPos + app1.length);
  
  const finalBlob = new Blob([combined], { type: 'image/jpeg' });
  const downloadUrl = URL.createObjectURL(finalBlob);
  
  GeoGridState.fotoGpsProcessada = {
    nomeOrig: file.name,
    nomeDownload: `speed-varginha-gps-${Date.now()}.jpg`,
    url: downloadUrl,
    largura: canvas.width,
    altura: canvas.height,
    tamanhoKb: Math.round(finalBlob.size / 1024)
  };
  renderGeogrid();
}

async function geogridApi(rota, corpo) {
  const resposta = await fetch(rota, corpo === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.ok) throw Object.assign(new Error(dados.error || `Erro ${resposta.status}`), { dados });
  return dados;
}

function geogridData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function geogridCor(rank) {
  if (!rank) return 'geogrid-fora';
  if (rank <= 3) return 'geogrid-top';
  if (rank <= 10) return 'geogrid-meio';
  return 'geogrid-baixo';
}

function geogridStatus(texto, classe) {
  const el = document.getElementById('geogridStatus');
  if (el) { el.textContent = texto; el.className = `status-badge text-[10px] whitespace-nowrap ${classe}`; }
}

function geogridFormularioChave(dados) {
  return `
    <form id="geogridChaveForm" class="geogrid-config" autocomplete="off">
      <div class="flex items-center justify-between mb-2">
        <label for="geogridChave" class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
          <i class="fas fa-key text-emerald-600"></i> Chave da API do Google Cloud ${dados.configured ? `<span class="text-[11px] font-normal text-gray-500">(atual termina em ${escaparHtml(dados.keyHint)})</span>` : ''}
        </label>
        ${dados.configured ? '<button type="button" data-geogrid="cancelar" class="text-xs text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i> Fechar</button>' : ''}
      </div>
      <div class="flex flex-wrap gap-2 mt-1">
        <input id="geogridChave" type="password" class="art-input" style="max-width: 26rem" placeholder="Cole aqui a chave criada no Google Cloud" required>
        <button type="submit" class="gmb-btn-primario" ${GeoGridState.ocupado ? 'disabled' : ''}>Salvar e conferir</button>
        ${dados.configured ? '<button type="button" data-geogrid="cancelar" class="gmb-btn-link">Cancelar</button>' : ''}
      </div>
      <p class="text-[11px] text-gray-500 mt-2">A chave fica salva exclusivamente no servidor do Nexcafe em cofre seguro e nunca volta desprotegida para a tela. Ao salvar, o sistema faz uma validação em tempo real buscando a ficha da Speed Financeira.</p>
    </form>`;
}

function geogridInstrucoes() {
  return `
    <ol class="geogrid-passos">
      <li>No <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud</a>, crie um projeto e ative uma conta de faturamento. O Google exige o faturamento ativo mesmo para o uso gratuito.</li>
      <li>Em APIs e serviços, ative a <strong>Places API (New)</strong>.</li>
      <li>Em Credenciais, crie uma chave de API e restrinja a chave à Places API (New).</li>
      <li>Cole a chave abaixo.</li>
    </ol>
    <p class="text-[11px] text-gray-600 mb-3">Custo esperado: zero. As buscas de identificadores de empresas na grade são gratuitas no SKU Essentials do Google.</p>`;
}

function geogridQuartoLugar(run, item) {
  const pontos = item.cells.filter(c => c.rank === 4)
    .sort((a, b) => a.row - b.row || a.col - b.col);
  if (!pontos.length) return '<p class="text-xs mt-3 text-gray-500">Nenhum ponto em 4º lugar nesta medição.</p>';
  const linhas = pontos.map(c => {
    const nome = run.names?.[c.leader] || 'Líder local';
    const bairro = c.bairro || BAIRROS_VARGINHA[c.row]?.[c.col] || `L${c.row + 1} C${c.col + 1}`;
    return `<tr class="cursor-pointer hover:bg-emerald-50" data-geogrid-select-row="${c.row}" data-geogrid-select-col="${c.col}">
      <td><strong class="text-gray-900">${escaparHtml(bairro)}</strong> <span class="text-[10px] text-gray-400 font-mono">(L${c.row + 1} C${c.col + 1})</span></td>
      <td><span class="text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">4º lugar</span></td>
      <td>${escaparHtml(nome)}</td>
    </tr>`;
  }).join('');
  return `<details class="geogrid-quarto mt-3">
    <summary class="gmb-btn-link text-xs font-bold text-amber-700 hover:text-amber-900">
      <i class="fas fa-crosshairs text-amber-600 mr-1"></i>Ver ${pontos.length} pontos a 1 passo do Top 3 (Clique para auditar)
    </summary>
    <p class="text-[11px] text-gray-500 my-2">Estes são os bairros onde a Speed está a apenas 1 posição do pódio visível no celular.</p>
    <div class="overflow-x-auto"><table class="geogrid-concorrentes-tabela">
    <thead><tr><th>Bairro / Ponto</th><th>Posição</th><th>1º colocado</th></tr></thead>
    <tbody>${linhas}</tbody></table></div></details>`;
}

function geogridDetalhePontoCard(run, item, anterior) {
  if (!GeoGridState.pontoSelecionado) return '';
  const { row, col } = GeoGridState.pontoSelecionado;
  const c = item.cells.find(x => x.row === row && x.col === col);
  if (!c) return '';

  const bairro = c.bairro || BAIRROS_VARGINHA[row]?.[col] || `Ponto Linha ${row + 1}, Coluna ${col + 1}`;
  const dKm = +(Math.hypot((row - 2) * 1.0, (col - 2) * 1.0)).toFixed(1);
  const distTexto = (row === 2 && col === 2) ? '📍 Sede Speed Financeira (Rua Santa Cruz, 696)' : `${dKm.toLocaleString('pt-BR')} km da loja no Centro`;
  
  const antCell = anterior?.terms?.[GeoGridState.termo]?.cells?.find(x => x.row === row && x.col === col);
  const delta = antCell && c.rank && antCell.rank ? antCell.rank - c.rank : null;
  const deltaTexto = delta === null ? '' : delta > 0 
    ? `<span class="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-bold"><i class="fas fa-arrow-up"></i> Subiu ${delta} posições</span>`
    : delta < 0 ? `<span class="text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px] font-bold"><i class="fas fa-arrow-down"></i> Caiu ${Math.abs(delta)} posições</span>`
    : '<span class="text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-bold">Estável</span>';

  const liderNome = c.leader ? (run.names[c.leader] || 'Líder local') : 'Sem dados';
  
  let acaoBairro = '';
  if (c.rank === null) {
    acaoBairro = 'Neste raio a Speed está fora dos 20 primeiros. Reforçar páginas hiperlocais e tráfego pago para este quadrante.';
  } else if (c.rank === 4) {
    acaoBairro = '⚡ <strong>Oportunidade Máxima:</strong> A Speed está no 4º lugar neste bairro. Solicite a clientes deste quadrante uma avaliação no WhatsApp citando "' + item.term + '".';
  } else if (c.rank <= 3) {
    acaoBairro = '🏆 <strong>Pódio Consolidado:</strong> A Speed já aparece na tela inicial dos celulares de quem pesquisa neste bairro.';
  } else {
    acaoBairro = `A Speed está em ${c.rank}º lugar neste bairro. O líder local é <strong>${escaparHtml(liderNome)}</strong>.`;
  }

  const linkMaps = `https://www.google.com/maps/search/${encodeURIComponent(item.term)}/@${c.lat},${c.lng},15z`;

  return `
    <div class="geogrid-ponto-card">
      <div class="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-gray-100">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            <i class="fas fa-map-pin mr-1"></i>Raio-X do Ponto Selecionado
          </span>
          <h4 class="text-sm font-bold text-gray-900 mt-1">${escaparHtml(bairro)}</h4>
          <p class="text-[11px] text-gray-500">${distTexto} • Coordenadas: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</p>
        </div>
        <button type="button" data-geogrid-fechar-ponto="1" class="text-gray-400 hover:text-gray-600 text-xs p-1" title="Fechar detalhe">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-2">
        <div class="bg-gray-50 p-2 rounded-lg border border-gray-200">
          <span class="text-[10px] font-bold text-gray-500 block uppercase">Posição da Speed</span>
          <strong class="text-base font-black ${c.rank && c.rank <= 3 ? 'text-emerald-600' : (c.rank === 4 ? 'text-amber-600' : 'text-gray-800')}">
            ${c.rank ? `${c.rank}º lugar` : 'Fora dos 20'}
          </strong>
          ${deltaTexto}
        </div>
        <div class="bg-gray-50 p-2 rounded-lg border border-gray-200">
          <span class="text-[10px] font-bold text-gray-500 block uppercase">1º Colocado neste Ponto</span>
          <strong class="text-xs font-bold text-gray-900 block truncate" title="${escaparHtml(liderNome)}">
            ${escaparHtml(liderNome)}
          </strong>
          <small class="text-[10px] text-gray-500">Líder do quadrante</small>
        </div>
      </div>
      <div class="text-[11px] text-gray-700 bg-emerald-50/60 border border-emerald-200 p-2 rounded-lg mb-2">
        ${acaoBairro}
      </div>
      <div class="flex items-center justify-between gap-2 pt-1">
        <a href="${linkMaps}" target="_blank" rel="noopener noreferrer" class="gmb-btn-link text-xs flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
          <i class="fas fa-arrow-up-right-from-square text-[10px]"></i> Abrir busca no Google Maps nesta coordenada
        </a>
        <button type="button" data-geogrid-fechar-ponto="1" class="text-[11px] text-gray-500 hover:text-gray-800">
          Fechar
        </button>
      </div>
    </div>`;
}

function geogridMapa(run, item, anterior) {
  const n = run.size || 5;
  const modo = GeoGridState.modoVisao;
  const pontoSel = GeoGridState.pontoSelecionado;

  const celulas = [...item.cells].sort((a, b) => a.row - b.row || a.col - b.col).map(c => {
    const isCentro = c.row === (n - 1) / 2 && c.col === (n - 1) / 2;
    const isSel = pontoSel && pontoSel.row === c.row && pontoSel.col === c.col;
    const bairro = c.bairro || BAIRROS_VARGINHA[c.row]?.[c.col] || `L${c.row + 1} C${c.col + 1}`;
    const sigla = BAIRROS_SIGLAS[c.row]?.[c.col] || `P${c.row + 1}${c.col + 1}`;
    const lider = c.leader && c.rank !== 1 ? run.names[c.leader] || 'Líder local' : '';
    
    // Diferença em relação à medição anterior
    const antCell = anterior?.terms?.[GeoGridState.termo]?.cells?.find(x => x.row === c.row && x.col === c.col);
    const diff = antCell && c.rank && antCell.rank ? antCell.rank - c.rank : null;

    let conteudoInterno = '';
    if (modo === 'bairros') {
      conteudoInterno = `
        <span class="text-[10px] font-black leading-none">${c.rank ? c.rank : '20+'}</span>
        <span class="geogrid-bairro-label">${sigla}</span>`;
    } else if (modo === 'comparativo' && anterior) {
      if (diff === null) {
        conteudoInterno = `<span class="text-xs font-bold">${c.rank ? c.rank : '20+'}</span>`;
      } else if (diff > 0) {
        conteudoInterno = `<span class="geogrid-diff-up">▲+${diff}</span>`;
      } else if (diff < 0) {
        conteudoInterno = `<span class="geogrid-diff-down">▼${diff}</span>`;
      } else {
        conteudoInterno = `<span class="geogrid-diff-same">=</span>`;
      }
    } else {
      conteudoInterno = `<span class="text-xs font-black">${c.rank ? c.rank : '20+'}</span>`;
    }

    const dica = `${bairro} • ${isCentro ? '📍 [Sede Speed - R. Santa Cruz, 696] • ' : ''}${c.rank ? `${c.rank}º lugar` : 'Fora dos 20 primeiros'}${lider ? ` • 1º: ${lider}` : ''} • Coordenadas: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;

    return `
      <div 
        data-geogrid-cell="1" 
        data-row="${c.row}" 
        data-col="${c.col}" 
        class="geogrid-celula ${geogridCor(c.rank)} ${isCentro ? 'geogrid-centro' : ''} ${isSel ? 'geogrid-celula-selecionada' : ''}" 
        title="${escaparHtml(dica)}" 
        aria-label="${escaparHtml(dica)}">
        ${conteudoInterno}
      </div>`;
  }).join('');

  return `
    <div class="geogrid-mapa-wrap">
      <div class="flex items-center justify-between w-full mb-1 px-1">
        <span class="text-[11px] font-bold text-gray-700 flex items-center gap-1">
          <i class="fas fa-map-marked-alt text-emerald-600"></i> Grade de Varginha
        </span>
        <div class="geogrid-view-switcher">
          <button type="button" data-geogrid-view="grid" class="geogrid-view-btn ${modo === 'grid' ? 'ativo' : ''}" title="Visualizar números de posição">
            <i class="fas fa-hashtag text-[9px]"></i> Posições
          </button>
          <button type="button" data-geogrid-view="bairros" class="geogrid-view-btn ${modo === 'bairros' ? 'ativo' : ''}" title="Visualizar nomes dos bairros de Varginha">
            <i class="fas fa-city text-[9px]"></i> Bairros
          </button>
          ${anterior ? `
            <button type="button" data-geogrid-view="comparativo" class="geogrid-view-btn ${modo === 'comparativo' ? 'ativo' : ''}" title="Visualizar subida e queda de posições">
              <i class="fas fa-arrow-trend-up text-[9px]"></i> Evolução
            </button>` : ''}
        </div>
      </div>
      <span class="geogrid-rosa geogrid-rosa-n" title="Norte (N)"><i class="fas fa-arrow-up text-[10px] mr-1"></i>Norte (Alto dos Pinheiros / Sta. Maria)</span>
      <div class="geogrid-mapa-compass-row">
        <span class="geogrid-rosa" title="Oeste (O)">Oeste<br><small class="text-[9px] font-normal text-gray-400">Jd. Andere</small></span>
        <div class="geogrid-mapa" style="grid-template-columns: repeat(${n}, minmax(0, 1fr))" aria-label="Posição da ficha em cada ponto da grade">${celulas}</div>
        <span class="geogrid-rosa" title="Leste (L)">Leste<br><small class="text-[9px] font-normal text-gray-400">Novo Horiz.</small></span>
      </div>
      <span class="geogrid-rosa" title="Sul (S)">Sul (Industrial / Aeroporto / Trevo)<i class="fas fa-arrow-down text-[10px] ml-1"></i></span>
      <div class="geogrid-legenda">
        <span><i class="geogrid-top"></i>1º a 3º (Top 3)</span>
        <span><i class="geogrid-meio"></i>4º a 10º (1ª página)</span>
        <span><i class="geogrid-baixo"></i>11º a 20º</span>
        <span><i class="geogrid-fora"></i>20+</span>
        <span><strong class="text-gray-900 border border-gray-800 px-1 rounded text-[10px]">Loja</strong> Centro</span>
      </div>
      <p class="text-[10px] text-gray-400 text-center mt-1">Dica: clique em qualquer círculo da grade para abrir o Raio-X completo daquele bairro.</p>
    </div>
    ${geogridDetalhePontoCard(run, item, anterior)}`;
}

function geogridSubAbas() {
  const aba = GeoGridState.abaSecundaria;
  return `
    <div class="geogrid-subabas">
      <button type="button" data-geogrid-subaba="mapa" class="geogrid-subaba ${aba === 'mapa' ? 'ativa' : ''}">
        <i class="fas fa-chart-line"></i> Pódio & Disputa
      </button>
      <button type="button" data-geogrid-subaba="spam" class="geogrid-subaba ${aba === 'spam' ? 'ativa' : ''}">
        <i class="fas fa-shield-halved"></i> Caça-Spam & Concorrentes
      </button>
      <button type="button" data-geogrid-subaba="respostas_seo" class="geogrid-subaba ${aba === 'respostas_seo' ? 'ativa' : ''}">
        <i class="fas fa-comment-dots"></i> Respostas com SEO
      </button>
      <button type="button" data-geogrid-subaba="smart_ads" class="geogrid-subaba ${aba === 'smart_ads' ? 'ativa' : ''}">
        <i class="fas fa-bullseye"></i> Smart Ads & Bairros
      </button>
      <button type="button" data-geogrid-subaba="termos_grade" class="geogrid-subaba ${aba === 'termos_grade' ? 'ativa' : ''}">
        <i class="fas fa-sliders"></i> Palavras & Grade
      </button>
      <button type="button" data-geogrid-subaba="geotag" class="geogrid-subaba ${aba === 'geotag' ? 'ativa' : ''}">
        <i class="fas fa-camera"></i> Fotos com GPS
      </button>
      <button type="button" data-geogrid-print="1" class="geogrid-subaba text-gray-500 hover:text-gray-900 ml-auto">
        <i class="fas fa-print"></i> Relatório PDF
      </button>
    </div>`;
}

function geogridPainelSpam(run, item) {
  const termosRegex = /(empréstimo|consignado|financiamento|crédito|financeira|varginha|fgts)/i;
  const suspeitos = Object.entries(run.names || {})
    .filter(([id, nome]) => id !== 'speed' && !/speed/i.test(nome) && termosRegex.test(nome))
    .map(([id, nome]) => ({ id, nome }));

  const redressalUrl = 'https://support.google.com/business/contact/business_redressal_form';

  return `
    <div class="space-y-4">
      <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <i class="fas fa-triangle-exclamation text-amber-600"></i> Auditoria de Keyword Stuffing (Spam Fighting)
          </span>
          <span class="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">Diretrizes Google</span>
        </div>
        <p class="text-[11px] text-amber-800 leading-relaxed">
          O Google proíbe incluir termos de busca ("empréstimo", "consignado", "Varginha") no nome da ficha quando não constam na fachada física da loja. Empresas que praticam isso distorcem o Local Pack artificialmente.
        </p>
      </div>

      <div class="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div class="p-3 bg-gray-50 border-b border-gray-200">
          <h4 class="text-xs font-bold text-gray-900 flex items-center gap-1.5">
            <i class="fas fa-user-secret text-rose-600"></i> Fichas com Títulos Suspeitos Detectadas em Varginha (${suspeitos.length})
          </h4>
        </div>
        ${suspeitos.length ? `
          <div class="divide-y divide-gray-100">
            ${suspeitos.map(s => `
              <div class="p-3 flex items-center justify-between gap-2 hover:bg-gray-50">
                <div>
                  <strong class="text-xs text-gray-900 block">${escaparHtml(s.nome)}</strong>
                  <span class="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded font-semibold border border-rose-200">
                    Palavras de busca no nome oficial
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <button type="button" data-copy-redressal="${escaparHtml(s.nome)}" class="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-1 rounded flex items-center gap-1">
                    <i class="fas fa-copy"></i> Copiar Denúncia
                  </button>
                  <a href="${redressalUrl}" target="_blank" rel="noopener noreferrer" class="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 px-2 py-1 rounded flex items-center gap-1">
                    <i class="fas fa-arrow-up-right-from-square"></i> Abrir Redressal Form
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p class="text-xs text-gray-500 p-4">Nenhum concorrente com padrão evidente de spam no nome identificado nesta medição.</p>'}
      </div>

      <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
        <h4 class="text-xs font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
          <i class="fas fa-tags text-emerald-600"></i> Benchmark de Categoria Primária
        </h4>
        <p class="text-[11px] text-emerald-800 leading-relaxed mb-2">
          A Categoria Primária responde por ~65% do peso de relevância direta no algoritmo do Maps:
        </p>
        <ul class="text-[11px] text-emerald-900 space-y-1 pl-4 list-disc">
          <li><strong>Speed Financeira:</strong> Categoria Primária configurada como <em>Agência de empréstimos (Loan agency)</em>.</li>
          <li><strong>Líderes Locais:</strong> Concorrentes no topo costumam alternar entre <em>Instituição Financeira (Financial institution)</em> e <em>Agência de empréstimos</em>. Manter ambas preenchidas assegura cobertura integral nos dois universos de busca.</li>
        </ul>
      </div>
    </div>`;
}

function geogridPainelRespostasSEO(item) {
  const nome = GeoGridState.clienteNomeSeo || 'Cliente Amigo';
  const servico = GeoGridState.clienteServicoSeo || 'Empréstimo Consignado INSS';

  const r1 = `Olá, ${nome}! Muito obrigado pela avaliação e pela confiança. É uma grande satisfação atender você aqui na Speed Financeira, na Rua Santa Cruz, 696 (Centro de Varginha). Nossa equipe está sempre pronta para oferecer as melhores soluções em ${servico} com rapidez, segurança e atendimento transparente. Conte sempre com a gente!`;
  const r2 = `Olá, ${nome}! Agradecemos imensamente o seu carinho e a nota positiva. Ficamos muito felizes em saber que a sua experiência com ${servico} na Speed Financeira foi excelente. Estamos há mais de 15 anos no Centro de Varginha com foco em ajudar nossos clientes com responsabilidade. Qualquer dúvida, nosso WhatsApp (35) 3067-5017 continua à disposição!`;
  const r3 = `Obrigado pelo retorno positivo, ${nome}! O seu reconhecimento é o maior incentivo para a equipe da Speed Financeira. Foi um prazer auxiliar você com o seu ${servico} aqui em Varginha. Desejamos muito sucesso e esperamos vê-lo novamente em nossa loja física na Rua Santa Cruz, 696!`;

  return `
    <div class="space-y-4">
      <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <h4 class="text-xs font-bold text-blue-900 mb-1 flex items-center gap-1.5">
          <i class="fas fa-brain text-blue-600"></i> Gerador de Respostas com SEO Semântico
        </h4>
        <p class="text-[11px] text-blue-800">
          O Google Maps <strong>indexa o texto das respostas do proprietário</strong>. Ao responder seus clientes incluindo naturalmente o nome da loja, a Rua Santa Cruz e o serviço contratado, a ficha ganha pontos adicionais de relevância no algoritmo.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
        <div>
          <label class="text-[11px] font-bold text-gray-700 block mb-1">Nome do Cliente:</label>
          <input type="text" id="seoClienteNome" class="art-input text-xs" value="${escaparHtml(nome)}" placeholder="Ex: Maria José">
        </div>
        <div>
          <label class="text-[11px] font-bold text-gray-700 block mb-1">Serviço Realizado:</label>
          <select id="seoClienteServico" class="art-input text-xs">
            <option value="Empréstimo Consignado INSS" ${servico.includes('INSS') ? 'selected' : ''}>Empréstimo Consignado INSS</option>
            <option value="Consignado CLT" ${servico.includes('CLT') ? 'selected' : ''}>Consignado CLT (Carteira Assinada)</option>
            <option value="Antecipação do Saque-Aniversário FGTS" ${servico.includes('FGTS') ? 'selected' : ''}>Antecipação FGTS</option>
            <option value="Portabilidade e Refinanciamento" ${servico.includes('Portabilidade') ? 'selected' : ''}>Portabilidade de Crédito</option>
            <option value="Empréstimo com Garantia de Veículo" ${servico.includes('Veículo') ? 'selected' : ''}>Garantia de Veículo</option>
            <option value="Serviços Digitais e Impressão" ${servico.includes('Digitais') ? 'selected' : ''}>Serviços Digitais / Impressão</option>
          </select>
        </div>
      </div>

      <div class="space-y-3">
        <div class="p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-emerald-300 transition">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <i class="fas fa-medal text-amber-500"></i> Opção 1: Institucional & Localização
            </span>
            <button type="button" data-copy-resposta="${escaparHtml(r1)}" class="gmb-btn-primario text-[11px] py-1 px-2.5 flex items-center gap-1">
              <i class="fas fa-copy"></i> Copiar
            </button>
          </div>
          <p class="text-xs text-gray-700 leading-relaxed font-sans">${escaparHtml(r1)}</p>
        </div>

        <div class="p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-emerald-300 transition">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <i class="fas fa-heart text-rose-500"></i> Opção 2: Calorosa & Conexão WhatsApp
            </span>
            <button type="button" data-copy-resposta="${escaparHtml(r2)}" class="gmb-btn-primario text-[11px] py-1 px-2.5 flex items-center gap-1">
              <i class="fas fa-copy"></i> Copiar
            </button>
          </div>
          <p class="text-xs text-gray-700 leading-relaxed font-sans">${escaparHtml(r2)}</p>
        </div>

        <div class="p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-emerald-300 transition">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <i class="fas fa-star text-amber-500"></i> Opção 3: Foco em Fidelização e Loja Física
            </span>
            <button type="button" data-copy-resposta="${escaparHtml(r3)}" class="gmb-btn-primario text-[11px] py-1 px-2.5 flex items-center gap-1">
              <i class="fas fa-copy"></i> Copiar
            </button>
          </div>
          <p class="text-xs text-gray-700 leading-relaxed font-sans">${escaparHtml(r3)}</p>
        </div>
      </div>
    </div>`;
}

function geogridPainelSmartAds(run, item) {
  const dominados = [];
  const oportunidades = [];
  const perifericos = [];

  item.cells.forEach(c => {
    const nome = c.bairro || BAIRROS_VARGINHA[c.row]?.[c.col] || `L${c.row + 1} C${c.col + 1}`;
    if (c.rank && c.rank <= 3) dominados.push(nome);
    else if (c.rank && c.rank <= 6) oportunidades.push(nome);
    else perifericos.push(nome);
  });

  return `
    <div class="space-y-4">
      <div class="p-3 bg-purple-50 border border-purple-200 rounded-xl">
        <h4 class="text-xs font-bold text-purple-900 mb-1 flex items-center gap-1.5">
          <i class="fas fa-bullseye text-purple-600"></i> Smart Geotargeting: Sincronização com Google Ads
        </h4>
        <p class="text-[11px] text-purple-800 leading-relaxed">
          Use a inteligência da grade para não queimar verba de mídia paga onde a Speed já ganha cliques orgânicos de graça. Concentre os anúncios de raio exatamente onde a ficha está entre o 4º e o 6º lugar.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span class="text-xs font-bold text-emerald-900 block mb-1">
            🟢 Dominados (${dominados.length})
          </span>
          <p class="text-[10px] text-emerald-700 mb-2 font-medium">A Speed já é Top 3 orgânico. Reduza lances de raio aqui.</p>
          <ul class="text-[11px] text-emerald-900 space-y-0.5 list-disc pl-3">
            ${dominados.slice(0, 6).map(b => `<li>${escaparHtml(b)}</li>`).join('')}
            ${dominados.length > 6 ? `<li class="text-[10px] text-emerald-600">+ outros ${dominados.length - 6} bairros</li>` : ''}
          </ul>
        </div>

        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span class="text-xs font-bold text-amber-900 block mb-1">
            🟡 Batalha / Oportunidade (${oportunidades.length})
          </span>
          <p class="text-[10px] text-amber-700 mb-2 font-medium">Posições 4ª a 6ª. Prioridade Máxima para Anúncios Locais!</p>
          <ul class="text-[11px] text-amber-900 space-y-0.5 list-disc pl-3 font-semibold">
            ${oportunidades.slice(0, 6).map(b => `<li>${escaparHtml(b)}</li>`).join('')}
            ${oportunidades.length > 6 ? `<li class="text-[10px] text-amber-600">+ outros ${oportunidades.length - 6} bairros</li>` : ''}
          </ul>
        </div>

        <div class="p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <span class="text-xs font-bold text-gray-800 block mb-1">
            ⚪ Periféricos (${perifericos.length})
          </span>
          <p class="text-[10px] text-gray-600 mb-2 font-medium">Fora da mancha central. Recomendado Meta Ads / Social.</p>
          <ul class="text-[11px] text-gray-700 space-y-0.5 list-disc pl-3">
            ${perifericos.slice(0, 5).map(b => `<li>${escaparHtml(b)}</li>`).join('')}
            ${perifericos.length > 5 ? `<li class="text-[10px] text-gray-500">+ outros ${perifericos.length - 5} bairros</li>` : ''}
          </ul>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1">
        <button type="button" data-copy-smart-ads="${escaparHtml(oportunidades.join(', '))}" class="gmb-btn-primario text-xs py-1.5 px-3 flex items-center gap-1.5">
          <i class="fas fa-copy"></i> Copiar Bairros Prioritários para Configurar no Google Ads
        </button>
        <span class="text-[10px] text-gray-400">Raio sugerido: 1,5 km do Centro</span>
      </div>
    </div>`;
}

function geogridPainelTermosGrade(dados) {
  const termos = GeoGridState.termosCustomizados || dados.terms || [];
  const size = GeoGridState.tamanhoCustomizado || dados.size || 5;
  const spacingKm = GeoGridState.espacamentoCustomizado || dados.spacingKm || 1.0;

  return `
    <div class="space-y-4">
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <h4 class="text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
          <i class="fas fa-sliders text-emerald-600"></i> Personalização de Palavras-Chave e Alcance da Grade
        </h4>
        <p class="text-[11px] text-slate-600 leading-relaxed">
          Adicione ou remova termos de busca conforme as campanhas da loja e configure o tamanho do raio medido pela Places API.
        </p>
      </div>

      <div class="p-3 bg-white border border-gray-200 rounded-xl">
        <label class="text-xs font-bold text-gray-800 block mb-2">Palavras-chave Monitoradas (${termos.length}):</label>
        <div class="flex flex-wrap gap-1.5 mb-3">
          ${termos.map((t, idx) => `
            <span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-semibold">
              <span>${escaparHtml(t)}</span>
              <button type="button" data-geogrid-remove-termo="${idx}" class="text-emerald-500 hover:text-rose-600 font-bold ml-0.5" title="Remover termo">×</button>
            </span>
          `).join('')}
        </div>

        <form id="geogridAddTermoForm" class="flex flex-wrap gap-2 mb-3">
          <input id="novoTermoInput" type="text" class="art-input text-xs flex-1" style="min-width: 14rem" placeholder="Digite novo termo (ex: xerox e impressão, foto 3x4...)" required>
          <button type="submit" class="gmb-btn-primario text-xs py-1.5 px-3 flex items-center gap-1">
            <i class="fas fa-plus"></i> Adicionar Termo
          </button>
        </form>

        <div class="pt-2 border-t border-gray-100">
          <span class="text-[10px] font-bold text-gray-500 block mb-1 uppercase tracking-wider">Sugestões rápidas de 1 clique:</span>
          <div class="flex flex-wrap gap-1">
            <button type="button" data-geogrid-sugestao="xerox e impressão" class="text-[10px] bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">+ xerox e impressão</button>
            <button type="button" data-geogrid-sugestao="foto 3x4" class="text-[10px] bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">+ foto 3x4</button>
            <button type="button" data-geogrid-sugestao="regularizar cpf" class="text-[10px] bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">+ regularizar cpf</button>
            <button type="button" data-geogrid-sugestao="financiamento de veículos" class="text-[10px] bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">+ financiamento de veículos</button>
            <button type="button" data-geogrid-sugestao="lan house varginha" class="text-[10px] bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">+ lan house varginha</button>
            <button type="button" data-geogrid-sugestao="emissão de crlv" class="text-[10px] bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">+ emissão de crlv</button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 border border-gray-200 rounded-xl">
        <div>
          <label class="text-xs font-bold text-gray-800 block mb-1">Tamanho da Grade:</label>
          <select id="configGradeSize" class="art-input text-xs">
            <option value="3" ${size === 3 ? 'selected' : ''}>3×3 (Hiperlocal Centro — 9 pontos)</option>
            <option value="5" ${size === 5 ? 'selected' : ''}>5×5 (Padrão Varginha — 25 pontos)</option>
            <option value="7" ${size === 7 ? 'selected' : ''}>7×7 (Regional Expandida — 49 pontos)</option>
          </select>
          <small class="text-[10px] text-gray-500 block mt-1">3×3 é ideal para conferências rápidas no Centro.</small>
        </div>
        <div>
          <label class="text-xs font-bold text-gray-800 block mb-1">Espaçamento entre Pontos:</label>
          <select id="configGradeSpacing" class="art-input text-xs">
            <option value="0.5" ${spacingKm === 0.5 ? 'selected' : ''}>0,5 km (Alta densidade central)</option>
            <option value="1.0" ${spacingKm === 1.0 ? 'selected' : ''}>1,0 km (Padrão urbano da cidade)</option>
            <option value="1.5" ${spacingKm === 1.5 ? 'selected' : ''}>1,5 km (Alcance de saídas e rodovias)</option>
          </select>
          <small class="text-[10px] text-gray-500 block mt-1">Distância em linha reta de cada coordenada.</small>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1">
        <button type="button" id="btnSalvarConfigGrade" class="gmb-btn-primario text-xs py-2 px-4 flex items-center gap-1.5" ${GeoGridState.ocupado ? 'disabled' : ''}>
          <i class="fas fa-floppy-disk"></i> Salvar Termos e Grade
        </button>
        <span class="text-[10px] text-gray-400">Salvo diretamente no servidor do Nexcafe</span>
      </div>
    </div>`;
}

function geogridPainelGeotag() {
  const p = GeoGridState.fotoGpsProcessada;

  return `
    <div class="space-y-4">
      <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
            <i class="fas fa-camera text-emerald-600"></i> Injetor de Coordenadas GPS (Geotagging EXIF)
          </span>
          <span class="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">Oficial Google</span>
        </div>
        <p class="text-[11px] text-emerald-800 leading-relaxed">
          O algoritmo do Google Maps avalia se as fotos da loja física possuem coordenadas EXIF GPS da loja. Fotos carimbadas com o GPS da Rua Santa Cruz, 696 ganham prioridade de exibição na busca local.
        </p>
      </div>

      <div class="p-3 bg-white border border-gray-200 rounded-xl">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-center">
          <div class="p-2 bg-gray-50 rounded-lg border border-gray-100">
            <span class="text-[9px] uppercase font-bold text-gray-400 block">Latitude</span>
            <strong class="text-xs font-mono text-gray-800">-21.555192</strong>
          </div>
          <div class="p-2 bg-gray-50 rounded-lg border border-gray-100">
            <span class="text-[9px] uppercase font-bold text-gray-400 block">Longitude</span>
            <strong class="text-xs font-mono text-gray-800">-45.439385</strong>
          </div>
          <div class="p-2 bg-gray-50 rounded-lg border border-gray-100">
            <span class="text-[9px] uppercase font-bold text-gray-400 block">Altitude</span>
            <strong class="text-xs font-mono text-gray-800">920 metros</strong>
          </div>
          <div class="p-2 bg-gray-50 rounded-lg border border-gray-100">
            <span class="text-[9px] uppercase font-bold text-gray-400 block">Local</span>
            <strong class="text-xs text-gray-800">Centro, Varginha</strong>
          </div>
        </div>

        <div id="dropzoneFotoGps" class="border-2 border-dashed border-emerald-300 rounded-xl p-5 text-center bg-emerald-50/40 hover:bg-emerald-50 transition cursor-pointer">
          <input type="file" id="fotoGpsInput" accept="image/jpeg,image/png,image/webp" class="hidden">
          <i class="fas fa-camera-retro text-3xl text-emerald-600 mb-2"></i>
          <p class="text-xs font-bold text-gray-800">Clique aqui ou arraste uma foto da loja</p>
          <p class="text-[11px] text-gray-500 mt-1">Formatos aceitos: JPG, PNG, WEBP. A foto receberá as coordenadas GPS e identificador da Speed Financeira nos metadados.</p>
        </div>

        ${p ? `
          <div class="mt-4 p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <img src="${p.url}" alt="Prévia" class="w-14 h-14 object-cover rounded-lg border border-emerald-200">
              <div>
                <strong class="text-xs text-gray-900 block truncate max-w-xs">${escaparHtml(p.nomeOrig)}</strong>
                <p class="text-[11px] text-emerald-800 font-semibold">${p.largura}×${p.altura}px • ${p.tamanhoKb} KB</p>
                <span class="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-bold">
                  <i class="fas fa-check-circle"></i> GPS da Rua Santa Cruz, 696 gravado no arquivo
                </span>
              </div>
            </div>
            <a href="${p.url}" download="${p.nomeDownload}" class="gmb-btn-primario text-xs py-2 px-3 flex items-center gap-1.5">
              <i class="fas fa-download"></i> Baixar Foto com GPS Injetado
            </a>
          </div>
        ` : ''}
      </div>
    </div>`;
}

function geogridNumeros(run, item, anterior) {
  const total = item.cells.length;
  const antes = anterior?.terms.find(t => t.term === item.term);
  const delta = antes ? +(item.average - antes.average).toFixed(1) : null;
  const variacao = delta === null ? '' : delta === 0 ? '<small class="text-gray-500 font-semibold mt-1">Estável vs. anterior</small>'
    : `<small class="mt-1 flex items-center gap-1 ${delta < 0 ? 'geogrid-melhorou' : 'geogrid-piorou'}">
         <i class="fas ${delta < 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
         ${delta < 0 ? 'Melhorou' : 'Caiu'} ${Math.abs(delta).toLocaleString('pt-BR')} posições vs. ${geogridData(anterior.at)}
       </small>`;
  const pctTop3 = Math.round(item.top3 / total * 100);
  const lideres = item.leaders.length
    ? item.leaders.map(l => `<li><strong>${escaparHtml(run.names[l.id] || 'Concorrente sem nome')}</strong> em 1º em ${l.count} de ${total} pontos</li>`).join('')
    : '<li>A Speed lidera em todos os pontos.</li>';

  const pontosTop3 = item.cells.filter(c => c.rank && c.rank <= 3);
  let rdmKm = 0;
  if (pontosTop3.length) {
    rdmKm = +(Math.max(...pontosTop3.map(c => Math.hypot((c.row - 2) * 1.0, (c.col - 2) * 1.0)))).toFixed(1);
  }

  return `
    <div class="geogrid-numeros">
      <div>
        <span>Posição média <i class="fas fa-chart-line text-emerald-600"></i></span>
        <strong>${item.average.toLocaleString('pt-BR')}º</strong>
        ${variacao}
      </div>
      <div>
        <span>Visibilidade (Top 3) <i class="fas fa-eye text-blue-600"></i></span>
        <strong>${pctTop3}%</strong>
        <div class="geogrid-progresso-bar">
          <div class="geogrid-progresso-fill ${pctTop3 > 0 ? 'bg-emerald-500' : 'bg-gray-300'}" style="width: ${Math.max(pctTop3, 3)}%"></div>
        </div>
        <small>${item.top3} de ${total} pontos no pack • RDM: ${rdmKm.toLocaleString('pt-BR')} km</small>
      </div>
      <div>
        <span>Presença nos 20 <i class="fas fa-bullseye text-purple-600"></i></span>
        <strong>${item.found} <span class="text-xs font-normal text-gray-500">de ${total}</span></strong>
        <div class="geogrid-progresso-bar">
          <div class="geogrid-progresso-fill bg-purple-500" style="width: ${Math.round(item.found / total * 100)}%"></div>
        </div>
        <small>${Math.round(item.found / total * 100)}% de cobertura local</small>
      </div>
    </div>
    
    ${geogridSubAbas()}

    ${GeoGridState.abaSecundaria === 'mapa' ? `
      ${geogridDiagnostico(item, run)}
      ${geogridConcorrentes(run, item)}
      <div class="mt-4 pt-3 border-t border-gray-100">
        <p class="text-xs font-bold text-gray-800 flex items-center gap-1.5 mb-1"><i class="fas fa-medal text-amber-500"></i> Quem lidera onde a Speed não está em 1º</p>
        <ul class="geogrid-lideres">${lideres}</ul>
        <p class="text-[11px] text-gray-400 mt-2">Cálculo de média considera "fora dos 20" como 21º. O usuário mobile visualiza os 3 primeiros sem rolar a tela.</p>
      </div>
    ` : ''}

    ${GeoGridState.abaSecundaria === 'spam' ? geogridPainelSpam(run, item) : ''}
    ${GeoGridState.abaSecundaria === 'respostas_seo' ? geogridPainelRespostasSEO(item) : ''}
    ${GeoGridState.abaSecundaria === 'smart_ads' ? geogridPainelSmartAds(run, item) : ''}
    ${GeoGridState.abaSecundaria === 'termos_grade' ? geogridPainelTermosGrade(GeoGridState.dados) : ''}
    ${GeoGridState.abaSecundaria === 'geotag' ? geogridPainelGeotag() : ''}`;
}

// Disputa do top 3: Speed e concorrentes lado a lado
function geogridConcorrentes(run, item) {
  const total = item.cells.length;
  if (!item.competitors) return '<p class="text-[11px] text-gray-500 mt-3">Meça de novo para ver a visibilidade de cada concorrente.</p>';
  const speed = { id: 'speed', nome: 'Speed Financeira', visibilidade: Math.round(item.top3 / total * 100), top3: item.top3, media: item.average, speed: true };
  const linhas = [speed, ...item.competitors.map(c => ({ id: c.id, nome: run.names[c.id] || 'Concorrente sem nome', visibilidade: c.visibility, top3: c.top3, media: c.average }))]
    .sort((a, b) => b.visibilidade - a.visibilidade || a.media - b.media);

  let alvoBox = '';
  let alvoId = null;
  const concorrentesApenas = [...item.competitors].sort((a, b) => b.visibility - a.visibility || a.average - b.average);
  if (speed.visibilidade < 80 && concorrentesApenas.length >= 3) {
    const alvo = concorrentesApenas[2] || concorrentesApenas[0];
    alvoId = alvo.id;
    const alvoNome = run.names[alvo.id] || 'Concorrente';
    const gap = (item.average - alvo.average).toFixed(1);
    const gapTexto = gap > 0 ? `Faltam ${gap.toLocaleString('pt-BR')} posições` : 'Empate técnico';
    alvoBox = `
      <div class="mb-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <i class="fas fa-bullseye text-amber-600"></i> Alvo Direto para o Top 3: <strong>${escaparHtml(alvoNome)}</strong> (${alvo.average.toLocaleString('pt-BR')}º)
          </span>
          <span class="text-[11px] font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full">
            ${gapTexto}
          </span>
        </div>
        <p class="text-[11px] text-amber-700 mt-1">
          Ultrapassar a <strong>${escaparHtml(alvoNome)}</strong> coloca a Speed no pódio dos 3 primeiros visíveis no celular em Varginha.
        </p>
      </div>`;
  }

  const ctaAvaliacao = `
    <div class="mt-4 p-3 rounded-lg border border-emerald-300 bg-emerald-50">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
          <i class="fab fa-whatsapp text-emerald-600 text-sm"></i> Disparo Rápido de Avaliação no Balcão
        </span>
        <span class="text-[10px] text-emerald-700 font-semibold bg-emerald-100 px-1.5 py-0.5 rounded">Link Oficial</span>
      </div>
      <p class="text-[11px] text-emerald-800 mb-2">Envie para o cliente atendido no WhatsApp para fortalecer as avaliações no Google:</p>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" id="btnCopiarMsgAvaliacao" class="gmb-btn-primario text-xs flex items-center gap-1.5 py-1.5 px-3">
          <i class="fas fa-copy"></i> Copiar Mensagem de WhatsApp
        </button>
        <a href="https://search.google.com/local/writereview?placeid=ChIJJfN_t4iSypQRbtupJEJHof8" target="_blank" rel="noopener noreferrer" class="gmb-btn-link text-xs flex items-center gap-1">
          <i class="fas fa-arrow-up-right-from-square"></i> Testar link da avaliação
        </a>
      </div>
      <div id="msgAvaliacaoFeedback" class="text-[11px] text-emerald-700 font-bold mt-2 hidden">
        <i class="fas fa-check-circle"></i> Mensagem copiada com sucesso! Basta colar na conversa com o cliente no WhatsApp.
      </div>
    </div>`;

  return `
    <div class="mt-4">
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-xs font-bold text-gray-800 flex items-center gap-1.5"><i class="fas fa-ranking-star text-amber-500"></i> Disputa do Top 3 neste termo</p>
        <span class="text-[10px] text-gray-400 font-medium">Pack dos 3 primeiros no Maps</span>
      </div>
      ${alvoBox}
      <table class="geogrid-concorrentes-tabela">
        <thead>
          <tr>
            <th>Empresa</th>
            <th class="text-center">Visibilidade</th>
            <th class="text-center">Top 3</th>
            <th class="text-center">Posição média</th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map(l => `
            <tr class="${l.speed ? 'geogrid-linha-speed' : ''}">
              <td>
                <div class="flex items-center gap-1 flex-wrap">
                  <span>${escaparHtml(l.nome)}</span>
                  ${l.speed ? '<span class="geogrid-badge-speed">Sua Ficha</span>' : ''}
                  ${!l.speed && l.id === alvoId ? '<span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded border border-amber-300 flex items-center gap-0.5"><i class="fas fa-crosshairs text-[9px]"></i> Alvo Direto</span>' : ''}
                </div>
              </td>
              <td class="text-center">
                <span class="geogrid-mini-bar"><span class="geogrid-mini-bar-fill" style="width:${l.visibilidade}%;${l.visibilidade > 0 ? '' : 'background:#cbd5e1'}"></span></span>
                <strong>${l.visibilidade}%</strong>
              </td>
              <td class="text-center font-semibold text-gray-700">${l.top3} <span class="text-gray-400 text-[10px]">/ ${total}</span></td>
              <td class="text-center font-bold text-gray-800">${l.media.toLocaleString('pt-BR')}º</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${ctaAvaliacao}
    </div>`;
}

function geogridDiagnostico(item, run) {
  const total = item.cells.length;
  const pctTop3 = Math.round(item.top3 / total * 100);
  const liderPrincipal = item.leaders?.[0] ? (run.names[item.leaders[0].id] || 'Líder local') : null;

  if (pctTop3 >= 80) {
    return `
      <div class="geogrid-diagnostico" style="background:#ecfdf5;border-color:#a7f3d0">
        <div class="geogrid-diagnostico-titulo"><i class="fas fa-crown text-amber-500"></i> Liderança Consolidada no Maps</div>
        <p class="geogrid-diagnostico-texto">A Speed domina o Top 3 em ${item.top3} dos ${total} pontos da cidade neste termo. Continue respondendo a todas as avaliações no mesmo dia e mantendo posts ativos para proteger essa posição.</p>
      </div>`;
  }

  if (item.found >= 20 && pctTop3 === 0) {
    return `
      <div class="geogrid-diagnostico">
        <div class="geogrid-diagnostico-titulo"><i class="fas fa-bullseye text-emerald-600"></i> Diagnóstico Tático: Próxima da 1ª Página / Top 3</div>
        <p class="geogrid-diagnostico-texto">A Speed aparece entre os 20 primeiros em <strong>${item.found} de ${total} pontos</strong> (posição média ${item.average.toLocaleString('pt-BR')}º), mas ainda não está no Top 3 visível aos clientes no celular. ${liderPrincipal ? `O principal concorrente no Top 3 é <strong>${escaparHtml(liderPrincipal)}</strong>.` : ''}</p>
        <ul class="geogrid-diagnostico-passos">
          <li><i class="fas fa-check-circle"></i> <span><strong>Avaliações direcionadas:</strong> No balcão de atendimento, solicite aos clientes satisfeitos de consignado que incluam o termo <em>"${escaparHtml(item.term)}"</em> no texto da avaliação do Google.</span></li>
          <li><i class="fas fa-check-circle"></i> <span><strong>Posts na ficha:</strong> Mantenha a esteira de publicações ativas no Perfil da Empresa destacando atendimento presencial na Rua Santa Cruz, 696.</span></li>
          <li><i class="fas fa-check-circle"></i> <span><strong>Relevância local (NAP):</strong> Assegure que o nome e endereço nos diretórios locais estejam 100% idênticos ao da ficha do Google Maps.</span></li>
        </ul>
      </div>`;
  }

  return `
    <div class="geogrid-diagnostico" style="background:#fffbeb;border-color:#fde68a">
      <div class="geogrid-diagnostico-titulo" style="color:#92400e"><i class="fas fa-arrow-trend-up text-amber-600"></i> Oportunidade de Ganho Geográfico</div>
      <p class="geogrid-diagnostico-texto" style="color:#78350f">Neste termo a Speed está presente em ${item.found} de ${total} pontos com posição média de ${item.average.toLocaleString('pt-BR')}º. Intensificar postagens locais e menções deste serviço no site ajuda a expandir o raio de cobertura do centro para os bairros.</p>
    </div>`;
}

function renderGeogrid() {
  const conteudo = document.getElementById('geogridConteudo');
  if (!conteudo) return;
  const dados = GeoGridState.dados;
  if (!dados) return;
  const mensagem = GeoGridState.mensagem ? `<p class="geogrid-mensagem"><i class="fas fa-info-circle mr-1.5"></i>${escaparHtml(GeoGridState.mensagem)}</p>` : '';
  const erro = dados.lastError ? `<p class="geogrid-erro"><i class="fas fa-triangle-exclamation mr-1.5"></i>Última tentativa (${geogridData(dados.lastError.at)}) falhou: ${escaparHtml(dados.lastError.message)}</p>` : '';

  if (!dados.configured) {
    geogridStatus('A configurar', 'bg-yellow-100 text-yellow-800');
    conteudo.innerHTML = geogridInstrucoes() + geogridFormularioChave(dados) + mensagem + erro;
    return;
  }

  const runs = dados.runs || [];
  const run = runs.find(r => r.at === GeoGridState.medicao) || runs.at(-1);
  if (GeoGridState.ocupado) geogridStatus('Medindo...', 'bg-yellow-100 text-yellow-800');
  else if (run) geogridStatus(`Medido em ${geogridData(run.at)}`, 'bg-green-100 text-green-800');
  else geogridStatus('Sem medição', 'bg-yellow-100 text-yellow-800');

  const topo = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
      <div class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs shrink-0"><i class="fas fa-store"></i></span>
        <div>
          <p class="text-xs font-bold text-gray-900">${escaparHtml(dados.placeName)}</p>
          <p class="text-[11px] text-gray-500 flex items-center gap-1"><i class="fas fa-location-dot text-emerald-600 text-[10px]"></i> ${escaparHtml(dados.placeAddress)}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-geogrid="medir" class="gmb-btn-primario text-xs flex items-center gap-1.5" ${GeoGridState.ocupado ? 'disabled' : ''}>
          <i class="fas ${GeoGridState.ocupado ? 'fa-circle-notch fa-spin' : 'fa-arrows-rotate'}"></i>
          <span>${GeoGridState.ocupado ? 'Medindo pontos...' : 'Medir agora'}</span>
        </button>
        <button type="button" data-geogrid="trocar" class="gmb-btn-link text-xs flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <i class="fas fa-key text-[10px] text-gray-400"></i> ${dados.configured ? 'Configurar chave' : 'Inserir chave'}
        </button>
        ${dados.configured ? '<button type="button" data-geogrid="remover" class="gmb-btn-link gmb-btn-perigo text-xs">Remover chave</button>' : ''}
      </div>
    </div>`;

  const chave = GeoGridState.editandoChave ? geogridFormularioChave(dados) : '';

  if (!run) {
    conteudo.innerHTML = topo + chave + mensagem + erro + '<p class="results-empty">Nenhuma medição ainda. Clique em Medir agora: leva cerca de meio minuto. Depois disso o sistema mede sozinho a cada 30 dias.</p>';
    return;
  }

  const termo = Math.min(GeoGridState.termo, run.terms.length - 1);
  const item = run.terms[termo];
  const indice = runs.indexOf(run);
  const anterior = indice > 0 ? runs[indice - 1] : null;

  const abas = run.terms.map((t, i) => {
    const ativa = i === termo;
    const badgeCls = t.average <= 3 ? 'bg-emerald-100 text-emerald-800' : (t.average <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700');
    return `<button type="button" data-geogrid-termo="${i}" class="geogrid-aba ${ativa ? 'geogrid-aba-ativa' : ''}">
      <span>${escaparHtml(t.term)}</span>
      <span class="geogrid-aba-badge ${badgeCls}">${t.average.toLocaleString('pt-BR')}º</span>
    </button>`;
  }).join('');

  const historico = runs.length > 1 ? `
    <label class="text-[11px] font-bold text-gray-600 flex items-center gap-1.5">
      <span>Medição:</span> 
      <select id="geogridMedicao" class="art-input" style="width:auto;display:inline-block;padding:.25rem .5rem;font-size:.75rem">
        ${[...runs].reverse().map(r => `<option value="${escaparHtml(r.at)}" ${r === run ? 'selected' : ''}>${new Date(r.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}${r.trigger === 'automatica' ? ' (automática)' : ''}</option>`).join('')}
      </select>
    </label>` : '';

  conteudo.innerHTML = topo + chave + mensagem + erro + `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div class="flex flex-wrap gap-1.5">${abas}</div>
      ${historico}
    </div>
    <div class="geogrid-corpo">
      <div class="geogrid-investigacao">
        ${geogridMapa(run, item, anterior)}
        ${geogridQuartoLugar(run, item)}
      </div>
      <div>
        ${geogridNumeros(run, item, anterior)}
      </div>
    </div>`;
}

async function carregarGeogrid() {
  const conteudo = document.getElementById('geogridConteudo');
  if (!conteudo) return;
  try {
    GeoGridState.dados = (await geogridApi('/api/marketing/geogrid')).geogrid;
    renderGeogrid();
  } catch {
    geogridStatus('Indisponível', 'bg-gray-100 text-gray-700');
    conteudo.innerHTML = '<p class="results-empty">O GeoGrid funciona com o painel aberto pelo Nexcafe (Speed Marketing), logado como administrador.</p>';
  }
}

async function geogridAcao(executar, sucesso) {
  GeoGridState.ocupado = true;
  GeoGridState.mensagem = '';
  renderGeogrid();
  try {
    GeoGridState.dados = (await executar()).geogrid;
    GeoGridState.mensagem = '';
    if (sucesso) mostrarToast(sucesso);
    return true;
  } catch (erro) {
    const candidatos = erro.dados?.candidates?.length ? ` Encontradas: ${erro.dados.candidates.map(c => c.name).join(', ')}.` : '';
    GeoGridState.mensagem = `${erro.message}.${candidatos}`;
    try { GeoGridState.dados = (await geogridApi('/api/marketing/geogrid')).geogrid; } catch { }
    return false;
  } finally {
    GeoGridState.ocupado = false;
    renderGeogrid();
  }
}

function setupGeogrid() {
  const painel = document.getElementById('geogridPainel');
  if (!painel || painel.dataset.pronto) return;
  painel.dataset.pronto = '1';

  painel.addEventListener('submit', async ev => {
    if (ev.target.id === 'geogridChaveForm') {
      ev.preventDefault();
      const key = document.getElementById('geogridChave').value.trim();
      if (!key) return;
      const ok = await geogridAcao(() => geogridApi('/api/marketing/geogrid/config', { key }), 'Chave salva e ficha encontrada.');
      if (ok) { GeoGridState.editandoChave = false; renderGeogrid(); }
      return;
    }

    if (ev.target.id === 'geogridAddTermoForm') {
      ev.preventDefault();
      const input = document.getElementById('novoTermoInput');
      const termo = input.value.trim().toLowerCase();
      if (!termo) return;
      const termos = GeoGridState.termosCustomizados || [...(GeoGridState.dados?.terms || [])];
      if (!termos.includes(termo)) {
        termos.push(termo);
        GeoGridState.termosCustomizados = termos;
        renderGeogrid();
        input.value = '';
        if (typeof mostrarToast === 'function') mostrarToast(`Termo "${termo}" adicionado. Clique em Salvar.`);
      }
      return;
    }
  });

  painel.addEventListener('click', async ev => {
    // Clique na célula do mapa
    const celula = ev.target.closest('[data-geogrid-cell]');
    if (celula) {
      const row = Number(celula.dataset.row);
      const col = Number(celula.dataset.col);
      if (GeoGridState.pontoSelecionado && GeoGridState.pontoSelecionado.row === row && GeoGridState.pontoSelecionado.col === col) {
        GeoGridState.pontoSelecionado = null;
      } else {
        GeoGridState.pontoSelecionado = { row, col };
      }
      renderGeogrid();
      return;
    }

    // Clique na tabela de 4º lugar para selecionar ponto
    const trSelect = ev.target.closest('[data-geogrid-select-row]');
    if (trSelect) {
      GeoGridState.pontoSelecionado = { row: Number(trSelect.dataset.geogridSelectRow), col: Number(trSelect.dataset.geogridSelectCol) };
      renderGeogrid();
      return;
    }

    // Fechar detalhe do ponto
    if (ev.target.closest('[data-geogrid-fechar-ponto]')) {
      GeoGridState.pontoSelecionado = null;
      renderGeogrid();
      return;
    }

    // Alternar modo de visualização (Posições / Bairros / Evolução)
    const btnView = ev.target.closest('[data-geogrid-view]');
    if (btnView) {
      GeoGridState.modoVisao = btnView.dataset.geogridView;
      renderGeogrid();
      return;
    }

    // Alternar sub-abas
    const btnSubAba = ev.target.closest('[data-geogrid-subaba]');
    if (btnSubAba) {
      GeoGridState.abaSecundaria = btnSubAba.dataset.geogridSubaba;
      renderGeogrid();
      return;
    }

    // Imprimir / Relatório PDF
    if (ev.target.closest('[data-geogrid-print]')) {
      window.print();
      return;
    }

    // Remover termo monitorado
    const btnRemTermo = ev.target.closest('[data-geogrid-remove-termo]');
    if (btnRemTermo) {
      const idx = Number(btnRemTermo.dataset.geogridRemoveTermo);
      const termos = GeoGridState.termosCustomizados || [...(GeoGridState.dados?.terms || [])];
      termos.splice(idx, 1);
      GeoGridState.termosCustomizados = termos;
      renderGeogrid();
      return;
    }

    // Sugestão de termo
    const btnSugestao = ev.target.closest('[data-geogrid-sugestao]');
    if (btnSugestao) {
      const termo = btnSugestao.dataset.geogridSugestao;
      const termos = GeoGridState.termosCustomizados || [...(GeoGridState.dados?.terms || [])];
      if (!termos.includes(termo)) {
        termos.push(termo);
        GeoGridState.termosCustomizados = termos;
        renderGeogrid();
        if (typeof mostrarToast === 'function') mostrarToast(`Termo "${termo}" adicionado.`);
      }
      return;
    }

    // Salvar configuração de termos e grade
    if (ev.target.closest('#btnSalvarConfigGrade')) {
      const termos = GeoGridState.termosCustomizados || GeoGridState.dados?.terms || [];
      const sizeEl = document.getElementById('configGradeSize');
      const spacingEl = document.getElementById('configGradeSpacing');
      const size = sizeEl ? Number(sizeEl.value) : 5;
      const spacingKm = spacingEl ? Number(spacingEl.value) : 1.0;
      await geogridAcao(() => geogridApi('/api/marketing/geogrid/config', { terms, size, spacingKm }), 'Configuração de termos e grade salva.');
      return;
    }

    // Dropzone de foto GPS
    if (ev.target.closest('#dropzoneFotoGps')) {
      const fileInput = document.getElementById('fotoGpsInput');
      if (fileInput) fileInput.click();
      return;
    }

    // Copiar resposta SEO
    const btnCopyResp = ev.target.closest('[data-copy-resposta]');
    if (btnCopyResp) {
      const texto = btnCopyResp.dataset.copyResposta;
      try {
        await navigator.clipboard.writeText(texto);
        if (typeof mostrarToast === 'function') mostrarToast('Resposta copiada para colar no Google!');
      } catch {
        prompt('Copie a resposta abaixo:', texto);
      }
      return;
    }

    // Copiar bairros Smart Ads
    const btnCopyAds = ev.target.closest('[data-copy-smart-ads]');
    if (btnCopyAds) {
      const texto = btnCopyAds.dataset.copySmartAds;
      try {
        await navigator.clipboard.writeText(texto);
        if (typeof mostrarToast === 'function') mostrarToast('Bairros prioritários copiados!');
      } catch {
        prompt('Copie os bairros abaixo:', texto);
      }
      return;
    }

    // Copiar contestação de Redressal Spam
    const btnCopyRedressal = ev.target.closest('[data-copy-redressal]');
    if (btnCopyRedressal) {
      const empresa = btnCopyRedressal.dataset.copyRedressal;
      const textoDenuncia = `Denúncia de violação de diretrizes: A empresa "${empresa}" está utilizando palavras-chave de serviços e localização ("keyword stuffing") no título oficial da ficha do Google Maps, o que é expressamente proibido pelas diretrizes do Perfil da Empresa, violando a concorrência leal em Varginha/MG.`;
      try {
        await navigator.clipboard.writeText(textoDenuncia);
        if (typeof mostrarToast === 'function') mostrarToast('Texto da contestação copiado!');
      } catch {
        prompt('Copie o texto para a denúncia:', textoDenuncia);
      }
      return;
    }

    // Copiar mensagem rápida de WhatsApp para avaliação
    const btnAvaliacao = ev.target.closest('#btnCopiarMsgAvaliacao');
    if (btnAvaliacao) {
      const runs = GeoGridState.dados?.runs || [];
      const run = runs.find(r => r.at === GeoGridState.medicao) || runs.at(-1);
      const itemAtual = run?.terms?.[Math.min(GeoGridState.termo, (run?.terms?.length || 1) - 1)];
      const termoNome = itemAtual ? itemAtual.term : 'empréstimo consignado';
      const msg = `Olá! Aqui é da Speed Financeira, em Varginha (Rua Santa Cruz, 696, Centro). Obrigado por ser atendido com a gente no seu ${termoNome}!\n\nSe puder, conte no Google como foi o seu atendimento. Leva menos de 1 minuto e ajuda outras pessoas da cidade a escolher com segurança:\nhttps://search.google.com/local/writereview?placeid=ChIJJfN_t4iSypQRbtupJEJHof8`;
      try {
        await navigator.clipboard.writeText(msg);
        const fb = document.getElementById('msgAvaliacaoFeedback');
        if (fb) fb.classList.remove('hidden');
        if (typeof mostrarToast === 'function') mostrarToast('Mensagem copiada! Basta colar no WhatsApp.');
      } catch {
        prompt('Copie a mensagem abaixo para enviar no WhatsApp:', msg);
      }
      return;
    }

    // Trocar termo ativo
    const aba = ev.target.closest('[data-geogrid-termo]');
    if (aba) {
      GeoGridState.termo = Number(aba.dataset.geogridTermo);
      GeoGridState.pontoSelecionado = null;
      renderGeogrid();
      return;
    }

    // Botões de ação do cabeçalho
    const botao = ev.target.closest('[data-geogrid]');
    if (!botao || GeoGridState.ocupado) return;
    const acao = botao.dataset.geogrid;
    if (acao === 'medir') {
      GeoGridState.medicao = null;
      await geogridAcao(() => geogridApi('/api/marketing/geogrid/run', {}), 'Medição concluída.');
    } else if (acao === 'trocar') { GeoGridState.editandoChave = true; renderGeogrid(); }
    else if (acao === 'cancelar') { GeoGridState.editandoChave = false; renderGeogrid(); }
    else if (acao === 'remover' && confirm('Remover a chave da API? As medições já feitas continuam guardadas.')) {
      await geogridAcao(() => geogridApi('/api/marketing/geogrid/config', { remove: true }), 'Chave removida.');
    }
  });

  // Mudança no seletor de medições históricas e inputs
  painel.addEventListener('change', async ev => {
    if (ev.target.id === 'geogridMedicao') {
      GeoGridState.medicao = ev.target.value;
      GeoGridState.pontoSelecionado = null;
      renderGeogrid();
    } else if (ev.target.id === 'seoClienteNome') {
      GeoGridState.clienteNomeSeo = ev.target.value.trim() || 'Cliente Amigo';
      renderGeogrid();
    } else if (ev.target.id === 'seoClienteServico') {
      GeoGridState.clienteServicoSeo = ev.target.value;
      renderGeogrid();
    } else if (ev.target.id === 'configGradeSize') {
      GeoGridState.tamanhoCustomizado = Number(ev.target.value);
    } else if (ev.target.id === 'configGradeSpacing') {
      GeoGridState.espacamentoCustomizado = Number(ev.target.value);
    } else if (ev.target.id === 'fotoGpsInput' && ev.target.files && ev.target.files[0]) {
      const file = ev.target.files[0];
      try {
        await processarFotoComGps(file);
        if (typeof mostrarToast === 'function') mostrarToast('Coordenadas GPS de Varginha gravadas na foto!');
      } catch (err) {
        alert('Erro ao processar imagem: ' + err.message);
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', () => { setupGeogrid(); carregarGeogrid(); });
