const Ajv = require('ajv');

const { variant: { parse: variantParser } } = require('@bcgsc-pori/graphkb-parser');

const { checkSpec } = require('../util');
const {
    fetchByIdList, uploadRecord, preLoadCache: preLoadAnyCache, BASE_FETCH_URL,
} = require('./util');
const refseq = require('./refseq');
const entrezGene = require('./gene');
const { rid } = require('../graphkb');
const { logger } = require('../logging');

const ajv = new Ajv();

const { dbSnp: SOURCE_DEFN } = require('../sources');

const DB_NAME = 'snp';
const LINK_URL = 'https://www.ncbi.nlm.nih.gov/snp';
const CACHE = {};

const recordSpec = ajv.compile({
    properties: {
        clinical_significance: { type: 'string' },
        docsum: { type: 'string' },
        genes: {
            items: {
                properties: {
                    gene_id: { pattern: '^\\d+$', type: 'string' },
                    name: { type: 'string' },
                },
                required: ['name', 'gene_id'],
                type: 'object',
            },
            type: 'array',
        },
        snp_id: { type: 'integer' },
        uid: { pattern: '^\\d+$', type: 'string' },
        updatedate: { type: 'string' },
    },
    required: ['uid', 'snp_id'],
    type: 'object',
});


const loadFromDocsumHgvs = async (api, hgvsVariants) => {
    let cds,
        protein;

    try {
        if (hgvsVariants.cds) {
            const parsed = variantParser(hgvsVariants.cds.split('|')[0], true).toJSON();
            const [transcript] = await refseq.fetchAndLoadByIds(api, [parsed.reference1]);
            const type = await api.getVocabularyTerm(parsed.type);
            cds = await api.addVariant({
                content: { ...parsed, reference1: rid(transcript), type: rid(type) },
                existsOk: true,
                target: 'PositionalVariant',
            });
        }
    } catch (err) {
        logger.error(`creating HGVSc (${hgvsVariants.cds}): ${err}`);
    }

    try {
        if (hgvsVariants.protein) {
            const gene = hgvsVariants.protein.split('|').find(p => p.startsWith('GENE='));
            const parsed = variantParser(hgvsVariants.protein.split('|')[0], true).toJSON();
            const [reference1] = await refseq.fetchAndLoadByIds(api, [parsed.reference1]);
            const type = await api.getVocabularyTerm(parsed.type);
            protein = await api.addVariant({
                content: { ...parsed, reference1: rid(reference1), type: rid(type) },
                existsOk: true,
                target: 'PositionalVariant',
            });

            if (cds) {
                await api.addRecord({
                    content: { in: rid(protein), out: rid(cds) },
                    existsOk: true,
                    target: 'Infers',
                });
            }

            if (gene) {
                const [geneRec] = await entrezGene.fetchAndLoadByIds(api, gene.split(':')[1]);
                const alternateProtein = await api.addVariant({
                    content: { ...parsed, reference1: rid(geneRec), type: rid(type) },
                    existsOk: true,
                    target: 'PositionalVariant',
                });
                await api.addRecord({
                    content: { in: rid(alternateProtein), out: rid(protein) },
                    existsOk: true,
                    target: 'Infers',
                });
            }
        }
    } catch (err) {
        logger.error(`creating HGVSp (${hgvsVariants.protein}): ${err}`);
    }
    return cds || protein;
};

/**
 * Given an record record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parseRecord = (record) => {
    checkSpec(recordSpec, record);
    const parsed = {
        displayName: `rs${record.snp_id}`,
        genes: record.genes.map(gene => gene.gene_id),
        hgvs: {},
        name: `rs${record.snp_id}`,
        sourceId: record.uid,
        sourceIdVersion: record.updatedate,
        url: `${LINK_URL}/rs${record.snp_id}`,
    };

    for (const tag of record.docsum.replace(/&gt;/g, '>').split(';')) {
        if (tag.startsWith('HGVS=')) {
            const notation = tag.replace(/^HGVS=/, '').split(',').sort().reverse();
            parsed.hgvs.cds = notation.find(n => /^NM_\d+.*:c\..*/.exec(n));
            parsed.hgvs.protein = notation.find(n => /^NP_\d+.*:p\..*/.exec(n));
            break;
        }
    }
    return parsed;
};


const loadSnpRecord = async (api, { hgvs, genes, ...content }) => {
    const uploaded = await uploadRecord(api, content, {
        cache: CACHE,
        sourceDefn: SOURCE_DEFN,
        target: 'CatalogueVariant',
    });

    // link to the hgvs cds notation
    const hgvsVariant = await loadFromDocsumHgvs(api, hgvs);

    if (hgvsVariant) {
        await api.addRecord({
            content: { in: rid(uploaded), out: rid(hgvsVariant) },
            existsOk: true,
            target: 'Infers',
        });
    }
    return uploaded;
};


/**
 * Given some list of pubmed IDs, return if cached,
 * If they do not exist, grab from the pubmed api
 * and then upload to GraphKB
 *
 * @param {ApiConnection} api connection to GraphKB
 * @param {Array.<string>} idList list of pubmed IDs
 */
const fetchAndLoadByIds = async (api, idListIn) => {
    const records = await fetchByIdList(
        idListIn,
        {
            cache: CACHE, db: DB_NAME, parser: parseRecord, url: BASE_FETCH_URL,
        },
    );
    return Promise.all(records.map(async rec => loadSnpRecord(api, rec)));
};

const preLoadCache = async api => preLoadAnyCache(
    api,
    {
        cache: CACHE, sourceDefn: SOURCE_DEFN, target: 'CatalogueVariant',
    },
);


module.exports = {
    SOURCE_DEFN,
    fetchAndLoadByIds,
    parseRecord,
    preLoadCache,
};
