/**
 * @module src/cancerhotspots
 */
const fs = require('fs');

const csv = require('fast-csv');

const { variant: { parse: variantParser } } = require('@bcgsc-pori/graphkb-parser');

const {
    convertRowFields,
    hashRecordToId,
} = require('../util');
const {
    rid,
    orderPreferredOntologyTerms,
} = require('../graphkb');
const _entrezGene = require('../entrez/gene');
const { logger } = require('../logging');

const {
    cancerhotspots: SOURCE_DEFN,
    oncotree: { name: oncotreeName },
    ensembl: { name: ensemblName },
} = require('../sources');

const HEADER = {
    assembly: 'NCBI_Build',
    cds: 'HGVSc',
    chromosome: 'Chromosome',
    clinSig: 'CLIN_SIG',
    dbsnp: 'dbSNP_RS',
    diseaseId: 'oncotree_detailed',
    geneId: 'Entrez_Gene_Id',
    impact: 'IMPACT',
    protein: 'HGVSp_Short',
    refSeq: 'Reference_Allele',
    start: 'Start_Position',
    stop: 'End_Position',
    transcriptId: 'Transcript_ID',
    untemplatedSeq: 'Allele',
};


const diseasesCache = {};
const featureCache = {};
const chromosomeCache = {};

/**
 * Create and link the variant defuinitions for a single row/record
 */
const processVariants = async ({ conn, record, source }) => {
    const {
        protein, cds, transcriptId, geneId, chromosome, start, stop,
    } = record;

    let proteinVariant,
        cdsVariant,
        genomicVariant;

    try {
        // get the chromosome
        let reference1;

        if (chromosomeCache[chromosome] !== undefined) {
            reference1 = chromosomeCache[chromosome];
        } else {
            reference1 = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { OR: [{ sourceId: chromosome }, { name: chromosome }] },
                        { biotype: 'chromosome' },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Feature',
            });
            chromosomeCache[chromosome] = reference1;
        }
        // try to create the genomic variant
        const refSeq = record.refSeq === '-'
            ? ''
            : record.refSeq;
        const untemplatedSeq = record.untemplatedSeq === '-'
            ? ''
            : record.untemplatedSeq;
        let notation = `${chromosome}:g.`;

        if (refSeq.length && untemplatedSeq.length) {
            if (refSeq.length === 1 && untemplatedSeq.length === 1) {
                // substitution
                notation = `${notation}${start}${refSeq}>${untemplatedSeq}`;
            } else {
                // indel
                notation = `${notation}${start}_${stop}del${refSeq}ins${untemplatedSeq}`;
            }
        } else if (refSeq.length === 0) {
            // insertion
            notation = `${notation}${start}_${stop}ins${untemplatedSeq}`;
        } else {
            // deletion
            notation = `${notation}${start}_${stop}del${refSeq}`;
        }
        const variant = variantParser(notation).toJSON();

        variant.reference1 = rid(reference1);
        variant.type = rid(await conn.getVocabularyTerm(variant.type));
        genomicVariant = rid(await conn.addVariant({
            content: { ...variant },
            existsOk: true,
            target: 'PositionalVariant',
        }));
    } catch (err) {
        logger.warn(`failed to create the genomic variant (${chromosome}:${start}-${stop})`);
        logger.warn(err);
    }

    try {
        // get the gene
        let reference1;

        if (featureCache[reference1] !== undefined) {
            reference1 = featureCache[reference1];
        } else {
            [reference1] = await _entrezGene.fetchAndLoadByIds(conn, [geneId]);
            featureCache[geneId] = reference1;
        }
        const variant = variantParser(
            protein.replace(/fs\*\?$/, 'fs'), // ignore uncertain truncations
            false,
        ).toJSON();
        variant.reference1 = rid(reference1);
        variant.type = rid(await conn.getVocabularyTerm(variant.type));
        proteinVariant = rid(await conn.addVariant({
            content: { ...variant },
            existsOk: true,
            target: 'PositionalVariant',
        }));
    } catch (err) {
        logger.error(`Failed the protein variant (${geneId}:${protein}) ${err}`);
        throw err;
    }

    // create the cds variant
    try {
        // get the ensembl transcript
        let reference1;

        if (featureCache[transcriptId] !== undefined) {
            reference1 = featureCache[transcriptId];
        } else {
            reference1 = rid(await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { sourceId: transcriptId },
                        { biotype: 'transcript' },
                        { source: { filters: { name: ensemblName }, target: 'Source' } },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Feature',
            }));
            featureCache[transcriptId] = reference1;
        }
        // parse the cds variant
        const variant = variantParser(cds, false).toJSON();

        variant.reference1 = reference1;
        variant.type = rid(await conn.getVocabularyTerm(variant.type));

        cdsVariant = rid(await conn.addVariant({
            content: { ...variant },
            existsOk: true,
            target: 'PositionalVariant',
        }));
        await conn.addRecord({
            content: { in: proteinVariant, out: cdsVariant, source: rid(source) },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    } catch (err) {
        logger.error(`Failed the cds variant (${transcriptId}:${cds}) ${err}`);
    }

    // link the genomic variant
    if (genomicVariant && cdsVariant) {
        await conn.addRecord({
            content: { in: rid(cdsVariant), out: rid(genomicVariant), source: rid(source) },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    } else if (genomicVariant) {
        await conn.addRecord({
            content: { in: rid(proteinVariant), out: rid(genomicVariant), source: rid(source) },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    }
    return proteinVariant;
};

const processRecord = async (conn, record, source, relevance) => {
    const { diseaseId, sourceId } = record;
    // get the protein variant
    const variantId = await processVariants({ conn, record, source });

    // get the disease by id from oncotree (try cache first)
    let disease;

    if (diseasesCache[diseaseId]) {
        disease = diseasesCache[diseaseId];
    } else {
        disease = rid(await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { sourceId: diseaseId },
                    { source: { filters: { name: oncotreeName }, target: 'Source' } },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'Disease',
        }));
        diseasesCache[diseaseId] = disease;
    }

    await conn.addRecord({
        content: {
            conditions: [variantId, disease],
            evidence: [source],
            relevance,
            reviewStatus: 'not required',
            source,
            sourceId,
            subject: disease,
        },
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
    });
};

const createRowId = row => hashRecordToId(row);


/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({ filename, conn, errorLogPrefix }) => {
    logger.info(`loading: ${filename}`);

    // get the dbID for the source
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const relevance = rid(await conn.getVocabularyTerm('mutation hotspot'));
    const counts = { error: 0, skip: 0, success: 0 };
    const errorList = [];

    let index = 0;

    logger.info('load entrez genes cache');
    await _entrezGene.preLoadCache(conn);

    const previousLoad = new Set();
    logger.info('load previous statements');
    const statements = await conn.getRecords({
        filters: { source: rid(source) },
        returnProperties: ['sourceId'],
        target: 'Statement',
    });

    for (const { sourceId } of statements) {
        previousLoad.add(sourceId);
    }
    logger.info(`${previousLoad.size} loaded statements`);

    const parserPromise = new Promise((resolve, reject) => {
        const parser = csv
            .parseFile(filename, {
                comment: '#', delimiter: '\t', headers: true, trim: true,
            })
            .on('data', (data) => {
                const record = convertRowFields(HEADER, data);
                const sourceId = createRowId(record);
                record.sourceId = sourceId;
                index++;

                if (
                    record.impact.toLowerCase() !== 'high'
                    || record.clinSig === ''
                    || record.clinSig.includes('benign')
                ) {
                    counts.skip++;
                } else if (previousLoad.has(sourceId)) {
                    logger.info(`Already loaded ${sourceId}`);
                } else if (record.protein.endsWith('=')) {
                    counts.skip++;
                    logger.info('skipping synonymous protein variant');
                } else if (record.protein.endsWith('_splice')) {
                    counts.skip++;
                    logger.info('skipping non-standard splice notation');
                } else {
                    parser.pause();

                    logger.info(`processing row #${index} ${sourceId}`);
                    processRecord(conn, record, source, relevance)
                        .then(() => {
                            logger.info('created record');
                            counts.success++;
                            parser.resume();
                        }).catch((err) => {
                            logger.error(err);
                            errorList.push({ error: err, errorMessage: err.toString(), record });
                            counts.error++;
                            parser.resume();
                        });
                }
            })
            .on('error', (err) => {
                console.error(err);
                logger.error(err);
                reject(err);
            })
            .on('end', () => {
                logger.info('completed stream');
                resolve();
            });
    });
    await parserPromise;
    const errorJson = `${errorLogPrefix}-cancerhotspots.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = {
    SOURCE_DEFN, uploadFile,
};
