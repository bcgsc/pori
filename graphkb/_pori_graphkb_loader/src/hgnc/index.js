/**
 * @module importer/hgnc
 */
const Ajv = require('ajv');
const _ = require('lodash');

const fs = require('fs');
const { checkSpec, request } = require('../util');
const {
    rid, orderPreferredOntologyTerms, convertRecordToQueryFilters,
} = require('../graphkb');
const { logger } = require('../logging');
const _entrez = require('../entrez/gene');
const { hgnc: SOURCE_DEFN, ensembl: { name: ensemblSourceName } } = require('../sources');


const ajv = new Ajv();

const HGNC_API = 'http://rest.genenames.org/fetch';


const CACHE = {};
/**
 * This defines the expected format of a response from the HGNC API
 */
const validateHgncSpec = ajv.compile({
    properties: {
        alias_symbol: { items: { type: 'string' }, type: 'array' },
        date_modified: { type: 'string' },
        ensembl_gene_id: { pattern: '^ENSG[0-9]+$', type: 'string' },
        entrez_id: { pattern: '^\\d+$', type: 'string' },
        hgnc_id: { pattern: '^HGNC:[0-9]+$', type: 'string' },
        name: { type: 'string' },
        prev_symbol: { items: { type: 'string' }, type: 'array' },
        symbol: { type: 'string' },
    },
    type: 'object',
});

const createDisplayName = symbol => symbol.toUpperCase().replace('ORF', 'orf');


/**
 * Upload a gene record and relationships from the corresponding HGNC record
 * @param {object} opt
 * @param {ApiConnection} opt.conn the graphkb api connection
 * @param {object.<string,object>} opt.source the source records
 * @param {object} opt.gene the gene record from HGNC
 */
const uploadRecord = async ({
    conn, sources: { hgnc, ensembl }, gene, deprecated = false,
}) => {
    const body = {
        biotype: 'gene',
        deprecated,
        displayName: createDisplayName(gene.symbol),
        longName: gene.name,
        name: gene.symbol,
        source: rid(hgnc),
        sourceId: gene.hgnc_id,
        sourceIdVersion: gene.date_modified,
    };

    // don't update version if nothing else has changed
    const currentRecord = await conn.addRecord({
        content: body,
        existsOk: true,
        fetchConditions: convertRecordToQueryFilters(_.omit(body, ['sourceIdVersion', 'displayName', 'longName'])),
        fetchFirst: true,
        target: 'Feature',
    });

    if (gene.ensembl_gene_id && ensembl) {
        try {
            const ensg = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { source: rid(ensembl) },
                        { biotype: 'gene' },
                        { sourceId: gene.ensembl_gene_id },
                    ],
                },
                target: 'Feature',
            });
            // try adding the cross reference relationship
            await conn.addRecord({
                content: { in: rid(ensg), out: rid(currentRecord), source: rid(hgnc) },
                existsOk: true,
                fetchExisting: false,
                target: 'crossreferenceof',
            });
        } catch (err) { }
    }

    for (const symbol of gene.prev_symbol || []) {
        const { sourceId, biotype } = currentRecord;

        // link to the current record
        try {
            const deprecatedRecord = await conn.addRecord({
                content: {
                    biotype,
                    dependency: rid(currentRecord),
                    deprecated: true,
                    displayName: createDisplayName(symbol),
                    name: symbol,
                    source: rid(hgnc),
                    sourceId,
                },
                existsOk: true,
                fetchConditions: convertRecordToQueryFilters({
                    deprecated: true, name: symbol, source: rid(hgnc), sourceId,
                }),
                fetchExisting: true,
                target: 'Feature',
            });
            await conn.addRecord({
                content: { in: rid(currentRecord), out: rid(deprecatedRecord), source: rid(hgnc) },
                existsOk: true,
                fetchExisting: false,
                target: 'deprecatedby',
            });
        } catch (err) { }
    }

    for (const symbol of gene.alias_symbol || []) {
        const { sourceId, biotype } = currentRecord;

        try {
            const aliasRecord = await conn.addRecord({
                content: {
                    biotype,
                    dependency: rid(currentRecord),
                    displayName: createDisplayName(symbol),
                    name: symbol,
                    source: rid(hgnc),
                    sourceId,
                },
                existsOk: true,
                fetchConditions: convertRecordToQueryFilters({
                    name: symbol, source: rid(hgnc), sourceId,
                }),
                target: 'Feature',
            });
            await conn.addRecord({
                content: { in: rid(currentRecord), out: rid(aliasRecord), source: rid(hgnc) },
                existsOk: true,
                fetchExisting: false,
                target: 'aliasof',
            });
        } catch (err) { }
    }

    // cross reference the entrez gene
    if (gene.entrez_id) {
        try {
            const [entrezGene] = await _entrez.fetchAndLoadByIds(conn, [gene.entrez_id]);
            await conn.addRecord({
                content: { in: rid(entrezGene), out: rid(currentRecord), source: rid(hgnc) },
                existsOk: true,
                fetchExisting: false,
                target: 'crossreferenceof',
            });
        } catch (err) {
            logger.warn(err);
        }
    }
    return currentRecord;
};


const fetchAndLoadBySymbol = async ({
    conn, symbol, paramType = 'symbol', ignoreCache = false,
}) => {
    symbol = symbol.toString().toLowerCase();

    if (!CACHE[paramType]) {
        CACHE[paramType] = {};
    }
    if (CACHE[paramType][symbol] && !ignoreCache) {
        return CACHE[paramType][symbol];
    }

    try {
        const filters = {
            AND: [
                { source: { filters: { name: SOURCE_DEFN.name }, target: 'Source' } },
            ],
        };

        if (paramType === 'symbol') {
            filters.AND.push({ name: symbol });
        } else {
            filters.AND.push({ sourceId: symbol });
        }
        const record = await conn.getUniqueRecordBy({
            filters,
            sort: orderPreferredOntologyTerms,
            target: 'Feature',
        });

        if (!ignoreCache) {
            CACHE[paramType][symbol] = record;
        }
        return record;
    } catch (err) { }
    // fetch from the HGNC API and upload
    const uri = `${HGNC_API}/${paramType}/${
        paramType === 'hgnc_id'
            ? symbol.replace(/^HGNC:/i, '')
            : symbol
    }`;
    logger.info(`loading: ${uri}`);
    const { response: { docs } } = await request({
        headers: { Accept: 'application/json' },
        json: true,
        method: 'GET',
        uri,
    });

    for (const record of docs) {
        checkSpec(validateHgncSpec, record, rec => rec.hgnc_id);
    }
    const [gene] = docs;

    let hgnc;

    if (CACHE.SOURCE) {
        hgnc = CACHE.SOURCE;
    } else {
        hgnc = await conn.addSource(SOURCE_DEFN);
        CACHE.SOURCE = hgnc;
    }
    let ensembl;

    try {
        ensembl = await conn.getUniqueRecordBy({
            filters: { name: ensemblSourceName },
            target: 'Source',
        });
    } catch (err) { }
    const result = await uploadRecord({
        conn,
        deprecated: (
            paramType === 'prev_symbol' || paramType === 'prev_name'
        ),
        gene,
        sources: { ensembl, hgnc },
    });
    CACHE[paramType][symbol] = result;
    return result;
};

/**
 * Upload the HGNC genes and ensembl links
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    logger.info('loading the external HGNC data');
    const { filename, conn } = opt;
    logger.info(`loading: ${filename}`);
    const hgncContent = JSON.parse(fs.readFileSync(filename));
    const genes = hgncContent.response.docs;
    const hgnc = await conn.addSource(SOURCE_DEFN);
    let ensembl;

    try {
        ensembl = await conn.getUniqueRecordBy({
            filters: { name: ensemblSourceName },
            target: 'Source',
        });
    } catch (err) {
        logger.info('Unable to fetch ensembl source for linking records');
    }

    logger.info(`adding ${genes.length} feature records`);

    for (const gene of genes) {
        try {
            checkSpec(validateHgncSpec, gene, rec => rec.hgnc_id);
        } catch (err) {
            logger.error(err);
            continue;
        }

        if (gene.longName && gene.longName.toLowerCase().trim() === 'entry withdrawn') {
            continue;
        }
        await uploadRecord({ conn, gene, sources: { ensembl, hgnc } });
    }
};

module.exports = {
    SOURCE_DEFN, dependencies: [ensemblSourceName], ensemblSourceName, fetchAndLoadBySymbol, uploadFile, uploadRecord,
};
