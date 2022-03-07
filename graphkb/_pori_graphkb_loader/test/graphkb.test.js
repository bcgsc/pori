const {
    orderPreferredOntologyTerms,
    shouldUpdate,
    simplifyRecordsLinks,
} = require('../src/graphkb');

describe('orderPreferredOntologyTerms', () => {
    test('prefer non-deprecated', () => {
        expect(orderPreferredOntologyTerms(
            { deprecated: true }, { deprecated: false },
        )).toBe(1);
        expect(orderPreferredOntologyTerms(
            { deprecated: false }, { deprecated: true },
        )).toBe(-1);
    });

    test('prefer terms with independent sourceId', () => {
        expect(orderPreferredOntologyTerms(
            { alias: false }, { alias: true },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { alias: true }, { alias: false },
        )).toBe(1);
        expect(orderPreferredOntologyTerms(
            { }, { dependency: true },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { dependency: true }, { },
        )).toBe(1);
    });

    test('prefer generic to versioned terms', () => {
        expect(orderPreferredOntologyTerms(
            { }, { sourceIdVersion: '' },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { sourceIdVersion: '' }, { },
        )).toBe(1);
    });

    test('prefer newer version of same record', () => {
        expect(orderPreferredOntologyTerms(
            { sourceIdVersion: '2019-10-08' }, { sourceIdVersion: '2020-10-08' },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { sourceIdVersion: '2020-10-08' }, { sourceIdVersion: '2019-10-08' },
        )).toBe(1);
    });

    test('prefer newer source version of same record', () => {
        expect(orderPreferredOntologyTerms(
            { source: { version: 1 }, sourceIdVersion: '2019-10-08' },
            { source: { version: 2 }, sourceIdVersion: '2019-10-08' },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { source: { version: 2 }, sourceIdVersion: '2019-10-08' },
            { source: { version: 1 }, sourceIdVersion: '2019-10-08' },
        )).toBe(1);
    });

    test('prefer terms with descriptions', () => {
        expect(orderPreferredOntologyTerms(
            { description: 'a description', sourceIdVersion: '2019-10-08' },
            { description: '', sourceIdVersion: '2019-10-08' },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { description: '', sourceIdVersion: '2019-10-08' },
            { description: 'a description', sourceIdVersion: '2019-10-08' },
        )).toBe(1);
    });

    test('use source rank to sort results', () => {
        expect(orderPreferredOntologyTerms(
            { source: { sort: 1 }, sourceId: 1 },
            { source: { sort: 2 }, sourceId: 2 },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { source: { sort: 2 }, sourceId: 1 },
            { source: { sort: 1 }, sourceId: 2 },
        )).toBe(1);
        expect(orderPreferredOntologyTerms(
            { source: { version: 1 }, sourceId: 1 },
            { source: { version: 2 }, sourceId: 2 },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { source: { version: 2 }, sourceId: 1 },
            { source: { version: 1 }, sourceId: 2 },
        )).toBe(1);
        expect(orderPreferredOntologyTerms(
            { description: 'a description', source: {}, sourceId: 1 },
            { description: '', source: {}, sourceId: 2 },
        )).toBe(-1);
        expect(orderPreferredOntologyTerms(
            { description: '', source: {}, sourceId: 1 },
            { description: 'a description', source: {}, sourceId: 2 },
        )).toBe(1);
    });

    test('fallback to 0 if there is no prefered one', () => {
        expect(orderPreferredOntologyTerms(
            { source: { }, sourceId: 1 },
            { source: { }, sourceId: 2 },
        )).toBe(0);
    });
});

describe('shouldUpdate', () => {
    describe('disease', () => {
        const model = 'disease';
        const originalContent = {
            '@class': 'Disease',
            '@rid': '#133:8',
            alias: true,
            createdAt: 1565314461881,
            createdBy: '#29:0',
            deprecated: false,
            description: 'congenital abnormality characterized by the presence of only one kidney.',
            displayName: 'congenital single kidney [c101220]',
            history: '#135:28899',
            in_AliasOf: [
                '#67:21022',
                '#66:23',
            ],
            name: 'congenital single kidney',
            out_AliasOf: [
                '#66:31991',
            ],
            source: '#40:3',
            sourceId: 'c101220',
            updatedAt: 1594438640025,
            updatedBy: '#29:0',
            url: 'http://ncicb.nci.nih.gov/xml/owl/evs/thesaurus.owl#c101220',
            uuid: '709eb34b-27ff-42f5-be0c-9051c639deb0',
        };
        const excludedFields = ['displayName'];

        test('true when non-excluded field changes', () => {
            const newContent = { ...originalContent };
            newContent.name = 'a new name';
            expect(shouldUpdate(model, originalContent, newContent, excludedFields)).toBe(true);
        });

        test('false when changed field is excluded', () => {
            const newContent = { ...originalContent };
            newContent.displayName = 'a new display name';
            expect(shouldUpdate(model, originalContent, newContent, excludedFields)).toBe(false);
        });

        test('false when same object passed and no fields excluded', () => {
            expect(shouldUpdate(model, originalContent, originalContent)).toBe(false);
        });

        test('false when a linked record change', () => {
            originalContent.source = {
                '@class': 'Source',
                '@rid': '#40:3',
                createdAt: 1565314457745,
                createdBy: '#29:0',
                description: 'nci thesaurus (ncit) provides reference terminology for many...',
                displayName: 'NCIt',
                longName: 'nci thesaurus',
                name: 'ncit',
                sort: 2,
                updatedAt: 1565314457745,
                updatedBy: '#29:0',
                url: 'https://ncit.nci.nih.gov/ncitbrowser',
                usage: 'https://creativecommons.org/licenses/by/4.0',
                uuid: 'dad84739-b1e3-4686-b055-6bc3c3de9bc3',
            };
            const newContent = { ...originalContent };
            newContent.source.name = 'a new source name';
            expect(shouldUpdate(model, originalContent, newContent)).toBe(false);
        });
    });

    describe('statement', () => {
        const model = 'statement';
        const originalContent = {
            '@class': 'Statement',
            '@rid': '#153:0',
            conditions: [
                '#159:5192',
                '#135:9855',
            ],
            createdAt: 1565629092399,
            createdBy: '#29:0',
            description: 'Young AML patients (<60 years old) with DNMT3A mutations...',
            displayNameTemplate: '{conditions:variant} {relevance} of {subject} ({evidence})',
            evidence: [
                '#118:774',
            ],
            evidenceLevel: [
                '#106:3',
            ],
            history: '#156:12546',
            relevance: '#148:2',
            reviewStatus: 'not required',
            source: '#38:1',
            sourceId: '4',
            subject: '#135:9855',
            updatedAt: 1611496856338,
            updatedBy: '#29:0',
            uuid: '543616c6-c259-4c4e-ab4e-31434221f259',
        };
        const excludedFields = ['reviewStatus'];

        test('true when non-excluded field changes', () => {
            const newContent = { ...originalContent };
            newContent.description = 'a new description';
            expect(shouldUpdate(model, originalContent, newContent, excludedFields)).toBe(true);
        });

        test('false when changed field is excluded', () => {
            const newContent = { ...originalContent };
            newContent.reviewStatus = 'pending';
            expect(shouldUpdate(model, originalContent, newContent, excludedFields)).toBe(false);
        });

        test('false when same object passed and no fields excluded', () => {
            expect(shouldUpdate(model, originalContent, originalContent)).toBe(false);
        });

        test('false when a linked record change', () => {
            originalContent.source = {
                '@class': 'Source',
                '@rid': '#38:1',
                createdAt: 1565629077198,
                createdBy: '#29:0',
                description: 'civic is an open access, open source, community-driven...',
                displayName: 'CIViC',
                name: 'civic',
                sort: 99999,
                updatedAt: 1565629077198,
                updatedBy: '#29:0',
                url: 'https://civicdb.org',
                usage: 'https://creativecommons.org/publicdomain/zero/1.0',
                uuid: '26a9c986-cede-4595-9c53-c62e707ea205',
            };
            const newContent = { ...originalContent };
            newContent.source.name = 'a new source name';
            expect(shouldUpdate(model, originalContent, newContent)).toBe(false);
        });
    });
});

describe('simplifyRecordsLinks', () => {
    test.each([
        123,
        123.0,
        'abc',
        null,
        undefined,
        false,
        {},
        { a: 1, b: 1 },
        { '@rid': 123, a: 1 },
    ])('does not change', (inputValue) => {
        const output = simplifyRecordsLinks(inputValue);
        expect(output).toEqual(inputValue);
    });

    test.each([
        [
            { a: [{ '@rid': 123, aa: 1 }, { ab: 2 }] },
            { a: ['123', { ab: 2 }] },
        ],
        [
            { a: { '@rid': 123, aa: 1 }, b: 2 },
            { a: '123', b: 2 },
        ],
        [
            { a: { '@rid': 123, a: { '@rid': 123, aa: 1 } } },
            { a: '123' },
        ],
    ])('being unnested', (inputValue, expectedValue) => {
        const output = simplifyRecordsLinks(inputValue);
        expect(output).toEqual(expectedValue);
    });
});
