import { describe, it, expect } from 'vitest';
import { parseDomainStats, selectCandidateDomains } from './wdcDiscovery.js';

describe('parseDomainStats', () => {
    it('parses domain and entity count from a TSV row, skipping the header', () => {
        const csv = [
            'Domain\t#Quads of Subset\t#Entities of class\tProperties and Density',
            "acme.com\t3997\t306\t{'title': 1.0}",
            "widgetco.com\t152\t4\t{'title': 1.0}",
        ].join('\n');

        expect(parseDomainStats(csv)).toEqual([
            { domain: 'acme.com', entityCount: 306 },
            { domain: 'widgetco.com', entityCount: 4 },
        ]);
    });

    it('skips a malformed row that is missing fields', () => {
        const csv = [
            'Domain\t#Quads of Subset\t#Entities of class\tProperties and Density',
            'incomplete-row\t5',
            "acme.com\t3997\t306\t{'title': 1.0}",
        ].join('\n');

        expect(parseDomainStats(csv)).toEqual([{ domain: 'acme.com', entityCount: 306 }]);
    });

    it('skips a row with a non-numeric entity count', () => {
        const csv = [
            'Domain\t#Quads of Subset\t#Entities of class\tProperties and Density',
            "bad-row.com\t3997\tNaN\t{'title': 1.0}",
            "acme.com\t3997\t306\t{'title': 1.0}",
        ].join('\n');

        expect(parseDomainStats(csv)).toEqual([{ domain: 'acme.com', entityCount: 306 }]);
    });

    it('skips blank lines', () => {
        const csv = [
            'Domain\t#Quads of Subset\t#Entities of class\tProperties and Density',
            '',
            "acme.com\t3997\t306\t{'title': 1.0}",
            '   ',
        ].join('\n');

        expect(parseDomainStats(csv)).toEqual([{ domain: 'acme.com', entityCount: 306 }]);
    });

    it('returns an empty array for header-only input', () => {
        const csv = 'Domain\t#Quads of Subset\t#Entities of class\tProperties and Density';
        expect(parseDomainStats(csv)).toEqual([]);
    });
});

describe('selectCandidateDomains', () => {
    const domainStats = [
        { domain: 'acme.com', entityCount: 306 },
        { domain: 'widgetco.com', entityCount: 4 },
        { domain: 'onejobonly.com', entityCount: 1 },
        { domain: 'alreadyknown.com', entityCount: 500 },
    ];

    it('excludes domains already in the known set, case-insensitively', () => {
        const result = selectCandidateDomains(domainStats, new Set(['AlreadyKnown.com']), { minEntities: 1, limit: 10 });
        expect(result.some(c => c.domain === 'alreadyknown.com')).toBe(false);
    });

    it('excludes domains below the minimum entity-count threshold', () => {
        const result = selectCandidateDomains(domainStats, new Set(), { minEntities: 3, limit: 10 });
        expect(result.some(c => c.domain === 'onejobonly.com')).toBe(false);
        expect(result.some(c => c.domain === 'widgetco.com')).toBe(true);
    });

    it('sorts surviving candidates by entity count, descending', () => {
        const result = selectCandidateDomains(domainStats, new Set(), { minEntities: 1, limit: 10 });
        expect(result.map(c => c.domain)).toEqual(['alreadyknown.com', 'acme.com', 'widgetco.com', 'onejobonly.com']);
    });

    it('caps the result to the given limit, keeping the highest entity counts', () => {
        const result = selectCandidateDomains(domainStats, new Set(), { minEntities: 1, limit: 2 });
        expect(result).toHaveLength(2);
        expect(result.map(c => c.domain)).toEqual(['alreadyknown.com', 'acme.com']);
    });
});
