/**
 * Creates resistance statements from the cosmic reistance mutations download file
 */
const fs = require('fs');

const { variant: { parse: variantParser } } = require('@bcgsc-pori/graphkb-parser');

const {
    loadDelimToJson,
    convertRowFields,
    hashRecordToId,
} = require('../util');
const {
    orderPreferredOntologyTerms,
    rid,
} = require('../graphkb');
const _pubmed = require('../entrez/pubmed');
const _gene = require('../entrez/gene');
const _ensembl = require('../ensembl');
const _hgnc = require('../hgnc');
const { logger } = require('../logging');

const { cosmic: SOURCE_DEFN } = require('../sources');

const HEADER = {
    cds: 'HGVSC',
    disease: 'Histology Subtype 1',
    diseaseFamily: 'Histology',
    gene: 'Gene Name',
    genomic: 'HGVSG',
    mutationId: 'LEGACY_MUTATION_ID',
    protein: 'HGVSP',
    pubmed: 'Pubmed Id',
    sampleId: 'Sample ID',
    sampleName: 'Sample Name',
    therapy: 'Drug Name',
    transcript: 'Transcript',
};


/**
 * Create and link the variant defuinitions for a single row/record
 */
const processVariants = async ({ conn, record, source }) => {
    let protein,
        cds,
        gene,
        genomic,
        catalog,
        generalProtein;

    try {
        // get the entrez gene
        const [geneName] = record.gene.split('_'); // convert MAP2K2_ENST00000262948 to MAP2K2
        [gene] = await _gene.fetchAndLoadBySymbol(conn, geneName);

        if (!gene) {
            throw Error(`failed to find the Entrez gene for ${record.gene}`);
        }
    } catch (err) {
        logger.warn(err);
    }

    if (!gene) {
        try {
            // get the hugo gene
            const [geneName] = record.gene.split('_'); // convert MAP2K2_ENST00000262948 to MAP2K2
            gene = await _hgnc.fetchAndLoadBySymbol({ conn, symbol: geneName });

            if (!gene) {
                throw Error(`failed to find the HGNC gene for ${record.gene}`);
            }
        } catch (err) {
            logger.error(err);
        }
    }

    try {
        // add the protein variant with its protein translation
        const variant = variantParser(record.protein, false).toJSON();
        variant.type = rid(await conn.getVocabularyTerm(variant.type));

        const reference1 = rid(await _ensembl.fetchAndLoadById(
            conn,
            { biotype: 'protein', sourceId: variant.reference1 },
        ));
        protein = rid(await conn.addVariant({
            content: { ...variant, reference1 },
            existsOk: true,
            target: 'PositionalVariant',
        }));

        if (gene) {
            // add the same protein varaint with the gene notation
            generalProtein = rid(await conn.addVariant({
                content: { ...variant, reference1: gene },
                existsOk: true,
                target: 'PositionalVariant',
            }));

            // link the translation version to the gene version
            await conn.addRecord({
                content: { in: generalProtein, out: protein },
                existsOk: true,
                fetchExisting: false,
                target: 'Infers',
            });
        }
    } catch (err) {
        logger.error(err);
    }

    // create the cds variant
    if (record.cds && record.cds.trim()) {
        try {
            const variant = variantParser(record.cds, false).toJSON();
            // get the ensembl transcript
            const reference1 = rid(await _ensembl.fetchAndLoadById(
                conn,
                { biotype: 'transcript', sourceId: variant.reference1 },
            ));
            // add the cds variant
            variant.type = rid(await conn.getVocabularyTerm(variant.type));
            cds = rid(await conn.addVariant({
                content: { ...variant, reference1 },
                existsOk: true,
                target: 'PositionalVariant',
            }));

            if (protein) {
                await conn.addRecord({
                    content: { in: protein, out: cds },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                });
            }
        } catch (err) {
            logger.error(err);
        }
    }

    // add the genomic representation
    if (record.genomic) {
        try {
            const variant = variantParser(record.genomic, false).toJSON();
            // get the chromosome
            const reference1 = rid(await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { sourceId: variant.reference1 },
                        { sourceIdVersion: null },
                        { biotype: 'chromosome' },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Feature',
            }));
            // add the cds variant
            variant.type = rid(await conn.getVocabularyTerm(variant.type));
            genomic = rid(await conn.addVariant({
                content: { ...variant, assembly: 'GRCh38', reference1 },
                existsOk: true,
                target: 'PositionalVariant',
            }));

            if (cds || protein) {
                await conn.addRecord({
                    content: { in: rid(cds || protein), out: genomic },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                });
            }
        } catch (err) {
            logger.error(err);
        }
    }

    // create the catalog variant
    if (record.mutationId) {
        try {
            catalog = await conn.addRecord({
                content: { source: rid(source), sourceId: record.mutationId },
                existsOk: true,
                target: 'CatalogueVariant',
            });

            if (genomic || cds || protein) {
                await conn.addRecord({
                    content: { in: rid(genomic || cds || protein), out: rid(catalog) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                });
            }
        } catch (err) {
            logger.error(err);
        }
    }

    // return the protein variant
    // prefers the gene:protein-hgvs version b/c original cosmic file didn't have the HGVSp so these were
    // likely annotated based backfilling on positions not the original article
    return generalProtein || protein || cds || genomic || catalog;
};


/**
 * Match the disease associated with the current record
 */
const processDisease = async (conn, record) => {
    let ncit;

    if (record.ncit) {
        try {
            ncit = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { source: { filters: { name: 'ncit' }, target: 'Source' } },
                        { sourceId: record.ncit },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            });
        } catch (err) {}
    }
    // get the disease by name
    let disease = ncit;

    const cleanDiseaseName = (name) => {
        let result = name.replace(/_/g, ' ');
        result = result.replace('leukaemia', 'leukemia');
        result = result.replace('tumour', 'tumor');
        return result;
    };

    if (!disease) {
        // try the more specific disease name first
        if (record.disease !== 'NS') {
            try {
                disease = await conn.getUniqueRecordBy({
                    filters: { name: cleanDiseaseName(record.disease) },
                    sort: orderPreferredOntologyTerms,
                    target: 'Disease',
                });
            } catch (err) {}
        }
    }

    if (!disease) {
        // try the less specific classification
        try {
            disease = await conn.getUniqueRecordBy({
                filters: { name: cleanDiseaseName(record.diseaseFamily) },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            });
        } catch (err) {}
    }

    if (!disease) {
        throw new Error(`missing: Disease (ncit=${record.ncit}; diseaseFamily=${record.diseaseFamily}; disease=${record.disease})`);
    }
    return disease;
};


const processCosmicRecord = async (conn, record, source) => {
    // get the protein variant
    const variant = await processVariants({ conn, record, source });

    if (!variant) {
        throw Error(`failed to parse variant from record (${record.HGVSP}, ${record.HGVSC}, ${record.HGVSG})`);
    }
    // get the drug by name
    const drug = rid(await conn.getTherapy(record.therapy.toLowerCase().replace(/ - ns$/, '')));
    // get the disease by NCIT code first if the mapping mapped one
    const disease = rid(await processDisease(conn, record));
    // create the resistance statement
    const relevance = rid(await conn.getVocabularyTerm('resistance'));
    const result = await conn.addRecord({
        content: {
            conditions: [rid(variant), rid(disease), drug],
            evidence: [rid(record.publication)],
            relevance,
            reviewStatus: 'not required',
            source: rid(source),
            subject: drug,
        },
        existsOk: true,
        target: 'Statement',
    });
    return rid(result);
};

/**
 * Disease mappings
 */
const loadClassifications = async (filename) => {
    const classifications = await loadDelimToJson(filename, { delim: ',' });
    const mapping = {};

    for (const row of classifications) {
        const disease = row.HISTOLOGY_COSMIC;
        const subdisease = row.HIST_SUBTYPE1_COSMIC;

        if (!mapping[disease]) {
            mapping[disease] = {};
        }
        mapping[disease][subdisease] = row.NCI_CODE;
    }
    return mapping;
};

/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({
    filename, classification, conn, errorLogPrefix, maxRecords,
}) => {
    const jsonList = await loadDelimToJson(filename);

    const mapping = await loadClassifications(classification);
    logger.info(`loaded ${jsonList.length} records`);
    // get the dbID for the source
    const source = rid(await conn.addSource(SOURCE_DEFN));

    const relevance = rid(await conn.getVocabularyTerm('resistance'));
    // soft-delete the previous cosmic resistance mutations upload (no stable IDs, can't update)
    const originalStatements = new Set((await conn.getRecords({
        filters: [
            { source },
            { relevance },
            { createdBy: { filters: { name: conn.username }, target: 'User' } },
        ],
        returnProperties: ['@rid'],
        target: 'Statement',
    })).map(rid));
    const retainedStatements = new Set();
    const newStatements = new Set();
    logger.info(`${originalStatements.size} original cosmic statements`);

    const counts = { error: 0, skip: 0, success: 0 };
    const errorList = [];
    logger.info(`Processing ${jsonList.length} records`);
    // Upload the list of pubmed IDs
    await _pubmed.fetchAndLoadByIds(conn, jsonList.map(rec => rec[HEADER.pubmed]), { upsert: true });

    for (let index = 0; index < jsonList.length; index++) {
        if (maxRecords && index > maxRecords) {
            logger.warn(`not loading all content due to max records limit (${maxRecords})`);
            break;
        }
        const sourceId = hashRecordToId(jsonList[index]);
        const record = { sourceId, ...convertRowFields(HEADER, jsonList[index]) };
        logger.info(`processing (${index} / ${jsonList.length}) ${sourceId}`);

        if (record.protein.startsWith('p.?')) {
            counts.skip++;
            continue;
        }

        try {
            record.ncit = (mapping[record.diseaseFamily] || {})[record.disease];
            record.publication = rid((await _pubmed.fetchAndLoadByIds(conn, [record.pubmed]))[0]);
            const statement = await processCosmicRecord(conn, record, source);

            if (originalStatements.has(statement)) {
                retainedStatements.add(statement);
            } else {
                newStatements.add(statement);
            }
            counts.success++;
        } catch (err) {
            errorList.push({ error: err.toString(), record });
            logger.log('error', err);
            counts.error++;
        }
    }
    logger.info(`${originalStatements.size} original cosmic statements`);
    logger.info(`retained ${retainedStatements.size} statements and created ${newStatements.size} statements`);

    if (!counts.error) {
        for (const statement of Array.from(originalStatements)) {
            if (!retainedStatements.has(statement)) {
                await conn.deleteRecord('Statement', statement);
            }
        }
    } else {
        logger.info('Cannot delete previously existing statements when errors were encoutered');
    }
    const errorJson = `${errorLogPrefix}-cosmic.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = {
    SOURCE_DEFN, loadClassifications, processDisease, uploadFile,
};
