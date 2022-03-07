/**
 * Credit: https://github.com/griffithlab/civic-server/blob/staging/lib/scrapers/asco.rb
 *
 * This was only possible to put together both thanks to ASCO and previous loader work done for the CIViC DB
 */
const Ajv = require('ajv');

const { requestWithRetry, checkSpec } = require('../util');
const { asco: SOURCE_DEFN } = require('../sources');
const { logger } = require('../logging');
const { rid } = require('../graphkb');
const { main: mainSpec, details: detailsSpec } = require('./specs.json');

const CACHE = {};


const ajv = new Ajv();
const validateMainSpec = ajv.compile(mainSpec);
const validateDetailsSpec = ajv.compile(detailsSpec);


/**
 * Fetch the DOI and citation
 * @param {string} ascoAbstractId
 */
const getAbstractDetails = async (ascoAbstractId) => {
    const url = 'https://ml-couch.asco.org/abstracts';
    const resp = await requestWithRetry({
        headers: { Accept: 'application/json' },
        json: true,
        method: 'GET',
        uri: `${url}/${ascoAbstractId}`,
    });
    checkSpec(validateDetailsSpec, resp);
    return { citation: resp.SiteCitation, doi: resp.DOI };
};


/**
 * ASCO returns multiple records for the same abstract, pick one
 */
const collapseAbstractDups = (abstracts) => {
    const absKey = a => JSON.stringify({ key: [a.AbstID, a.Year, a.Meeting, a.Title, a.FirstAuthor] });
    const fillScore = a => Object.values(a).filter(v => v !== undefined && v !== null && v !== '').length;

    const dups = {};

    for (const abs of abstracts) {
        const key = absKey(abs);

        if (dups[key] === undefined) {
            dups[key] = [];
        }
        dups[key].push(abs);
    }
    const result = [];

    for (const key of Object.keys(dups)) {
        if (dups[key].length < 2) {
            result.push(...dups[key]);
        } else {
            // decide between dups
            dups[key].sort((a, b) => (fillScore(a) - fillScore(b))).reverse();
            result.push(dups[key][0]);
        }
    }
    return result;
};


const pageAbstractsRequests = async (opt) => {
    let start = 0,
        maxRecords = null;
    const abstracts = [];

    while (maxRecords === null || start < maxRecords) {
        const qs = Object.entries(opt.qs).map(([k, v]) => `${k}=${v}`).join('&');
        logger.info(`requesting abstracts from ASCO: ${opt.uri}?${qs} start=${start}`);
        const { response: { docs, numFound } } = await requestWithRetry({
            ...opt,
            qs: { ...opt.qs, start },
        });

        if (maxRecords === null) {
            maxRecords = numFound;
        }
        start += docs.length;

        abstracts.push(...docs);
    }
    return abstracts;
};


/**
 * Fetch a list of abtracts from ASCO and load their citation information into GraphKB
 *
 * @param {ApiConnection} conn the GraphKB API connection object
 * @param {string[]} idList the list of abstract IDs to fetch
 * @param {boolean} ignoreCache if true then try to load all IDs from ASCO rather than skipping those already in GraphKB
 */
const fetchAndLoadByIds = async (conn, idList = []) => {
    const url = 'https://solr.asco.org/solr/ml/select';
    const abstracts = [];

    if (!CACHE._source) {
        CACHE._source = await conn.addSource(SOURCE_DEFN);
    }
    const source = CACHE._source;

    if (idList.length) {
        for (const id of idList) {
            logger.info(`fetching abstracts (${id})`);
            // loop to avoid ddos external API
            const docs = await pageAbstractsRequests({
                headers: { Accept: 'application/json' },
                json: true,
                method: 'GET',
                qs: {
                    _format: 'json',
                    q: `(AbstID:${id})`,
                    wt: 'json',
                },
                uri: url,
            });

            abstracts.push(...docs);
        }
    } else {
        logger.info('fetching all abstracts');
        // loop to avoid ddos external API
        const docs = await pageAbstractsRequests({
            headers: { Accept: 'application/json' },
            json: true,
            method: 'GET',
            qs: {
                _format: 'json',
                wt: 'json',
            },
            uri: url,
        });

        abstracts.push(...docs);
    }

    // now uplolad the newly fetched records into GraphKB
    logger.info(`uploading ${abstracts.length} abstracts to GraphKB`);
    const records = [];

    for (const abstract of collapseAbstractDups(abstracts)) {
        checkSpec(validateMainSpec, abstract);
        // fetch the DOI/citation data for each
        const details = getAbstractDetails(abstract.id);
        const content = {
            ...details,
            abstractNumber: abstract.AbstID,
            authors: abstract.AuthorString,
            displayName: `${abstract.Meeting} (abstract ${abstract.AbstID})`,
            meeting: abstract.Meeting,
            name: abstract.Title,
            source: rid(source),
            sourceId: abstract.id,
            url: abstract.url,
            year: abstract.Year,
        };
        const record = await conn.addRecord({
            content,
            existsOk: true,
            fetchConditions: {
                AND: [ // abstract number and meeting name have a unique index on them
                    { abstractNumber: content.abstractNumber },
                    { source: rid(source) },
                    { year: Number.parseInt(content.year, 10) },
                    { meeting: content.meeting },
                ],
            },
            target: 'Abstract',
            upsert: true,
        });
        records.push(record);
    }
    return records;
};


const upload = async ({ conn }) => {
    const source = await conn.addSource(SOURCE_DEFN);
    CACHE._source = source;

    await fetchAndLoadByIds(conn);
    logger.info(`${JSON.stringify(conn.getCreatedCounts())}`);
};


module.exports = { fetchAndLoadByIds, upload };
