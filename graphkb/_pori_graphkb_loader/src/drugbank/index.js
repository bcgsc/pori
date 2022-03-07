/**
 * Module to load the DrugBank data from the XML download
 * @module importer/drugbank
 */

const Ajv = require('ajv');
const XmlStream = require('xml-stream');
const fs = require('fs');

const { checkSpec } = require('../util');
const { rid } = require('../graphkb');
const _hgnc = require('../hgnc');
const { logger } = require('../logging');
const _chembl = require('../chembl');
const { drugbank: SOURCE_DEFN, fdaSrs: { name: fdaName } } = require('../sources');
const spec = require('./spec.json');


// Lists most of the commonly required 'Tags' and Attributes
const HEADER = {
    ident: 'drugbank-id',
    mechanism: 'mechanism-of-action',
    superclass: 'atc-code',
    superclasses: 'atc-codes',
    unii: 'unii',
};

/**
 * This defines the expected format of the JSON post transform from xml
 */
const ajv = new Ajv();
const validateDrugbankSpec = ajv.compile(spec);


const getDrugBankId = record => record['drugbank-id'][0].$text;


const processRecord = async ({
    conn, drug, sources: { current, fda }, ATC,
}) => {
    checkSpec(validateDrugbankSpec, drug, getDrugBankId);
    let atcLevels = [];

    try {
        atcLevels = Array.from(
            drug[HEADER.superclasses][0][HEADER.superclass][0].level,
            x => ({ name: x.$text, sourceId: x.$.code.toLowerCase() }),
        );
    } catch (err) {}
    logger.info(`processing ${getDrugBankId(drug)}`);
    const body = {
        description: drug.description,
        mechanismOfAction: drug[HEADER.mechanism],
        name: drug.name,
        source: rid(current),
        sourceId: getDrugBankId(drug),
        sourceIdVersion: drug.$.updated,
    };

    if (drug.categories[0] && drug.categories[0].category) {
        body.subsets = [];

        for (const cat of Object.values(drug.categories[0].category)) {
            body.subsets.push(cat.category[0]);
        }
    }
    if (drug['calculated-properties']) {
        for (const { kind, value } of drug['calculated-properties'].property) {
            if (kind === 'IUPAC Name') {
                body.iupacName = value;
            } else if (kind === 'Molecular Formula') {
                body.molecularFormula = value;
            }
        }
    }

    const record = await conn.addRecord({
        content: body,
        existsOk: true,
        fetchConditions: {
            AND: [
                { name: body.name },
                { source: rid(current) },
                { sourceId: body.sourceId },
            ],
        },
        fetchFirst: true,
        target: 'Therapy',
    });

    // create the categories
    for (const atcLevel of atcLevels) {
        if (ATC[atcLevel.sourceId] === undefined) {
            const level = await conn.addRecord({
                content: {
                    name: atcLevel.name,
                    source: rid(current),
                    sourceId: atcLevel.sourceId,
                },
                existsOk: true,
                target: 'Therapy',
            });
            ATC[level.sourceId] = level;
        }
    }

    if (atcLevels.length > 0) {
        // link the current record to the lowest subclass
        await conn.addRecord({
            content: {
                in: rid(ATC[atcLevels[0].sourceId]),
                out: rid(record),
                source: rid(current),
            },
            existsOk: true,
            fetchExisting: false,
            target: 'subclassof',
        });

        // link the subclassing
        for (let i = 0; i < atcLevels.length - 1; i++) {
            await conn.addRecord({
                content: {
                    in: rid(ATC[atcLevels[i + 1].sourceId]),
                    out: rid(ATC[atcLevels[i].sourceId]),
                    source: rid(current),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'subclassof',
            });
        }
    }
    // process the commerical product names
    const aliases = Array.from(new Set(
        (drug.products.product || [])
            .map(p => p.name)
            // only keep simple alias names (over 100k otherwise)
            .filter(p => /^[a-zA-Z]\w+$/.exec(p) && p.toLowerCase() !== drug.name.toLowerCase()),
    ));

    for (const aliasName of aliases) {
        const alias = await conn.addRecord({
            content: {
                dependency: rid(record),
                name: aliasName.toLowerCase(),
                source: rid(current),
                sourceId: getDrugBankId(drug),
            },
            existsOk: true,
            target: 'Therapy',
        });
        // link together
        await conn.addRecord({
            content: { in: rid(record), out: rid(alias), source: rid(current) },
            existsOk: true,
            fetchExisting: false,
            target: 'aliasof',
        });
    }

    // link to the FDA UNII
    if (fda && drug[HEADER.unii]) {
        let fdaRec;

        try {
            fdaRec = await conn.getUniqueRecordBy({
                filters: {
                    AND: [
                        { source: rid(fda) },
                        { sourceId: drug[HEADER.unii].trim() },
                    ],
                },
                target: 'Therapy',
            });
        } catch (err) {
            logger.log('error', `failed cross-linking from ${record.sourceId} to ${drug[HEADER.unii]} (fda)`);
        }

        if (fdaRec) {
            await conn.addRecord({
                content: {
                    in: rid(fdaRec), out: rid(record), source: rid(current),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'CrossReferenceOf',
            });
        }
    }
    // link to ChemBL
    const xrefs = [];

    try {
        xrefs.push(...drug['external-identifiers']['external-identifier']);
    } catch (err) {}

    for (const { resource, identifier } of xrefs) {
        if (resource.toLowerCase() === 'chembl') {
            try {
                const chemblDrug = await _chembl.fetchAndLoadById(conn, identifier);
                await conn.addRecord({
                    content: { in: rid(chemblDrug), out: rid(record), source: rid(current) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'crossreferenceof',
                });
            } catch (err) {
                logger.error(err);
            }
        }
    }

    // try to link this drug to hgnc gene targets
    if (drug.targets.target) {
        let interactionType = '';

        try {
            interactionType = drug.targets.target.actions.action.join('/');
        } catch (err) {}

        const genes = [];

        for (const polypeptide of (drug.targets.target.polypeptide || [])) {
            for (const gene of polypeptide['external-identifiers']['external-identifier']) {
                if (gene.resource[0] === 'HUGO Gene Nomenclature Committee (HGNC)') {
                    genes.push(gene.identifier[0]);
                }
            }
        }

        for (const identifier of genes) {
            const gene = await _hgnc.fetchAndLoadBySymbol({
                conn, paramType: 'hgnc_id', symbol: identifier,
            });
            await conn.addRecord({
                content: {
                    comment: interactionType,
                    in: rid(record),
                    out: rid(gene),
                    source: rid(current),
                },
                existsOk: true,
                fetchExisting: false,
                target: 'targetof',
            });
        }
    }
};


/**
 * Given the input XML file, load the resulting parsed ontology into GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input XML file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({ filename, conn, maxRecords }) => {
    logger.info('Loading the external drugbank data');

    const source = await conn.addSource(SOURCE_DEFN);

    const ATC = {};
    let fdaSource;

    try {
        fdaSource = await conn.getUniqueRecordBy({
            filters: { name: fdaName },
            target: 'Source',
        });
    } catch (err) {
        logger.warn('Unable to find fda source record. Will not attempt cross-reference links');
    }
    logger.info('caching previously requested CHEMBL drugs');
    await _chembl.preLoadCache(conn);
    const counts = { error: 0, skipped: 0, success: 0 };

    const parseXML = new Promise((resolve, reject) => {
        logger.log('info', `loading XML data from ${filename}`);
        const stream = fs.createReadStream(filename);
        const xml = new XmlStream(stream);
        xml.collect('drug drugbank-id');
        xml.collect('drug external-identifier');
        xml.collect('drug synonym');
        xml.collect('drug categories > category');
        xml.collect('drug atc-code level');
        xml.collect('drug target polypeptide');
        xml.collect('drug target actions action');
        xml.collect('drug products product');
        xml.collect('drug calculated-properties property');
        xml.on('endElement: drug', (item) => {
            if (Object.keys(item).length < 3) {
                return;
            }
            xml.pause();
            processRecord({
                ATC, conn, drug: item, sources: { current: source, fda: fdaSource },
            }).then(() => {
                counts.success++;

                if (maxRecords && (counts.success + counts.error + counts.skipped) >= maxRecords) {
                    logger.warn(`not loading all content due to max records limit (${maxRecords})`);
                    logger.info('Parsing stream complete');
                    stream.close();
                    resolve();
                }

                xml.resume();
            }).catch((err) => {
                let label;

                try {
                    label = getDrugBankId(item);
                } catch (err2) {}  // eslint-disable-line
                counts.error++;
                logger.error(err);
                logger.error(`Unable to process record ${label}`);
                xml.resume();
            });
        });
        xml.on('end', () => {
            logger.info('Parsing stream complete');
            stream.close();
            resolve();
        });
        xml.on('error', (err) => {
            logger.error('Parsing stream error');
            logger.error(err);
            stream.close();
            reject(err);
        });
    });

    await parseXML;
    logger.log('info', JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, dependencies: [fdaName], uploadFile };
