// Perfil da Empresa no Google (Business Profile API): conexao OAuth do servidor com a ficha da Speed Financeira.
// O dono autoriza uma vez com a conta Google da ficha; o servidor guarda o refresh token e pede tokens de acesso.
// Escopo unico: business.manage. So a ficha "Speed Financeira" e usada; os outros perfis da conta ficam de fora.
const crypto = require("node:crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_URL = "https://mybusinessbusinessinformation.googleapis.com/v1/";
const V4_URL = "https://mybusiness.googleapis.com/v4/";
// business.manage: a ficha. webmasters.readonly: só leitura do Search Console do site (server/search-console.js).
const SCOPE = "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/webmasters.readonly";
const LOCATION_TITLE = /speed financeira/i;

const gmbError = (message, status = 502) => Object.assign(new Error(message), { status });

function authUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `${AUTH_URL}?${params}`;
}

const newState = () => crypto.randomBytes(24).toString("hex");

async function call(fetchImpl, url, init) {
  let response;
  try { response = await fetchImpl(url, init); }
  catch (cause) { throw gmbError(`Sem conexao com o Google: ${cause.message}`); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || data?.error || "erro desconhecido";
    throw gmbError(`Google respondeu ${response.status}: ${String(message).slice(0, 200)}`, response.status === 400 || response.status === 401 || response.status === 403 ? 400 : 502);
  }
  return data;
}

function tokenRequest(fetchImpl, fields) {
  return call(fetchImpl, TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri, fetchImpl = fetch }) {
  const data = await tokenRequest(fetchImpl, { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!data.refresh_token) throw gmbError("O Google nao devolveu o refresh token. Remova o acesso do app na conta Google e conecte de novo.", 400);
  return { refreshToken: data.refresh_token, accessToken: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
}

async function refreshAccess({ clientId, clientSecret, refreshToken, fetchImpl = fetch }) {
  const data = await tokenRequest(fetchImpl, { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  return { accessToken: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
}

const get = (fetchImpl, token, url) => call(fetchImpl, url, { headers: { authorization: `Bearer ${token}` } });

// Procura a ficha da Speed Financeira entre as contas e locais que a conta autorizada administra.
async function findLocation({ accessToken, fetchImpl = fetch }) {
  const accounts = (await get(fetchImpl, accessToken, ACCOUNTS_URL)).accounts || [];
  const seen = [];
  for (const account of accounts) {
    const url = `${INFO_URL}${account.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`;
    const locations = (await get(fetchImpl, accessToken, url)).locations || [];
    for (const location of locations) {
      seen.push(location.title || "");
      if (LOCATION_TITLE.test(location.title || "")) {
        const address = location.storefrontAddress || {};
        return {
          accountName: account.name, locationName: location.name, title: location.title,
          address: [...(address.addressLines || []), address.locality].filter(Boolean).join(", ")
        };
      }
    }
  }
  throw gmbError(`Ficha da Speed Financeira nao encontrada nesta conta Google (fichas vistas: ${seen.join("; ") || "nenhuma"})`, 404);
}

// Posts da ficha pela API v4 (localPosts): accounts/{conta}/locations/{local}/localPosts.
async function listPosts({ accessToken, accountName, locationName, fetchImpl = fetch, pageSize = 10 }) {
  const url = `${V4_URL}${accountName}/${locationName}/localPosts?pageSize=${pageSize}`;
  const data = await get(fetchImpl, accessToken, url);
  return (data.localPosts || []).map(post => ({ summary: String(post.summary || "").slice(0, 80), state: post.state || "", createTime: post.createTime || "", topicType: post.topicType || "" }));
}

// ---- Leituras para a saude da ficha (server/ficha-saude.js) ----
const VERIFY_URL = "https://mybusinessverifications.googleapis.com/v1/";
const ACTIONS_URL = "https://mybusinessplaceactions.googleapis.com/v1/";
const PERF_URL = "https://businessprofileperformance.googleapis.com/v1/";
const READ_MASK = "name,title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,specialHours,serviceItems,serviceArea,profile,metadata,openInfo,storeCode";
const ACTION_METRICS = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_CONVERSATIONS"];
const ymd = d => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });

// Cada leitura vira { ok, value } ou { ok: false, message }: uma API desligada nao derruba as outras.
async function source(promise) {
  try { return { ok: true, value: await promise }; }
  catch (cause) {
    const message = /has not been used|is disabled/i.test(cause.message) ? "a API está desligada no projeto do Google Cloud" : String(cause.message).slice(0, 160);
    return { ok: false, message };
  }
}

// Acoes da ficha (ligacoes, rotas, cliques no site e conversas) nos 30 dias que terminam 3 dias atras (o Google atrasa).
async function monthlyActions({ get: read, locationName, now }) {
  const end = new Date(now.getTime() - 3 * 86400_000), start = new Date(end.getTime() - 29 * 86400_000);
  const range = (prefix, d) => Object.entries(ymd(d)).map(([k, v]) => `dailyRange.${prefix}_date.${k}=${v}`).join("&");
  const data = await read(`${PERF_URL}${locationName}:fetchMultiDailyMetricsTimeSeries?${ACTION_METRICS.map(m => `dailyMetrics=${m}`).join("&")}&${range("start", start)}&${range("end", end)}`);
  const byMetric = Object.fromEntries(ACTION_METRICS.map(m => [m, 0]));
  for (const series of (data.multiDailyMetricTimeSeries || []).flatMap(item => item.dailyMetricTimeSeries || []))
    byMetric[series.dailyMetric] = (series.timeSeries?.datedValues || []).reduce((sum, v) => sum + Number(v.value || 0), 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), total: Object.values(byMetric).reduce((a, b) => a + b, 0), calls: byMetric.CALL_CLICKS, directions: byMetric.BUSINESS_DIRECTION_REQUESTS, website: byMetric.WEBSITE_CLICKS, conversations: byMetric.BUSINESS_CONVERSATIONS };
}

// Termos de busca dos ultimos 3 meses fechados.
async function searchKeywords({ get: read, locationName, now }) {
  const end = new Date(now.getFullYear(), now.getMonth() - 1, 1), start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
  const month = (prefix, d) => `monthlyRange.${prefix}_month.year=${d.getFullYear()}&monthlyRange.${prefix}_month.month=${d.getMonth() + 1}`;
  const data = await read(`${PERF_URL}${locationName}/searchkeywords/impressions/monthly?${month("start", start)}&${month("end", end)}&pageSize=100`);
  return data.searchKeywordsCounts || [];
}

// Tudo o que a nota de saude e o alerta de alteracao precisam, em paralelo.
async function readFicha({ accessToken, accountName, locationName, fetchImpl = fetch, now = new Date() }) {
  const read = url => get(fetchImpl, accessToken, url);
  const v4 = `${V4_URL}${accountName}/${locationName}`;
  const [location, updated, attributes, media, posts, reviews, voice, links, actions, keywords] = await Promise.all([
    source(read(`${INFO_URL}${locationName}?readMask=${READ_MASK}`)),
    source(read(`${INFO_URL}${locationName}:getGoogleUpdated?readMask=${READ_MASK}`)),
    source(read(`${INFO_URL}${locationName}/attributes`).then(d => d.attributes || [])),
    source(read(`${v4}/media?pageSize=100`).then(d => d.mediaItems || [])),
    source(read(`${v4}/localPosts?pageSize=20`).then(d => d.localPosts || [])),
    source(read(`${v4}/reviews?pageSize=50`)),
    source(read(`${VERIFY_URL}${locationName}/VoiceOfMerchantState`)),
    source(read(`${ACTIONS_URL}${locationName}/placeActionLinks`).then(d => d.placeActionLinks || [])),
    source(monthlyActions({ get: read, locationName, now })),
    source(searchKeywords({ get: read, locationName, now }))
  ]);
  return { location, updated, attributes, media, posts, reviews, voice, links, actions, keywords };
}

// ---- Posts que o servidor publica (calendario do painel, publicarPeloServidor) ----
// A API v4 nao programa post: o servidor cria no dia, a partir da hora marcada. Dia que passou fica de fora.
function postsDoDia(plano, publicados, agora = new Date(), hora = 9) {
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  if (agora.getHours() < hora) return [];
  return plano.filter(post => post.publicarPeloServidor && post.data === hoje && post.fotoUrl && !publicados[post.id]);
}

async function createPost({ accessToken, accountName, locationName, summary, url, photoUrl, fetchImpl = fetch }) {
  const body = { languageCode: "pt", topicType: "STANDARD", summary, callToAction: { actionType: "LEARN_MORE", url }, media: [{ mediaFormat: "PHOTO", sourceUrl: photoUrl }] };
  const data = await call(fetchImpl, `${V4_URL}${accountName}/${locationName}/localPosts`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { name: data.name || "", state: data.state || "" };
}

module.exports = { authUrl, newState, exchangeCode, refreshAccess, findLocation, listPosts, readFicha, postsDoDia, createPost, SCOPE };
