const readXlsxFile = require('read-excel-file/node');
const kbParser = require('@bcgsc-pori/graphkb-parser');

const { logger } = require('../logging');
const { rid } = require('../graphkb');
const _pubmed = require('../entrez/pubmed');
const _entrezGene = require('../entrez/gene');
const { PMC4232638: SOURCE_DEFN } = require('../sources');


const TP53_COLS = {
    DOM: 'Functional categories for TP53 - Dominant negative activity',
    GOF: 'Functional categories for TP53 - Gain of function',
    LOF: 'Functional categories for TP53 - Loss of function',
    WT: 'Functional categories for TP53 - Conserved wild-type function',
};

const THIS_PUBMED_ID = '25348012';

const KINASE_COL = 'Functional categories for oncogenes/ new cancer genes - Change in kinase, GTPase, or other enzymatic activity (i.e. RNase)';

/**
 * Parse the excel supplmentary file to assign relevance to rows
 */
const readSupplementaryFile = async (filename) => {
    logger.info(`reading: ${filename}`);
    const rawData = await readXlsxFile(filename, { sheet: 'Additional file 2' });

    const header = [];
    let lastSuperHeader;

    for (let i = 0; i < rawData[0].length; i++) {
        const superCol = rawData[1][i];
        const col = rawData[2][i];

        if (superCol !== null) {
            lastSuperHeader = superCol;
        }
        if (!col) {
            header.push(superCol);
        } else {
            header.push(`${lastSuperHeader} - ${col}`);
        }
    }

    const rows = [];

    for (const rawRow of rawData.slice(3)) {
        const row = {};
        rawRow.forEach((v, i) => {
            if (v !== '----' && v !== null) {
                row[header[i]] = v;
            } else {
                row[header[i]] = '';
            }
        });

        if (row['Functional classification'] === 'non-neutral') {
            rows.push(row);
        }
    }
    rows.filter(row => row[KINASE_COL] === 'yes' && ['Oncogene', 'New cancer gene'].includes(row.Type))
        .forEach((row) => {
            row.relevance = 'likely gain of function';
        });

    // now loop over TP53 mutations
    for (const row of rows) {
        const isNo = s => !s || s.toLowerCase().startsWith('no ');
        const gof = !isNo(row[TP53_COLS.GOF]);
        const lof = !isNo(row[TP53_COLS.LOF]);
        const domNeg = !isNo(row[TP53_COLS.DOM]);

        if (gof && (lof || domNeg)) {
            continue; // skip entries in multiple categories
        } else if (gof) {
            row.relevance = 'gain of function';
        } else if (domNeg && lof) {
            row.relevance = 'dominant negative';
        } else if (lof) {
            row.relevance = 'loss of function';
        }
    }

    // clean up the PMIDs
    for (const row of rows) {
        if (row.relevance) {
            row.evidence = [THIS_PUBMED_ID];
            row.comment = '';

            if (!row['PubMed ID (PMID)']) {
                continue;
            }
            const pmids = `${row['PubMed ID (PMID)']}`.split(',');
            const comment = [];
            const evidence = [];

            for (const pmid of pmids) {
                const m = /^\s*(\d+)\s*(\([^)]+\))?$/.exec(pmid);

                if (!m) {
                    logger.warn(`unable to parse pubmed ID ${pmid.trim()}`);
                } else {
                    evidence.push(m[1]);
                    comment.push(`PMID:${pmid.trim()}`);
                }
            }
            row.evidence.push(...evidence);
            row.comment = comment.join('; ');
        }
    }
    return rows.filter(row => row.relevance);
};

const uploadFile = async ({ conn, filename }) => {
    logger.info('retrieve the publication');
    const rows = await readSupplementaryFile(filename);
    const source = rid(await conn.addRecord({
        content: {
            ...SOURCE_DEFN,
        },
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    }));
    logger.info(`found ${rows.length} functional impact statements`);
    logger.info('pre-loading pubmed entries');
    await _pubmed.preLoadCache(conn);

    // now upload the statements
    const counts = { error: 0, success: 0 };

    for (const row of rows) {
        logger.info(`loading: ${row.Gene}:${row['Amino acid change']}`);

        try {
            const parsed = kbParser.variant.parse(`p.${row['Amino acid change']}`, false).toJSON();
            const [gene] = await _entrezGene.fetchAndLoadBySymbol(conn, row.Gene);
            const relevance = await conn.getVocabularyTerm(row.relevance);
            const evidence = await _pubmed.fetchAndLoadByIds(conn, row.evidence);
            const variantType = await conn.getVocabularyTerm(parsed.type);
            // create the variant record
            const variant = await conn.addVariant({
                content: {
                    ...parsed,
                    reference1: rid(gene),
                    type: rid(variantType),
                },
                existsOk: true,
                target: 'PositionalVariant',
            });

            // now create the statement
            await conn.addRecord({
                content: {
                    conditions: [rid(variant), rid(gene)],
                    evidence: evidence.map(rid),
                    relevance: rid(relevance),
                    source: rid(source),
                    subject: rid(gene),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'Statement',
            });
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
            throw err;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = {
    SOURCE_DEFN: {}, uploadFile,
};
