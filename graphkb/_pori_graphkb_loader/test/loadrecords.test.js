const fs = require('fs');
const path = require('path');

const { parseXmlToJson } = require('../src/util');

const ctg = require('../src/clinicaltrialsgov');
const gene = require('../src/entrez/gene');
const pubmed = require('../src/entrez/pubmed');
const refseq = require('../src/entrez/refseq');
const chembl = require('../src/chembl');

const addRecordMock = jest.fn().mockImplementation(async ({ content }) => content);
const api = {
    addRecord: addRecordMock,
    addSource: async content => addRecordMock({ content }),
    getUniqueRecordBy: jest.fn().mockImplementation(async ({ filters }) => filters),
};


jest.mock('../src/util', () => {
    const original = jest.requireActual('../src/util');
    return { ...original, requestWithRetry: jest.fn() };
});

const util = require('../src/util');

const dataFileLoad = filename => fs.readFileSync(path.join(__dirname, filename));
const dataFileToJson = filename => JSON.parse(dataFileLoad(filename));

afterEach(() => {
    jest.clearAllMocks();
});


describe('clinicaltrialsgov', () => {
    test('convertAPIRecord', async () => {
        const raw = await parseXmlToJson(dataFileLoad('data/clinicaltrialsgov.NCT03478891.xml'));
        const result = ctg.convertAPIRecord(raw);
        expect(result).toHaveProperty('sourceId', 'NCT03478891');
        expect(result).toHaveProperty('sourceIdVersion', '2019-07-15');

        expect(result).toHaveProperty('phases', ['Phase 1']);
        expect(result).toHaveProperty('startDate', '2018-05-16');
        expect(result).toHaveProperty('completionDate', '2019-03-20');
        expect(result).toHaveProperty('locations', [{ city: 'bethesda', country: 'united states' }]);
        expect(result).toHaveProperty('drugs', ['VRC-EBOMAB092-00-AB (MAb114)']);
        expect(result).toHaveProperty('diseases', ['Healthy Adult Immune Responses to Vaccine']);
    });

    test('fetchAndLoadById', async () => {
        api.getUniqueRecordBy.mockRejectedValueOnce(new Error('doesnt exist yet'));
        util.requestWithRetry.mockResolvedValueOnce(dataFileLoad('data/clinicaltrialsgov.NCT03478891.xml'));

        const result = await ctg.fetchAndLoadById(api, 'NCT03478891');
        expect(result).toHaveProperty('sourceId', 'NCT03478891');
        expect(result).toHaveProperty('sourceIdVersion', '2019-07-15');

        expect(result).toHaveProperty('source');
        expect(result).toHaveProperty('phase', '1');
        expect(result).toHaveProperty('startDate', '2018-05-16');
        expect(result).toHaveProperty('completionDate', '2019-03-20');
        expect(result).toHaveProperty('city', 'bethesda');
        expect(result).toHaveProperty('country', 'united states');
    });
});


describe('entrez', () => {
    beforeEach(() => {
        api.getUniqueRecordBy.mockRejectedValueOnce(new Error('doesnt exist yet'));
    });

    describe('gene', () => {
        test('fetchAndLoadById', async () => {
            util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_gene.3845.json'));
            const kras = '3845';
            const [result] = await gene.fetchAndLoadByIds(api, [kras]);
            expect(result).toHaveProperty('biotype', 'gene');
            expect(result).toHaveProperty('name', 'KRAS');
            expect(result).toHaveProperty('sourceId', '3845');
            expect(result).not.toHaveProperty('sourceIdVersion');
            expect(result).toHaveProperty('description');
            expect(result).toHaveProperty('source');
        });
    });

    describe('pubmed', () => {
        test('fetchAndLoadById', async () => {
            util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_pubmed.30016509.json'));
            const [result] = await pubmed.fetchAndLoadByIds(api, ['30016509']);
            expect(result).toHaveProperty('year', 2019);
            expect(result).toHaveProperty('name', 'MAVIS: merging, annotation, validation, and illustration of structural variants.');
            expect(result).toHaveProperty('journalName', 'Bioinformatics (Oxford, England)');
            expect(result).toHaveProperty('sourceId', '30016509');
            expect(result).toHaveProperty('source');
            expect(result).toHaveProperty('displayName', 'pmid:30016509');
        });
    });

    describe('refseq', () => {
        afterEach(() => {
            jest.clearAllMocks();
        });

        describe('fetchAndLoadById', () => {
            test('transcript', async () => {
                util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NM_005228.5.json'));
                const [result] = await refseq.fetchAndLoadByIds(api, ['NM_005228.5']);
                expect(result).toHaveProperty('biotype', 'transcript');
                expect(result).not.toHaveProperty('name');
                expect(result).toHaveProperty('sourceId', 'NM_005228');
                expect(result).toHaveProperty('sourceIdVersion', '5');
                expect(result).toHaveProperty('source');
                expect(result).toHaveProperty('displayName', 'NM_005228.5');
                expect(result).toHaveProperty('longName', 'Homo sapiens epidermal growth factor receptor (EGFR), transcript variant 1, mRNA');
            });

            test('chromosome', async () => {
                util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NC_000003.11.json'));
                const [result] = await refseq.fetchAndLoadByIds(api, ['NC_000003.11']);
                expect(result).toHaveProperty('biotype', 'chromosome');
                expect(result).toHaveProperty('name', '3');
                expect(result).toHaveProperty('longName', 'Homo sapiens chromosome 3, GRCh37.p13 Primary Assembly');
                expect(result).toHaveProperty('sourceId', 'NC_000003');
                expect(result).toHaveProperty('sourceIdVersion', '11');
                expect(result).toHaveProperty('source');
                expect(result).toHaveProperty('displayName', 'NC_000003.11');
            });

            test('chromosome no version', async () => {
                util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NC_000003.json'));
                const [result] = await refseq.fetchAndLoadByIds(api, ['NC_000003']);
                expect(result).toHaveProperty('biotype', 'chromosome');
                expect(result).toHaveProperty('name', '3');
                expect(result).not.toHaveProperty('longName');
                expect(result).toHaveProperty('sourceId', 'NC_000003');
                expect(result).toHaveProperty('sourceIdVersion', null);
                expect(result).toHaveProperty('source');
                expect(result).toHaveProperty('displayName', 'NC_000003');
            });

            test('protein', async () => {
                util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/entrez_refseq.NP_008819.1.json'));
                const [result] = await refseq.fetchAndLoadByIds(api, ['NP_008819.1']);
                expect(result).toHaveProperty('biotype', 'protein');
                expect(result).toHaveProperty('sourceId', 'NP_008819');
                expect(result).toHaveProperty('sourceIdVersion', '1');
                expect(result).toHaveProperty('source');
                expect(result).toHaveProperty('longName', 'calmodulin-1 isoform 2 [Homo sapiens]');
                expect(result).toHaveProperty('displayName', 'NP_008819.1');
            });
        });
    });
});


describe('chembl', () => {
    test('fetchAndLoadById', async () => {
        util.requestWithRetry.mockResolvedValueOnce(dataFileToJson('data/chembl.CHEMBL553.json'));
        const result = await chembl.fetchAndLoadById(api, 'CHEMBL553');
        expect(result).toHaveProperty('sourceId', 'CHEMBL553');
        expect(result).toHaveProperty('name', 'ERLOTINIB');
        expect(result).toHaveProperty('molecularFormula', 'C22H23N3O4');

        expect(api.addRecord).toHaveBeenCalledTimes(4);
    });
});
