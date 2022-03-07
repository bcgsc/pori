const {
    parseRelevance, fixStringNulls, composeGenomicHgvs, loadSmallMutation,
} = require('../src/moa');


describe('composeGenomicHgvs', () => {
    test('insertion', () => {
        expect(composeGenomicHgvs({
            alternate_allele: 'A', end_position: 124, reference_allele: '-', start_position: 123,
        })).toEqual('g.123_124insA');
    });

    test('deletion', () => {
        expect(composeGenomicHgvs({
            alternate_allele: '-', end_position: 124, reference_allele: 'A', start_position: 124,
        })).toEqual('g.124delA');
        expect(composeGenomicHgvs({
            alternate_allele: '-', end_position: 125, reference_allele: 'AA', start_position: 124,
        })).toEqual('g.124_125delAA');
    });

    test('substitution', () => {
        expect(composeGenomicHgvs({
            alternate_allele: 'C', end_position: 124, reference_allele: 'A', start_position: 124,
        })).toEqual('g.124A>C');
    });

    test('indel', () => {
        expect(composeGenomicHgvs({
            alternate_allele: 'C', end_position: 125, reference_allele: 'AA', start_position: 124,
        })).toEqual('g.124_125delAAinsC');
    });

    test('old indel syntax', () => {
        expect(composeGenomicHgvs({
            alternate_allele: 'CC', end_position: 124, reference_allele: 'AA', start_position: 124,
        })).toEqual('g.124_125delAAinsCC');
    });
});


describe('fixStringNulls', () => {
    test('deeply nested', () => {
        expect(fixStringNulls({ thing: { thing: 'None' } })).toEqual({ thing: { thing: null } });
    });

    test('first level', () => {
        expect(fixStringNulls({ thing: 'None' })).toEqual({ thing: null });
    });
});


describe('parseRelevance', () => {
    test('sensitivity', () => {
        expect(parseRelevance({
            features: [],
            therapy_name: 'stuff',
            therapy_sensitivity: true,
        })).toEqual(['sensitivity']);
    });

    test('no sensitivity', () => {
        expect(parseRelevance({
            features: [],
            therapy_name: 'stuff',
            therapy_sensitivity: false,
        })).toEqual(['no sensitivity']);
    });

    test('resistance', () => {
        expect(parseRelevance({
            features: [],
            therapy_name: 'stuff',
            therapy_resistance: true,
        })).toEqual(['resistance']);
    });

    test('favorable prognosis', () => {
        expect(parseRelevance({
            favorable_prognosis: true,
            features: [],
        })).toEqual(['favourable prognosis']);
    });

    test('unfavorable prognosis', () => {
        expect(parseRelevance({
            favorable_prognosis: false,
            features: [],
        })).toEqual(['unfavourable prognosis']);
    });

    test('pathogenic', () => {
        expect(parseRelevance({
            features: [{ attributes: [{ pathogenic: '1.0' }] }],
        })).toEqual(['pathogenic']);
    });

    test('no pathogenic', () => {
        expect(() => parseRelevance({
            features: [{ attributes: [{ pathogenic: null }] }],
        })).toThrow('no relevance');
    });

    test('no relevance', () => {
        expect(() => parseRelevance({
            favorable_prognosis: null,
            features: [],
            therapy_resistance: null,
            therapy_sensitivity: null,
        })).toThrow('no relevance');
    });
});


describe('loadSmallMutation', () => {
    const variantDefaults = {
        alternate_allele: null,
        cdna_change: null,
        chromosome: null,
        end_position: null,
        exon: null,
        protein_change: null,
        reference_allele: null,
        start_position: null,
        variant_annotation: null,
    };

    const sigId = '#34:5';
    const variantId = '#23:4';
    const geneId = '#56:7';
    const vocabId = '#45:6';

    const mockConn = () => ({
        addRecord: jest.fn().mockResolvedValue({ '@rid': '#12:3' }),
        addVariant: jest.fn().mockResolvedValue({ '@rid': variantId }),
        getUniqueRecordBy: jest.fn().mockResolvedValue({ '@rid': sigId }),
        getVocabularyTerm: jest.fn().mockResolvedValue({ '@rid': vocabId }),
    });

    test('only category variant', async () => {
        const conn = mockConn();
        const result = await loadSmallMutation(conn, geneId, {
            ...variantDefaults,
            variant_annotation: 'some variant type',
        });
        expect(result).toEqual({ '@rid': variantId });
        expect(conn.addRecord).toHaveBeenCalledTimes(0);
        expect(conn.addVariant).toHaveBeenCalledTimes(1);
        expect(conn.addVariant).toHaveBeenCalledWith({
            content: {
                germline: false,
                reference1: geneId,
                type: vocabId,
            },
            existsOk: true,
            target: 'CategoryVariant',
        });
    });

    test('exon variant with specific type', async () => {
        const conn = mockConn();
        const result = await loadSmallMutation(conn, geneId, {
            ...variantDefaults,
            exon: 2,
            variant_annotation: 'some variant type',
        });
        expect(result).toEqual({ '@rid': variantId });
        expect(conn.addRecord).toHaveBeenCalledTimes(0);
        expect(conn.addVariant).toHaveBeenCalledWith({
            content: {
                break1Repr: 'e.2',
                break1Start: { '@class': 'ExonicPosition', pos: 2 },
                germline: false,
                reference1: geneId,
                type: vocabId,
            },
            existsOk: true,
            target: 'PositionalVariant',
        });
    });

    test('generic exon variant', async () => {
        const conn = mockConn();
        const result = await loadSmallMutation(conn, geneId, {
            ...variantDefaults,
            exon: 2,
        });
        expect(result).toEqual({ '@rid': variantId });
        expect(conn.addRecord).toHaveBeenCalledTimes(0);
        expect(conn.addVariant).toHaveBeenCalledWith({
            content: {
                break1Repr: 'e.2',
                break1Start: { '@class': 'ExonicPosition', pos: 2 },
                germline: false,
                reference1: geneId,
                type: vocabId,
            },
            existsOk: true,
            target: 'PositionalVariant',
        });
    });

    test('generic variant', async () => {
        const conn = mockConn();
        const result = await loadSmallMutation(conn, geneId, {
            ...variantDefaults,
        });
        expect(result).toEqual({ '@rid': variantId });
        expect(conn.addRecord).toHaveBeenCalledTimes(0);
        expect(conn.addVariant).toHaveBeenCalledWith({
            content: {
                germline: false,
                reference1: geneId,
                type: vocabId,
            },
            existsOk: true,
            target: 'CategoryVariant',
        });
    });
});
