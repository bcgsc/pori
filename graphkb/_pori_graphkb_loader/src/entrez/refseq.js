/**
 * @module importer/entrez/refseq
 */
const Ajv = require('ajv');
const _ = require('lodash');
const pLimit = require('p-limit');


const {
    fetchByIdList, uploadRecord, preLoadCache: preLoadAnyCache, fetchAndLoadBySearchTerm: search,
} = require('./util');
const { checkSpec } = require('../util');
const { rid } = require('../graphkb');
const { refseq: SOURCE_DEFN } = require('../sources');
const { logger } = require('../logging');


const ajv = new Ajv();

const CONCURENCY_LIMIT = 100;
const DB_NAME = 'nucleotide';
const CACHE = {};

const recordSpec = ajv.compile({
    properties: {
        accessionversion: { pattern: '^N[A-Z]_\\d+\\.\\d+$', type: 'string' },
        biomol: { enum: ['genomic', 'rna', 'peptide', 'mRNA'], type: 'string' },
        replacedby: { type: 'string' },
        status: { type: 'string' },
        subname: { type: 'string' },
        title: { type: 'string' },
    },
    required: ['title', 'biomol', 'accessionversion'],
    type: 'object',
});

/**
 * Given an record record retrieved from refseq, parse it into its equivalent
 * GraphKB representation
 */
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    const [sourceId, sourceIdVersion] = record.accessionversion.split('.');
    let biotype = 'transcript';

    if (record.biomol === 'genomic') {
        biotype = 'chromosome';
    } else if (record.biomol === 'peptide') {
        biotype = 'protein';
    }
    const parsed = {
        biotype,
        displayName: record.accessionversion.toUpperCase(),
        longName: record.title,
        sourceId,
        sourceIdVersion: sourceIdVersion || null,
    };

    if (biotype === 'chromosome') {
        parsed.name = record.subname;
    }
    return parsed;
};


/**
 * Given some list of refseq IDs, return if cached,
 * If they do not exist, grab from the refseq graphkbConn
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of IDs
 */
const fetchAndLoadByIds = async (api, idListIn) => {
    const versionedIds = [];
    const unversionedIds = [];
    idListIn.forEach((id) => {
        if (/\.\d+$/.exec(id)) {
            versionedIds.push(id);
        } else {
            unversionedIds.push(id);
        }
    });
    const records = [];

    if (versionedIds.length > 0) {
        const fullRecords = await fetchByIdList(
            versionedIds,
            {
                cache: CACHE, db: DB_NAME, parser: parseRecord,
            },
        );
        records.push(...fullRecords);
    }

    if (unversionedIds.length > 0) {
        const fullRecords = await fetchByIdList(
            unversionedIds,
            {
                cache: CACHE, db: DB_NAME, parser: parseRecord,
            },
        );
        fullRecords.forEach((rec) => {
            const simplified = _.omit(rec, ['sourceIdVersion', 'longName', 'description']);
            simplified.displayName = simplified.sourceId.toUpperCase();
            records.push({ ...simplified, sourceIdVersion: null });
        });
    }
    logger.verbose(`uploading ${records.length} records`);

    const limit = pLimit(CONCURENCY_LIMIT);
    const result = await Promise.all(records.map(rec => limit(() => uploadRecord(api, rec, {
        cache: CACHE,
        sourceDefn: SOURCE_DEFN,
        target: 'Feature',
    }))));

    // for versioned records link to the unversioned version
    await Promise.all(result
        .filter(r => (r.sourceIdVersion !== undefined && r.sourceIdVersion !== null))
        .map((record) => {
            const linkRecords = async () => {
                const unversioned = await api.addRecord({
                    content: {
                        biotype: record.biotype,
                        description: record.description,
                        displayName: record.sourceId.toUpperCase(),
                        longName: record.longName,
                        name: record.name,
                        source: rid(record.source),
                        sourceId: record.sourceId,
                        sourceIdVersion: null,
                    },
                    existsOk: true,
                    fetchConditions: {
                        AND: [
                            { name: record.name },
                            { source: rid(record.source) },
                            { sourceId: record.sourceId },
                            { sourceIdVersion: null },
                        ],
                    },
                    target: 'Feature',
                });
                await api.addRecord({
                    content: { in: rid(record), out: rid(unversioned), source: record.source },
                    existsOk: true,
                    target: 'GeneralizationOf',
                });
            };
            return limit(() => linkRecords);
        }));

    return result;
};


const preLoadCache = async api => preLoadAnyCache(
    api,
    {
        cache: CACHE, sourceDefn: SOURCE_DEFN, target: 'Feature',
    },
);


const fetchAndLoadBySearchTerm = (api, term, opt = {}) => search(api, term, {
    ...opt,
    cache: CACHE,
    dbName: DB_NAME,
    parser: parseRecord,
    sourceDefn: SOURCE_DEFN,
    target: 'Feature',
});

const cacheHas = key => Boolean(CACHE[key]);


module.exports = {
    SOURCE_DEFN,
    cacheHas,
    fetchAndLoadByIds,
    fetchAndLoadBySearchTerm,
    parseRecord,
    preLoadCache,
};
