/**
 * @module
 * @ignore
 */
const fetch = require('node-fetch');
const fs = require('fs');
const parse = require('csv-parse/lib/sync');
const xml2js = require('xml2js');
const sleep = require('sleep-promise');
const HTTP_STATUS_CODES = require('http-status-codes');
const jsonpath = require('jsonpath');
const crypto = require('crypto');
const stableStringify = require('json-stable-stringify');
const _ = require('lodash');

const { logger } = require('./logging');


const REQUESTS_CACHE = {};


const convertOwlGraphToJson = (graph, idParser = x => x) => {
    const initialRecords = {};

    for (const statement of graph.statements) {
        let src;

        try {
            src = idParser(statement.subject.value);
        } catch (err) {
            continue;
        }

        if (initialRecords[src] === undefined) {
            initialRecords[src] = { code: src };
        }
        if (initialRecords[src][statement.predicate.value] === undefined) {
            initialRecords[src][statement.predicate.value] = [];
        }
        initialRecords[src][statement.predicate.value].push(statement.object.value);
    }
    const nodesByCode = {};
    // const initialRecords = require(filename);

    // transform all NCIT codes to std format
    for (const record of Object.values(initialRecords)) {
        nodesByCode[record.code] = record;

        for (const predicate of Object.keys(record)) {
            if (typeof record[predicate] === 'object' && record[predicate] !== null) {
                const formatted = [];

                for (let item of record[predicate]) {
                    try {
                        item = idParser(item);
                    } catch (err) {
                        // ignore, will be unamed n\d+ nodes
                    }
                    formatted.push(item);
                }
                record[predicate] = formatted;
            }
        }
    }
    return nodesByCode;
};


const loadDelimToJson = async (filename, opt = {}) => {
    const { delim = '\t', header = true, ...rest } = opt;
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename, 'utf8');
    logger.info('parsing into json');
    const jsonList = parse(content, {
        auto_parse: true,
        columns: header,
        comment: '##',
        delimiter: delim,
        escape: null,
        quote: null,
        ...rest,
    });
    return jsonList;
};


const parseXmlToJson = (xmlContent, opts = {}) => new Promise((resolve, reject) => {
    xml2js.parseString(
        xmlContent,
        {
            emptyTag: null,
            mergeAttrs: true,
            normalize: true,
            trim: true,
            ...opts,
        },
        (err, result) => {
            if (err !== null) {
                logger.error(`xml parsing error: ${err}`);
                reject(err);
            } else {
                resolve(result);
            }
        },
    );
});


const loadXmlToJson = (filename, opts = {}) => {
    logger.info(`reading: ${filename}`);
    const xmlContent = fs.readFileSync(filename).toString();
    logger.info(`parsing: ${filename}`);
    return parseXmlToJson(xmlContent, opts);
};


class HTTPResponseError extends Error {
    constructor(response, ...args) {
        super(`HTTP Error Response: ${response.status} ${response.statusText}`, ...args);
        this.response = response;
        this.statusCode = response.status;
    }
}



const request = async ({
    body, uri, qs = {}, json = false, headers = {}, method = 'GET',
} = {}) => {
    const url = new URL(uri);
    Object.keys(qs).forEach(key => url.searchParams.append(key, qs[key]));

    let defaultHeaders = {};

    if (json) {
        defaultHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' };
    }
    const resp = await fetch(url, {
        body: JSON.stringify(body),
        headers: { ...defaultHeaders, ...headers },
        method,
    });

    if (resp.ok) {
        if (json) {
            const result = await resp.json();
            return result;
        }
        const result = await resp.text();
        return result;
    }
    const errorMessage = await resp.text();
    throw new HTTPResponseError(resp, `${resp.status} - ${resp.statusText} - ${errorMessage}`);
};


/**
 *  Try again for too many requests errors. Helpful for APIs with a rate limit (ex. pubmed)
 */
const requestWithRetry = async (requestOpt, { waitSeconds = 2, retries = 1, useCache = true } = {}) => {
    const reqId = stableStringify(requestOpt);

    if (useCache && REQUESTS_CACHE[reqId]) {
        return REQUESTS_CACHE[reqId];
    }

    try {
        const result = await request(requestOpt);

        if (useCache) {
            REQUESTS_CACHE[reqId] = result;
        }
        return result;
    } catch (err) {
        if (err.statusCode === HTTP_STATUS_CODES.TOO_MANY_REQUESTS && retries > 0) {
            await sleep(waitSeconds);
            logger.warn(`TIMEOUT, retrying request ${requestOpt.url}`);
            return requestWithRetry(requestOpt, { retries: retries - 1, waitSeconds });
        }
        throw err;
    }
};


const hashStringToId = input => crypto.createHash('md5').update(input).digest('hex');

const hashRecordToId = (input, propertyList = null) => {
    if (!propertyList) {
        return hashStringToId(stableStringify(input));
    }
    return hashStringToId(stableStringify(_.pick(input, propertyList)));
};


const shallowObjectKey = obj => JSON.stringify(obj, (k, v) => (k
    ? `${v}`
    : v));


const checkSpec = (spec, record, idGetter = rec => rec.id) => {
    if (!spec(record)) {
        throw new Error(`Spec Validation failed for ${
            idGetter(record)
        } #${
            spec.errors[0].dataPath
        } ${
            spec.errors[0].message
        } found '${
            shallowObjectKey(jsonpath.query(record, `$${spec.errors[0].dataPath}`))
        }'`);
    }
    return true;
};

/**
 * Remap object property names and return the object
 */
const convertRowFields = (header, row) => {
    const result = {};

    for (const [name, col] of Object.entries(header)) {
        result[name] = row[col];
    }
    return result;
};


module.exports = {
    checkSpec,
    convertOwlGraphToJson,
    convertRowFields,
    hashRecordToId,
    hashStringToId,
    loadDelimToJson,
    loadXmlToJson,
    parseXmlToJson,
    request,
    requestWithRetry,
};
