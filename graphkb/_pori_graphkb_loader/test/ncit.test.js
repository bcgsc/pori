const { cleanRawRow, pickEndpoint } = require('../src/ncit');

describe('cleanRawRow', () => {
    const rawRow = {
        conceptStatus: '',
        definition: 'A percutaneous coronary intervention is necessary for a myocardial...',
        id: 'C10000',
        name: '',
        parents: 'C99521|C99522|C99523',
        semanticType: 'Therapeutic or Preventive Procedure',
        synonyms: 'Percutaneous Coronary Intervention for ST Elevation Myocardial...',
        xmlTag: '<http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#C100000>',
    };

    test('Has expected properties', () => {
        expect(cleanRawRow(rawRow)).toEqual(
            expect.objectContaining({
                deprecated: expect.any(Boolean),
                description: expect.any(String),
                displayName: expect.any(String),
                endpoint: expect.any(String),
                name: expect.any(String),
                parents: expect.any(Array),
                sourceId: expect.any(String),
                species: expect.any(String),
                synonyms: expect.any(Array),
                url: expect.any(String),
            }),
        );
    });

    // deprecated property's value
    test.each([
        ['obsolete concept in parents', '', 'C99999|C61063', true], // 'C61063' = obsolete concept
        ['retired concept in parents', '', 'C85834|C99999', true], // 'C85834' = retired concept
        ['obsolete concept in concept status', 'Obsolete_Concept', '', true],
        ['retired concept in concept status', 'Retired_Concept', '', true],
        ['valid concept in parents', '', 'C99999', false],
        ['valid concept in concept status', 'Valid_Concept', '', false],
        ['both parents and concept status empty', '', '', false],
    ])('Has expected deprecated value: %s', (_, conceptStatus, parents, expected) => {
        const row = { ...rawRow, conceptStatus, parents };
        expect(cleanRawRow(row)).toHaveProperty('deprecated', expected);
    });

    // parents property's value
    test.each([
        ['empty', '', []],
        ['to lowercase', 'C00001', ['c00001']],
        ['more than one', 'C00001|C00002', ['c00001', 'c00002']],
        ['obsolete concept', 'C00001|C61063', ['c00001']], // 'C61063' = obsolete concept
        ['retired concept', 'C00001|C85834', ['c00001']], // 'C85834' = retired concept
        ['extra separators', '||C00001', ['c00001']],
    ])('Has expected parents value: %s', (_, parents, expected) => {
        const row = { ...rawRow, parents };
        expect(cleanRawRow(row)).toHaveProperty('parents', expected);
    });

    // endpoint property's value
    test('Has expected endpoint value', () => {
        const expected = pickEndpoint(rawRow.semanticType, rawRow.parentConcepts);
        expect(cleanRawRow(rawRow)).toHaveProperty('endpoint', expected);
    });

    // species property's value
    test.each([
        ['murine as name', 'A murine', '', '', 'murine'],
        ['mouse as name', 'A mouse', '', '', 'mouse'],
        ['rat as name', 'A rat', '', '', 'rat'],
        ['name not listed', 'A whale', '', '', ''],
        ['murine as parents', '', 'A murine', '', 'murine'],
        ['mouse as parents', '', 'A mouse', '', 'mouse'],
        ['rat as parents', '', 'A rat', '', 'rat'],
        ['parents not listed', '', 'A whale', '', ''],
        ['murine as synonyms', '', '', 'A murine', 'murine'],
        ['mouse as synonyms', '', '', 'A mouse', 'mouse'],
        ['rat as synonyms', '', '', 'A rat', 'rat'],
        ['synonyms not listed', '', '', 'A whale', ''],
        ['name, parents & synonyms all empty', '', '', '', ''],
    ])('Has expected species value: %s', (_, name, parents, synonyms, expected) => {
        const row = {
            ...rawRow,
            name,
            parents,
            synonyms,
        };
        expect(cleanRawRow(row)).toHaveProperty('species', expected);
    });

    // url property's value
    test('Remove XML tags around URLs', () => {
        expect(cleanRawRow({ ...rawRow, xmlTag: '<https://bcgsc.ca>' }))
            .toHaveProperty('url', 'https://bcgsc.ca');
    });

    // displayName property's value
    test.each([
        ['id and name are the same', 'C10000', 'C10000', 'c10000'],
        ['id and name are not the same', 'C20000', 'C10000', 'C10000 [c20000]'],
    ])('Has expected displayName value: %s', (_, id, name, expected) => {
        const row = { ...rawRow, id, name };
        expect(cleanRawRow(row)).toHaveProperty('displayName', expected);
    });

    // name property's value
    test.each([
        ['to lowercase', '', 'C10000', 'c10000'],
        ['no name but id', 'C10000', '', 'c10000'],
        ['keep first of multiple names', '', 'C10000|C20000', 'c10000'],
        ['extra separators', '', '||C10000', 'c10000'],
    ])('Has expected name value: %s', (_, id, name, expected) => {
        const row = { ...rawRow, id, name };
        expect(cleanRawRow(row)).toHaveProperty('name', expected);
    });

    // synonyms property's value
    test.each([
        ['to array', '', 'a|b', ['a', 'b']],
        ['to lowercase', '', 'A|B', ['a', 'b']],
        ['filter by name', 'C', 'a|b|c', ['a', 'b']],
        ['remove duplicate', '', 'a|a', ['a']],
        ['extra separators', '', '||a|b', ['a', 'b']],
        ['add extra names to synonyms', 'a|b', 'c|d', ['c', 'd', 'b']],
    ])('Has expected synonyms value: %s', (_, name, synonyms, expected) => {
        const row = { ...rawRow, name, synonyms };
        expect(cleanRawRow(row)).toHaveProperty('synonyms', expected);
    });
});

describe('pickEndpoint', () => {
    test.each([
        ['Some Anatomical Abnormality', 'Disease'],
        ['A Particular Anatomical Structure', 'AnatomicalEntity'],
        ['Prescribe Antibiotic', 'Therapy'],
    ])('Actual concept', (conceptName, output) => {
        expect(pickEndpoint(conceptName, '')).toBe(output);
    });

    test.each([
        ['Congenital Abnormality', 'Disease'],
        ['Body Location or Region', 'AnatomicalEntity'],
        ['Biologically Active Substance', 'Therapy'],
    ])('Parent concept fallback', (parentConcepts, output) => {
        expect(pickEndpoint('', parentConcepts)).toBe(output);
    });

    test('Both concept and parent do not correspond to any endpoint', () => {
        expect(() => pickEndpoint('A whale', 'A mammal'))
            .toThrow('Concept not implemented (A whale)');
    });

    test('Concept do not correspond to any endpoint and there is no parent', () => {
        expect(() => pickEndpoint('A demogorgon', ''))
            .toThrow('Concept not implemented (A demogorgon)');
    });
});
