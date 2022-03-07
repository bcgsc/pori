const { runLoader } = require('../src');
const { fileExists, createOptionsMenu } = require('../src/cli');
const { loadDelimToJson } = require('../src/util');
const { logger } = require('../src/logging');
const { fetchAndLoadBySymbol } = require('../src/hgnc');

/**
 * Upload the HGNC genes from a list of symbols
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    logger.info('loading the external HGNC data');
    const { filename, conn } = opt;
    logger.info(`loading: ${filename}`);
    const genes = await loadDelimToJson(filename);
    logger.info('fetching existing gene names to avoid spamming external APIs');
    const existingGenes = new Set();
    (await conn.getRecords({
        filters: [{ biotype: 'gene' }, { source: { filters: { name: 'hgnc' }, target: 'Source' } }],
        returnProperies: ['name', 'sourceId'],
        target: 'Feature',
    })).forEach(({ name, sourceId }) => {
        existingGenes.add(sourceId);
        existingGenes.add(name);
    });
    logger.info(`fetched ${existingGenes.size} existing gene names`);
    logger.info(`adding ${genes.length} feature records`);
    const counts = { error: 0, exists: 0, success: 0 };

    for (const { name } of genes) {
        if (existingGenes.has(name.toLowerCase())) {
            counts.exists++;
            continue;
        }

        try {
            await fetchAndLoadBySymbol({ conn, symbol: name });
            counts.success++;
        } catch (err) {
            try {
                await fetchAndLoadBySymbol({ conn, paramType: 'prev_symbol', symbol: name });
                counts.success++;
            } catch (err2) {
                logger.error(`${name} ${err}`);
                counts.error++;
            }
        }
    }
    logger.info(`counts: ${JSON.stringify(counts)}`);
};

const parser = createOptionsMenu();
parser.add_argument('filename', {
    help: 'path to the tab delimited list of gene names',
    type: fileExists,
});
const options = parser.parse_args();

runLoader(options, uploadFile, { filename: options.filename })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
