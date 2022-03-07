const fs = require('fs');

const { variant: { parse: parseVariant } } = require('@bcgsc-pori/graphkb-parser');

const { logger } = require('../logging');
const { orderPreferredOntologyTerms, rid } = require('../graphkb');
const { fetchAndLoadBySymbol } = require('../entrez/gene');


const getEntrezGene = async (conn, name) => {
    try {
        const gene = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: 'entrez gene' }, target: 'Source' } },
                    { biotype: 'gene' },
                    { name },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'Feature', // prefer non-deprecated non-alias terms
        });
        return gene;
    } catch (err) {
        // fetch directly from entrez
        const gene = await fetchAndLoadBySymbol(conn, name);
        return gene;
    }
};

/**
 * Upload the HGNC genes from a list of symbols
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    const { filename, conn } = opt;
    logger.info(`loading: ${filename}`);
    const variants = fs.readFileSync(filename, 'utf8').split('\n')
        .map(row => row.trim())
        .filter(row => row);

    logger.info(`adding ${variants.length} variant records`);
    const counts = { error: 0, success: 0 };

    for (const variant of variants) {
        logger.info(`loading ${variant}`);

        try {
            const parsed = parseVariant(variant, true).toJSON();
            const variantType = await conn.getVocabularyTerm(parsed.type);
            const reference1 = await getEntrezGene(conn, parsed.reference1);

            let reference2 = null;

            if (parsed.reference2) {
                reference2 = await getEntrezGene(conn, parsed.reference2);
            }

            await conn.addVariant({
                content: {
                    ...parsed,
                    reference1: rid(reference1),
                    reference2: reference2 && rid(reference2),
                    type: rid(variantType),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'PositionalVariant',
            });

            counts.success++;
        } catch (err) {
            logger.error(`${err}`);
            counts.error++;
        }
    }
    logger.info(`counts: ${JSON.stringify(counts)}`);
};

module.exports = { uploadFile };
