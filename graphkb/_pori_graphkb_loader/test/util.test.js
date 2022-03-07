const path = require('path');

const {
    loadDelimToJson,
    loadXmlToJson,
} = require('../src/util');

describe('util', () => {
    test.todo('preferredSources');

    test.todo('convertOwlGraphToJson');

    test('loadDelimToJson', async () => {
        const filename = path.join(__dirname, 'data/UNII_Records_25Oct2018_sample.txt');
        const result = await loadDelimToJson(filename, '\t');
        expect(result.length).toBe(99);
    });

    test('loadXmlToJson', async () => {
        const filename = path.join(__dirname, 'data/drugbank_sample.xml');
        const result = await loadXmlToJson(filename);
        expect(result).toHaveProperty('drugbank');
        expect(result.drugbank).toHaveProperty('drug');
        expect(result.drugbank.drug.length).toBe(1);
    });
});
