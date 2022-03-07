/**
 *
 * Given the DOID JSON file. Upload the diseases and relationships to the knowledgebase using the REST API
 *
 * @module importer/disease_ontology
 */
const Ajv = require('ajv');
const fs = require('fs');

const { checkSpec } = require('../util');
const { rid, orderPreferredOntologyTerms, edgeExists } = require('../graphkb');
const { logger } = require('../logging');
const { diseaseOntology: SOURCE_DEFN, ncit: { name: ncitName } } = require('../sources');
const { node: nodeSpecDefn, edge: edgeSpecDefn } = require('./specs.json');

const PREFIX_TO_STRIP = 'http://purl.obolibrary.org/obo/';
const ajv = new Ajv();
const nodeSpec = ajv.compile(nodeSpecDefn);
const edgeSpec = ajv.compile(edgeSpecDefn);


const parseDoid = (ident) => {
    const match = /.*(DOID_\d+)$/.exec(ident);

    if (!match) {
        throw new Error(`invalid DOID: ${ident}`);
    }
    return match[1].replace('_', ':').toLowerCase();
};


const parseNodeRecord = (record) => {
    checkSpec(nodeSpec, record);
    const {
        id,
        lbl,
        meta: {
            deprecated = false,
            definition: { val: description } = {},
            subsets = [],
            synonyms = [],
            basicPropertyValues = [],
            xrefs = [],
        } = {},
    } = record;

    const hasDeprecated = [];
    const name = lbl.toLowerCase().trim();

    for (const { val, pred } of basicPropertyValues) {
        if (pred.toLowerCase().endsWith('#hasalternativeid')) {
            hasDeprecated.push(val);
        }
    }

    const ncitLinks = [];

    for (const { val: other } of xrefs) {
        let match;

        if (match = /^NCI:(C\d+)$/.exec(other)) {
            ncitLinks.push(`${match[1].toLowerCase()}`);
        }
    }

    const aliases = [];

    for (const { val: alias } of synonyms || []) {
        if (alias.toLowerCase().trim() !== name) {
            aliases.push(alias.toLowerCase().trim());
        }
    }

    return {
        aliases: aliases.filter(a => a !== name),
        deprecated,
        description,
        hasDeprecated,
        name,
        ncitLinks,
        sourceId: parseDoid(id),
        subsets: subsets.map(subset => subset.replace(PREFIX_TO_STRIP, '')),
    };
};


/* now add the edges to the kb
{
  "sub" : "http://purl.obolibrary.org/obo/DOID_5039",
  "pred" : "is_a",
  "obj" : "http://purl.obolibrary.org/obo/DOID_461"
}
*/
const loadEdges = async ({
    DOID, records, conn, source,
}) => {
    logger.info('adding the subclass relationships');
    const counts = {
        error: 0, exists: 0, skip: 0, success: 0,
    };

    for (const edge of DOID.graphs[0].edges) {
        const { sub, pred, obj } = edge;

        if (pred === 'is_a') { // currently only loading this class type
            let src,
                tgt;

            try {
                checkSpec(edgeSpec, edge);
                src = parseDoid(sub).toLowerCase();
                tgt = parseDoid(obj).toLowerCase();

                if (edgeExists(records[src], records[tgt], 'SubClassOf')) {
                    counts.exists++;
                    continue;
                }
                logger.info(`processing is_a edge from ${src} to ${tgt}`);


                if (records[src] && records[tgt]) {
                    await conn.addRecord({
                        content: {
                            in: records[tgt]['@rid'],
                            out: records[src]['@rid'],
                            source,
                        },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'SubclassOf',
                    });
                    counts.success++;
                } else {
                    logger.warn(`skipping edge missing one of node records: ${src} or ${tgt}`);
                    counts.skip++;
                }
            } catch (err) {
                logger.warn(err);
                counts.error++;
                continue;
            }
        }
    }
    logger.info(`edge counts: ${JSON.stringify(counts)}`);
};

/**
 * Parses the disease ontology json for disease definitions, relationships to other DO diseases and relationships to NCI disease terms
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input JSON file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({
    filename, conn, ignoreCache = false, maxRecords,
}) => {
    // load the DOID JSON
    logger.info('loading external disease ontology data');
    const DOID = JSON.parse(fs.readFileSync(filename));

    // build the disease ontology first
    const nodesByName = {}; // store by name

    let source = await conn.addSource(SOURCE_DEFN);
    source = rid(source);
    logger.info(`processing ${DOID.graphs[0].nodes.length} nodes`);
    const recordsBySourceId = {};

    const ncitCache = {};

    try {
        const ncitSource = await conn.getUniqueRecordBy({
            filters: { name: ncitName },
            target: 'Source',
        });
        logger.info(`fetched ncit source record ${rid(ncitSource)}`);
        logger.info('getting existing ncit records');
        const ncitRecords = await conn.getRecords({
            filters: { AND: [{ source: rid(ncitSource) }, { alias: false }] },
            neighbors: 0,
            target: 'Disease',
        });
        logger.info(`cached ${ncitRecords.length} ncit records`);

        for (const record of ncitRecords.sort(orderPreferredOntologyTerms).reverse()) {
            ncitCache[record.sourceId] = rid(record);
        }
    } catch (err) {
        logger.error(err);
    }

    const counts = {
        error: 0, exists: 0, skip: 0, success: 0,
    };
    const doCache = {};

    const doCacheKeyFunction = rec => JSON.stringify([
        rec.sourceId.toLowerCase(),
        (rec.sourceIdVersion || '').toLowerCase(),
        (rec.name || '').toLowerCase(),
        rec.alias || false,
        rec.deprecated || false,
    ]);

    logger.info('fetching previously entered DO records');
    const previousRecords = await conn.getRecords({
        filters: { source },
        neighbors: 0,
        target: 'Disease',
    });
    logger.info(`found ${previousRecords.length} previously entered disease ontology records`);

    for (const previousRecord of previousRecords) {
        doCache[doCacheKeyFunction(previousRecord)] = previousRecord;
    }

    for (let i = 0; i < DOID.graphs[0].nodes.length; i++) {
        if (maxRecords && i > maxRecords) {
            logger.warn(`not loading all content due to max records limit (${maxRecords})`);
            break;
        }
        const node = DOID.graphs[0].nodes[i];
        logger.info(`processing ${node.id} (${i} / ${DOID.graphs[0].nodes.length})`);
        let row;

        try {
            row = parseNodeRecord(node);
        } catch (err) {
            logger.error(err);
            counts.error++;
            continue;
        }

        const {
            name,
            sourceId,
            description,
            deprecated,
            subsets,
            aliases,
            hasDeprecated,
            ncitLinks,
        } = row;

        if (nodesByName[name] !== undefined) {
            throw new Error(`name is not unique ${name}`);
        }

        // create the database entry
        let record;
        const mainContent = {
            alias: false,
            deprecated,
            description,
            name,
            source,
            sourceId,
            subsets,
        };

        if (!ignoreCache && doCache[doCacheKeyFunction(mainContent)]) {
            record = doCache[doCacheKeyFunction(mainContent)];
        } else {
            record = await conn.addRecord({
                content: mainContent,
                existsOk: true,
                fetchConditions: {
                    AND: [
                        { sourceId }, { name }, { source },
                    ],
                },
                fetchFirst: true,
                target: 'Disease',
                upsert: true,
                upsertCheckExclude: ['sourceIdVersion', 'subsets'],
            });
        }
        counts.success++;

        if (recordsBySourceId[record.sourceId] !== undefined) {
            throw new Error(`sourceID is not unique: ${record.sourceId}`);
        }
        recordsBySourceId[record.sourceId] = record;

        // create synonyms and links
        for (const alias of aliases) {
            const content = {
                alias: true,
                name: alias,
                source,
                sourceId: record.sourceId,
            };

            if (!ignoreCache && doCache[doCacheKeyFunction(content)]) {
                continue;
            }

            try {
                const synonym = await conn.addRecord({
                    content,
                    existsOk: true,
                    fetchConditions: {
                        AND: [
                            { name: alias },
                            { source },
                            { sourceId: record.sourceId },
                        ],
                    },
                    target: 'Disease',
                    upsert: true,
                    upsertCheckExclude: ['sourceIdVersion', 'subsets'],
                });
                await conn.addRecord({
                    content: {
                        in: rid(record),
                        out: rid(synonym),
                        source,
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'AliasOf',
                });
            } catch (err) {
                logger.error(`Failed to create alias (${record.sourceId}, ${record.name}) ${alias}`);
                console.error(err);
                logger.error(err);
            }
        }

        // create deprecatedBy links for the old sourceIDs
        for (const alternateId of hasDeprecated) {
            const content = {
                deprecated: true,
                name: record.name,
                source,
                sourceId: alternateId,
            };

            if (!ignoreCache && doCache[doCacheKeyFunction(content)]) {
                continue;
            }

            try {
                const alternate = await conn.addRecord({
                    content,
                    existsOk: true,
                    fetchConditions: {
                        AND: [
                            { source },
                            { sourceId: alternateId },
                            { name: record.name },
                        ],
                    },
                    target: 'Disease',
                    upsert: true,
                    upsertCheckExclude: ['sourceIdVersion', 'subsets'],
                });
                await conn.addRecord({
                    content: { in: rid(record), out: rid(alternate), source },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'DeprecatedBy',
                });
            } catch (err) {
                logger.error(`Failed to create deprecated form (${record.sourceId}) ${alternateId}`);
                logger.error(err);
            }
        }

        // link to existing ncit records
        for (const ncitId of ncitLinks) {
            if (!ncitCache[ncitId]) {
                logger.warn(`failed to link ${record.sourceId} to ${ncitId}. Missing record`);
            } else {
                await conn.addRecord({
                    content: { in: rid(ncitCache[ncitId]), out: rid(record), source },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'CrossreferenceOf',
                });
            }
        }
    }

    await loadEdges({
        DOID, conn, records: recordsBySourceId, source,
    });
    logger.info(JSON.stringify(counts));
};


module.exports = {
    SOURCE_DEFN, parseNodeRecord, uploadFile,
};
