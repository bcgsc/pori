const {
    loadDelimToJson, convertRowFields,
} = require('../util');
const { rid, orderPreferredOntologyTerms } = require('../graphkb');
const { SOURCE_DEFN: { name: ncitSourceName } } = require('../ncit');
const { logger } = require('../logging');

const { fdaSrs: SOURCE_DEFN } = require('../sources');

const HEADER = {
    id: 'UNII',
    name: 'PT',
    ncit: 'NCIT',
    pubchem: 'PUBCHEM',
};

/**
 * Given the TAB delimited UNII records file. Load therapy records and NCIT links
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({ filename, conn: graphkbConn, maxRecords }) => {
    const jsonList = await loadDelimToJson(filename);
    const source = await graphkbConn.addSource(SOURCE_DEFN);

    // only load FDA records if we have already loaded NCIT
    try {
        await graphkbConn.getUniqueRecordBy({
            filters: { name: ncitSourceName },
            target: 'Source',
        });
    } catch (err) {
        logger.error('Cannot link to NCIT, Unable to find source record');
        throw err;
    }
    const counts = { error: 0, skip: 0, success: 0 };

    logger.info(`loading ${jsonList.length} records`);
    const intervalSize = 1000;

    for (let i = 0; i < jsonList.length; i++) {
        if (maxRecords && i > maxRecords) {
            logger.warn(`not loading all content due to max records limit (${maxRecords})`);
            break;
        }
        const {
            id, ncit, name,
        } = convertRowFields(HEADER, jsonList[i]);

        if (!name || !id) {
            // only load records with at min these 3 values filled out
            counts.skip++;
            continue;
        }
        let ncitRec;

        if (i % intervalSize === 0) {
            logger.info(`processing ${id} (${i} / ${jsonList.length})`);
        } else {
            logger.verbose(`processing ${id} (${i} / ${jsonList.length})`);
        }

        if (ncit) {
            try {
                ncitRec = await graphkbConn.getUniqueRecordBy({
                    filters: {
                        AND: [
                            { source: { filters: { name: ncitSourceName }, target: 'Source' } },
                            { sourceId: ncit },
                        ],
                    },
                    sort: orderPreferredOntologyTerms,
                    target: 'Therapy',
                });
            } catch (err) {
                logger.error(err);
                counts.error++;
            }
        }

        let drug;

        try {
            drug = await graphkbConn.addRecord({
                content: { name, source: rid(source), sourceId: id },
                existsOk: true,
                target: 'Therapy',
            });

            if (ncitRec) {
                await graphkbConn.addRecord({
                    content: { in: rid(ncitRec), out: rid(drug), source: rid(source) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'CrossReferenceOf',
                });
            }
            counts.success++;
        } catch (err) {
            counts.error++;
            logger.error(err);
            continue;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, dependencies: [ncitSourceName], uploadFile };
