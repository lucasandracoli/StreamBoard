const axios = require("axios");
const logger = require("../utils/logger")

const GQL_URL = "https://api.campeao.com.br/graphql";
const GQL_HEADERS = {
  "content-type": "application/json",
  accept: "application/json",
  origin: "https://campeao.com.br",
  referer: "https://campeao.com.br/",
  "user-agent": "StreamBoard/1.0 (+node)",
};

let campeaoToken = null;
let campeaoTokenExp = 0;

async function authenticateCampeao() {
  try {
    const r = await axios.post(
      GQL_URL,
      {
        operationName: "authenticateUser",
        variables: {
          email: process.env.CAMPEAO_API_EMAIL,
          password: process.env.CAMPEAO_API_PASSWORD,
        },
        query: `mutation authenticateUser($email: String!, $password: String!) {
          authenticateUser(email: $email, password: $password) { token }
        }`,
      },
      { headers: GQL_HEADERS, timeout: 10000 }
    );
    campeaoToken = r.data?.data?.authenticateUser?.token || null;
    if (!campeaoToken) throw new Error("Token não retornado pela API Campeão");
    campeaoTokenExp = Date.now() + 14 * 60 * 1000;
  } catch (err) {
    campeaoToken = null;
    logger.error("Falha ao autenticar na API Campeão.", err);
    throw err;
  }
}

async function ensureToken() {
  if (!campeaoToken || Date.now() >= campeaoTokenExp) {
    await authenticateCampeao();
  }
}

async function gqlRequest(body) {
  await ensureToken();
  try {
    return await axios.post(GQL_URL, body, {
      headers: { ...GQL_HEADERS, Authorization: `Bearer ${campeaoToken}` },
      timeout: 10000,
    });
  } catch (err) {
    if (err.response && err.response.status === 401) {
      logger.info("Token da API Campeão expirado, reautenticando.");
      campeaoToken = null;
      await ensureToken();
      return axios.post(GQL_URL, body, {
        headers: { ...GQL_HEADERS, Authorization: `Bearer ${campeaoToken}` },
        timeout: 10000,
      });
    }
    logger.error("Erro na requisição GQL para a API Campeão.", err);
    throw err;
  }
}

module.exports = {
    gqlRequest
};