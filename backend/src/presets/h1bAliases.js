/**
 * Feed company key → the H-1B (DOL LCA) employer keys for that company's
 * legal entities. Keys are normalizeCompanyName() output. Only list keys that
 * differ from the feed key ("GOOGLE LLC" already normalizes to "google").
 * Entities reached through an alias are trusted even when they span several
 * FEINs. Review this list at each quarterly import.
 */
export const H1B_ALIASES = {
    amazon: ['amazoncomservices', 'amazonwebservices', 'amazondevelopmentcenterus', 'amazondataservices', 'amazonadvertising', 'amazonfulfillmentservices'],
    aws: ['amazonwebservices'],
    alphabet: ['google'],
    meta: ['metaplatforms'],
    jpmorgan: ['jpmorganchaseandco', 'jpmorganchasebank'],
    jpmorganchase: ['jpmorganchaseandco', 'jpmorganchasebank'],
};
