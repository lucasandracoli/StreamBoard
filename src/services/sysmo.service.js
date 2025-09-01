const sysmoDb = require("../../config/sysmo");
const logger = require("../utils/logger");

const fetchProductFromSysmoByCode = async (productCode, companyId) => {
  const query = `
        SELECT pre.emp,
            pro.cod,
            pro.dsc AS dsc,
            pre.pv2,
            pro.grp as sec
            FROM gcepro02 AS pro
            INNER JOIN gcepro04 AS pre ON pre.cod = pro.cod
            WHERE pre.emp = $2
            AND pro.cod = $1
            AND pro.dep = 41
            AND pro.sec = 410
            AND pro.grp IN ('1','2','3') -- 1-Aves | 2-Bovino | 3-Suino
            AND pre.pv2 > 0
            AND fl_situacao = 'A'
        LIMIT 1;
    `;
  try {
    console.log(
      `[DEBUG] SYSMO REQUEST: Enviando para o Sysmo -> Código: ${productCode}, Empresa: ${companyId}`
    );
    const result = await sysmoDb.query(query, [productCode, companyId]);

    if (result.rows.length === 0) {
      console.log(
        `[DEBUG] SYSMO RESPONSE: Nenhum dado recebido para o código ${productCode}`
      );
      return null;
    }

    console.log(
      `[DEBUG] SYSMO RESPONSE: Dados recebidos do Sysmo -> ${JSON.stringify(
        result.rows[0]
      )}`
    );
    return result.rows[0];
  } catch (error) {
    logger.error(
      `Erro ao buscar produto de código ${productCode} no Sysmo para empresa ${companyId}.`,
      error
    );
    throw new Error("Erro de comunicação com o banco de dados Sysmo.");
  }
};

module.exports = {
  fetchProductFromSysmoByCode,
};
