const Ajv = require('ajv');


const _entrezGene = require('../entrez/gene');
const _chembl = require('../chembl');
const { logger } = require('../logging');
const { checkSpec, request } = require('../util');
const { rid } = require('../graphkb');

const { dgidb: SOURCE_DEFN } = require('../sources');
const spec = require('./spec.json');

const ajv = new Ajv();

const recordSpec = ajv.compile(spec);

const BASE_URL = 'https://dgidb.org/api/v2';


const processRecord = async ({ conn, record, source }) => {
    checkSpec(recordSpec, record);
    const {
        entrez_id: entrezId,
        concept_id: chemblId,
        interaction_types: interactionTypes,
        id,
    } = record;

    const [gene] = await _entrezGene.fetchAndLoadByIds(conn, [entrezId]);
    const drug = await _chembl.fetchAndLoadById(conn, chemblId.replace('chembl:', ''));

    const interactionType = interactionTypes.map(i => i.toLowerCase().trim()).sort().join(';');

    await conn.addRecord({
        content: {
            actionType: interactionType,
            in: rid(drug),
            out: rid(gene),
            source: rid(source),
            uuid: id, // use the input uuid as the uuid rather than generating one
        },
        existsOk: true,
        fetchExisting: false,
        target: 'TargetOf',
    });
};


const upload = async ({ conn, url = BASE_URL }) => {
    logger.info('creating the source record');
    const source = rid(await conn.addSource(SOURCE_DEFN));
    const limit = 1000;
    let page = `${url}/interactions?count=${limit}&page=1`;
    const counts = { error: 0, skip: 0, success: 0 };

    // pre-cache the entrez genes
    logger.info('pre-loading the entrez gene list');
    await _entrezGene.preLoadCache(conn);
    logger.info('pre-loading the chembl drug list');
    await _chembl.preLoadCache(conn);

    while (page) {
        logger.info(`loading: ${page}`);
        const resp = await request({
            json: true,
            method: 'GET',
            uri: page,
        });
        const { _meta: { links: { next } }, records } = resp;
        page = next;

        // process this batch of records
        for (const record of records) {
            logger.info(`processing ${record.id}`);

            try {
                await processRecord({ conn, record, source });
                counts.success++;
            } catch (err) {
                logger.error(err);
                counts.error++;
            }
        }
    }
    logger.info(JSON.stringify(counts));
};


module.exports = {
    SOURCE_DEFN,
    dependencies: [_entrezGene.SOURCE_DEFN.name, _chembl.SOURCE_DEFN.name],
    upload,
};
