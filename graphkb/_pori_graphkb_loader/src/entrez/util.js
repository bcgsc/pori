/**
 * @module importer/entrez/util
 */

const {
    requestWithRetry, orderPreferredOntologyTerms,
} = require('../util');
const { rid, generateCacheKey } = require('../graphkb');
const { logger } = require('../logging');


const DEFAULT_QS = {
    retmode: 'json',
    rettype: 'docsum',
};

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const BASE_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const BASE_FETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const MAX_CONSEC_IDS = 150;


/**
 * pull records from a cache where stored, return leftoever id's otherwise
 * @param {Array.<string>} rawIdList array of sourceIds to pull records from a cache by
 * @param {object} cache the cache to pull from
 */
const pullFromCacheById = (rawIdList, cache) => {
    const idList = Array.from(new Set(Array.from(rawIdList, id => `${id}`.toLowerCase().trim())));
    const cached = [];
    const remaining = [];

    for (const id of idList) {
        if (cache[id]) {
            cached.push(cache[id]);
        } else {
            remaining.push(id);
        }
    }
    return { cached, remaining };
};


/**
 * Given some list of pumbed Ids, fetch the minimal parsed aricle summaries
 * @param {Array.<string>} pmidListIn list of pubmed ids
 * @param {object} opt
 * @param {string} [opt.url=BASE_URL] the base url for the pubmed api
 * @param {string} [opt.db='pubmed'] the entrez database name
 * @param {function} opt.parser the parser function to transform the entrez record to a graphkb record
 * @param {object} [opt.cache={}] the cache associated with calls to this db
 * @param {string} [opt.dbfrom=null] if querying by a linked ID must include the db you wish to retrieve from
 */
const fetchByIdList = async (rawIdList, opt) => {
    const {
        url = BASE_URL, db = 'pubmed', parser, cache = {}, dbfrom = null,
    } = opt;

    if (rawIdList.length === 0) {
        return [];
    }
    rawIdList = Array.from(new Set(rawIdList));
    const { cached: allRecords, remaining: idList } = pullFromCacheById(rawIdList, cache);

    for (let startIndex = 0; startIndex < idList.length; startIndex += MAX_CONSEC_IDS) {
        const idListString = idList
            .slice(startIndex, startIndex + MAX_CONSEC_IDS)
            .map(id => id.toString())
            .join(',');

        const queryParams = { ...DEFAULT_QS, db, id: idListString };

        if (dbfrom) {
            queryParams.dbfrom = dbfrom;
        }

        logger.debug(`loading: ${url}?db=${db}`);
        const { result, error } = await requestWithRetry({
            headers: { Accept: 'application/json' },
            json: true,
            method: 'GET',
            qs: queryParams,
            uri: url,
        });

        if (error) {
            logger.error(error);
        }

        const records = [];
        Object.keys(result).filter(k => k !== 'uids').forEach((key) => {
            const rec = result[key];

            try {
                records.push(parser(rec));
            } catch (err) {
                logger.error(err);
            }
        });
        allRecords.push(...records);
    }

    return allRecords;
};

/**
 * Given some pubmed ID, get the corresponding record from GraphKB
 */
const fetchRecord = async (api, {
    sourceId, sourceIdVersion = null, db = 'pubmed', target = 'Publication', cache = {},
}) => {
    const cacheKey = generateCacheKey({ sourceId, sourceIdVersion });

    if (cache[cacheKey]) {
        return cache[cacheKey];
    }
    const record = await api.getUniqueRecordBy({
        filters: {
            AND: [
                { sourceId },
                { sourceIdVersion },
                { source: { filters: { name: db }, target: 'Source' } },
            ],
        },
        sort: orderPreferredOntologyTerms,
        target,
    });
    cache[cacheKey] = record;
    return record;
};


/**
 * Given the parsed content of some recrod, upload to the api
 * @param {object} content the record contents to be uploaded
 * @param {object} opt
 * @param {boolean} opt.cache add the GraphKB record to the cache
 * @param {boolean} opt.fetchFirst attempt to get the record by source Id before uploading it
 * @param {string} opt.target
 * @param {object} opt.sourceDefn
 * @param {function} opt.createDisplayName
 */
const uploadRecord = async (api, content, opt = {}) => {
    const {
        cache = false,
        fetchFirst = true,
        target = 'Publication',
        sourceDefn,
        upsert = false,
        createDisplayName,
    } = opt;

    const { sourceId, sourceIdVersion } = content;

    const cacheKey = generateCacheKey({ sourceId, sourceIdVersion });

    if (cache && cache[cacheKey]) {
        return cache[cacheKey];
    }

    let source = cache.__source;

    if (!source) {
        source = await api.addSource(sourceDefn);

        if (cache) {
            cache.__source = source;
        }
    }

    if (fetchFirst) {
        try {
            const record = await api.getUniqueRecordBy({
                filters: {
                    AND: [
                        { sourceId },
                        { source: rid(source) },
                        { sourceIdVersion: sourceIdVersion || null },
                    ],
                },
                target,
            });

            if (cache) {
                cache[cacheKey] = record;
            }
            return record;
        } catch (err) { }
    }

    const formattedContent = {
        ...content,
        source: rid(source),
    };

    if (createDisplayName) {
        formattedContent.displayName = createDisplayName(content.sourceId);
    }

    const result = await api.addRecord({
        content: formattedContent,
        existsOk: true,
        fetchConditions: {
            AND: [
                { sourceId },
                { source: rid(source) },
                { sourceIdVersion: sourceIdVersion || null },
            ],
        },
        target,
        upsert,
    });

    if (cache) {
        cache[cacheKey] = result;
    }
    return result;
};


const preLoadCache = async (api, { sourceDefn, cache, target }) => {
    const records = await api.getRecords({
        filters: {
            AND: [
                { source: { filters: { name: sourceDefn.name }, target: 'Source' } },
                { dependency: null },
                { deprecated: false },
            ],
        },
        neighbors: 0,
        target,
    });

    const dups = new Set();

    for (const record of records) {
        const cacheKey = generateCacheKey(record);

        if (cache[cacheKey]) {
            // duplicate
            dups.add(cacheKey);
        }
        cache[cacheKey] = record;
    }
    Array(dups).forEach((key) => {
        delete cache[key];
    });
    logger.info(`cache contains ${Object.keys(cache).length} keys`);
};

/**
 * Given some list of pubmed IDs, return if cached,
 * If they do not exist, grab from the pubmed api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idListIn list of pubmed IDs
 * @param {Object} opt
 * @param {string} opt.dbName name of the entrez db to pull from ex. gene
 * @param {function} opt.parser function to convert records from the api to the graphkb format
 * @param {object} opt.cache
 * @param {number} opt.MAX_CONSEC maximum consecutive records to upload at once
 * @param {string} opt.target the graphkb api target to upload to
 * @param {object} opt.sourceDefn the object with the source information
 */
const fetchAndLoadByIds = async (api, idListIn, {
    dbName, parser, cache, MAX_CONSEC = 100, target, sourceDefn,
}) => {
    const records = await fetchByIdList(
        idListIn,
        {
            cache, db: dbName, parser,
        },
    );
    const result = [];
    let queue = records;

    while (queue.length > 0) {
        const current = queue.slice(0, MAX_CONSEC);
        queue = queue.slice(MAX_CONSEC);
        const newRecords = await Promise.all(current.map(
            async record => uploadRecord(api, record, {
                cache,
                sourceDefn,
                target,
            }),
        ));
        result.push(...newRecords);
    }
    return result;
};

/**
 * ex. https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?retmode=json&db=gene&rettype=docsum&term=kras[sym]
 *
 * @param {ApiConnection} api graphkb api connection
 * @param {string} term the search term ex. kras[sym]
 * @param {Object} opt
 * @param {string} opt.dbName name of the entrez db to pull from ex. gene
 * @param {function} opt.parser function to convert records from the api to the graphkb format
 * @param {object} opt.cache
 * @param {number} opt.MAX_CONSEC maximum consecutive records to upload at once
 * @param {string} opt.target the graphkb api target to upload to
 * @param {object} opt.sourceDefn the object with the source information
 */
const fetchAndLoadBySearchTerm = async (api, term, opt) => {
    const { dbName } = opt;
    // get the list of ids
    logger.info(`searching ${BASE_SEARCH_URL}?db=${dbName}&term=${term}`);
    const { esearchresult: { idlist } } = await requestWithRetry({
        headers: { Accept: 'application/json' },
        json: true,
        method: 'GET',
        qs: { ...DEFAULT_QS, db: dbName, term },
        uri: BASE_SEARCH_URL,
    });
    return fetchAndLoadByIds(api, idlist, opt);
};


module.exports = {
    BASE_FETCH_URL,
    BASE_URL,
    DEFAULT_QS,
    fetchAndLoadByIds,
    fetchAndLoadBySearchTerm,
    fetchByIdList,
    fetchRecord,
    preLoadCache,
    pullFromCacheById,
    uploadRecord,
};
