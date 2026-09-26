// Resultados agregados lançados manualmente. Não armazena dados pessoais.
(function () {
  'use strict';
  const KEY = 'speed_resultados_reais_v1';
  const SOURCES = {
    google_ads: 'Google Ads', meta_ads: 'Meta Ads', google_maps: 'Perfil da Empresa no Google',
    social_organico: 'Redes sociais orgânicas', site_organico: 'Site orgânico',
    indicacao: 'Indicação', outros: 'Outros'
  };
  const FIELDS = {
    spend: 'resultsSpendInput', clicks: 'resultsClicksInput', qualified: 'resultsQualifiedInput',
    proposals: 'resultsProposalsInput', contracts: 'resultsContractsInput',
    commission: 'resultsCommissionInput'
  };
  const COUNT_FIELDS = new Set(['clicks', 'qualified', 'proposals', 'contracts']);
  const byId = id => document.getElementById(id);
  const currency = value => value === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const number = value => value === null ? '—' : new Intl.NumberFormat('pt-BR').format(value);
  const validAmount = (value, integer) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000000 && (!integer || Number.isInteger(value)));
  function validRecord(row) {
    return row && typeof row === 'object' && !Array.isArray(row) &&
      typeof row.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(row.id) &&
      typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
      Object.hasOwn(SOURCES, row.source) &&
      typeof row.campaign === 'string' && row.campaign.length <= 80 &&
      Object.keys(FIELDS).every(field => validAmount(row[field], COUNT_FIELDS.has(field)));
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data.filter(validRecord).slice(0, 1000) : [];
    } catch { return []; }
  }
  let records = load();
  function completeTotal(rows, field) {
    return rows.length && rows.every(row => row[field] !== null)
      ? rows.reduce((total, row) => total + row[field], 0) : null;
  }
  function balance(rows) {
    const spend = completeTotal(rows, 'spend');
    const commission = completeTotal(rows, 'commission');
    return spend === null || commission === null ? null : commission - spend;
  }
  function renderPeriods() {
    const select = byId('resultsPeriod');
    const selected = select.value;
    const months = [...new Set(records.map(row => row.date.slice(0, 7)))].sort().reverse();
    select.replaceChildren(new Option('Todo o período', 'all'));
    months.forEach(month => {
      const [year, value] = month.split('-');
      select.add(new Option(new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(Number(year), Number(value) - 1, 1)) + ' ' + year, month));
    });
    select.value = months.includes(selected) ? selected : 'all';
  }
  function cell(row, content) {
    const td = document.createElement('td');
    td.textContent = content;
    row.appendChild(td);
  }
  function renderTable(rows) {
    const body = byId('resultsBySource');
    body.replaceChildren();
    Object.keys(SOURCES).forEach(source => {
      const group = rows.filter(item => item.source === source);
      if (!group.length) return;
      const tr = document.createElement('tr');
      cell(tr, SOURCES[source]);
      ['clicks', 'qualified', 'proposals', 'contracts'].forEach(field => cell(tr, number(completeTotal(group, field))));
      cell(tr, currency(completeTotal(group, 'spend')));
      cell(tr, currency(completeTotal(group, 'commission')));
      cell(tr, currency(balance(group)));
      body.appendChild(tr);
    });
  }
  function resetForm() {
    byId('resultsForm').reset();
    byId('resultsEditId').value = '';
    byId('resultsCancelEdit').hidden = true;
    byId('resultsEntry').querySelector('summary').textContent = 'Adicionar resultado';
    const today = new Date();
    byId('resultsDate').value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  }
  function editRecord(id) {
    const row = records.find(item => item.id === id);
    if (!row) return;
    byId('resultsEditId').value = row.id;
    byId('resultsDate').value = row.date;
    byId('resultsSource').value = row.source;
    byId('resultsCampaign').value = row.campaign;
    Object.entries(FIELDS).forEach(([field, input]) => { byId(input).value = row[field] === null ? '' : row[field]; });
    byId('resultsCancelEdit').hidden = false;
    byId('resultsEntry').querySelector('summary').textContent = 'Editar resultado';
    byId('resultsEntry').open = true;
    byId('resultsEntry').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(records));
  }
  function renderRecords(rows) {
    const box = byId('resultsRecords');
    box.replaceChildren();
    if (!rows.length) return;
    const heading = document.createElement('h3');
    heading.textContent = 'Lançamentos do período';
    box.appendChild(heading);
    rows.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach(row => {
      const item = document.createElement('div');
      item.className = 'results-record';
      const label = document.createElement('span');
      label.textContent = row.date.split('-').reverse().join('/') + ' · ' + SOURCES[row.source] + (row.campaign ? ' · ' + row.campaign : '');
      item.appendChild(label);
      const actions = document.createElement('span');
      const edit = document.createElement('button');
      edit.type = 'button'; edit.textContent = 'Editar'; edit.addEventListener('click', () => editRecord(row.id));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Excluir'; remove.addEventListener('click', () => {
        if (!confirm('Excluir este lançamento?')) return;
        const previous = records;
        records = records.filter(item => item.id !== row.id);
        try { save(); render(); resetForm(); } catch { records = previous; byId('resultsFormStatus').textContent = 'Não foi possível salvar a exclusão.'; }
      });
      actions.append(edit, remove);
      item.appendChild(actions);
      box.appendChild(item);
    });
  }
  function render() {
    renderPeriods();
    const period = byId('resultsPeriod').value;
    const rows = records.filter(row => period === 'all' || row.date.startsWith(period));
    byId('resultsEmpty').hidden = rows.length > 0;
    byId('resultsEmpty').textContent = records.length && !rows.length ? 'Sem lançamentos neste período.' : 'Nenhum resultado registrado. Adicione o primeiro lançamento para acompanhar o que gera contratos.';
    byId('resultsContent').hidden = rows.length === 0;
    if (rows.length) {
      byId('resultsCommission').textContent = currency(completeTotal(rows, 'commission'));
      byId('resultsContracts').textContent = number(completeTotal(rows, 'contracts'));
      byId('resultsSpend').textContent = currency(completeTotal(rows, 'spend'));
      byId('resultsBalance').textContent = currency(balance(rows));
      const spend = completeTotal(rows, 'spend'), contracts = completeTotal(rows, 'contracts');
      byId('resultsCpa').textContent = spend !== null && contracts > 0 ? currency(spend / contracts) : '—';
      renderTable(rows);
    }
    renderRecords(rows);
  }
  function readInput(field, input) {
    const raw = byId(input).value.trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!validAmount(value, COUNT_FIELDS.has(field))) throw new Error('Confira os valores numéricos informados.');
    return value;
  }
  function submit(event) {
    event.preventDefault();
    const status = byId('resultsFormStatus');
    status.textContent = '';
    const date = byId('resultsDate').value;
    const source = byId('resultsSource').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Object.hasOwn(SOURCES, source)) { status.textContent = 'Informe data e origem válidas.'; return; }
    try {
      const editedId = byId('resultsEditId').value;
      if (!editedId && records.length >= 1000) throw new Error('Limite de 1.000 lançamentos atingido. Exporte o backup antes de revisar os registros.');
      const row = { id: editedId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)), date, source, campaign: byId('resultsCampaign').value.trim() };
      Object.entries(FIELDS).forEach(([field, input]) => { row[field] = readInput(field, input); });
      if (!validRecord(row)) throw new Error('Confira os dados do lançamento.');
      const previous = records;
      records = editedId ? records.map(item => item.id === editedId ? row : item) : [...records, row];
      try { save(); } catch { records = previous; throw new Error('Não foi possível salvar neste navegador.'); }
      render(); resetForm(); byId('resultsEntry').open = false;
      status.textContent = 'Resultado salvo neste navegador.';
    } catch (error) { status.textContent = error.message; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    if (!byId('resultsForm')) return;
    byId('resultsPeriod').addEventListener('change', render);
    byId('resultsForm').addEventListener('submit', submit);
    byId('resultsCancelEdit').addEventListener('click', resetForm);
    resetForm(); render();
  });
})();
