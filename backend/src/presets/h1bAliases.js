/**
 * Feed company name → the legal names it files H-1B applications under,
 * spelled as they appear in the DOL LCA files. Keys and spellings are both
 * run through normalizeLegalName(), so punctuation and Inc/LLC don't matter.
 * When a company has an entry here, ONLY these entities count for it (a
 * same-name unrelated filer is never added). Review at each quarterly import.
 */
export const H1B_ALIASES = {
    Amazon: [
        'Amazon.com Services LLC', 'Amazon Web Services, Inc.', 'Amazon Development Center U.S., Inc.',
        'Amazon Data Services, Inc.', 'Amazon Advertising LLC', 'Amazon Capital Services, Inc.',
    ],
    AWS: ['Amazon Web Services, Inc.'],
    Google: ['Google LLC'],
    Alphabet: ['Google LLC'],
    Meta: ['Meta Platforms, Inc.'],
    Microsoft: ['Microsoft Corporation'],
    Apple: ['Apple Inc.'],
    JPMorgan: ['JPMorgan Chase & Co.', 'JPMorgan Chase Bank, N.A.'],
    'JPMorgan Chase': ['JPMorgan Chase & Co.', 'JPMorgan Chase Bank, N.A.'],
};
