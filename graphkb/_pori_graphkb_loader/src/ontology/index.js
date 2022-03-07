/**
 * Load a custom JSON file
 *
 * @module importer/ontology
 */

const Ajv = require('ajv');
const fs = require('fs');
const jsonpath = require('jsonpath');

const { schema, schema: { schema: kbSchema } } = require('@bcgsc-pori/graphkb-schema');
const SOURCE_DEFAULTS = require('../sources');

const { logger } = require('../logging');
const { rid, convertRecordToQueryFilters } = require('../graphkb');

const ajv = new Ajv();

const INPUT_ERROR_CODE = 2;


const validateSpec = ajv.compile({
    properties: {
        class: {
            enum: kbSchema.Ontology.descendantTree(true).map(model => model.name),
            type: 'string',
        },
        defaultNameToSourceId: { type: 'boolean' },
        records: {
            additionalProperties: {
                properties: {
                    comment: { type: 'string' },
                    description: { type: 'string' },
                    // edges
                    links: {
                        items: {
                            properties: {
                                additionalProperties: false,
                                class: { enum: schema.getEdgeModels().map(e => e.name), type: 'string' },
                                target: { minLength: 1, type: 'string' },
                            },
                            required: ['class', 'target'],
                            type: 'object',
                        },
                        type: 'array',
                    },
                    name: { type: 'string' },
                    sourceId: { type: 'string' },
                    sourceIdVersion: { type: 'string' },
                    // defaults to the record key
                    url: { format: 'uri', type: 'string' },
                },
                type: 'object',
            },
            type: 'object',
        },
        sources: {
            additionalProperties: {
                properties: {
                    description: { type: 'string' },
                    name: { minLength: 1, type: 'string' },
                    url: { format: 'uri', type: 'string' },
                    usage: { format: 'uri', type: 'string' },
                    version: { type: 'string' },
                },
                required: ['name'],
                type: 'object',
            },
            properties: {
                default: {
                    properties: {
                        description: { type: 'string' },
                        name: { minLength: 1, type: 'string' },
                        url: { format: 'uri', type: 'string' },
                        usage: { format: 'uri', type: 'string' },
                        version: { type: 'string' },
                    },
                    required: ['name'],
                    type: 'object',
                },
            },
            required: ['default'],
            type: 'object',
        },
    },
    required: ['class', 'sources', 'records'],
    type: 'object',
});


const fetchSourceByName = (name) => {
    const matches = Object.values(SOURCE_DEFAULTS).filter(s => s.name === name);

    if (matches.length !== 1) {
        return {};
    }
    return matches[0];
};


/**
 * Upload the JSON ontology file
 *
 * @param {object} opt
 * @param {string} opt.data the JSON data to be loaded
 * @param {ApiConnection} opt.conn the graphKB api connection
 */
const uploadFromJSON = async ({ data, conn }) => {
    const counts = { errors: 0, skipped: 0, success: 0 };

    // validate that it follows the expected pattern
    if (!validateSpec(data)) {
        logger.error(
            `Spec Validation failed #${
                validateSpec.errors[0].dataPath
            } ${
                validateSpec.errors[0].message
            } found ${
                jsonpath.query(data, `$${validateSpec.errors[0].dataPath}`)
            }`,
        );
        process.exit(INPUT_ERROR_CODE);
    }
    // build the specification for checking records
    // check that all the keys make sense for linking
    const {
        records, sources, class: recordClass, defaultNameToSourceId,
    } = data;

    for (const recordKey of Object.keys(records)) {
        const record = records[recordKey];

        if (!record.sourceId) {
            record.sourceId = recordKey;
        }
        if (record.source && !sources[record.source]) {
            logger.error(`Missing source definition (${record.source})`);
            counts.errors++;
        }

        if (!record.name && defaultNameToSourceId) {
            record.name = record.sourceId;
        }

        for (const { target, class: edgeClass, source } of record.links || []) {
            if (records[target] === undefined) {
                logger.log('error', `Invalid link (${edgeClass}) from ${recordKey} to undefined record ${target}`);
                counts.errors++;
            }
            if (source && !sources[source]) {
                logger.error(`Missing source definition (${record.source})`);
                counts.errors++;
            }
        }
    }

    if (counts.errors) {
        logger.log('error', 'There are errors in the JSON file, will not attempt to upload');
        process.exit(INPUT_ERROR_CODE);
    }

    // try to create/fetch the source record
    const sourcesRecords = {};

    try {
        await Promise.all(Object.entries(sources).map(async ([sourceKey, sourceDefn]) => {
            const content = { ...fetchSourceByName(sourceDefn.name), ...sourceDefn };
            const sourceRID = rid(await conn.addSource(content));
            sourcesRecords[sourceKey] = sourceRID;
        }));
    } catch (err) {
        console.error(err);
        logger.log('error', `unable to create the source records ${err}`);
        process.exit(INPUT_ERROR_CODE);
    }

    const dbRecords = {}; // store the created/fetched records from the db
    // try to create all the records
    logger.log('info', 'creating the records');

    for (const key of Object.keys(records)) {
        const { links, ...record } = records[key];

        if (!record.source) {
            record.source = sourcesRecords.default;
        } else {
            record.source = sourcesRecords[record.source];
        }

        try {
            const dbRecord = await conn.addRecord({
                content: { ...record },
                existsOk: true,
                fetchConditions: convertRecordToQueryFilters({
                    name: record.name,
                    source: record.source,
                    sourceId: record.sourceId,
                    sourceIdVersion: record.sourceIdVersion,
                }),
                target: recordClass,
                upsert: true,
            });
            dbRecords[key] = rid(dbRecord);
            counts.success++;
        } catch (err) {
            logger.log('error', err);
            counts.errors++;
        }
    }
    // try to create all the links
    logger.log('info', 'creating the record links');

    for (const key of Object.keys(records)) {
        const { links = [] } = records[key];

        for (const { class: edgeType, target, source = 'default' } of links) {
            if (dbRecords[target] === undefined || dbRecords[key] === undefined) {
                counts.skipped++;
                continue;
            }

            try {
                await conn.addRecord({
                    content: {
                        in: dbRecords[target],
                        out: dbRecords[key],
                        source: sourcesRecords[source],
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: edgeType,
                });
                counts.success++;
            } catch (err) {
                logger.log('error', err);
                counts.errors++;
            }
        }
    }
    // report the success rate
    logger.info(JSON.stringify(conn.updated));
    logger.info(`processed: ${JSON.stringify(counts)}`);
};


/**
 * Upload the JSON ontology file
 *
 * @param {object} opt
 * @param {string} opt.filename the path to the JSON input file
 * @param {ApiConnection} opt.conn the graphKB api connection
 */
const uploadFile = async ({ filename, conn }) => {
    logger.log('info', `reading: ${filename}`);
    const data = JSON.parse(fs.readFileSync(filename));

    await uploadFromJSON({ conn, data });
};


module.exports = { uploadFile, uploadFromJSON };
