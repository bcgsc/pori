const fs = require('fs');
const path = require('path');

// mokeypatch node-fetch
jest.mock('node-fetch', () => require('fetch-mock-jest').sandbox()); // eslint-disable-line global-require
const fetchMock = require('node-fetch');

const { fetchAndLoadBySearchTerm } = require('../../src/entrez/gene');

const getRandomInt = (max = 1000) => Math.floor(Math.random() * max);

const extApiData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/external_api_responses.json')));
Object.entries(extApiData).forEach(([url, respBody]) => {
    fetchMock.get(url, respBody);
});


afterEach(() => {
    jest.clearAllMocks();
});


describe('fetchAndLoadBySearchTerm', () => {
    test('kras', async () => {
        const addRecordMock = jest.fn().mockImplementation(async ({ content }) => ({ ...content, '@rid': `#${getRandomInt()}:${getRandomInt()}` }));
        const api = {
            addRecord: addRecordMock,
            addSource: async content => addRecordMock({ content }),
            getUniqueRecordBy: jest.fn().mockImplementation(async () => { throw new Error('did not find record'); }),
        };
        const newTerms = await fetchAndLoadBySearchTerm(api, 'KRAS');
        expect(newTerms).toHaveLength(1);
    });
});
