/**
 * @module importer/entrez/pubmed
 */
const Ajv = require('ajv');

const { checkSpec } = require('../util');
const { fetchByIdList, uploadRecord, preLoadCache: preLoadAnyCache } = require('./util');

const ajv = new Ajv();
const LINK_URL = 'https://pubmed.ncbi.nlm.nih.gov';

const { pubmed: SOURCE_DEFN } = require('../sources');

const DB_NAME = 'pubmed';
const CACHE = {};

const recordSpec = ajv.compile({
    properties: {
        fulljournalname: { type: 'string' },
        sortdate: { type: 'string' },
        sortpubdate: { type: 'string' },
        title: { type: 'string' },
        uid: { pattern: '^\\d+$', type: 'string' },
    },
    required: ['uid', 'title'],
    type: 'object',
});

/**
 * Given an record record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    const parsed = {
        name: record.title,
        sourceId: record.uid,
        url: `${LINK_URL}/${record.uid}`,
    };

    if (record.fulljournalname) {
        parsed.journalName = record.fulljournalname;
    }

    // sortpubdate: '1992/06/01 00:00'
    if (record.sortpubdate) {
        const match = /^(\d\d\d\d)\//.exec(record.sortpubdate);

        if (match) {
            parsed.year = parseInt(match[1], 10);
        }
    } else if (record.sortdate) {
        const match = /^(\d\d\d\d)\//.exec(record.sortdate);

        if (match) {
            parsed.year = parseInt(match[1], 10);
        }
    }
    return parsed;
};


const createDisplayName = sourceId => `pmid:${sourceId}`;


/**
 * Given some list of pubmed IDs, return if cached,
 * If they do not exist, grab from the pubmed api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of pubmed IDs
 */
const fetchAndLoadByIds = async (api, idListIn, opt = {}) => {
    const pmcIds = idListIn.filter(id => /^pmc\d+$/i.exec(id)).map(id => id.replace(/^pmc/i, ''));
    const records = await fetchByIdList(
        idListIn.filter(id => !/^pmc\d+$/i.exec(id)),
        {
            cache: CACHE, db: DB_NAME, parser: parseRecord,
        },
    );
    records.push(...await fetchByIdList(
        pmcIds,
        {
            cache: CACHE, db: 'pmc', dbfrom: DB_NAME, parser: parseRecord,
        },
    ));
    return Promise.all(records.map(
        async record => uploadRecord(api, record, {
            ...opt,
            cache: CACHE,
            createDisplayName,
            sourceDefn: SOURCE_DEFN,
            target: 'Publication',
        }),
    ));
};

const preLoadCache = async api => preLoadAnyCache(
    api,
    {
        cache: CACHE, sourceDefn: SOURCE_DEFN, target: 'Publication',
    },
);


module.exports = {
    SOURCE_DEFN,
    fetchAndLoadByIds,
    parseRecord,
    preLoadCache,
};
