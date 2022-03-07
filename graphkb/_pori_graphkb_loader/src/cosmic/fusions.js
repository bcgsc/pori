/**
 * Creates recurrence statements from the fusions export which can be downloaded as a file from
 * COSMIC
 */
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
const { loadClassifications, processDisease } = require('./resistance');

const { logger } = require('../logging');
const { cosmic: SOURCE_DEFN } = require('../sources');

const RECURRENCE_THRESHOLD = 3;

const HEADER = {
    disease: 'HISTOLOGY_SUBTYPE_1',
    diseaseFamily: 'PRIMARY_HISTOLOGY',
    exon1: '5\'_LAST_OBSERVED_EXON',
    exon2: '3\'_FIRST_OBSERVED_EXON',
    fusionId: 'FUSION_ID',
    fusionName: 'TRANSLOCATION_NAME',
    gene1: '5\'_GENE_NAME',
    gene2: '3\'_GENE_NAME',
    pubmed: 'PUBMED_PMID',
    sampleId: 'SAMPLE_ID',
};


const processVariants = async ({
    conn, record, variantType, exonSpecific,
}) => {
    // fetch the features
    const [gene1] = await _gene.fetchAndLoadBySymbol(conn, record.gene1);
    const [gene2] = await _gene.fetchAndLoadBySymbol(conn, record.gene2);

    // create the variants
    const general = await conn.addVariant({
        content: {
            reference1: rid(gene1),
            reference2: rid(gene2),
            type: variantType,
        },
        existsOk: true,
        target: 'CategoryVariant',
    });
    let specific;

    if (exonSpecific && record.exon1 && record.exon2) {
        specific = await conn.addVariant({
            content: {
                break1Repr: `e.${record.exon1}`,
                break1Start: { '@class': 'ExonicPosition', pos: record.exon1 },
                break2Repr: `e.${record.exon2}`,
                break2Start: { '@class': 'ExonicPosition', pos: record.exon2 },
                reference1: rid(gene1),
                reference2: rid(gene2),
                type: variantType,
            },
            existsOk: true,
            target: 'PositionalVariant',
        });
        await conn.addRecord({
            content: {
                in: rid(general),
                out: rid(specific),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'Infers',
        });
    }
    return [general, specific];
};


const processRecordGroup = async ({
    conn, records, source, relevance, variantType, exonSpecific, diseaseOverride,
}) => {
    // get the disease name
    const disease = diseaseOverride || rid(await processDisease(conn, records[0]));
    const pubmedIds = Array.from(new Set(records.map(r => r.pubmed)));
    const publications = await _pubmed.fetchAndLoadByIds(conn, pubmedIds);

    const [genericVariant, exonSpecificVariant] = await processVariants({
        conn, exonSpecific, record: records[0], variantType,
    });


    // create the recurrence statement
    await conn.addRecord({
        content: {
            conditions: [
                exonSpecific && exonSpecificVariant
                    ? exonSpecificVariant
                    : genericVariant,
                disease,
            ],
            evidence: publications.map(rid),
            relevance,
            reviewStatus: 'not required',
            source: rid(source),
            sourceId: records[0].sourceId,
            subject: disease,
        },
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
    });
};

/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async ({
    filename, conn, classification,
}) => {
    const jsonList = await loadDelimToJson(filename);
    const mapping = await loadClassifications(classification);
    // get the dbID for the source
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const counts = { error: 0, skip: 0, success: 0 };
    logger.info(`Processing ${jsonList.length} records`);

    const records = jsonList.map(row => convertRowFields(HEADER, row));
    const relevance = rid(await conn.getVocabularyTerm('recurrent'));
    const variantType = rid(await conn.getVocabularyTerm('fusion'));
    const cancer = rid(await conn.getUniqueRecordBy({ filters: { name: 'cancer' }, sort: orderPreferredOntologyTerms, target: 'Disease' }));

    await _pubmed.fetchAndLoadByIds(conn, records.map(rec => rec.pumbed));

    const addPropertyMatch = (histogram, object, properties) => {
        const hashId = hashRecordToId(object, properties);

        if (histogram[hashId] === undefined) {
            histogram[hashId] = [];
        }
        histogram[hashId].push(object);
    };

    const recurrenceCounts = [
        {}, // disease and exon specific
        {}, // disease and non-specific exons
        {}, // non-disease and non-exon specific
    ];
    const recurrentProperties = [
        ['variant', 'diseaseFamily', 'disease'],
        ['nonSpecificVariant', 'diseaseFamily', 'disease'],
        ['nonSpecificVariant'],
    ];

    // pre-process/clean records
    for (const record of records) {
        record.id = hashRecordToId(record, ['fusionId', 'sampleId']);
        record.ncit = (mapping[record.diseaseFamily] || {})[record.disease];

        record.disease = record.disease.toUpperCase() === 'NS'
            ? ''
            : record.disease;

        record.diseaseFamily = record.diseaseFamily.toUpperCase() === 'NS'
            ? ''
            : record.diseaseFamily;

        if (!record.disease && !record.diseaseFamily) {
            record.diseaseFamily = 'cancer';
        }

        [record.gene1] = record.gene1.split('_');
        [record.gene2] = record.gene2.split('_');

        record.variant = `(${record.gene1},${record.gene2}).fus(e.${record.exon1},e.${record.exon2})`;
        record.nonSpecificVariant = `(${record.gene1},${record.gene2}).fus(e.?,e.?)`;

        recurrentProperties.forEach((plist, index) => addPropertyMatch(recurrenceCounts[index], record, plist));
    }

    const getSampleCount = group => (new Set(group.map(row => row.sampleId))).size;

    logger.info(`processing ${records.length} recurrent fusion statements`);
    const processed = new Set();

    // disease-specific, exon-specific, fusions
    for (let index = 0; index <= recurrenceCounts.length; index++) {
        const recurrencyLevel = recurrenceCounts[index];

        for (const [groupId, group] of Object.entries(recurrencyLevel)) {
            if (processed.has(groupId) || getSampleCount(group) < RECURRENCE_THRESHOLD) {
                continue;
            }

            try {
                await processRecordGroup({
                    conn,
                    diseaseOverride: index > 1
                        ? cancer
                        : null,
                    exonSpecific: index === 0,
                    records: group,
                    relevance,
                    source,
                    variantType,
                });

                // block less specific versions of this recurrency statement to avoid redundancy
                recurrentProperties.slice(index + 1).forEach((plist) => {
                    const nextHashId = hashRecordToId(group[0], plist);
                    processed.add(nextHashId);
                });
                counts.success++;
            } catch (err) {
                logger.error(err);
                counts.error++;
            }
        }
    }

    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, uploadFile };
