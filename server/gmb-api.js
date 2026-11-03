// Perfil da Empresa no Google (Business Profile API): conexao OAuth do servidor com a ficha da Speed Financeira.
// O dono autoriza uma vez com a conta Google da ficha; o servidor guarda o refresh token e pede tokens de acesso.
// Escopo unico: business.manage. So a ficha "Speed Financeira" e usada; os outros perfis da conta ficam de fora.
const crypto = require("node:crypto");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_URL = "https://mybusinessbusinessinformation.googleapis.com/v1/";
const V4_URL = "https://mybusiness.googleapis.com/v4/";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
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

module.exports = { authUrl, newState, exchangeCode, refreshAccess, findLocation, listPosts, SCOPE };
