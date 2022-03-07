
const Ajv = require('ajv');
const kbParser = require('@bcgsc-pori/graphkb-parser');

const { checkSpec, requestWithRetry } = require('../util');
const { moa: SOURCE_DEFN } = require('../sources');
const { rid, orderPreferredOntologyTerms } = require('../graphkb');
const spec = require('./spec.json');
const { logger } = require('../logging');
const entrezGene = require('../entrez/gene');
const pubmed = require('../entrez/pubmed');
const _trials = require('../clinicaltrialsgov');


const ajv = new Ajv({ allErrors: true });
const validateMoaRecord = ajv.compile(spec);


const composeGenomicHgvs = (moaVariant) => {
    /**
     * Create the HGVS genomic variant string
     */
    const start = Number.parseInt(`${moaVariant.start_position}`, 10);
    const end = Number.parseInt(`${moaVariant.end_position}`, 10);
    const alt = moaVariant.alternate_allele;
    const ref = moaVariant.reference_allele;

    if (ref === '-') {
        // insertion
        return `g.${start}_${end}ins${alt}`;
    } if (alt === '-') {
        // deletion
        if (start === end) {
            return `g.${start}del${ref}`;
        }
        return `g.${start}_${end}del${ref}`;
    } if (ref.length > 1 || alt.length > 1) {
        // indel
        if (start === end && alt.length === ref.length) {
            return `g.${start}_${end + alt.length - 1}del${ref}ins${alt}`;
        }
        return `g.${start}_${end}del${ref}ins${alt}`;
    }
    return `g.${start}${ref}>${alt}`;
};


const loadSmallMutation = async (conn, gene, moaVariant) => {
    /**
     * Create the small mutation in all its forms and link them where approprite.
     * Preferentially return the protein change
     */
    let proteinVariant = null,
        cdsVariant = null,
        genomicVariant = null,
        catVariant = null,
        exonVariant = null;
    const germline = Boolean(moaVariant.feature_type === 'germline_variant');

    // create the genomic variant if we have the appropriate fields
    if (!['reference_allele', 'alternate_allele', 'start_position', 'end_position', 'chromosome'].some(v => moaVariant[v] === null)) {
        const hgvsg = kbParser.variant.parse(composeGenomicHgvs(moaVariant), false).toJSON();
        const chromosome = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { biotype: 'chromosome' },
                    {
                        sourceId: ['X', 'Y', 'MT'].includes(moaVariant.chromosome)
                            ? moaVariant.chromosome
                            : `${Number.parseInt(moaVariant.chromosome, 10)}`,
                    },
                ],
            },
            target: 'Feature',
        });
        const genomicType = rid(await conn.getVocabularyTerm(hgvsg.type));
        genomicVariant = rid(await conn.addVariant({
            content: {
                ...hgvsg, germline, reference1: rid(chromosome), type: genomicType,
            },
            existsOk: true,
            target: 'PositionalVariant',
        }));
    }

    // create the cds variant
    if (moaVariant.cdna_change !== null && moaVariant.cdna_change !== '') {
        const hgvsc = kbParser.variant.parse(moaVariant.cdna_change, false).toJSON();
        const cdsType = rid(await conn.getVocabularyTerm(hgvsc.type));
        cdsVariant = rid(await conn.addVariant({
            content: {
                ...hgvsc, germline, reference1: rid(gene), type: cdsType,
            },
            existsOk: true,
            target: 'PositionalVariant',
        }));
    }

    // create the protein variant
    if (moaVariant.protein_change !== null && moaVariant.protein_change !== '') {
        const hgvsp = kbParser.variant.parse(moaVariant.protein_change, false).toJSON();
        const proteinType = rid(await conn.getVocabularyTerm(hgvsp.type));
        proteinVariant = rid(await conn.addVariant({
            content: {
                ...hgvsp, germline, reference1: rid(gene), type: proteinType,
            },
            existsOk: true,
            target: 'PositionalVariant',
        }));
    }

    let variantAnnotation = null;

    if (moaVariant.variant_annotation) {
        try {
            variantAnnotation = await conn.getVocabularyTerm(moaVariant.variant_annotation, 'moa');
        } catch (err) {
            variantAnnotation = await conn.getVocabularyTerm(moaVariant.variant_annotation);
        }
    }

    // create the exon level variant
    if (moaVariant.exon !== null) {
        const exonNumber = Number.parseInt(moaVariant.exon, 10);
        let variantType;

        if (variantAnnotation) {
            variantType = variantAnnotation;
        } else {
            variantType = await conn.getVocabularyTerm('mutation');
        }
        const parsed = kbParser.variant.parse(`e.${exonNumber}mut`, false).toJSON();
        exonVariant = await conn.addVariant({
            content: {
                ...parsed,
                germline,
                reference1: rid(gene),
                type: rid(variantType),

            },
            existsOk: true,
            target: 'PositionalVariant',
        });
    }

    // create the non-specific category variant
    if (!exonVariant) {
        if (moaVariant.variant_annotation) {
            catVariant = await conn.addVariant({
                content: { germline, reference1: rid(gene), type: rid(variantAnnotation) },
                existsOk: true,
                target: 'CategoryVariant',
            });
        } else if (!(proteinVariant || cdsVariant || genomicVariant)) {
        // most general variant annotation only
            const variantType = await conn.getVocabularyTerm('mutation');
            catVariant = await conn.addVariant({
                content: { germline, reference1: rid(gene), type: rid(variantType) },
                existsOk: true,
                target: 'CategoryVariant',
            });
        }
    }

    const variantJoinOrder = [
        genomicVariant,
        cdsVariant,
        proteinVariant,
        exonVariant,
        catVariant,
    ].filter(v => v !== null);

    let i;

    for (i = 1; i < variantJoinOrder.length; i++) {
        await conn.addRecord({
            content: {
                in: rid(variantJoinOrder[i]),
                out: rid(variantJoinOrder[i - 1]),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    }

    return (proteinVariant || cdsVariant || genomicVariant || exonVariant || catVariant);
};


const loadVariant = async (conn, moaVariant) => {
    /**
     * Create and return the current variant type
     */
    let gene,
        gene2 = null;

    if (moaVariant.gene || moaVariant.gene1) {
        const results = await entrezGene.fetchAndLoadBySymbol(
            conn, moaVariant.gene || moaVariant.gene1,
        );

        if (results.length > 1) {
            throw Error(`Error finding gene by symbol (${moaVariant.gene || moaVariant.gene1}). Symbol is non-specific and returns multiple matches`);
        } else if (results.length === 0) {
            throw Error(`Error finding gene by symbol (${moaVariant.gene || moaVariant.gene1}). No results`);
        }
        [gene] = results;
    }
    if (moaVariant.gene2) {
        const results = await entrezGene.fetchAndLoadBySymbol(
            conn, moaVariant.gene2,
        );

        if (results.length > 1) {
            throw Error(`Error finding gene by symbol (${moaVariant.gene2}). Symbol is non-specific and returns multiple matches`);
        } else if (results.length === 0) {
            throw Error(`Error finding gene by symbol (${moaVariant.gene2}). No results`);
        }
        [gene2] = results;
    }

    if (moaVariant.feature_type === 'rearrangement') {
        if (!['Translocation', 'Fusion'].includes(moaVariant.rearrangement_type)) {
            throw Error(`Rearrangement has an unknown type (${moaVariant.rearrangement_type}): ${moaVariant.gene1}/${moaVariant.gene2}`);
        }
        const variantType = await conn.getVocabularyTerm(moaVariant.rearrangement_type);
        return conn.addVariant({
            content: {
                reference1: rid(gene),
                reference2: gene2 !== null
                    ? rid(gene2)
                    : gene2,
                type: rid(variantType),
            },
            existsOk: true,
            target: 'CategoryVariant',
        });
    } if (['somatic_variant', 'germline_variant'].includes(moaVariant.feature_type)) {
        return loadSmallMutation(conn, gene, moaVariant);
    } if (moaVariant.feature_type === 'microsatellite_stability') {
        if (moaVariant.status === 'MSI-High') {
            const signature = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { name: 'microsatellite instability' },
                    ],
                },
                target: 'Signature',
            });
            const variantType = await conn.getVocabularyTerm('high signature');
            return conn.addVariant({
                content: { reference1: rid(signature), type: rid(variantType) },
                existsOk: true,
                target: 'CategoryVariant',
            });
        }
    } else if (moaVariant.feature_type === 'mutational_signature') {
        const signature = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: 'cosmic' }, target: 'Source' } },
                    { sourceId: `SBS${Number.parseInt(moaVariant.cosmic_signature_number, 10)}` },
                    { sourceIdVersion: `${Number.parseInt(moaVariant.cosmic_signature_version, 10)}` },
                ],
            },
            target: 'Signature',
        });
        const variantType = await conn.getVocabularyTerm('signature present');
        return conn.addVariant({
            content: { reference1: rid(signature), type: rid(variantType) },
            existsOk: true,
            target: 'CategoryVariant',
        });
        // } else if (moaVariant.feature_type === 'mutational_burden') {
    } else if (moaVariant.feature_type === 'copy_number') {
        const variantType = await conn.getVocabularyTerm(moaVariant.direction);
        return conn.addVariant({
            content: { reference1: rid(gene), type: rid(variantType) },
            existsOk: true,
            target: 'CategoryVariant',
        });
    } else if (moaVariant.feature_type === 'knockdown') {
        const variantType = await conn.getVocabularyTerm('knockdown', 'moa');
        return conn.addVariant({
            content: { reference1: rid(gene), type: rid(variantType) },
            existsOk: true,
            target: 'CategoryVariant',
        });
    }
    throw Error(`Unexpected variant configuration: ${moaVariant.feature_type}`);
};


const loadRecord = async (conn, moaRecord, moaSource, relevanceTerms) => {
    /**
     * Load assertions from MoA as GraphKB Statements
     */

    let disease;

    if (moaRecord.oncotree_term && moaRecord.oncotree_code) {
        disease = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { name: moaRecord.oncotree_term },
                    { sourceId: moaRecord.oncotree_code },
                    { source: { filters: { name: 'oncotree' }, target: 'Source' } },
                ],
            },
            target: 'Disease',
        });
    } else if (moaRecord.oncotree_term) {
        disease = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { name: moaRecord.oncotree_term },
                    { source: { filters: { name: 'oncotree' }, target: 'Source' } },
                ],
            },
            target: 'Disease',
        });
    } else if (moaRecord.disease) {
        disease = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { name: moaRecord.disease },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'Disease',
        });
    } else {
        throw Error('disease not given');
    }

    const evidenceLevel = rid(await conn.getUniqueRecordBy({
        filters: {
            AND: [
                { name: moaRecord.predictive_implication },
                { source: rid(moaSource) },
            ],
        },
        target: 'EvidenceLevel',
    }));

    const pubmedIds = moaRecord.sources.map(s => s.pmid).filter(s => s !== null);
    const articles = await pubmed.fetchAndLoadByIds(conn, pubmedIds);

    if (articles.length !== pubmedIds.length) {
        throw Error(`mismatch number of articles found (${articles.length}) compared to those specified ${pubmedIds.length}`);
    }

    for (const sourceRecord of moaRecord.sources) {
        if (sourceRecord.pmid === null) {
            if (sourceRecord.nct && sourceRecord.source_type !== 'Abstract') {
                articles.push(await _trials.fetchAndLoadById(conn, sourceRecord.nct));
            } else if (['FDA', 'Guideline'].includes(sourceRecord.source_type)) {
                articles.push(await conn.addRecord({
                    content: {
                        citation: sourceRecord.citation,
                        displayName: `${SOURCE_DEFN.displayName} ${sourceRecord.source_type}-${sourceRecord.source_id}`,
                        name: `${sourceRecord.source_type}-${sourceRecord.source_id}`,
                        source: rid(moaSource),
                        sourceId: sourceRecord.source_id,
                        url: sourceRecord.url,
                    },
                    existsOk: true,
                    target: 'CuratedContent',
                }));
            } else {
                throw Error(`Unable to process evidence (${sourceRecord.source_type})`);
            }
        }
    }

    if (moaRecord.therapy_resistance === true && moaRecord.therapy_sensitivity === true) {
        throw Error('nonsensical entry linked to both sensitivity and resistance');
    }

    let therapy = null;

    if (moaRecord.therapy_name) {
        therapy = await conn.addTherapyCombination(moaSource, moaRecord.therapy_name);
    }


    const moaVariants = [];
    moaRecord.features.forEach(feature => {
        moaVariants.push(...feature.attributes);
    });

    const variants = [];

    for (const variant of moaVariants) {
        const varRecord = await loadVariant(conn, variant);

        if (varRecord === null) {
            throw Error(`Failed to parse variant from record: ${JSON.stringify(variant)}`);
        }
        variants.push(varRecord);
    }

    const result = [];

    for (const termName of relevanceTerms) {
        const term = await conn.getVocabularyTerm(termName);
        const conditions = [...variants, disease];
        let subject = null;

        if (['sensitivity', 'resistance', 'no sensitivity'].includes(termName)) {
            subject = rid(therapy);
            conditions.push(subject);
        } else if (['favourable prognosis', 'unfavourable prognosis'].includes(termName)) {
            subject = rid(await conn.getVocabularyTerm('patient'));
            conditions.push(subject);
        } else if (termName === 'pathogenic') {
            subject = rid(disease);
        } else {
            throw Error(`Unable to determine subject for relevance (${termName})`);
        }

        const statement = await conn.addRecord({
            content: {
                conditions: conditions.map(rid),
                evidence: articles.map(rid),
                evidenceLevel: [evidenceLevel],
                relevance: rid(term),
                source: rid(moaSource),
                sourceId: moaRecord.assertion_id,
                subject,
            },
            evidence: articles.map(rid),
            existsOk: true,
            fetchConditions: {
                AND: [
                    { source: rid(moaSource) },
                    { sourceId: moaRecord.assertion_id },
                    { relevance: rid(term) },
                ],
            },
            fetchExisting: true,
            target: 'Statement',
            upsert: true,
        });
        result.push(statement);
    }
    return result;
};


const fixStringNulls = (obj) => {
    /**
     * Any values of "None" replace with null
     */
    if (obj === 'None') {
        return null;
    }
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(fixStringNulls);
    }
    const result = { ...obj };
    const propList = Object.keys(obj);

    for (const prop of propList) {
        if (!['gene', 'gene1', 'gene2'].includes(prop)) {
            result[prop] = fixStringNulls(obj[prop]);
        }
    }
    return result;
};


const parseRelevance = (moaRecord) => {
    /**
     * Pull out all applicable relevance terms from an MOA assertion record
     */
    if (moaRecord.therapy_resistance === true && moaRecord.therapy_sensitivity === true) {
        throw Error('nonsensical entry linked to both sensitivity and resistance');
    }

    const relevance = [];

    if (moaRecord.therapy_name) {
        if (moaRecord.therapy_resistance === true) {
            relevance.push('resistance');
        } else if (moaRecord.therapy_sensitivity === true) {
            relevance.push('sensitivity');
        } else if (moaRecord.therapy_sensitivity === false) {
            relevance.push('no sensitivity');
        }
    }
    if (moaRecord.favorable_prognosis === true) {
        relevance.push('favourable prognosis');
    } else if (moaRecord.favorable_prognosis === false) {
        relevance.push('unfavourable prognosis');
    }

    const variants = [];

    for (const feature of moaRecord.features) {
        variants.push(...feature.attributes);
    }

    if (variants.every(variant => variant.pathogenic === '1.0') && variants.length > 0) {
        relevance.push('pathogenic');
    }

    if (relevance.length < 1) {
        throw Error('statement has no relevance');
    }
    return relevance;
};


const upload = async ({ conn, url = 'https://moalmanac.org/api/assertions' }) => {
    const source = await conn.addSource(SOURCE_DEFN);
    const records = await requestWithRetry({ json: true, method: 'GET', uri: url });
    logger.info(`loaded ${records.length} assertions from MOA API`);

    const counts = { error: 0, skipped: 0, success: 0 };
    const existingRecords = await conn.getRecords({
        filters: { source: rid(source) },
        returnProperties: ['@rid', 'sourceId', 'updatedAt'],
        target: 'Statement',
    });

    const existing = {};

    for (const record of existingRecords) {
        const key = record.sourceId;

        if (existing[key] === undefined) {
            existing[key] = [];
        }
        existing[key].push(record);
    }

    for (const rawRecord of records) {
        try {
            logger.info(`loading: ${rawRecord.assertion_id} / ${records.length}`);
            const record = fixStringNulls(rawRecord);
            checkSpec(validateMoaRecord, record);

            const key = `${record.assertion_id}`;
            const lastUpdate = new Date(record.last_updated).getTime();
            const relevance = parseRelevance(record);

            // do we have the expected number of GraphKB records for this MOA assertion
            if (existing[key] && existing[key].length === relevance.length) {
                // check the last update date of the assertion against the timestamp in GraphKB
                if (existing[key].every(r => lastUpdate <= r.updatedAt)) {
                    logger.debug('Skip. Current record exists and does not need updating');
                    counts.skipped++;
                    continue;
                }
            }
            const updatedRecords = (await loadRecord(conn, record, source, relevance)).map(r => r['@rid']);

            if (existing[key]) {
                const toRemove = existing[key].map(r => r['@rid']).filter(r => !updatedRecords.includes(r));

                if (toRemove.length) {
                    logger.warn(`Removing ${toRemove.length} records that are out of date`);

                    for (const recordId of toRemove) {
                        await conn.deleteRecord('Statement', recordId);
                    }
                }
            }
            counts.success++;
        } catch (err) {
            logger.warn(`${err}`);
            counts.error++;

            if (err.toString().includes('Cannot read property')) {
                throw err;
            }
        }
    }
    logger.info(JSON.stringify(counts));
};



module.exports = {
    SOURCE_DEFN, composeGenomicHgvs, fixStringNulls, loadSmallMutation, parseRelevance, upload,
};
