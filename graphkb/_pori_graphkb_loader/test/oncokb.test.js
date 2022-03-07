const { parseVariantName } = require('../src/oncokb');


describe('oncokb', () => {
    describe('parseVariantName', () => {
        test.todo('parses exon mutations');

        test.todo('kinase domain duplication');

        test.todo('amplification');

        test.todo('wildtype');

        test('adds p prefix for protein changes', () => {
            const parsed = parseVariantName('V600_K601insFGLAT', { reference1: 'braf' });
            expect(parsed).toEqual({
                type: 'p.v600_k601insfglat',
            });
        });

        test('fusion', () => {
            const parsed = parseVariantName('BCR-ABL1 Fusion');
            expect(parsed).toEqual({
                flipped: false,
                reference2: 'abl1',
                type: 'fusion',
            });
        });

        test('fusion with gene given', () => {
            const parsed = parseVariantName('BCR-ABL1 Fusion', { reference1: 'ABL1' });
            expect(parsed).toEqual({
                flipped: true,
                reference2: 'bcr',
                type: 'fusion',
            });
        });

        test('case insensitive fusion parsing', () => {
            const parsed = parseVariantName('RAD51C-ATXN7', { reference1: 'atxn7' });
            expect(parsed).toEqual({
                flipped: true,
                reference2: 'rad51c',
                type: 'fusion',
            });
        });

        test('unicode dash character', () => {
            const parsed = parseVariantName('GOPC–ROS1 Fusion', { reference1: 'ros1' });
            expect(parsed).toEqual({
                flipped: true,
                reference2: 'gopc',
                type: 'fusion',
            });
        });
    });
});
