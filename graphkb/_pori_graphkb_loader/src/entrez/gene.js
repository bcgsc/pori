/**
 * Loader module for the entrez gene utility
 * @module importer/entrez/gene
 */
const Ajv = require('ajv');

const { checkSpec } = require('../util');
const util = require('./util');
const { entrezGene: SOURCE_DEFN } = require('../sources');

const ajv = new Ajv();

const CACHE = {};
const SEARCH_CACHE = {};
const DB_NAME = 'gene';
const LINK_URL = 'https://www.ncbi.nlm.nih.gov/gene';
const MAX_CONSEC = 100;

const recordSpec = ajv.compile({
    properties: {
        description: { type: 'string' },
        name: { type: 'string' },
        summary: { type: 'string' },
        uid: { pattern: '^\\d+$', type: 'string' },
    },
    required: ['uid', 'name'],
    type: 'object',
});

/**
 * Given an gene record retrieved from entrez, parse it into its equivalent
 * GraphKB representation
 */
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    return {
        biotype: 'gene',
        description: record.summary,
        displayName: record.name,
        longName: record.description,
        name: record.name,
        sourceId: record.uid,
        url: `${LINK_URL}/${record.uid}`,
    };
};


/**
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of gene IDs
 */
const fetchAndLoadGeneByIds = async (api, idListIn) => util.fetchAndLoadByIds(
    api,
    idListIn,
    {
        MAX_CONSEC,
        cache: CACHE,
        dbName: DB_NAME,
        parser: parseRecord,
        sourceDefn: SOURCE_DEFN,
        target: 'Feature',
    },
);

/**
 * Given a gene symbol, search the genes and upload the resulting records to graphkb
 * @param {ApiConnection} api connection to GraphKB
 * @param {string} symbol the gene symbol
 */
const fetchAndLoadBySearchTerm = async (api, term, termType = 'Preferred Symbol', fallbackTermType = null) => {
    const cacheKey = `${termType}:${term}`;

    if (SEARCH_CACHE[cacheKey]) {
        return SEARCH_CACHE[cacheKey];
    }
    let result = await util.fetchAndLoadBySearchTerm(
        api,
        `${term}[${termType}] AND human[ORGN] AND alive[prop]`,
        {
            MAX_CONSEC,
            cache: CACHE,
            dbName: DB_NAME,
            parser: parseRecord,
            sourceDefn: SOURCE_DEFN,
            target: 'Feature',
        },
    );

    // fallback to gene name
    if (result.length === 0 && fallbackTermType) {
        result = await util.fetchAndLoadBySearchTerm(
            api,
            `${term}[${fallbackTermType}] AND human[ORGN] AND alive[prop]`,
            {
                MAX_CONSEC,
                cache: CACHE,
                dbName: DB_NAME,
                parser: parseRecord,
                sourceDefn: SOURCE_DEFN,
                target: 'Feature',
            },
        );
    }
    SEARCH_CACHE[cacheKey] = result;
    return SEARCH_CACHE[cacheKey];
};


const preLoadCache = async api => util.preLoadCache(
    api,
    {
        cache: CACHE, sourceDefn: SOURCE_DEFN, target: 'Feature',
    },
);

const fetchAndLoadBySymbol = async (api, term) => fetchAndLoadBySearchTerm(api, term, 'Preferred Symbol', 'Gene Name');


module.exports = {
    SOURCE_DEFN,
    fetchAndLoadByIds: fetchAndLoadGeneByIds,
    fetchAndLoadBySearchTerm,
    fetchAndLoadBySymbol,
    parseRecord,
    preLoadCache,
};
