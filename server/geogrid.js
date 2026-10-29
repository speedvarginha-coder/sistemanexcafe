// GeoGrid: posicao da ficha no Google em uma grade de pontos ao redor da loja.
// Usa a Places API (Text Search New) com locationBias em cada ponto: sem personalizacao da conta logada.
// As buscas da grade pedem so places.id (SKU Essentials IDs Only, sem cobranca); os nomes dos
// concorrentes vem de uma busca Pro por termo no centro e de detalhes so dos lideres que faltarem.
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";

// Sem o nome da cidade: cidade escrita na busca anula o locationBias (documentacao da Text Search).
const DEFAULT_TERMS = ["empréstimo consignado", "empréstimo", "antecipação fgts", "financeira"];
const DEFAULT_CENTER = { lat: -21.5551923, lng: -45.439385 }; // Rua Santa Cruz, 696 (pino da ficha)
const GRID_SIZE = 5;
const SPACING_KM = 1;
const BIAS_RADIUS_M = 1000;
const OUT = 21; // fora dos 20 primeiros, para a media

const placesError = (message, status = 502) => Object.assign(new Error(message), { status });

function gridPoints(center = DEFAULT_CENTER, size = GRID_SIZE, spacingKm = SPACING_KM) {
  const half = (size - 1) / 2;
  const dLat = spacingKm / 111.32;
  const dLng = spacingKm / (111.32 * Math.cos(center.lat * Math.PI / 180));
  const points = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Linha 0 = norte, coluna 0 = oeste.
      points.push({ row, col, lat: +(center.lat + (half - row) * dLat).toFixed(6), lng: +(center.lng + (col - half) * dLng).toFixed(6) });
    }
  }
  return points;
}

async function callPlaces(fetchImpl, key, url, { body, fields }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (cause) { throw placesError(`Sem conexao com o Google: ${cause.message}`); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw placesError(`Google Places respondeu ${response.status}: ${data?.error?.message || "erro desconhecido"}`, response.status === 400 || response.status === 403 ? 400 : 502);
  return data;
}

function searchBody(term, point) {
  const body = { textQuery: term, languageCode: "pt-BR", regionCode: "BR", pageSize: 20 };
  if (point) body.locationBias = { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: BIAS_RADIUS_M } };
  return body;
}

// Busca a ficha para a configuracao (SKU Pro, poucas chamadas).
async function findPlaces({ key, query, fetchImpl = fetch, center = DEFAULT_CENTER }) {
  const data = await callPlaces(fetchImpl, key, SEARCH_URL, { body: searchBody(query, center), fields: "places.id,places.displayName,places.formattedAddress" });
  return (data.places || []).map(place => ({ id: place.id, name: place.displayName?.text || "", address: place.formattedAddress || "" }));
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() { while (next < items.length) { const index = next++; results[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

async function measureGeogrid({ key, placeId, terms = DEFAULT_TERMS, center = DEFAULT_CENTER, size = GRID_SIZE, spacingKm = SPACING_KM, fetchImpl = fetch, concurrency = 4 }) {
  if (!key || !placeId) throw placesError("GeoGrid sem chave ou sem ficha configurada", 400);
  const points = gridPoints(center, size, spacingKm);
  const names = {};
  let calls = 0;
  const result = [];
  for (const term of terms) {
    const named = await callPlaces(fetchImpl, key, SEARCH_URL, { body: searchBody(term, center), fields: "places.id,places.displayName" });
    calls++;
    for (const place of named.places || []) names[place.id] = place.displayName?.text || "";
    const cells = await pool(points, concurrency, async point => {
      const data = await callPlaces(fetchImpl, key, SEARCH_URL, { body: searchBody(term, point), fields: "places.id" });
      calls++;
      const ids = (data.places || []).map(place => place.id);
      const index = ids.indexOf(placeId);
      return { row: point.row, col: point.col, lat: point.lat, lng: point.lng, rank: index >= 0 ? index + 1 : null, leader: ids[0] || null };
    });
    const ranks = cells.map(cell => cell.rank || OUT);
    const leaders = {};
    for (const cell of cells) if (cell.leader && cell.leader !== placeId) leaders[cell.leader] = (leaders[cell.leader] || 0) + 1;
    result.push({
      term,
      cells,
      average: +(ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length).toFixed(1),
      top3: cells.filter(cell => cell.rank && cell.rank <= 3).length,
      found: cells.filter(cell => cell.rank).length,
      leaders: Object.entries(leaders).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => ({ id, count }))
    });
  }
  // Nome dos lideres que nao apareceram na busca do centro (Place Details, poucas chamadas).
  const missing = [...new Set(result.flatMap(item => item.cells.map(cell => cell.leader)).filter(id => id && id !== placeId && !(id in names)))];
  for (const id of missing) {
    try { names[id] = (await callPlaces(fetchImpl, key, DETAILS_URL + encodeURIComponent(id), { fields: "displayName" })).displayName?.text || ""; calls++; }
    catch { names[id] = ""; }
  }
  const used = new Set(result.flatMap(item => [...item.cells.map(cell => cell.leader), ...item.leaders.map(l => l.id)]).filter(Boolean));
  return {
    at: new Date().toISOString(),
    center, size, spacingKm, radiusM: BIAS_RADIUS_M,
    terms: result,
    names: Object.fromEntries(Object.entries(names).filter(([id]) => used.has(id))),
    calls
  };
}

module.exports = { measureGeogrid, findPlaces, gridPoints, DEFAULT_TERMS, DEFAULT_CENTER, GRID_SIZE, SPACING_KM };
