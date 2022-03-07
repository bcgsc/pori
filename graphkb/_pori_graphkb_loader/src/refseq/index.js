/**
 * Import the RefSeq transcripts, ignoring version numbers for now
 * @module importer/refseq
 */
const { loadDelimToJson } = require('../util');
const { rid } = require('../graphkb');
const { logger } = require('../logging');

const _entrez = require('../entrez/gene');

const { refseq: SOURCE_DEFN } = require('../sources');

/**
 * Parse the tab delimited file to upload features and their relationships
 * For each versioned feature, a generalization (non-versioned) feature is created
 * to facilitate linking from other sources where the version may not be given
 *
 * @param {object} opt options
 * @param {string} opt.filename path to the tab delimited file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async ({ filename, conn, maxRecords }) => {
    const json = await loadDelimToJson(filename);

    const source = await conn.addRecord({
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: { name: SOURCE_DEFN.name },
        target: 'Source',
    });
    logger.log('info', `Loading ${json.length} gene records`);
    const counts = { error: 0, skipped: 0, success: 0 };
    // batch load entrez genes
    await _entrez.preLoadCache(conn);
    await _entrez.fetchAndLoadByIds(conn, json.map(rec => rec.GeneID));

    for (let i = 0; i < json.length; i++) {
        if (maxRecords && i > maxRecords) {
            logger.warn(`not loading all content due to max records limit (${maxRecords})`);
            break;
        }

        try {
            const { RNA, GeneID, Protein } = json[i];
            logger.info(`processing (${i} / ${json.length}) ${RNA}`);

            // Load the RNA
            const [rnaName, rnaVersion] = RNA.split('.');
            const general = await conn.addRecord({
                content: {
                    biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: null,
                },
                existsOk: true,
                target: 'Feature',
            });
            const versioned = await conn.addRecord({
                content: {
                    biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: rnaVersion,
                },
                existsOk: true,
                target: 'Feature',
            });
            // make the general an alias of the versioned
            await conn.addRecord({
                content: { in: rid(versioned), out: rid(general), source: rid(source) },
                existsOk: true,
                fetchExisting: false,
                target: 'generalizationof',
            });

            try {
                const [hgnc] = await _entrez.fetchAndLoadByIds(conn, [GeneID]);
                await conn.addRecord({
                    content: { in: rid(hgnc), out: rid(general), source: rid(source) },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'elementof',
                });
            } catch (err) {
                logger.log('error', `failed cross-linking from ${general.sourceId} to ${GeneID}`);
                logger.error(err);
            }

            // load the protein
            if (Protein) {
                const [proteinName, proteinVersion] = Protein.split('.');
                const generalProtein = await conn.addRecord({
                    content: {
                        biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: null,
                    },
                    existsOk: true,
                    target: 'Feature',
                });
                const versionedProtein = await conn.addRecord({
                    content: {
                        biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: proteinVersion,
                    },
                    existsOk: true,
                    target: 'Feature',
                });
                // make the general an alias of the versioned
                await conn.addRecord({
                    content: {
                        in: rid(versionedProtein),
                        out: rid(generalProtein),
                        source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'generalizationof',
                });

                await conn.addRecord({
                    content: {
                        in: rid(general),
                        out: rid(generalProtein),
                        source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'elementof',
                });

                await conn.addRecord({
                    content: {
                        in: rid(versioned),
                        out: rid(versionedProtein),
                        source: rid(source),
                    },
                    existsOk: true,
                    fetchExisting: false,
                    target: 'elementof',
                });
            }
            counts.success++;
        } catch (err) {
            logger.error(err);
            counts.error++;
        }
    }
    logger.info(JSON.stringify(counts));
};

module.exports = { SOURCE_DEFN, uploadFile };
