const sysmo = require("../../config/sysmo");
const campeaoService = require("./campeao.service");

const getProductByBarcode = async (barcode) => {
    const result = await sysmo.query(
        `
        SELECT
            pro.cod AS cod,
            bar.bar AS bar,
            pro.dsc AS dsc,
            pre.pv2 AS pv2
        FROM gcepro02 pro
        JOIN gcebar01 bar ON pro.cod = bar.pro
        JOIN gcepro04 pre ON pre.cod = bar.pro AND pre.emp = 1
        WHERE bar.bar = $1
        `,
        [barcode]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const product = result.rows[0];
    const iid = String(product.cod).split(".")[0].trim();

    const gqlResp = await campeaoService.gqlRequest({
        operationName: "ProductsListQuery",
        variables: { storeId: "5", args: { limit: 1, offset: 0, storeId: "5", sort: { field: "id", order: "desc" }, iid, }, },
        query: `
            fragment ProductListFragment on Product {
                id iid name gtin
                image { url thumborized(width:210,height:210) }
                configuration(storeId: $storeId) { price promotionalPrice qtyInStock }
            }
            query ProductsListQuery($args: ProductStoreSearchInput!, $storeId: ID!) {
                productsByStore(args: $args) {
                    rows { ...ProductListFragment }
                    count
                }
            }
        `,
    });
    
    const rows = gqlResp.data?.data?.productsByStore?.rows || [];
    let image = null;
    if (rows.length > 0) {
        const campeaoProduct = rows[0];
        image = campeaoProduct.image?.thumborized || campeaoProduct.image?.url || null;
    }

    return { ...product, image };
};

module.exports = {
    getProductByBarcode
};