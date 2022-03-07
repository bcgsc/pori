/**
 * @module importer/vario
 */

const rdf = require('rdflib');
const fs = require('fs');


const { convertOwlGraphToJson } = require('./util');
const { rid } = require('./graphkb');
const { logger } = require('./logging');
const { vario: SOURCE_DEFN } = require('./sources');


const PREDICATES = {
    description: 'http://purl.obolibrary.org/obo/IAO_0000115',
    id: 'http://www.geneontology.org/formats/oboInOwl#id',
    name: 'http://www.w3.org/2000/01/rdf-schema#label',
    subclassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
};

const OWL_NAMESPACE = 'http://purl.obolibrary.org/obo/vario.owl';


/**
 * Parse the ID from a url string
 *
 * @param {string} url the url to be parsed
 * @returns {string} the ID string
 * @throws {Error} when the string does not match the expected format
 *
 * @example
 * > parseId(http://purl.obolibrary.org/obo/VariO_044)
 * 'VariO_044'
 */
const parseId = (url) => {
    // http://purl.obolibrary.org/obo/VariO_044
    const match = /.*\/(VariO_\d+)$/.exec(url);

    if (match) {
        return `${match[1].toLowerCase().replace('_', ':')}`;
    }
    throw new Error(`failed to parse: ${url}`);
};


/**
 * Parse the input OWL file and upload the ontology to GraphKB via the API
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input OWL file
 * @param {ApiConnection} opt.conn the api request connection object
 */
const uploadFile = async ({ filename, conn }) => {
    logger.info(`Loading external ${SOURCE_DEFN.name} data`);
    logger.info(`loading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    logger.info(`parsing: ${filename}`);
    const graph = rdf.graph();
    rdf.parse(content, graph, OWL_NAMESPACE, 'application/rdf+xml');
    const nodesByCode = convertOwlGraphToJson(graph, parseId);

    const source = await conn.addSource(SOURCE_DEFN);

    const recordsByCode = {};
    const subclassEdges = [];

    for (const [code, original] of Object.entries(nodesByCode)) {
        if (!original[PREDICATES.name]) {
            continue;
        }
        const node = {
            description: (original[PREDICATES.description] || [null])[0],
            name: original[PREDICATES.name][0],
            source: rid(source),
            sourceId: code,
        };

        for (const tgt of original[PREDICATES.subclassOf] || []) {
            subclassEdges.push([code, tgt]);
        }
        recordsByCode[code] = await conn.addRecord({ content: node, existsOk: true, target: 'vocabulary' });
    }

    for (const [srcCode, tgtCode] of subclassEdges) {
        const src = recordsByCode[srcCode];
        const tgt = recordsByCode[tgtCode];

        if (src && tgt) {
            await conn.addRecord({
                content: {
                    in: rid(tgt), out: rid(src), source: rid(source),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'subclassof',
            });
        }
    }
};

module.exports = { SOURCE_DEFN, uploadFile };
