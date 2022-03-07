/**
 * Loader for the BCGSC custom drug ontology
 * @module importer/drug_ontology
 */

const { loadDelimToJson } = require('./util');
const { rid, orderPreferredOntologyTerms } = require('./graphkb');
const { logger } = require('./logging');
const { SOURCE_DEFN: { name: drugbankName } } = require('./drugbank');
const { SOURCE_DEFN: { name: chemblName } } = require('./chembl');
const { gscTherapeuticOntology: SOURCE_DEFN } = require('./sources');

const HEADER = {
    alias: 'alias',
    drugbank: 'DrugBankID',
    grandparent1: 'Class_2',
    grandparent2: 'Class_3_pathway',
    name: 'source',
    parent: 'Class_1',
};

const TAGS = {
    [HEADER.parent]: 'specific drug class',
    [HEADER.grandparent1]: 'general drug class',
    [HEADER.grandparent2]: 'pathway drug class',
};


/**
 * Try to extact match a drugbank/chembl record. If there isn't one then add this name as a new record instead
 */
const getDrugOrAdd = async (conn, source, name, rawRecord = {}) => {
    if (!name) {
        return null;
    }
    const tags = [];

    for (const col of [HEADER.parent, HEADER.grandparent1, HEADER.grandparent2]) {
        if (name === rawRecord[col]) {
            tags.push(TAGS[col]);
        }
    }
    let record;

    try {
        record = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: drugbankName }, target: 'Source' } },
                    { name },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'Therapy',
        });
        return record;
    } catch (err) {}

    try {
        record = await conn.getUniqueRecordBy({
            filters: { AND: [{ source: { filters: { name: chemblName }, target: 'Source' } }, { name }] },
            sort: orderPreferredOntologyTerms,
            target: 'Therapy',
        });
        return record;
    } catch (err) {}

    return conn.addRecord({
        content: {
            name, source: rid(source), sourceId: name, subsets: tags,
        },
        existsOk: true,
        fetchConditions: { AND: [{ name }, { source: rid(source) }, { sourceId: name }] },
        target: 'Therapy',
    });
};


/**
 * Create the drug class and link to existing drug classes with identical names
 */
const addDrugClass = async (conn, source, name, rawRecord) => {
    if (!name) {
        return null;
    }

    const tags = [];

    for (const col of [HEADER.parent, HEADER.grandparent1, HEADER.grandparent2]) {
        if (name === rawRecord[col]) {
            tags.push(TAGS[col]);
        }
    }

    const record = await conn.addRecord({
        content: {
            name,
            source: rid(source),
            sourceId: name,
            subsets: tags,
        },
        existsOk: true,
        fetchConditions: {
            AND: [
                { name },
                { source: rid(source) },
                { sourceId: name },
            ],
        },
        target: 'Therapy',
    });

    // link to drugs with exact name matches
    try {
        const drugbankDrug = await conn.getUniqueRecordBy({
            filters: {
                AND: [
                    { source: { filters: { name: drugbankName }, target: 'Source' } },
                    { name },
                ],
            },
            sort: orderPreferredOntologyTerms,
            target: 'Therapy',
        });
        await conn.addRecord({
            content: { in: rid(drugbankDrug), out: rid(record), source: rid(source) },
            existsOk: true,
            fetchExistsing: false,
            target: 'CrossReferenceOf',
        });
    } catch (err) {}
    return record;
};


/**
 * Given a TAB delmited biomart export of Ensembl data, upload the features to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the tab delimited export file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const { filename, conn } = opt;

    const content = await loadDelimToJson(filename);

    const source = rid(await conn.addSource(SOURCE_DEFN));

    const counts = { error: 0, success: 0 };

    for (let i = 0; i < content.length; i++) {
        const record = content[i];
        logger.info(`processing ${record[HEADER.name]} (${i} / ${content.length})`);

        // clean the names
        for (const col of [HEADER.name, HEADER.parent, HEADER.grandparent1, HEADER.grandparent2, HEADER.alias]) {
            record[col] = record[col].trim().toLowerCase().replace(/\binhibitors\b/, 'inhibitor');
        }

        try {
            const drug = await getDrugOrAdd(conn, source, record[HEADER.name], record);

            const [parent, grandparent1, grandparent2] = await Promise.all([
                addDrugClass(conn, source, record[HEADER.parent], record),
                addDrugClass(conn, source, record[HEADER.grandparent1], record),
                addDrugClass(conn, source, record[HEADER.grandparent2], record),
            ]);
            const aliases = await Promise.all(
                record[HEADER.alias].split(/\s*,\s*/)
                    .filter(term => term && term !== record[HEADER.name])
                    .map(async term => getDrugOrAdd(conn, source, term)),
            );
            // link the drug to its alias terms
            await Promise.all(aliases.map(async alias => conn.addRecord({
                content: { in: rid(drug), out: rid(alias), source: rid(source) },
                existsOk: true,
                target: 'aliasof',
            })));

            if (parent) {
                if (rid(drug) !== rid(parent)) {
                    await conn.addRecord({
                        content: { in: rid(parent), out: rid(drug), source },
                        existsOk: true,
                        fetchExistsing: false,
                        target: 'subclassof',
                    });
                }
                if (grandparent1 && rid(parent) !== rid(grandparent1)) {
                    await conn.addRecord({
                        content: { in: rid(grandparent1), out: rid(parent), source },
                        existsOk: true,
                        fetchExistsing: false,
                        target: 'subclassof',
                    });
                }
                if (grandparent2 && rid(parent) !== rid(grandparent2)) {
                    await conn.addRecord({
                        content: { in: rid(grandparent2), out: rid(parent), source },
                        existsOk: true,
                        fetchExistsing: false,
                        target: 'subclassof',
                    });
                }
            }
            // get the mapped drugbank drug
            if (/^DB\d+$/i.exec(record[HEADER.drugbank])) {
                const dbDrug = rid(await conn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { source: { filters: { name: drugbankName }, target: 'Source' } },
                            { sourceId: record[HEADER.drugbank] },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                }));

                // now link the records together
                if (dbDrug !== rid(drug)) {
                    await conn.addRecord({
                        content: { in: dbDrug, out: rid(drug), source },
                        existsOk: true,
                        fetchExistsing: false,
                        target: 'crossreferenceof',
                    });
                }
            }
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = { SOURCE_DEFN, dependencies: [drugbankName], uploadFile };
