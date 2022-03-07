/**
 * Loads the Sequence Ontology OWL files
 *
 * http://www.sequenceontology.org/browser
 *
 * @module importer/sequence_ontology
 */

const rdf = require('rdflib');
const fs = require('fs');

const { convertOwlGraphToJson } = require('./util');
const { rid, convertRecordToQueryFilters } = require('./graphkb');
const { logger } = require('./logging');
const { sequenceOntology: SOURCE_DEFN } = require('./sources');


const OWL_NAMESPACE = 'http://purl.obolibrary.org/obo/so/so-simple.owl';

const PREDICATES = {
    ALIASOF: 'http://www.geneontology.org/formats/oboInOwl#hasExactSynonym',
    CROSSREF: 'http://www.geneontology.org/formats/oboInOwl#hasDbXref',
    DEPRECATED: 'http://www.w3.org/2002/07/owl#deprecated',
    DEPRECATEDBY: 'http://purl.obolibrary.org/obo/IAO_0100001',
    DESCRIPTION: 'http://purl.obolibrary.org/obo/IAO_0000115',
    GENERALIZATION: 'http://www.geneontology.org/formats/oboInOwl#hasBroadSynonym',
    ID: 'http://www.geneontology.org/formats/oboInOwl#id',
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    SUBSETOF: 'http://www.geneontology.org/formats/oboInOwl#inSubset',
    TYPE: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
};

/**
 * Parse the ID from a url
 *
 * @param {string} url the url to be parsed
 * @returns {string} the ID
 * @throws {Error} the ID did not match the expected format
 */
const parseId = (url) => {
    const match = /.*\/SO_(\d+)$/.exec(url);

    if (match) {
        return `so:${match[1]}`;
    }
    throw new Error(`failed to parser ID from ${url}`);
};


const parseRecord = (code, rawRecord) => {
    if (!rawRecord[PREDICATES.LABEL] || rawRecord[PREDICATES.LABEL].length === 0) {
        throw new Error('Could not find record label');
    }
    const record = {
        aliases: rawRecord[PREDICATES.ALIASOF] || [],
        content: {
            name: rawRecord[PREDICATES.LABEL][0].replace(/_/g, ' '),
            sourceId: code.toLowerCase(),
        },
        subclassof: [],
    };

    if (rawRecord[PREDICATES.DESCRIPTION] && rawRecord[PREDICATES.DESCRIPTION].length) {
        record.content.description = rawRecord[PREDICATES.DESCRIPTION][0];
    }
    if (rawRecord[PREDICATES.DEPRECATED] && rawRecord[PREDICATES.DEPRECATED].length) {
        record.content.deprecated = rawRecord[PREDICATES.DEPRECATED][0] === 'true';
    }

    for (const parent of rawRecord[PREDICATES.SUBCLASSOF] || []) {
        if (/^so:[0-9]+$/i.exec(parent)) {
            record.subclassof.push(parent);
        }
    }
    return record;
};


const uploadFile = async ({ filename, conn }) => {
    logger.info('Loading the external sequence ontology data');
    logger.info(`reading: ${filename}`);
    const fileContent = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    logger.info(`parsing: ${filename}`);
    rdf.parse(fileContent, graph, OWL_NAMESPACE, 'application/rdf+xml');

    const source = await conn.addSource(SOURCE_DEFN);

    const nodesByCode = convertOwlGraphToJson(graph, parseId);
    logger.info(`loading ${Object.keys(nodesByCode).length} records`);
    const records = {};
    const subclassEdges = [];

    for (const [code, rawRecord] of Object.entries(nodesByCode)) {
        try {
            const { content, subclassof } = parseRecord(code, rawRecord);
            const record = await conn.addRecord({
                content: { ...content, source: rid(source) },
                existsOk: true,
                fetchConditions: convertRecordToQueryFilters({ name: content.name, source: rid(source), sourceId: content.sourceId }),
                target: 'vocabulary',
            });
            records[record.sourceId] = record;

            for (const parent of subclassof) {
                subclassEdges.push({ in: parent, out: code });
            }
        } catch (err) {
            logger.warn(`Failed to create the record (code=${code}): ${err.message}`);
        }
    }
    logger.info(`loading ${subclassEdges.length} subclassof links`);

    for (const edge of subclassEdges) {
        if (records[edge.out] && records[edge.in]) {
            await conn.addRecord({
                content: {
                    in: rid(records[edge.in]),
                    out: rid(records[edge.out]),
                    source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'subclassof',
            });
        } else {
            logger.warn(`Failed to create  subclassof link from ${edge.out} to ${edge.in}`);
        }
    }
};

module.exports = { SOURCE_DEFN, uploadFile };
