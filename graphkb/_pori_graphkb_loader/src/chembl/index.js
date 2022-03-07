/**
 * Load therapy recrods from CHEMBL
 */
const Ajv = require('ajv');

const {
    checkSpec, requestWithRetry,
} = require('../util');
const {
    rid, generateCacheKey,
} = require('../graphkb');
const { logger } = require('../logging');
const { chembl: SOURCE_DEFN } = require('../sources');
const spec = require('./spec.json');

const ajv = new Ajv();

const recordSpec = ajv.compile(spec);


const API = 'https://www.ebi.ac.uk/chembl/api/data/molecule';

const CACHE = {};


/**
 * fetch drug by chemblId and load it into GraphKB
 * @param {ApiConnection} conn
 * @param {string} drugId
 */
const fetchAndLoadById = async (conn, drugId) => {
    const cacheKey = generateCacheKey({ sourceId: drugId });

    if (CACHE[cacheKey]) {
        return CACHE[cacheKey];
    }
    logger.info(`loading: ${API}/${drugId}`);
    const chemblRecord = await requestWithRetry({
        json: true,
        uri: `${API}/${drugId}`,
    });
    checkSpec(recordSpec, chemblRecord);

    if (!CACHE.SOURCE) {
        CACHE.SOURCE = await conn.addSource(SOURCE_DEFN);
    }
    const source = rid(CACHE.SOURCE);

    const content = {
        name: chemblRecord.pref_name,
        source,
        sourceId: chemblRecord.molecule_chembl_id,
    };

    if (content.name) {
        content.displayName = `${content.name} [${content.sourceId.toUpperCase()}]`;
    } else {
        content.displayName = content.sourceId.toUpperCase();
    }

    if (chemblRecord.molecule_properties && chemblRecord.molecule_properties.full_molformula) {
        content.molecularFormula = chemblRecord.molecule_properties.full_molformula;
    }

    const record = await conn.addRecord({
        content,
        existsOk: true,
        fetchConditions: { AND: [{ name: content.name }, { source }, { sourceId: content.sourceId }] },
        target: 'Therapy',
    });

    CACHE[cacheKey] = record;

    if (chemblRecord.usan_stem_definition) {
        try {
            const parent = await conn.addRecord({
                content: {
                    comment: 'usan stem definition',
                    name: chemblRecord.usan_stem_definition,
                    source,
                    sourceId: chemblRecord.usan_stem_definition,
                },
                existsOk: true,
                target: 'Therapy',
            });

            await conn.addRecord({
                content: {
                    in: rid(parent),
                    out: rid(record),
                    source,
                },
                existsOk: true,
                target: 'SubClassOf',
            });
        } catch (err) {}
    }
    return record;
};


const preLoadCache = async (api) => {
    const records = await api.getRecords({
        filters: {
            AND: [
                { source: { filters: { name: SOURCE_DEFN.name }, target: 'Source' } },
                { dependency: null },
                { deprecated: false },
            ],
        },
        target: 'Therapy',
    });

    const dups = new Set();

    for (const record of records) {
        const cacheKey = generateCacheKey(record);

        if (CACHE[cacheKey]) {
            // duplicate
            dups.add(cacheKey);
        }
        CACHE[cacheKey] = record;
    }
    Array(dups).forEach((key) => {
        delete CACHE[key];
    });
    logger.info(`cache contains ${Object.keys(CACHE).length} keys`);
};


module.exports = {
    SOURCE_DEFN,
    fetchAndLoadById,
    preLoadCache,
};
