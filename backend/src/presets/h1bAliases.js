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
    // Spellings below are taken from the FY2025–FY2026 LCA files.
    Oracle: ['Oracle America, Inc.', 'Oracle Financial Services Software, Inc.'],
    Cisco: ['Cisco Systems, Inc.'],
    Uber: ['Uber Technologies, Inc.', 'Uber Freight US LLC'],
    Databricks: ['Databricks, Inc.'],
    OpenAI: ['OpenAI OpCo, LLC', 'OpenAI, L.L.C.'],
    Anthropic: ['Anthropic, PBC'],
    Robinhood: ['Robinhood Markets, Inc.'],
    Ramp: ['Ramp Business Corporation'],
    Notion: ['Notion Labs, Inc.'],
    Palantir: ['PALANTIR TECHNOLOGIES INC.'],
    Walmart: ['WAL-MART ASSOCIATES, INC.'],
    'Capital One': ['Capital One Services, LLC', 'Capital One, National Association'],
    'Goldman Sachs': ['GOLDMAN SACHS & CO. LLC', 'GOLDMAN SACHS SERVICES LLC', 'GOLDMAN SACHS BANK USA'],
    Cognizant: ['COGNIZANT TECHNOLOGY SOLUTIONS US CORP', 'Cognizant TriZetto Software Group, Inc.', 'Cognizant Mobility, Inc.'],
    Zoom: ['Zoom Communications, Inc.', 'Zoom Video Communications, Inc.'],
    Deloitte: ['Deloitte Consulting LLP', 'Deloitte & Touche LLP', 'Deloitte LLP'],
    Qualcomm: ['Qualcomm Incorporated', 'Qualcomm Technologies, Inc.', 'Qualcomm Atheros, Inc.', 'Qualcomm Innovation Center, Inc.'],
};
