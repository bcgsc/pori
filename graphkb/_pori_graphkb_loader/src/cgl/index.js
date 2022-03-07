const fs = require('fs');

const { variant: { parse: variantParser } } = require('@bcgsc-pori/graphkb-parser');

const {
    loadDelimToJson,
    hashRecordToId,
} = require('../util');
const {
    orderPreferredOntologyTerms,
    rid,
} = require('../graphkb');
const _refseq = require('../entrez/refseq');
const { logger } = require('../logging');

const { cgl: SOURCE_DEFN } = require('../sources');


const loadCdsVariant = async (graphkbConn, transcriptId, cdsNotation) => {
    let reference1;

    try {
        reference1 = await graphkbConn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: SOURCE_DEFN.name }, target: 'Source' } },
                    { sourceId: transcriptId.split('.')[0] },
                    { sourceIdVersion: transcriptId.split('.')[1] || null },
                    { biotype: 'transcript' },
                ],
            },
            target: 'Feature',
        });
    } catch (err) {
        const transcripts = await _refseq.fetchAndLoadByIds(graphkbConn, [transcriptId]);

        if (transcripts.length !== 1) {
            throw new Error(`unable to find unique transcript (${transcriptId}) (found: ${transcripts.length})`);
        }
        [reference1] = transcripts;
    }

    if (!cdsNotation.startsWith('c.')) {
        throw new Error(`invalid HGVSc notation (${cdsNotation})`);
    }
    // add the cds variant
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = variantParser(cdsNotation, false);
    variant.reference1 = reference1;
    variant.type = rid(await graphkbConn.getVocabularyTerm(variant.type));
    const cds = rid(await graphkbConn.addVariant({
        content: { ...variant },
        existsOk: true,
        target: 'PositionalVariant',
    }));
    return cds;
};


const loadProteinVariant = async (graphkbConn, gene, proteinNotation) => {
    if (!proteinNotation) {
        return null;
    }
    if (!proteinNotation.startsWith('p.')) {
        throw new Error(`invalid HGVSp notation (${proteinNotation})`);
    }
    proteinNotation = proteinNotation.replace(/^p\.\(/, 'p.').replace(/\)$/, '');

    if (!proteinNotation.includes('fs')) {
        proteinNotation = proteinNotation.replace(/\*$/, 'Ter');
    }
    const reference1 = await graphkbConn.getUniqueRecordBy({
        filters: [
            {
                name: gene,
            },
            {
                biotype: 'gene',
            },
            {
                source: { filters: { name: 'entrez gene' }, target: 'Source' },
            },
        ],
        target: 'Feature',
    });
    // add the cds variant
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = variantParser(proteinNotation, false);
    variant.reference1 = reference1;
    variant.type = rid(await graphkbConn.getVocabularyTerm(variant.type));
    const protein = rid(await graphkbConn.addVariant({
        content: { ...variant },
        existsOk: true,
        target: 'PositionalVariant',
    }));
    return protein;
};


const loadGenomicVariant = async (graphkbConn, chromosome, position, ref, alt) => {
    if (!ref.length || !alt.length || !position || !chromosome) {
        return null;
    }
    let notation;

    if (ref.length === alt.length && ref.length === 1) {
        notation = `g.${position}${ref}>${alt}`;
    } else {
        if (ref[0] !== alt[0]) {
            throw new Error(`unexpected ref (${ref}) vs alt (${alt}) combination, do not match on first base`);
        }
        let [start, end] = position.split('_').map(p => Number.parseInt(p, 10));
        ref = ref.slice(1);
        alt = alt.slice(1);

        if (!ref.length) {
            // insertion or duplication
            if (!end) {
                end = start + 1;
            }
            notation = `g.${start}_${end}ins${ref}`;
        } else if (!alt.length) {
            // deletion
            if (ref.length > 1) {
                if (!end) {
                    end = start + ref.length - 1;
                }
                if (ref.length !== end - start + 1) {
                    throw new Error(`deletion position (${position}) span (${end - start + 1}) does not match the length of reference sequence (${ref.length}) deleted`);
                }
            }
            end = (!end || end === start)
                ? ''
                : `_${end}`;
            notation = `g.${start}${end}del${ref}`;
        } else {
            // indel
            if (ref.length > 1) {
                if (!end) {
                    end = start + ref.length - 1;
                }
                if (ref.length !== end - start + 1) {
                    throw new Error(`indel position (${position}) span (${end - start + 1}) does not match the length of reference sequence (${ref.length}) deleted`);
                }
            }
            end = (!end || end === start)
                ? ''
                : `_${end}`;
            notation = `g.${start}${end}del${ref}ins${alt}`;
        }
    }
    const reference1 = await graphkbConn.getUniqueRecordBy({
        filters: [
            { OR: [{ name: chromosome }, { sourceId: chromosome }] },
            {
                biotype: 'chromosome',
            },
        ],
        target: 'Feature',
    });
    // add the cds variant
    const {
        noFeatures, multiFeature, prefix, ...variant
    } = variantParser(notation, false);
    variant.reference1 = reference1;
    variant.type = rid(await graphkbConn.getVocabularyTerm(variant.type));
    const genomic = rid(await graphkbConn.addVariant({
        content: { ...variant, assembly: 'hg19' },
        existsOk: true,
        target: 'PositionalVariant',
    }));
    return genomic;
};


/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({ filename, conn, errorLogPrefix }) => {
    const jsonList = await loadDelimToJson(filename);
    // get the dbID for the source
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const counts = { error: 0, skip: 0, success: 0 };
    const errorList = [];
    logger.info(`Processing ${jsonList.length} records`);
    // Upload the list of pubmed IDs
    const disease = await conn.getUniqueRecordBy({
        filters: {
            name: 'cancer',
        },
        sort: orderPreferredOntologyTerms,
        target: 'Disease',
    });
    const relevance = await conn.getVocabularyTerm('pathogenic');

    // load all transcripts (entrez sometimes misses requests for single ones for some reason)
    logger.info('loading all transcripts');
    await _refseq.preLoadCache(conn);

    for (let index = 0; index < jsonList.length; index++) {
        const sourceId = hashRecordToId(jsonList[index]);
        const record = jsonList[index];
        logger.verbose(`processing (${index} / ${jsonList.length}) ${sourceId}`);

        let protein,
            cds,
            genomic;

        try {
            cds = await loadCdsVariant(conn, record.transcript, record.coding_hgvs);
        } catch (err) {
            logger.warn(`failed to load the cds variant (${record.transcript}:${record.coding_hgvs}) ${err}`);
        }

        try {
            protein = await loadProteinVariant(conn, record.gene, record.protein_hgvs);
        } catch (err) {
            logger.warn(`failed to load the protein variant (${record.gene}:${record.protein_hgvs}) ${err}`);
        }

        try {
            if (protein && cds) {
                await conn.addRecord({
                    content: { in: rid(protein), out: rid(cds) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Infers',
                });
            }
        } catch (err) {
            logger.warn(`failed to link the protein variant ${err}`);
        }

        try {
            genomic = await loadGenomicVariant(conn, record.chr_CGL, record.pos_CGL, record.ref, record.alt);
        } catch (err) {
            logger.warn(`failed to create genomic representation of variant (${record.chromosome}:g.${record.position}${record.ref}>${record.alt}): ${err}`);
        }

        try {
            if (genomic) {
                if (cds) {
                    await conn.addRecord({
                        content: { in: rid(cds), out: rid(genomic) },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'Infers',
                    });
                } else if (protein) {
                    await conn.addRecord({
                        content: { in: rid(protein), out: rid(genomic) },
                        existsOk: true,
                        fetchExisting: false,
                        target: 'Infers',
                    });
                }
            }
        } catch (err) {
            logger.warn(`failed to link the genomic variant ${err}`);
        }


        try {
            const variant = protein || cds || genomic;

            if (!variant) {
                throw new Error('unable to load any variants');
            }

            await conn.addRecord({
                content: {
                    conditions: [rid(variant), rid(disease)],
                    description: 'reviewed by Clinical Molecular Geneticist at CGL',
                    evidence: [rid(source)],
                    relevance: rid(relevance),
                    source: rid(source),
                    subject: rid(disease),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'Statement',
            });
            counts.success++;
        } catch (err) {
            logger.error(`${record.gene}:${record.protein_hgvs} ${record.transcript}:${record.coding_hgvs}`);
            logger.error(err);
            counts.error++;
            continue;
        }
    }
    const errorJson = `${errorLogPrefix}-cgl.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
    logger.info(JSON.stringify(counts));
};

module.exports = { uploadFile };
