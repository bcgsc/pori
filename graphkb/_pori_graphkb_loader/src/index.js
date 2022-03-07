/**
 * Migrates the data from the flatfiles to the graph database
 * @module importer
 * @ignore
 */
const { ApiConnection } = require('./graphkb');
const { DEFAULT_QS } = require('./entrez/util');
const pubmed = require('./entrez/pubmed');
const entrezGene = require('./entrez/gene');
const refseq = require('./entrez/refseq');
const dbSnp = require('./entrez/snp');
const clinicalTrialsGov = require('./clinicaltrialsgov');
const graphkb = require('./graphkb');
const hgnc = require('./hgnc');
const sources = require('./sources');
const ontology = require('./ontology');
const util = require('./util');

const { logger } = require('./logging');


const runLoader = async (options, loaderFunc, loaderOptions = {}) => {
    const apiConnection = new ApiConnection(options.graphkb);

    try {
        await apiConnection.setAuth(options);
    } catch (err) {
        throw Error(`Login failed: ${err}`);
    }

    if (options.pubmed) {
        DEFAULT_QS.api_key = options.pubmed;
    }

    logger.info('Login Succeeded');

    await loaderFunc({
        ...loaderOptions,
        conn: apiConnection,
        errorLogPrefix: options.errorLogPrefix,
    });

    logger.info(`created: ${JSON.stringify(apiConnection.getCreatedCounts())}`);
    logger.info('upload complete');
};


module.exports = {
    clinicalTrialsGov,
    dbSnp,
    entrezGene,
    graphkb,
    hgnc,
    ontology,
    pubmed,
    refseq,
    runLoader,
    sources,
    util,
};
