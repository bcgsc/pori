const readXlsxFile = require('read-excel-file/node');
const fs = require('fs');

const { logger } = require('../logging');
const { convertRowFields } = require('../util');
const { rid, orderPreferredOntologyTerms } = require('../graphkb');
const _entrezGene = require('../entrez/gene');
const _pubmed = require('../entrez/pubmed');
const { PMC4468049: SOURCE_DEFN } = require('../sources');

// https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4468049/ Table 1
// https://gdc.cancer.gov/resources-tcga-users/tcga-code-tables/tcga-study-abbreviations
const DISEASE_CODES = {
    BLCA: 'Bladder Urothelial Carcinoma',
    BRCA: 'Breast cancer',
    GBM: 'Glioblastoma multiforme',
    HNSC: 'Head and Neck squamous cell carcinoma',
    KIRC: 'renal clear cell carcinoma',
    LAML: 'Acute Myeloid Leukemia',
    LGG: 'low-grade glioma, nos',
    LUAD: 'Lung adenocarcinoma',
    LUSC: 'Lung squamous cell carcinoma',
    OV: 'Ovarian serous cystadenocarcinoma',
    PRAD: 'Prostate adenocarcinoma',
    SKCM: 'cutaneous melanoma',
    THCA: 'Thyroid carcinoma',
};


const parseRecurrentFusions = async ({
    conn, filename, fileStream, publication, source,
}) => {
    logger.info(`loading: ${filename} (Table S7)`);
    const rawData = await readXlsxFile(fileStream || filename, { sheet: 'Table S7' });
    const [, header] = rawData;
    const rows = rawData.slice(2).map((values) => {
        const row = {};

        for (let i = 0; i < header.length; i++) {
            row[header[i]] = values[i];
        }
        return row;
    });
    const specificityCol = 'Specific to a single tumor type';
    const errorList = [];
    const counts = { error: 0, skip: 0, success: 0 };

    const diseaseMap = {};

    const fusion = rid(await conn.getVocabularyTerm('in-frame fusion'));
    const relevance = rid(await conn.getVocabularyTerm('recurrent'));
    const cancer = rid(await conn.getUniqueRecordBy({
        filters: {
            OR: [
                { sourceId: 'cancer' },
                { name: 'cancer' },
            ],
        },
        sort: orderPreferredOntologyTerms,
        target: 'Disease',
    }));

    for (const code of Object.keys(DISEASE_CODES)) {
        logger.info(`retrieving disease for code (${code})`);

        try {
            const disease = rid(await conn.getUniqueRecordBy({
                filters: {
                    OR: [
                        { sourceId: DISEASE_CODES[code] },
                        { name: DISEASE_CODES[code] },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            }));
            diseaseMap[code] = disease;
        } catch (err) {
            logger.error(err);
        }
    }

    for (const row of rows) {
        const [geneA, geneB] = row.FusionPair.split('__');
        logger.info(`processing (${geneA},${geneB})`);

        if (Number.parseInt(row.Total, 10) < 3) {
            logger.info(`skipping low frequency fusion (freq: ${row.Total})`);
            counts.skip++;
            continue;
        }

        let diseaseCode = null,
            disease = cancer;

        for (const col of Object.keys(row)) {
            if (!['FusionPair', specificityCol, 'Total'].includes(col) && row.Total === row[col]) {
                // disease count column
                diseaseCode = col;
                disease = diseaseMap[diseaseCode];
                break;
            }
        }

        if (!disease) {
            logger.info(`skipping missing disease (${diseaseCode})`);
            counts.skip++;
            continue;
        }

        try {
            const [reference1] = await _entrezGene.fetchAndLoadBySymbol(conn, geneA);
            const [reference2] = await _entrezGene.fetchAndLoadBySymbol(conn, geneB);

            const variant = rid(await conn.addVariant({
                content: {
                    reference1: rid(reference1),
                    reference2: rid(reference2),
                    type: fusion,
                },
                existsOk: true,
                target: 'CategoryVariant',
            }));
            await conn.addRecord({
                content: {
                    conditions: [variant, disease],
                    evidence: [publication],
                    relevance,
                    source,
                    subject: disease,
                },
                existsOk: true,
                fetchExisting: false,
                target: 'Statement',
            });

            counts.success++;
        } catch (err) {
            errorList.push({ error: err.toString(), record: row });
            logger.error(err);
            counts.error++;
        }
    }
    return errorList;
};


const parseKinaseFusions = async ({
    conn, filename, fileStream, publication, source,
}) => {
    logger.info(`loading: ${filename} (Table S11)`);
    const counts = { error: 0, skip: 0, success: 0 };
    const errorList = [];
    const rawData = await readXlsxFile(fileStream || filename, { sheet: 'Table S11' });
    const [, header] = rawData;
    const headerMap = {
        break1: 'Junction_A',
        break2: 'Junction_B',
        disease: 'Cancer',
        geneA: 'GeneID_A',
        geneB: 'GeneID_B',
        kinaseA: 'Kinase.A',
        kinaseB: 'Kinase.B',
    };
    const rows = rawData.slice(2).map((values) => {
        const row = {};

        for (let i = 0; i < header.length; i++) {
            row[header[i]] = values[i];
        }
        return convertRowFields(headerMap, row);
    });

    const fusion = rid(await conn.getVocabularyTerm('in-frame fusion'));
    const relevance = rid(await conn.getVocabularyTerm('likely gain of function'));

    for (const row of rows) {
        logger.info(`processing (${row.geneA},${row.geneB}):(g.${row.break1},g.${row.break2})`);

        if (row.kinaseA === row.kinaseB) {
            errorList.push({ error: 'skipping: cannot determine kinase partner', record: row });
            logger.info('skipping: cannot determine kinase partner');
            counts.skip++;
            continue;
        }

        try {
            const [geneA] = await _entrezGene.fetchAndLoadByIds(conn, [row.geneA]);
            const [geneB] = await _entrezGene.fetchAndLoadByIds(conn, [row.geneB]);

            const disease = rid(await conn.getUniqueRecordBy({
                filters: {
                    OR: [
                        { sourceId: DISEASE_CODES[row.disease] },
                        { name: DISEASE_CODES[row.disease] },
                    ],
                },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            }));

            const variant = rid(await conn.addVariant({
                content: {
                    break1Repr: `g.${row.break1}`,
                    break1Start: { '@class': 'GenomicPosition', pos: row.break1 },
                    break2Repr: `g.${row.break2}`,
                    break2Start: { '@class': 'GenomicPosition', pos: row.break2 },
                    displayName: `(${geneA.displayName},${geneB.displayName}):fusion(g.${row.break1},g.${row.break2})`,
                    reference1: rid(geneA),
                    reference2: rid(geneB),
                    type: fusion,
                },
                existsOk: true,
                target: 'PositionalVariant',
            }));
            await conn.addRecord({
                content: {
                    conditions: [variant, disease],
                    evidence: [publication],
                    relevance,
                    source,
                    subject: row.kinaseA === 'yes'
                        ? rid(geneA)
                        : rid(geneB),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'Statement',
            });

            counts.success++;
        } catch (err) {
            errorList.push({ error: err.toString(), record: row });
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
    return errorList;
};

const uploadFile = async ({ conn, filename, errorLogPrefix }) => {
    logger.info('retrieve the publication');
    const publication = rid((await _pubmed.fetchAndLoadByIds(conn, ['25500544']))[0]);
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const errorList = [];
    errorList.push(...await parseKinaseFusions({
        conn, filename, publication, source,
    }));
    errorList.push(...await parseRecurrentFusions({
        conn, filename, publication, source,
    }));

    const errorJson = `${errorLogPrefix}-PMC4468049.json`;
    logger.info(`writing: ${errorJson}`);
    fs.writeFileSync(errorJson, JSON.stringify({ records: errorList }, null, 2));
};

module.exports = {
    SOURCE_DEFN: {}, uploadFile,
};
