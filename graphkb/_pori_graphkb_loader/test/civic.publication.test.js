const { titlesMatch } = require('../src/civic/publication');


describe('titlesMatch', () => {
    test('ignores trailing period', () => {
        expect(titlesMatch(
            'a sentence.',
            'a sentence',
        )).toBe(true);
    });

    test('case insensitive', () => {
        expect(titlesMatch(
            'A sentence.',
            'a sentence.',
        )).toBe(true);
    });

    test('ignores leading whitespace', () => {
        expect(titlesMatch(
            '  a sentence',
            'a sentence',
        )).toBe(true);
    });

    test('ignores trailing whitespace', () => {
        expect(titlesMatch(
            'a sentence',
            'a sentence  ',
        )).toBe(true);
    });

    test('ignores emphasis vs italics', () => {
        expect(titlesMatch(
            'a <em>sentence</em>.',
            'a <i>sentence</i>',
        )).toBe(true);
    });

    test('ignores emphasis', () => {
        expect(titlesMatch(
            'a <em>sentence</em>.',
            'a sentence',
        )).toBe(true);
    });

    test('ignores italics', () => {
        expect(titlesMatch(
            'a <i>sentence</i>.',
            'a sentence',
        )).toBe(true);
    });
});
