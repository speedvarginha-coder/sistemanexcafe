// Saude da ficha no Google: nota de 0 a 100, alteracoes no perfil, potencial de crescimento e NAP em diretorios.
// Logica pura (sem rede). Adaptado do Local Ninja v1.1.0 (packages/core/src/healthcheck, profile/watch,
// geogrid/growth-potential, citations/nap), licenca MIT:
//   Copyright (c) 2026 Synectus Private Limited
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
//   associated documentation files (the "Software"), to deal in the Software without restriction [...]
//   The above copyright notice and this permission notice shall be included in all copies or
//   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
// Mudancas: uma ficha so; sem comparacao de categoria com concorrentes (o Local Ninja usa o DataForSEO);
// ficha duplicada procurada na Places API; checagem do nome com palavras-chave; NAP com endereco e CEP do Brasil.

// Limiares do Local Ninja (escolha deles, nao numeros do Google), mantidos.
const CFG = {
  minPhotos: 10, recentPhotoDays: 30, recentPostDays: 7, reviewWindowDays: 30, minAverageRating: 4.0,
  minDescriptionChars: 250, descriptionMaxChars: 750, maxUppercaseShare: 0.5, maxWordRepeats: 4,
  keywordTopN: 5, minKeywordCoverage: 0.4, duplicateNameSimilarity: 0.7, duplicateAddressSimilarity: 0.8, phoneMatchDigits: 9
};
// Participacao nos cliques por posicao do pacote local (BrightLocal 2018, sem anuncios), como no Local Ninja.
const PACK_SHARES = [17.3, 12.0, 2.9];
const OUTSIDE_PACK_SHARE = 0;

const DAY_MS = 86_400_000;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ageDays = (iso, now) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? null : (now.getTime() - t) / DAY_MS; };
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|info|biz|io|co|br)\b/i;
// Servico ou cidade no nome: o Google proibe quando nao estao no nome real da loja.
const NAME_KEYWORDS = /empr[eé]stimo|consignado|financiamento|cr[eé]dito|varginha|inss|fgts|portabilidade/i;

const words = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "para", "perto", "mim", "a", "o", "com"]);
const stem = w => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

function keywordsCovered(text, keywords) {
  const have = new Set(words(text).map(stem));
  const covered = [], missing = [];
  for (const k of keywords) {
    const need = words(k).filter(w => !STOP.has(w)).map(stem);
    (need.length > 0 && need.every(w => have.has(w)) ? covered : missing).push(k);
  }
  return { covered, missing };
}

function descriptionProblems(text) {
  const problems = [];
  const len = [...text].length;
  if (len < CFG.minDescriptionChars) problems.push(`só ${len} caracteres, o recomendado é pelo menos ${CFG.minDescriptionChars}`);
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "");
  if (letters.length >= 20 && upper.length / letters.length > CFG.maxUppercaseShare) problems.push("quase tudo em letras maiúsculas");
  const counts = new Map();
  for (const w of words(text)) if (w.length >= 4 && !STOP.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  const stuffed = [...counts].filter(([, n]) => n > CFG.maxWordRepeats).map(([w]) => w);
  if (stuffed.length) problems.push(`repete "${stuffed[0]}" mais de ${CFG.maxWordRepeats} vezes (parece excesso de palavras-chave)`);
  return problems;
}

// Coeficiente de Dice sobre bigramas de caracteres do texto normalizado, de 0 a 1.
function similarity(a, b) {
  const x = words(a).join(" "), y = words(b).join(" ");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
  const gx = grams(x), gy = grams(y);
  let hit = 0;
  for (const [g, n] of gx) hit += Math.min(n, gy.get(g) || 0);
  return (2 * hit) / (Math.max(x.length - 1, 0) + Math.max(y.length - 1, 0));
}

const phoneKey = p => { const d = String(p || "").replace(/\D/g, ""); return d.length >= CFG.phoneMatchDigits ? d.slice(-CFG.phoneMatchDigits) : null; };

// Duplicada: nome quase igual com o mesmo endereco ou telefone, ou endereco e telefone iguais com qualquer nome.
function looksDuplicate(a, b) {
  const name = similarity(a.name, b.name) >= CFG.duplicateNameSimilarity;
  const addr = !!a.address && !!b.address && similarity(a.address, b.address) >= CFG.duplicateAddressSimilarity;
  const pa = phoneKey(a.phone);
  const phone = pa !== null && pa === phoneKey(b.phone);
  return (name && (addr || phone)) || (addr && phone);
}

const brandName = title => String(title || "").split(/\s+[–—-]\s+/)[0].trim();
const addressLine = a => a ? [...(a.addressLines || []), a.sublocality, a.locality, a.administrativeArea, a.postalCode].filter(Boolean).join(", ") : "";
const dateOnly = d => (d && d.year && d.month && d.day ? Date.UTC(d.year, d.month - 1, d.day) : null);

// input: { location, media, posts, reviews, voice, links, attributes } no formato { ok, value } ou { ok: false, message };
// keywords: termos de busca mais usados (Desempenho); others: fichas parecidas achadas no Maps.
function evaluateHealth(input, now = new Date()) {
  const checks = [];
  const add = (id, title, importance, status, detail, fix) => checks.push({ id, title, importance, status, detail, fix: status === "pass" ? null : fix || null });
  const unreadable = (what, src) => src.message ? `Não deu para ler ${what}: ${src.message}` : `Não deu para ler ${what} no Google`;
  const EDIT = "Perfil da Empresa > Editar perfil";

  const L = (id, title, importance, fix, judge) => {
    if (!input.location.ok) return add(id, title, importance, "unknown", unreadable("o perfil", input.location), fix);
    const r = judge(input.location.value);
    add(id, title, importance, r.pass ? "pass" : "fail", r.detail, fix);
  };

  L("name_keywords", "Nome sem serviço ou cidade", "important", `${EDIT} > Nome da empresa (usar o nome da fachada)`, l => {
    const extra = String(l.title || "").slice(brandName(l.title).length);
    const found = String(l.title || "").match(NAME_KEYWORDS);
    return found && extra
      ? { pass: false, detail: `O nome "${l.title}" traz "${found[0]}". O Google proíbe serviço ou cidade no nome quando não estão na fachada; uma denúncia pode suspender a ficha` }
      : { pass: true, detail: `Nome: ${l.title}` };
  });
  L("description", "Descrição da empresa", "necessary", `${EDIT} > Descrição`, l => {
    const text = (l.profile?.description || "").trim();
    if (!text) return { pass: false, detail: "Nenhuma descrição definida" };
    const len = [...text].length, problems = [];
    if (len > CFG.descriptionMaxChars) problems.push(`${len} caracteres, o limite é ${CFG.descriptionMaxChars}`);
    if (LINK.test(text)) problems.push("contém um link, o que o Google não permite");
    return problems.length ? { pass: false, detail: `Descrição: ${problems.join("; ")}` } : { pass: true, detail: `${plural(len, "caractere")}, sem links` };
  });
  L("description_quality", "Qualidade da descrição", "important", `${EDIT} > Descrição`, l => {
    const text = (l.profile?.description || "").trim();
    if (!text) return { pass: false, detail: "Não há descrição para avaliar" };
    const problems = descriptionProblems(text);
    return problems.length ? { pass: false, detail: `Descrição: ${problems.join("; ")}` } : { pass: true, detail: "Tamanho bom, sem excesso de maiúsculas, sem palavras repetidas demais" };
  });
  {
    const title = "A descrição usa os termos que o cliente mais busca", fix = `${EDIT} > Descrição`;
    if (!input.location.ok) add("description_keywords", title, "nice", "unknown", unreadable("o perfil", input.location), fix);
    else if (!input.keywords?.length) add("description_keywords", title, "nice", "unknown", "Ainda não há termos de busca no Desempenho da ficha", fix);
    else {
      const top = input.keywords.slice(0, CFG.keywordTopN);
      const { covered, missing } = keywordsCovered(input.location.value.profile?.description || "", top);
      add("description_keywords", title, "nice", covered.length / top.length >= CFG.minKeywordCoverage ? "pass" : "fail",
        `${covered.length} dos ${top.length} termos mais buscados aparecem na descrição` + (missing.length ? `; faltam: ${missing.map(k => `"${k}"`).join(", ")}` : "") + `, o recomendado é pelo menos ${Math.round(CFG.minKeywordCoverage * 100)}%`, fix);
    }
  }
  L("primary_category", "Categoria principal", "necessary", `${EDIT} > Categoria`, l => {
    const c = l.categories?.primaryCategory;
    return c?.name ? { pass: true, detail: c.displayName || c.name } : { pass: false, detail: "Nenhuma categoria principal definida" };
  });
  L("additional_categories", "Categorias adicionais", "important", `${EDIT} > Categoria`, l => {
    const list = l.categories?.additionalCategories || [];
    return list.length ? { pass: true, detail: list.map(c => c.displayName || c.name).join(", ") } : { pass: false, detail: "Nenhuma categoria adicional, adicione pelo menos uma" };
  });
  L("regular_hours", "Horário de funcionamento", "necessary", `${EDIT} > Horário`, l => {
    const n = l.regularHours?.periods?.length || 0;
    return n ? { pass: true, detail: plural(n, "período de funcionamento", "períodos de funcionamento") } : { pass: false, detail: "Nenhum horário de funcionamento definido" };
  });
  L("special_hours", "Horário especial nas próximas datas", "nice", `${EDIT} > Horário > Horário especial`, l => {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const n = (l.specialHours?.specialHourPeriods || []).filter(p => { const d = dateOnly(p.startDate); return d !== null && d >= today; }).length;
    return n ? { pass: true, detail: plural(n, "data futura com horário especial", "datas futuras com horário especial") } : { pass: false, detail: "Nenhum horário especial para as próximas datas (feriados)" };
  });
  L("phone", "Telefone", "necessary", `${EDIT} > Contato`, l => (l.phoneNumbers?.primaryPhone?.trim() ? { pass: true, detail: l.phoneNumbers.primaryPhone } : { pass: false, detail: "Nenhum telefone principal" }));
  L("website", "Site", "necessary", `${EDIT} > Contato`, l => (l.websiteUri?.trim() ? { pass: true, detail: l.websiteUri } : { pass: false, detail: "Nenhum site definido" }));
  L("website_utm", "Link do site com rastreio UTM", "nice", `${EDIT} > Contato > Site`, l => {
    if (!l.websiteUri?.trim()) return { pass: false, detail: "Não há site para rastrear" };
    let utm = false;
    try { utm = [...new URL(l.websiteUri).searchParams.keys()].some(k => k.startsWith("utm_")); } catch { /* sem UTM */ }
    return utm ? { pass: true, detail: "O link do site tem parâmetros utm_" } : { pass: false, detail: "O link do site não tem utm_, então a visita vinda do Google não aparece separada nas análises do site" };
  });
  L("service_items", "Serviços listados", "nice", `${EDIT} > Serviços`, l => {
    const n = l.serviceItems?.length || 0;
    return n ? { pass: true, detail: plural(n, "serviço") } : { pass: false, detail: "Nenhum serviço listado" };
  });

  const PHOTOS = "Perfil da Empresa > Fotos > Adicionar";
  const M = (id, title, importance, judge) => {
    if (!input.media.ok) return add(id, title, importance, "unknown", unreadable("as fotos", input.media), PHOTOS);
    const r = judge(input.media.value.filter(m => !m.mediaFormat || m.mediaFormat === "PHOTO"));
    add(id, title, importance, r.pass ? "pass" : "fail", r.detail, PHOTOS);
  };
  M("photo_count", "Fotos suficientes", "important", items => ({ pass: items.length >= CFG.minPhotos, detail: `${plural(items.length, "foto")}, o recomendado é pelo menos ${CFG.minPhotos}` }));
  M("recent_photo", "Foto recente", "important", items => {
    const ages = items.map(m => ageDays(m.createTime, now)).filter(a => a !== null);
    const newest = ages.length ? Math.min(...ages) : null;
    return { pass: newest !== null && newest <= CFG.recentPhotoDays, detail: newest === null ? `Nenhuma foto, o recomendado é uma nos últimos ${CFG.recentPhotoDays} dias` : `A foto mais recente tem ${plural(Math.floor(newest), "dia")}, o recomendado é até ${CFG.recentPhotoDays} dias` };
  });
  const hasCategory = (items, c) => items.some(m => m.locationAssociation?.category === c);
  M("logo_photo", "Logo (foto do perfil)", "important", items => ({ pass: hasCategory(items, "PROFILE"), detail: hasCategory(items, "PROFILE") ? "Logo definido" : "Nenhum logo definido" }));
  M("cover_photo", "Foto de capa", "important", items => ({ pass: hasCategory(items, "COVER"), detail: hasCategory(items, "COVER") ? "Foto de capa definida" : "Nenhuma foto de capa definida" }));

  {
    const fix = "Publicar o post da semana (esteira de posts, nesta aba)";
    if (!input.posts.ok) add("recent_post", "Post recente no Google", "important", "unknown", unreadable("os posts", input.posts), fix);
    else {
      const ages = input.posts.value.filter(p => !p.state || p.state === "LIVE").map(p => ageDays(p.createTime, now)).filter(a => a !== null);
      const newest = ages.length ? Math.min(...ages) : null;
      add("recent_post", "Post recente no Google", "important", newest !== null && newest <= CFG.recentPostDays ? "pass" : "fail",
        newest === null ? `Nenhum post publicado, o recomendado é um nos últimos ${CFG.recentPostDays} dias` : `Último post há ${plural(Math.floor(newest), "dia")}, o recomendado é até ${CFG.recentPostDays} dias`, fix);
    }
  }

  {
    const win = CFG.reviewWindowDays, REV = "Perfil da Empresa > Avaliações";
    if (!input.reviews.ok) {
      for (const [id, title, imp] of [["unreplied_reviews", "Nenhuma avaliação sem resposta", "necessary"], ["average_rating", "Nota média", "important"], ["new_reviews", "Avaliação nova recente", "important"]])
        add(id, title, imp, "unknown", unreadable("as avaliações", input.reviews), REV);
    } else {
      const r = input.reviews.value;
      add("unreplied_reviews", "Nenhuma avaliação sem resposta", "necessary", r.unreplied === 0 ? "pass" : "fail",
        r.unreplied === 0 ? (r.newInWindow ? `Toda avaliação dos últimos ${win} dias tem resposta` : `Nenhuma avaliação nos últimos ${win} dias esperando resposta`) :`${plural(r.unreplied, "avaliação", "avaliações")} dos últimos ${win} dias sem resposta`, REV);
      const avg = r.avgRating;
      add("average_rating", "Nota média", "important", avg === null ? "unknown" : avg >= CFG.minAverageRating ? "pass" : "fail",
        avg !== null ? `${avg.toFixed(1)} estrelas em ${plural(r.total, "avaliação", "avaliações")}, o recomendado é pelo menos ${CFG.minAverageRating.toFixed(1)}` : "Nenhuma avaliação com nota", REV);
      const lastAge = r.newestAt ? Math.floor(ageDays(r.newestAt, now)) : null;
      // Mudanca da Speed: "important" (no Local Ninja e "nice"); avaliacao recente e a maior diferenca para a lider.
      add("new_reviews", "Avaliação nova recente", "important", r.newInWindow > 0 ? "pass" : "fail",
        `${plural(r.newInWindow, "avaliação nova", "avaliações novas")} nos últimos ${win} dias` + (r.newInWindow === 0 && lastAge !== null ? `; a última chegou há ${plural(lastAge, "dia")}` : ""),
        "Pedir avaliação no WhatsApp a todo cliente atendido");
    }
  }

  if (!input.voice.ok) add("verification", "Verificada e em situação regular", "necessary", "unknown", unreadable("a verificação", input.voice), "Ligar a My Business Verifications API no Google Cloud");
  else {
    const s = input.voice.value || {};
    const issue = s.complyWithGuidelines ? "cumprir as diretrizes (ficha com problema)" : s.resolveOwnershipConflict ? "resolver conflito de propriedade" : s.verify ? "verificar a ficha" : s.waitForVoiceOfMerchant ? "aguardar análise" : null;
    add("verification", "Verificada e em situação regular", "necessary", s.hasVoiceOfMerchant && !issue ? "pass" : "fail",
      s.hasVoiceOfMerchant && !issue ? "O Google informa situação regular" : `Situação irregular: o Google pede ${issue || "verificação"}`, "Perfil da Empresa > Verificação");
  }
  if (!input.links.ok) add("place_action_link", "Link de agendamento ou contato", "nice", "unknown", unreadable("os links de ação", input.links), "Ligar a My Business Place Actions API no Google Cloud");
  else {
    const n = input.links.value.length;
    add("place_action_link", "Link de agendamento ou contato", "nice", n ? "pass" : "fail", n ? plural(n, "link") : "Nenhum link de agendamento (pode apontar para o WhatsApp)", `${EDIT} > Agendamentos`);
  }
  if (!input.attributes.ok) add("attributes", "Atributos definidos", "nice", "unknown", unreadable("os atributos", input.attributes), `${EDIT} > Mais`);
  else {
    const n = input.attributes.value.filter(a => (a.values || []).length || (a.uriValues || []).length || a.repeatedEnumValue?.setValues?.length).length;
    add("attributes", "Atributos definidos", "nice", n ? "pass" : "fail", n ? plural(n, "atributo preenchido", "atributos preenchidos") : "Nenhum atributo (acessibilidade, pagamentos, atendimento no local)", `${EDIT} > Mais`);
  }
  if (!input.location.ok || !input.others) add("duplicate_listing", "Sem ficha duplicada no Maps", "important", "unknown", input.others ? unreadable("o perfil", input.location) : input.othersError ? `Não deu para procurar no Maps: ${input.othersError}` : "Configure a chave do GeoGrid para procurar fichas parecidas no Maps", null);
  else {
    const l = input.location.value;
    const me = { name: brandName(l.title), address: addressLine(l.storefrontAddress), phone: l.phoneNumbers?.primaryPhone || "" };
    const dups = input.others.filter(o => looksDuplicate(me, o));
    add("duplicate_listing", "Sem ficha duplicada no Maps", "important", dups.length ? "fail" : "pass",
      dups.length ? `Parece com ${dups.slice(0, 3).map(d => `"${d.name}" (${d.address || "sem endereço"})`).join(", ")}: nome parecido com o mesmo endereço ou telefone. Peça a remoção da duplicada no Maps` : input.others.length ? `Nenhuma das ${plural(input.others.length, "ficha parecida", "fichas parecidas")} no Maps tem o mesmo endereço e telefone` : "Nenhuma outra ficha com nome parecido no Maps",
      "Maps > ficha duplicada > Sugerir edição > Fechar ou remover > Duplicada");
  }
  return checks;
}

// Leituras que falharam nao contam: nem ajudam nem atrapalham a nota.
function scoreOf(checks) {
  const passed = checks.filter(c => c.status === "pass").length;
  const total = checks.filter(c => c.status === "pass" || c.status === "fail").length;
  return { passed, total, percent: total === 0 ? 0 : Math.round((passed / total) * 100) };
}

// Resumo das avaliacoes da primeira pagina (mais novas primeiro).
function reviewSummary(data, now = new Date()) {
  const list = data.reviews || [];
  const recent = list.filter(r => { const a = ageDays(r.createTime, now); return a !== null && a <= CFG.reviewWindowDays; });
  const avg = Number(data.averageRating);
  return {
    total: Number(data.totalReviewCount) || list.length,
    avgRating: Number.isFinite(avg) && avg > 0 ? Math.round(avg * 100) / 100 : null,
    newInWindow: recent.length,
    unreplied: recent.filter(r => !r.reviewReply).length,
    newestAt: list.map(r => r.createTime).filter(Boolean).sort().at(-1) || null
  };
}

// Termos de busca do Desempenho, mais buscados primeiro, sem repetir a mesma busca com e sem acento.
function topKeywords(counts) {
  const seen = new Set(), out = [];
  const valueOf = item => Number(item.insightsValue?.value ?? item.insightsValue?.threshold ?? 0);
  for (const item of [...(counts || [])].sort((a, b) => valueOf(b) - valueOf(a))) {
    const key = words(item.searchKeyword).join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push({ term: item.searchKeyword, count: valueOf(item), approx: item.insightsValue?.value === undefined });
  }
  return out;
}

// ---- Alteracoes no perfil (adaptado de profile/watch) ----
const WATCH_FIELDS = { title: "Nome", profile: "Descrição", categories: "Categorias", regularHours: "Horário", specialHours: "Horário especial", serviceItems: "Serviços", serviceArea: "Área atendida", websiteUri: "Site", openInfo: "Situação (aberta/fechada)", phoneNumbers: "Telefone", storeCode: "Código da loja", storefrontAddress: "Endereço" };
const stable = v => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v ?? null));
const DAYS = { MONDAY: "seg", TUESDAY: "ter", WEDNESDAY: "qua", THURSDAY: "qui", FRIDAY: "sex", SATURDAY: "sáb", SUNDAY: "dom" };
const hm = t => `${t?.hours || 0}h${t?.minutes ? String(t.minutes).padStart(2, "0") : ""}`;
const serviceName = s => s.freeFormServiceItem?.label?.displayName || s.structuredServiceItem?.serviceTypeId?.replace(/^job_type_id:/, "") || "serviço";

// Texto curto de um campo, para mostrar o antes e depois.
function fieldText(field, v) {
  if (v === undefined || v === null) return "(vazio)";
  const cut = s => (s.length > 240 ? `${s.slice(0, 237)}...` : s);
  switch (field) {
    case "profile": return cut(v.description || "(vazio)");
    case "categories": return [v.primaryCategory?.displayName || v.primaryCategory?.name, ...(v.additionalCategories || []).map(c => c.displayName || c.name)].filter(Boolean).join(" + ") || "(vazio)";
    case "regularHours": return (v.periods || []).map(p => `${DAYS[p.openDay] || p.openDay} ${hm(p.openTime)}-${hm(p.closeTime)}`).join(", ") || "(vazio)";
    case "specialHours": return plural((v.specialHourPeriods || []).length, "data especial", "datas especiais");
    case "serviceItems": return cut(`${plural(v.length, "serviço")}: ${v.map(serviceName).join(", ")}`);
    case "phoneNumbers": return [v.primaryPhone, ...(v.additionalPhones || [])].filter(Boolean).join(", ") || "(vazio)";
    case "storefrontAddress": return addressLine(v) || "(vazio)";
    case "openInfo": return v.status || "(vazio)";
    default: return cut(typeof v === "string" ? v : JSON.stringify(v));
  }
}

const snapshotOf = location => Object.fromEntries(Object.keys(WATCH_FIELDS).map(f => [f, location[f] ?? null]));

// Campos que mudaram entre duas fotos da ficha. Campo que a foto antiga nunca guardou conta como igual.
function diffSnapshots(before, after) {
  if (!before) return [];
  return Object.keys(WATCH_FIELDS).filter(f => f in before && stable(before[f]) !== stable(after[f]))
    .map(f => ({ field: f, label: WATCH_FIELDS[f], before: fieldText(f, before[f]), after: fieldText(f, after[f]) }));
}

// Campos em que o Google tem versao diferente da do dono (getGoogleUpdated.diffMask).
function googleDiff(updated) {
  const mask = String(updated?.diffMask || "").split(",").map(s => s.trim()).filter(Boolean);
  return mask.map(path => { const f = path.split(".")[0]; return { field: path, label: WATCH_FIELDS[f] || path, google: f in WATCH_FIELDS ? fieldText(f, updated.location?.[f]) : "" }; });
}

// ---- Potencial de crescimento (adaptado de geogrid/growth-potential) ----
// Acoes a mais por mes se todo ponto fora do top 3 entrasse no top 3. Faixa: pior vaga (3o) a vaga media.
function estimateGrowthPotential(ranks, monthlyActions) {
  if (!ranks.length || monthlyActions === null || monthlyActions === undefined) return null;
  const outside = ranks.filter(r => r === null || r > 3).length;
  const missing = outside / ranks.length;
  const gain = target => Math.max(0, target - OUTSIDE_PACK_SHARE) / 100;
  const low = Math.min(...PACK_SHARES), high = PACK_SHARES.reduce((a, b) => a + b, 0) / PACK_SHARES.length;
  return { low: Math.max(0, Math.floor(monthlyActions * missing * gain(low) + 1e-9)), high: Math.max(0, Math.ceil(monthlyActions * missing * gain(high) - 1e-9)), outside, points: ranks.length };
}

// ---- NAP em diretorios (adaptado de citations/nap) ----
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " "; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const htmlToText = html => decodeEntities(html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const normalizeText = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’`]/g, "").replace(/&/g, " e ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const ABBREV = { rua: "r", avenida: "av", travessa: "tv", praca: "pc", alameda: "al", rodovia: "rod", numero: "n", loja: "lj", sala: "sl" };
const addressTokens = s => normalizeText(s).split(" ").filter(Boolean).map(t => ABBREV[t] ?? t);
const CEP = /\b\d{5}-?\d{3}\b/;

// Endereco na pagina: numero da rua com a maioria das outras palavras perto (CEP fora da conta, muitos guias nao mostram).
function addressOnPage(address, pageTokens) {
  const toks = addressTokens(address.replace(CEP, " ")).filter(t => !["mg", "brasil", "brazil"].includes(t));
  const number = toks.find(t => /^\d+[a-z]?$/.test(t));
  const rest = toks.filter(t => t !== number);
  if (!number) return false;
  for (let i = 0; i < pageTokens.length; i++) {
    if (pageTokens[i] !== number) continue;
    const win = new Set(pageTokens.slice(Math.max(0, i - 8), i + 18));
    if (!rest.length || rest.filter(w => win.has(w)).length / rest.length >= 0.6) return true;
  }
  return false;
}

function collectBusinesses(node, out, depth = 0) {
  if (depth > 8 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach(n => collectBusinesses(n, out, depth + 1));
  const name = typeof node.name === "string" ? decodeEntities(node.name) : null;
  const phone = typeof node.telephone === "string" ? node.telephone : null;
  const a = node.address;
  const address = typeof a === "string" ? a : a && typeof a === "object" ? ["streetAddress", "addressLocality", "addressRegion", "postalCode"].map(k => (typeof a[k] === "string" ? a[k] : "")).filter(Boolean).join(" ") || null : null;
  if (name && (phone || address)) out.push({ name, phone, address });
  for (const v of Object.values(node)) if (v && typeof v === "object") collectBusinesses(v, out, depth + 1);
}
function jsonLdBusinesses(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectBusinesses(JSON.parse(m[1].trim()), out); } catch { /* bloco que nao e JSON */ }
  }
  return out;
}
const PHONE_IN_TEXT = /\+?\d[\d\s().\-–]{5,}\d/g;
const napKey = s => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-8) : null; };

// Compara nome, endereco e telefone da pagina com a ficha. So da "diferente" a partir de dado estruturado
// (JSON-LD) que a pagina diz ser da empresa; texto solto vira "nao achado". oldPhones: numeros desativados.
function compareNap(html, profile, oldPhones = []) {
  const text = htmlToText(html);
  const textNorm = ` ${normalizeText(text)} `;
  const tokens = addressTokens(text);
  const biz = jsonLdBusinesses(html);
  const fields = {};
  if (profile.name?.trim()) {
    const want = ` ${normalizeText(profile.name)} `;
    const names = biz.map(b => normalizeText(b.name || "")).filter(Boolean);
    fields.name = textNorm.includes(want) || names.some(n => ` ${n} `.includes(want)) ? "match" : names.length ? "mismatch" : "not_found";
  }
  // Numeros da pagina: texto, links tel: e links do WhatsApp (wa.me/55..., ?phone=55...).
  const found = [...text.matchAll(PHONE_IN_TEXT)].map(m => m[0]);
  for (const m of html.matchAll(/(?:tel:|wa\.me\/|[?&](?:amp;)?phone=)\+?([\d\s().%-]{7,})/gi)) found.push(decodeURIComponent(m[1]));
  const keys = new Set(found.map(napKey).filter(Boolean));
  const structured = biz.map(b => napKey(b.phone)).filter(Boolean);
  const wantPhone = napKey(profile.phone);
  if (wantPhone) fields.phone = keys.has(wantPhone) || structured.includes(wantPhone) ? "match" : structured.length ? "mismatch" : "not_found";
  if (profile.address?.trim()) {
    const inLd = biz.map(b => b.address).filter(Boolean).some(a => addressOnPage(profile.address, addressTokens(decodeEntities(a))));
    fields.address = addressOnPage(profile.address, tokens) || inLd ? "match" : biz.some(b => b.address) ? "mismatch" : "not_found";
  }
  const oldKeys = oldPhones.map(napKey).filter(Boolean);
  const oldPhone = [...keys, ...structured].some(k => oldKeys.includes(k));
  const values = Object.values(fields);
  // Mudanca da Speed: o telefone e o que mais erra nos guias, entao "certo" exige o telefone oficial na pagina.
  const ok = fields.name === "match" && (fields.phone ? fields.phone === "match" : fields.address === "match") && fields.address !== "mismatch";
  const result = oldPhone || values.includes("mismatch") ? "mismatch" : ok ? "match" : "not_found";
  return { result, fields, oldPhone };
}

module.exports = {
  CFG, evaluateHealth, scoreOf, reviewSummary, topKeywords, snapshotOf, diffSnapshots, googleDiff, WATCH_FIELDS,
  estimateGrowthPotential, compareNap, looksDuplicate, similarity, keywordsCovered, descriptionProblems, brandName, addressLine
};
