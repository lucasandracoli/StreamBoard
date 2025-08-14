const db = require("../../config/streamboard");

const getCompaniesWithProducts = async () => {
    const query = `
        SELECT DISTINCT c.id, c.name, c.cnpj
        FROM companies c
        JOIN butcher_products bp ON c.id = bp.company_id
        ORDER BY c.name;
    `;
    const result = await db.query(query);
    return result.rows;
};

const getProductById = async (id) => {
    const result = await db.query("SELECT * FROM butcher_products WHERE id = $1", [id]);
    return result.rows[0];
};

const getProductsByCompany = async (companyId, page = 1, limit = 5) => {
    const offset = (page - 1) * limit;

    const productsQuery = `
        SELECT p.id, p.product_name, p.price, p.section_name, p.last_updated, c.name as company_name
        FROM butcher_products p
        JOIN companies c ON p.company_id = c.id
        WHERE p.company_id = $1
        ORDER BY p.section_name, p.product_name
        LIMIT $2 OFFSET $3;
    `;

    const countQuery = `SELECT COUNT(*) FROM butcher_products WHERE company_id = $1;`;

    const productsResult = await db.query(productsQuery, [companyId, limit, offset]);
    const countResult = await db.query(countQuery, [companyId]);
    const companyResult = await db.query("SELECT name FROM companies WHERE id = $1", [companyId]);

    const totalProducts = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalProducts / limit);
    const companyName = companyResult.rows.length > 0 ? companyResult.rows[0].name : "Loja não encontrada";

    return {
        products: productsResult.rows,
        totalPages: totalPages,
        currentPage: page,
        companyId: companyId,
        companyName: companyName
    };
};

const deleteProduct = async (id) => {
    const result = await db.query("DELETE FROM butcher_products WHERE id = $1", [id]);
    return result.rowCount;
};

const addProduct = async (productData) => {
    const { company_id, product_name, price, section_id, section_name } = productData;
    const query = `
        INSERT INTO butcher_products (company_id, product_name, price, section_id, section_name, last_updated)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *;
    `;
    const result = await db.query(query, [company_id, product_name, price, section_id, section_name]);
    return result.rows[0];
};

const upsertProductsFromSheet = async (products, companyId) => {
    const client = await db.connect();
    try {
        await client.query("BEGIN");

        const sectionMap = { '1': 'BOVINO', '2': 'SUÍNO', '3': 'AVES', '4': 'OVINO' };

        for (const product of products) {
            const sectionName = sectionMap[product.section_id] || `SEÇÃO ${product.section_id}`;
            const query = `
                INSERT INTO butcher_products (company_id, product_name, price, section_id, section_name, last_updated)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (company_id, product_name) 
                DO UPDATE SET price = EXCLUDED.price, section_id = EXCLUDED.section_id, section_name = EXCLUDED.section_name, last_updated = NOW();
            `;
            await client.query(query, [companyId, product.product_name, product.price, product.section_id, sectionName]);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    getCompaniesWithProducts,
    getProductById,
    getProductsByCompany,
    deleteProduct,
    addProduct,
    upsertProductsFromSheet
};