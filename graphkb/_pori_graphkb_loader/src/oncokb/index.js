/**
 * @module importer/oncokb
 */
const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

const kbParser = require('@bcgsc-pori/graphkb-parser');

const {
    checkSpec,
    hashRecordToId,
} = require('../util');
const {
    orderPreferredOntologyTerms,
    rid,
    convertRecordToQueryFilters,
} = require('../graphkb');
const _pubmed = require('../entrez/pubmed');
const _entrezGene = require('../entrez/gene');
const _ncit = require('../ncit');
const { logger } = require('../logging');
const { oncokb: SOURCE_DEFN } = require('../sources');


const ajv = new Ajv();


const actionableRecordSpec = ajv.compile({
    properties: {
        abstracts: { type: 'string' },
        cancerType: { type: 'string' },
        drugs: { type: 'string' },
        entrezGeneId: { type: 'number' },
        gene: { type: 'string' },
        level: { type: 'string' },
        pmids: { type: 'string' },
        proteinChange: { type: 'string' },
        // TODO: Link variant to protein change with 'infers' where different
        variant: { type: 'string' },
    },
    type: 'object',
});
const annotatedRecordSpec = ajv.compile({
    properties: {
        entrezGeneId: { type: 'number' },
        gene: { type: 'string' },
        mutationEffect: { type: 'string' },
        mutationEffectAbstracts: { type: 'string' },
        mutationEffectPmids: { type: 'string' },
        oncogenicity: { type: 'string' },
        proteinChange: { type: 'string' },
        // TODO: Link variant to protein change with 'infers' where different
        variant: { type: 'string' },
    },
    type: 'object',
});
const drugRecordSpec = ajv.compile({
    properties: {
        drugName: { type: 'string' },
        ncitCode: { pattern: '^C\\d+$', type: 'string' },
        synonyms: {
            items: { type: 'string' },
            type: 'array',
        },
        uuid: { format: 'uuid', type: 'string' },
    },
    required: ['drugName', 'uuid'],
    type: 'object',
});
const curatedGeneSpec = ajv.compile({
    properties: {
        entrezGeneId: { type: 'number' },
        oncogene: { type: 'boolean' },
        tsg: { type: 'boolean' },
    },
    requried: ['entrezGeneId', 'oncogene', 'tsg'],
    type: 'object',
});

const variantSpec = ajv.compile({
    properties: {
        alteration: { type: 'string' },
        consequence: {
            properties: { term: { type: 'string' } },
            required: ['term'],
            type: 'object',
        },
        gene: {
            properties: { entrezGeneId: { type: 'number' } },
            required: ['entrezGeneId'],
            type: 'object',
        },
        name: { type: 'string' },
        proteinEnd: { type: 'number' },
        proteinStart: { type: 'number' },
    },
    required: ['gene', 'consequence', 'name', 'proteinStart', 'proteinEnd', 'alteration'],
    type: 'object',
});

const VOCABULARY_MAPPING = {
    fusions: 'fusion',
    'oncogenic mutations': 'oncogenic mutation',
    'promoter mutations': 'promoter mutation',
    'truncating mutations': 'truncating',
};

const DISEASE_MAPPING = {
    'all tumors': 'disease of cellular proliferation',
    'cns cancer': 'central nervous system cancer',
    'non-langerhans cell histiocytosis/erdheim-chester disease': 'non-langerhans-cell histiocytosis',
};

const VOCABULARY_CACHE = {};

const getVocabulary = async (conn, term) => {
    const stdTerm = term.trim().toLowerCase();

    if (VOCABULARY_CACHE[stdTerm]) {
        return VOCABULARY_CACHE[stdTerm];
    }
    const rec = await conn.getVocabularyTerm(stdTerm);
    VOCABULARY_CACHE[rec.sourceId] = rec;
    return rec;
};

/**
 * Parse the variant string preresentation from oncokb to its graphkB equivalent
 */
const parseVariantName = (variantIn, { reference1 } = {}) => {
    const variant = variantIn.toLowerCase().trim();

    try {
        kbParser.variant.parse(`p.${variant}`, false);
        return { type: `p.${variant}` };
    } catch (err) { }
    let match = /^([a-z])?(\d+)_([a-z])?(\d+)splice$/.exec(variant);

    if (match) {
        return {
            type: `p.(${match[1] || '?'}${match[2]}_${match[3] || '?'}${match[4]})spl`,
        };
    } if (variant.endsWith('_splice')) {
        return { type: `p.${variant.replace('_splice', 'spl')}` };
    } if (match = /^([a-z0-9_]+)[\u2013-]([a-z0-9_]+)(\s+fusion)?$/iu.exec(variant)) {
        const [, gene1, gene2] = match;

        if (reference1) {
            if (reference1.toLowerCase() === gene1) {
                return {
                    flipped: false,
                    reference2: gene2,
                    type: 'fusion',
                };
            } if (reference1.toLowerCase() === gene2) {
                return {
                    flipped: true,
                    reference2: gene1,
                    type: 'fusion',
                };
            }
            throw new Error(`Fusion gene names (${gene1},${gene2}) do not match expected gene name (${reference1})`);
        } else {
            return {
                flipped: false,
                reference2: gene2,
                type: 'fusion',
            };
        }
    } if (match = /^exon (\d+) (mutation|insertion|deletion|deletion\/insertion|splice mutation|indel|missense mutation)s?$/i.exec(variant)) {
        const [, pos, type] = match;

        if (type === 'deletion/insertion' || type === 'indel') {
            return { type: `e.${pos}delins` };
        }
        return { type: `e.${pos}${type.slice(0, 3)}` };
    } if (VOCABULARY_MAPPING[variant.toLowerCase().trim()] !== undefined) {
        return { type: VOCABULARY_MAPPING[variant.toLowerCase().trim()] };
    } if (match = /^Exon (\d+) and (\d+) deletion$/i.exec(variant)) {
        return { type: `e.${match[1]}_${match[2]}del` };
    } if (match = /^([A-Z]\d+)_([A-Z]\d+)(trunc|fs)$/i.exec(variant)) {
        const [, pos1, pos2, type] = match;

        return {
            type: `p.(${pos1}_${pos2})${type === 'trunc'
                ? '*'
                : 'fs'
            }`,
        };
    }
    throw new Error(`Unable to parse variant from variantName (variantName=${variantIn}, reference1=${reference1})`);
};


/**
 * Parse the variant string and return the new variant record with all appropriate calculated linked records
 */
const processVariant = async (conn, {
    gene, variantName, entrezGeneId, alternate,
}) => {
    let gene1,
        type,
        reference2,
        gene2,
        flipped = false;

    if (gene.toLowerCase() === 'other biomarkers') {
        try {
            const vocab = variantName.trim().toLowerCase();

            if (vocab !== 'microsatellite instability-high') {
                throw new Error(`unsupported biomarker variant ${variantName}`);
            }
            type = 'strong signature';
            gene1 = await conn.getUniqueRecordBy({
                filters: { name: 'microsatellite instability' },
                target: 'Signature',
            });
        } catch (err) {
            logger.warn(`failed to retrieve the associated vocabulary for (variant=${variantName})`);
            throw err;
        }
    } else {
        // gene-base variant
        try {
            [gene1] = await _entrezGene.fetchAndLoadByIds(conn, [entrezGeneId]);
        } catch (err) {
            logger.error(err);
            throw err;
        }

        // determine the type of variant we are dealing with
        try {
            ({ type, reference2, flipped } = parseVariantName(
                variantName,
                { reference1: gene1.name },
            ));
        } catch (err) {
            logger.warn(`${err} assume vocabulary term`);
            type = variantName;
        }

        try {
            if (reference2) {
                const candidates = await _entrezGene.fetchAndLoadBySymbol(conn, reference2);

                if (candidates.length !== 1) {
                    throw new Error(`Unable to find single (${candidates.map(c => `${c['@rid']}(${c.name})`)}) unique records by symbol (${reference2})`);
                }
                [gene2] = candidates;
            }
        } catch (err) {
            logger.warn(err);
            throw err;
        }
    }
    // swap them for fusions listed in opposite order. Use the variant name to determin the order
    // ex. GENE1-GENE2
    if (flipped) {
        [gene1, gene2] = [gene2, gene1];
    }

    // if it fits one of the known term types usethat, otherwise attempt to parse as if protein notation
    let variantUrl,
        variant,
        variantType = type;

    try {
        variantType = await getVocabulary(conn, variantType);
        variantUrl = 'CategoryVariant';
        variant = {};
    } catch (err) {
        logger.warn(err);
    }

    if (!variant) {
        try {
            variant = kbParser.variant.parse(type, false).toJSON();
        } catch (err) {
            try {
                // try with adding a p prefix also
                variant = kbParser.variant.parse(`p.${type}`, false).toJSON();
            } catch (err2) { }
            logger.warn(`failed to parse the variant (${type}) for record (gene=${gene}, variant=${variantName})`);
            throw err;
        }

        variantUrl = 'PositionalVariant';

        try {
            variantType = await getVocabulary(conn, variant.type);
        } catch (err) {
            logger.warn(`failed to retrieve the variant type (${variant.type})`);
        }
    }
    variant.reference1 = rid(gene1);

    if (gene2) {
        variant.reference2 = rid(gene2);
    }
    variant.type = rid(variantType);

    // create the variant
    for (const [key, value] of Object.entries(variant)) {
        if (value instanceof kbParser.position.Position) {
            variant[key] = value.toJSON();
        }
    }

    variant = await conn.addVariant({
        content: variant,
        existsOk: true,
        target: variantUrl,
    });

    // if there is an alternate representation, link it to this one
    if (alternate) {
        const { variant: altVariantName, entrezGeneId: altGeneId } = alternate;
        let reference1;

        if (altGeneId === entrezGeneId) {
            ({ reference1 } = variant);
        } else {
            [reference1] = await _entrezGene.fetchAndLoadByIds(conn, [altGeneId]);
        }

        try {
            // try with adding a p prefix also
            const parsed = kbParser.variant.parse(altVariantName, false).toJSON();
            parsed.reference1 = rid(reference1);
            parsed.type = rid(await getVocabulary(conn, parsed.type));
            const altVariant = rid(await conn.addVariant({
                content: parsed,
                existsOk: true,
                target: 'PositionalVariant',
            }));
            await conn.addRecord({
                content: {
                    in: rid(variant),
                    out: altVariant,
                },
                existsOk: true,
                fetchExisting: false,
                target: 'infers',
            });
        } catch (err) {
            logger.warn(`failed to parse the alternate variant form (${alternate.variant}) for record (gene=${gene}, variant=${variantName})`);
            logger.error(err);
        }
    }

    return variant;
};


const processDisease = async (conn, diseaseName) => {
    // next attempt to find the cancer type (oncotree?)
    let disease;

    try {
        disease = await conn.getUniqueRecordBy({
            filters: { name: diseaseName },
            sort: orderPreferredOntologyTerms,
            target: 'Disease',
        });
    } catch (err) {
        if (diseaseName.includes('/')) {
            disease = await conn.getUniqueRecordBy({
                filters: { name: diseaseName.split('/')[0].trim() },
                sort: orderPreferredOntologyTerms,
                target: 'Disease',
            });
        } else {
            throw err;
        }
    }
    return disease;
};


/**
 * Convert abstract citation to a sourceId findable in GraphKB
 *
 * @example
 * parseAbstractCitation('Camidge et al. Abstract# 8001, ASCO 2014 http://meetinglibrary.asco.org/content/132030-144')
 * {source: 'ASCO', year: 2014, abstractNumber: 80001}
 */
const parseAbstractCitation = (citation) => {
    let match;

    if (match = /.*Abstract\s*#\s*([A-Z0-9a-z][A-Za-z0-9-]+)[.,]? (AACR|ASCO),? (2\d{3})[., ]*/.exec(citation)) {
        const [, abstractNumber, sourceName, year] = match;
        return { abstractNumber, source: sourceName, year };
    }
    throw new Error(`unable to parse abstract citation (${citation})`);
};

/**
 * Parses an actionable record from OncoKB and querys the GraphKB for existing terms
 * Converts this record into a GraphKB statement (where possible) and uploads the statement to the GraphKB
 * http://oncokb.org/api/v1/utils/allActionableVariants.json
 *
 * @param opt {object} options
 * @param opt.conn {ApiConnection} the connection object for sending requests to the GraphKB server
 * @param opt.record {object} the record from OncoKB (post-parsing)
 * @param opt.source {object} the oncokb source object
 */
const processRecord = async ({
    conn, record, source, variantMap = {},
}) => {
    // get the variant
    const {
        gene,
        variantName,
        diseaseName,
        entrezGeneId,
        support,
        drug = null,
        levelName,
        relevanceName,
        appliesToTarget,
        sourceId,
    } = record;
    const key = `${entrezGeneId}:${variantName}`;
    const variant = await processVariant(conn, {
        alternate: variantMap[key], entrezGeneId, gene, variantName,
    });
    // next attempt to find the cancer type (oncotree?)
    let disease;

    if (diseaseName) {
        disease = await processDisease(conn, diseaseName);
    }

    // find the drug
    let therapy;

    if (drug) {
        try {
            therapy = await conn.getUniqueRecordBy({
                filters: { AND: [{ name: drug }, { source }] },
                sort: orderPreferredOntologyTerms,
                target: 'Therapy',
            });
        } catch (err) {
            if (drug.includes('+')) {
                // add the combination therapy as a new therapy defined by oncokb
                therapy = await conn.addTherapyCombination(source, drug, { matchSource: true });
            } else {
                throw err;
            }
        }
    }

    // get the evidence level and determine the relevance
    let level;

    if (levelName) {
        level = await conn.getUniqueRecordBy({
            filters: { AND: [{ sourceId: levelName }, { source }] },
            target: 'EvidenceLevel',
        });
    }
    const relevance = await getVocabulary(conn, relevanceName);

    // find/add the publications
    const pmids = support.filter(pmid => /^\d+$/.exec(pmid.trim()));
    const abstracts = [];

    for (const abstract of support.filter(pmid => !/^\d+$/.exec(pmid.trim()))) {
        let parsed;

        try {
            parsed = parseAbstractCitation(abstract);
        } catch (err) {
            // only report parsing error when statement will otherwise fail
            if (pmids.length < 1) {
                logger.warn(err);
            }
            continue;
        }

        try {
            const absRecord = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { source: { filters: { name: parsed.source }, target: 'Source' } },
                        { year: parsed.year },
                        { abstractNumber: parsed.abstractNumber },
                    ],
                },
                target: 'Abstract',
            });
            abstracts.push(absRecord);
        } catch (err) {
            logger.warn(err);
        }
    }
    const publications = await _pubmed.fetchAndLoadByIds(conn, pmids);

    const content = {
        conditions: [rid(variant)],
        evidence: [...publications.map(rid), ...abstracts.map(rid)],
        relevance: rid(relevance),
        reviewStatus: 'not required',
        source,
        sourceId,
    };

    if (disease) {
        content.conditions.push(rid(disease));
    }
    if (appliesToTarget === 'drug') {
        content.subject = rid(therapy);
        content.conditions.push(content.subject);
    } else if (appliesToTarget === 'gene') {
        content.subject = rid(variant.reference1);
        content.conditions.push(content.subject);
    } else if (appliesToTarget === 'variant') {
        content.subject = rid(variant);
    } else {
        throw new Error(`Unrecognized appliesToTarget (${appliesToTarget})`);
    }
    if (level) {
        content.evidenceLevel = rid(level);
    }
    // make the actual statement
    await conn.addRecord({
        content,
        existsOk: true,
        fetchExisting: false,
        target: 'Statement',
    });
};


const generateSourceId = (rec) => {
    const { _rec, ...rest } = rec;
    return hashRecordToId(rest);
};


const parseActionableRecord = (rawRecord) => {
    checkSpec(actionableRecordSpec, rawRecord);

    const statements = [];
    let disease = rawRecord.cancerType.toLowerCase().trim();
    disease = DISEASE_MAPPING[disease] || disease;
    const variant = VOCABULARY_MAPPING[rawRecord.variant] || rawRecord.variant;
    const support = rawRecord.pmids.split(',').filter(pmid => pmid && pmid.trim());
    support.push(...(rawRecord.abstracts || '').split(';').filter(c => c.trim()));
    let relevance;

    if (/^[r]\d+$/i.exec(rawRecord.level)) {
        relevance = 'resistance';
    } else if (/^\d+[a-z]?$/i.exec(rawRecord.level)) {
        relevance = 'sensitivity';
    } else {
        throw new Error(`did not recognize evidence level (${rawRecord.level})`);
    }

    for (const drug of Array.from(rawRecord.drugs.split(','), x => x.trim().toLowerCase()).filter(x => x.length > 0)) {
        statements.push({
            _raw: rawRecord,
            appliesToTarget: 'drug',
            diseaseName: disease,
            drug,
            entrezGeneId: rawRecord.entrezGeneId,
            gene: rawRecord.gene.toLowerCase().trim(),
            levelName: rawRecord.level,
            relevanceName: relevance,
            support,
            variantName: variant,
        });
    }

    return statements.map(rec => ({ ...rec, sourceId: generateSourceId(rec) }));
};


const parseAnnotatedRecord = (rawRecord) => {
    checkSpec(annotatedRecordSpec, rawRecord);
    const support = rawRecord.mutationEffectPmids
        .split(',')
        .filter(pmid => pmid && pmid.trim());
    const gene = rawRecord.gene.toLowerCase().trim();
    const variant = VOCABULARY_MAPPING[rawRecord.variant] || rawRecord.variant;

    support.push(...(rawRecord.mutationEffectAbstracts || '').split(';').filter(c => c.trim()));
    return [{
        _raw: rawRecord,
        appliesToTarget: 'gene',
        entrezGeneId: rawRecord.entrezGeneId,
        gene,
        relevanceName: rawRecord.mutationEffect.replace(/-/g, ' ').toLowerCase().trim(),
        support,
        variantName: variant,
    }, {
        _raw: rawRecord,
        appliesToTarget: 'variant',
        entrezGeneId: rawRecord.entrezGeneId,
        gene,
        relevanceName: rawRecord.oncogenicity.toLowerCase().trim(),
        support,
        variantName: variant,
    }].map(rec => ({ ...rec, sourceId: generateSourceId(rec) }));
};


/**
 * Add the oncokb evidence level terms. Pulls data from: http://oncokb.org/api/v1/levels
 */
const addEvidenceLevels = async (conn, proxy, source) => {
    const levels = proxy.get('levels.json');
    const result = {};

    for (let [level, desc] of Object.entries(levels)) {
        if (!/^LEVEL_[A-Z0-9]+$/.exec(level)) {
            throw new kbParser.error.ParsingError({
                expected: '/^LEVEL_[A-Z0-9]+$/',
                message: `Error in parsing the level name: ${level}`,
                observed: level,
            });
        }
        level = level.slice('LEVEL_'.length);
        const record = await conn.addRecord({
            content: {
                description: desc,
                name: level,
                source: rid(source),
                sourceId: level,
                url: 'http://oncokb.org/api/v1/levels',
            },
            existsOk: true,
            fetchConditions: convertRecordToQueryFilters({ name: level, source: rid(source), sourceId: level }),
            target: 'EvidenceLevel',
        });
        result[level] = record;
    }
    return result;
};


/**
 * Upload the gene curation as tumour supressive or oncogenic statements
 */
const uploadAllCuratedGenes = async ({ conn, proxy, source }) => {  // eslint-disable-line
    const genes = proxy.get('allCuratedGenes.json');

    const tsg = rid(await conn.getVocabularyTerm('tumour suppressive'));
    const oncogene = rid(await conn.getVocabularyTerm('oncogenic'));

    for (const gene of genes) {
        logger.debug(`processing gene: ${gene.entrezGeneId}`);
        let record;

        try {
            checkSpec(curatedGeneSpec, gene, g => g.entrezGeneId);
            [record] = await _entrezGene.fetchAndLoadByIds(conn, [gene.entrezGeneId]);
            record = rid(record);
        } catch (err) {
            logger.error(err);
            continue;
        }
        // now add the TSG or oncogene statement
        const relevance = [];

        if (gene.oncogene) {
            relevance.push(oncogene);
        }
        if (gene.tsg) {
            relevance.push(tsg);
        }
        await Promise.all(relevance.map(async (rel) => {
            try {
                await conn.addRecord({
                    content: {
                        conditions: [record],
                        description: gene.summary,
                        evidence: [rid(source)],
                        relevance: rel,
                        source: rid(source),
                        subject: record,
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'Statement',
                });
            } catch (err) {
                logger.error(err);
            }
        }));
    }
};

/**
 * Load the drug ontology from OncoKB
 */
const uploadAllTherapies = async ({ conn, proxy, source }) => {
    const drugs = proxy.get('drugs.json');

    const aliases = [];


    for (const drug of drugs) {
        logger.debug(`processing drug: ${drug.uuid}`);
        let record;

        try {
            checkSpec(drugRecordSpec, drug, d => d.uuid);
            record = await conn.addRecord({
                content: { name: drug.drugName, source, sourceId: drug.uuid },
                existsOk: true,
                target: 'Therapy',
            });
        } catch (err) {
            logger.error(err);
            continue;
        }

        // link to NCIT
        if (drug.ncitCode) {
            try {
                const ncit = await conn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { sourceId: drug.ncitCode },
                            { source: { filters: { name: _ncit.SOURCE_DEFN.name }, target: 'Source' } },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                });
                await conn.addRecord({
                    content: { in: rid(ncit), out: rid(record), source },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'crossreferenceof',
                });
            } catch (err) {
                logger.warn(`Failed to link ${drug.uuid} to ${drug.ncitCode}`);
            }
        }

        // link to the alias terms
        drug.synonyms
            .filter(syn => syn.toLowerCase().trim() !== record.name)
            .forEach(syn => aliases.push([record, syn]));
    }

    const addAlias = async ([record, aliasName]) => {
        if (aliasName.toLowerCase().trim() === record.name) {
            return;
        }

        try {
            const alias = await conn.addRecord({
                content: {
                    dependency: rid(record),
                    name: aliasName,
                    source,
                    sourceId: record.sourceId,
                },
                existsOk: true,
                target: 'Therapy',
            });
            await conn.addRecord({
                content: { in: rid(alias), out: rid(record), source },
                existsOk: true,
                fetchExisting: false,
                target: 'AliasOf',
            });
        } catch (err) {
            logger.warn(`Failed to link alias ${record.sourceId} to ${aliasName} (${err})`);
        }
    };

    await Promise.all(aliases.map(addAlias));
};


const getVariantDescriptions = async (proxy) => {
    // grab all the variant details
    const variantMap = {};
    const variantRecords = proxy.get('variants.json');

    for (const record of variantRecords) {
        try {
            checkSpec(variantSpec, record);
        } catch (err) {
            logger.error(err);
            continue;
        }
        const { alteration, name, gene: { entrezGeneId } } = record;

        if (alteration === name) {
            continue;
        }
        const key = `${entrezGeneId}:${name}`;
        const match = /^([A-Z])?(\d+)_([A-Z])?(\d+)(\S+)$/.exec(alteration);

        if (!match) {
            logger.error(`unexpected variant alteration pattern (${alteration})`);
        } else {
            const [, startAA, start, endAA, end, rawType] = match;
            const type = rawType.replace('splice', 'spl').replace('mis', '?');
            let variant = `p.(${startAA || '?'}${start}_${endAA || '?'}${end})${type}`;

            if (type === 'ins') {
                variant = `p.(${startAA || '?'}${start}_${endAA || '?'}${end})_(${startAA || '?'}${start}_${endAA || '?'}${end})${type}`;
            }
            variantMap[key] = { entrezGeneId, variant };
        }
    }
    return variantMap;
};


/**
 * Reads files as if they were API reponses (API is no longer open but have the original downloads)
 * @param {string} dirname the directory where the downloaded endpoint responses live
 */
const oncokbProxy = (dirname) => {
    if (!fs.existsSync(dirname)) {
        throw new Error(`Input directory (${dirname}) does not exist`);
    }

    const get = (filename) => {
        const content = fs.readFileSync(path.join(dirname, filename));
        return JSON.parse(content);
    };
    return { get };
};


/**
 * Upload the OncoKB statements from the OncoKB API into GraphKB
 *
 * @param {object} opt options
 * @param {string} [opt.url] the base url for fetching from the OncoKB Api
 * @param {ApiConnection} opt.conn the GraphKB api connection object
 */
const upload = async (opt) => {
    const { conn, errorLogPrefix } = opt;
    const proxy = oncokbProxy(opt.url);

    // add the source node
    const source = rid(await conn.addSource(SOURCE_DEFN));

    const variantMap = await getVariantDescriptions(proxy);
    const previousLoad = await conn.getRecords({
        filters: { source: { filters: { name: SOURCE_DEFN.name }, target: 'Source' } },
        returnProperties: 'sourceId',
        target: 'Statement',
    });

    logger.info('pre-loading entrez genes');
    await _entrezGene.preLoadCache(conn);
    logger.info('pre-loading pubmed articles');
    await _pubmed.preLoadCache(conn);
    // can no longer access URL and do not have a download of this file
    // logger.info('load oncogene/tumour suppressor list');
    // await uploadAllCuratedGenes({ conn, proxy, source });
    logger.info('load drug ontology');
    await uploadAllTherapies({ conn, proxy, source });
    await addEvidenceLevels(conn, proxy, source);

    const records = [];
    const counts = {
        errors: 0, existing: 0, skip: 0, success: 0,
    };

    const loadedIds = new Set();

    for (const prev of previousLoad) {
        loadedIds.add(prev.sourceId);
    }

    logger.info(`${loadedIds.size} previously loaded oncokb statements`);

    const errorList = [];

    // download and parse all variants
    for (const file of ['allActionableVariants', 'allAnnotatedVariants']) {
        logger.info(`loading: /utils/${file}.json`);
        const result = proxy.get(`${file}.json`);
        const parser = file === 'allActionableVariants'
            ? parseActionableRecord
            : parseAnnotatedRecord;

        logger.info(`loaded ${result.length} records`);

        for (const record of result) {
            try {
                records.push(...parser(record));
            } catch (err) {
                counts.errors++;
                errorList.push({ ...record, error: err.error || err, errorMessage: err.toString() });
            }
        }
    }

    // upload variant statements
    for (let i = 0; i < records.length; i++) {
        const record = records[i];

        if (loadedIds.has(record.sourceId)) {
            counts.existing++;
            continue;
        }
        logger.debug(`processing (${i} / ${records.length})`);

        if (record.relevanceName === 'inconclusive') {
            counts.skip++;
            continue;
        }

        try {
            await processRecord({
                conn, record, source, variantMap,
            });
            counts.success++;
        } catch (err) {
            counts.errors++;
            logger.error(err);

            if (err.toString().includes('Cannot convert undefined or null to object')) {
                console.error(record);
                throw err;
            }
            errorList.push({ ...record, error: err.error || err, errorMessage: err.toString() });
        }
    }
    const errorOutput = `${errorLogPrefix}-oncokb.json`;
    logger.info(`writing errors to ${errorOutput}`);
    fs.writeFileSync(errorOutput, JSON.stringify({ records: errorList }, null, 2));
    logger.info(`external records processed: ${JSON.stringify(counts)}`);
};

module.exports = {
    SOURCE_DEFN,
    kb: true,
    parseVariantName,
    specs: {
        actionableRecordSpec,
        annotatedRecordSpec,
        curatedGeneSpec,
        drugRecordSpec,
    },
    upload,
};
