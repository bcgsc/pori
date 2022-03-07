const { normalizeVariantRecord } = require('../src/civic/variant');
const { translateRelevance } = require('../src/civic');

describe('normalizeVariantRecord', () => {
    test('exon mutation', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'gene',
            name: 'EXON 12 MUTATION',
        });
        expect(variants).toEqual([{
            positional: true,
            reference1: {
                name: 'gene',
                sourceId: '1',
            },
            variant: 'e.12mut',
        }]);
    });

    test('deleterious mutation', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'gene',
            name: 'DELETRIOUS MUTATION',
        });
        expect(variants).toEqual([{
            reference1: { name: 'gene', sourceId: '1' },
            type: 'deletrious mutation',
        }]);
    });

    test('phosphorylation variant', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'gene',
            name: 'Y1234 phosphorylation',
        });
        expect(variants).toEqual([{
            positional: true,
            reference1: { name: 'gene', sourceId: '1' },
            variant: 'p.y1234phos',
        }]);
    });

    test('single gene fusion with missense mutation', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'ALK FUSION G1202R',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'alk', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.g1202r',
            },
        ]);
    });

    test('multi-gene fusion with 2 resistance mutations (dash notation)', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'alk',
            name: 'EML4-ALK G1202R-L1198F',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'eml4' },
                reference2: { name: 'alk', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.g1202r',
            },
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.l1198f',
            },
        ]);
    });

    test('multi-gene fusion', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NRG1',
            name: 'CD74-NRG1',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'cd74' },
                reference2: { name: 'nrg1', sourceId: '1' },
                type: 'fusion',
            },
        ]);
    });

    test('fusion with multiple variants', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'LMNA-NTRK1 G595R AND G667C',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'lmna' },
                reference2: { name: 'ntrk1', sourceId: '1' },
                type: 'fusion',
            },
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.g595r',
            },
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.g667c',
            },
        ]);
    });

    test('corrects deprecated indel syntax', () => {
        // S111C (c.330CA>TT)
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'S111C (c.330CA>TT)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [{
                    positional: true,
                    reference1: { name: 'ntrk1', sourceId: '1' },
                    variant: 'c.330_331delcainstt',
                }],
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.s111c',
            },
        ]);
    });

    test.skip('multiple variants with plus notation', () => {
        // V600E+V600M
        // E2014K + E2419K
    });

    test.skip('missense and amplification', () => {
        // V600E AMPLIFICATION
    });

    test('categorical variant', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'UNDEREXPRESSION',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'ntrk1', sourceId: '1' },
                type: 'underexpression',
            },
        ]);
    });

    test('protein truncation with cds notation', () => {
        // e46* (c.136g>t)
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'E46* (c.136G>T)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.136g>t',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.e46*',
            },
        ]);
    });


    test('categorical variant with spaces', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'DNA BINDING DOMAIN MUTATION',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'ntrk1', sourceId: '1' },
                type: 'dna binding domain mutation',
            },
        ]);
    });

    test('regular missense mutation', () => {
        // R132H
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NTRK1',
            name: 'R132H',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'ntrk1', sourceId: '1' },
                variant: 'p.r132h',
            },
        ]);
    });

    test('plural for single gene fusion', () => {
        // ALK FUSIONS
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'NRG1',
            name: 'NRG1 fusions',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'nrg1', sourceId: '1' },
                type: 'fusion',
            },
        ]);
    });

    test('fusion with exon positions', () => {
        // EML4-ALK E20;A20
        // ALK FUSIONS
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'EML4-ALK E20;A20',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'eml4' },
                reference2: { name: 'alk', sourceId: '1' },
                variant: 'fusion(e.20,e.20)',
            },
        ]);
    });

    test('fusion with new exon notation', () => {
        // EWSR1-FLI1 e7-e6
        // FLI1 Fusion
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'FLI1',
            name: 'EWSR1-FLI1 e7-e6',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'ewsr1' },
                reference2: { name: 'fli1', sourceId: '1' },
                variant: 'fusion(e.7,e.6)',
            },
        ]);
    });

    test('fusion with reference2 input gene', () => {
        // EML4-ALK E20;A20
        // ALK FUSIONS
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'EML4',
            name: 'EML4-ALK E20;A20',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'eml4', sourceId: '1' },
                reference2: { name: 'alk' },
                variant: 'fusion(e.20,e.20)',
            },
        ]);
    });

    test('abl fusion', () => {
        // BCR-ABL
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'BCR-ABL',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'bcr' },
                reference2: { name: 'abl1', sourceId: '1' },
                type: 'fusion',
            },
        ]);
    });


    test('cds notation', () => {
        // BCR-ABL
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'c.123G>T',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'abl1', sourceId: '1' },
                variant: 'c.123g>t',
            },
        ]);
    });

    test('exon range deletion', () => {
        // BCR-ABL
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'exon 2-3 deletion',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'abl1', sourceId: '1' },
                variant: 'e.2_3del',
            },
        ]);
    });

    test('frameshift with cds', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 't133lfs*26 (c.397dela)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.397dela',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.t133lfs*26',
            },
        ]);
    });

    test('protein indel with cds', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 't133lfs*26 (c.397dela)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.397dela',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.t133lfs*26',
            },
        ]);
    });

    test('simple gene mutation', () => {
        // BCR-ABL
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'ABL1 mutations',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'abl1', sourceId: '1' },
                type: 'mutation',
            },
        ]);
    });

    test('exon plural mutations', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'exon 3 mutations',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'abl1', sourceId: '1' },
                variant: 'e.3mut',
            },
        ]);
    });

    test('mutations', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ABL1',
            name: 'mutations',
        });
        expect(variants).toEqual([
            {
                reference1: { name: 'abl1', sourceId: '1' },
                type: 'mutation',
            },
        ]);
    });

    test.skip('germline notation', () => {
        // DPYD*2A HOMOZYGOSITY
    });

    test('splice site mutation', () => {
        // F547 SPLICE SITE MUTATION
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'F547 SPLICE SITE MUTATION',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.f547spl',
            },
        ]);
    });

    test('protein deletion with cds deletion sequence', () => {
        // r79_s80del (c.236_241delgcagtc)
        // r82_v84del (c.244_252del)
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'r79_s80del (c.236_241delgcagtc)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.236_241delgcagtc',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.r79_s80del',
            },
        ]);
    });

    test('protein deletion with cds deletion no sequence', () => {
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'r82_v84del (c.244_252del)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.244_252del',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.r82_v84del',
            },
        ]);
    });


    test('protein dup with cds dup', () => {
        // p.s193_c196dupstsc (c.577_588dupagcaccagctgc)
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'p.s193_c196dupstsc (c.577_588dupagcaccagctgc)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.577_588dupagcaccagctgc',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.s193_c196dupstsc',
            },
        ]);
    });

    test('protein with cds notation', () => {
        // A122I (c.364_365GC>AT)
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'A122I (c.364_365GC>AT)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.364_365gc>at',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.a122i',
            },
        ]);
    });

    test('OR-able position no alt seq', () => {
        // G12/G13
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'G12/G13',
        });
        expect(variants).toEqual([
            {
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.(g12_g13)mut',
            },
        ]);
    });

    test('catalogue variant', () => {
        // RS3910384
    });

    test('semi-colon delimited variants', () => {
        // A50A (c.150C>G); Splicing alteration (c.463-1G>T)
        const variants = normalizeVariantRecord({
            entrezId: 1,
            entrezName: 'ALK',
            name: 'A50A (c.150C>G); Splicing alteration (c.463-1G>T)',
        });
        expect(variants).toEqual([
            {
                inferredBy: [
                    {
                        positional: true,
                        reference1: { name: 'alk', sourceId: '1' },
                        variant: 'c.150c>g',
                    },
                ],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'p.a50a',
            },
            {
                infers: [{
                    reference1: { name: 'alk', sourceId: '1' },
                    type: 'splicing alteration',
                }],
                positional: true,
                reference1: { name: 'alk', sourceId: '1' },
                variant: 'c.463-1g>t',
            },
        ]);
    });

    test('duplicate fusion', () => {
        // AGGF1-PDGFRB, AGGF1-PDGFRB C843G
    });

    test('non-specific positional mutaiton', () => {
        // E1813 mutations
    });

    describe('bad notation should return as vocabulary', () => {
        test('ERBB2 G776INSV_G/C', () => {
            const variants = normalizeVariantRecord({
                entrezId: 1,
                entrezName: 'ERBB2',
                name: 'ERBB2 G776INSV_G/C',
            });
            expect(variants).toEqual([{
                reference1: { name: 'erbb2', sourceId: '1' },
                type: 'erbb2 g776insv_g/c',
            }]);
        });

        test('exon1 151nt del; Null (Partial deletion of Exon 1)', () => {
            const variants = normalizeVariantRecord({
                entrezId: 1,
                entrezName: 'ERBB2',
                name: 'exon1 151nt del; Null (Partial deletion of Exon 1)',
            });
            expect(variants).toEqual([{
                reference1: { name: 'erbb2', sourceId: '1' },
                type: 'exon1 151nt del',
            }, {
                reference1: { name: 'erbb2', sourceId: '1' },
                type: 'null (partial deletion of exon 1)',
            }]);
        });
    });
});

describe('translateRelevance', () => {
    test.each([
        ['Predictive', 'Supports', 'Sensitivity', 'sensitivity'],
        ['Predictive', 'Supports', 'Adverse Response', 'adverse response'],
        ['Predictive', 'Supports', 'Reduced Sensitivity', 'reduced sensitivity'],
        ['Predictive', 'Supports', 'Resistance', 'resistance'],
        ['Predictive', 'Supports', 'Sensitivity/Response', 'sensitivity'],
        ['Diagnostic', 'Supports', 'Positive', 'favours diagnosis'],
        ['Diagnostic', 'Supports', 'Negative', 'opposes diagnosis'],
        ['Prognostic', 'Supports', 'Negative', 'unfavourable prognosis'],
        ['Prognostic', 'Supports', 'Poor Outcome', 'unfavourable prognosis'],
        ['Prognostic', 'Supports', 'Positive', 'favourable prognosis'],
        ['Prognostic', 'Supports', 'Better Outcome', 'favourable prognosis'],
        ['Predisposing', 'Supports', 'Positive', 'predisposing'],
        ['Predisposing', 'Supports', null, 'predisposing'],
        ['Predisposing', 'Supports', 'null', 'predisposing'],
        ['Predisposing', 'Supports', 'Pathogenic', 'pathogenic'],
        ['Predisposing', 'Supports', 'Likely Pathogenic', 'likely pathogenic'],
        ['Functional', 'Supports', 'Gain of Function', 'gain of function'],
        ['Predictive', 'Does Not Support', 'Sensitivity', 'no response'],
        ['Predictive', 'Does Not Support', 'Sensitivity/Response', 'no response'],
        ['Predictive', 'Does Not Support', 'Resistance', 'no resistance'],
        ['Functional', 'Supports', 'Neomorphic', 'neomorphic'],
        ['Functional', 'Supports', 'Unaltered Function', 'unaltered function'],
    ])(
        '%s|%s|%s returns %s', (evidenceType, evidenceDirection, clinicalSignificance, expected) => {
            expect(translateRelevance(evidenceType, evidenceDirection, clinicalSignificance)).toEqual(expected);
        },
    );

    test.each([
        // For EvType-EvDir-ClinSign test cases that should not be loaded
        ['Prognostic', 'Does Not Support', 'Poor Outcome'],
        ['Functional', 'Does Not Support', 'Neomorphic'],
        ['Predisposing', 'Does Not Support', 'Positive'],
        ['Predisposing', 'N/A', 'N/A'],
        ['Diagnostic', 'Does Not Support', 'Positive'],
        ['Diagnostic', 'Does Not Support', 'Negative'],
        ['Functional', 'Does Not Support', 'Unaltered Function'],
    ])(
        '%s|%s|%s errors', (evidenceType, evidenceDirection, clinicalSignificance) => {
            expect(() => translateRelevance(evidenceType, evidenceDirection, clinicalSignificance)).toThrow('unable to process relevance');
        },
    );
});
