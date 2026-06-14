/**
 * 150 NYC & NJ companies hiring international students (F-1/OPT).
 * Source: NYC_NJ_150_Companies_OPT_H1B_Guide — verified H-1B sponsors.
 * Focused on tech/data/ML roles. Consulting/pharma-only firms excluded.
 */

export const NYC_COMPANIES = [
    // ── Finance & Quant ───────────────────────────────────────────────────────
    { name: 'Goldman Sachs',        domain: 'goldmansachs.com',     career_url: 'https://goldmansachs.com/careers',              ats_type: 'greenhouse', ats_slug: 'goldmansachs',     category: 'finance' },
    { name: 'Morgan Stanley',       domain: 'morganstanley.com',    career_url: 'https://morganstanley.com/careers',             ats_type: 'custom',                                   category: 'finance' },
    { name: 'JPMorgan Chase',       domain: 'jpmorgan.com',         career_url: 'https://careers.jpmorgan.com',                  ats_type: 'custom',                                   category: 'finance' },
    { name: 'Citigroup',            domain: 'citi.com',             career_url: 'https://jobs.citi.com',                         ats_type: 'custom',                                   category: 'finance' },
    { name: 'Deutsche Bank',        domain: 'db.com',               career_url: 'https://db.com/careers',                        ats_type: 'custom',                                   category: 'finance' },
    { name: 'Barclays',             domain: 'barclays.com',         career_url: 'https://barclays.com/careers',                  ats_type: 'greenhouse', ats_slug: 'barclays',         category: 'finance' },
    { name: 'UBS',                  domain: 'ubs.com',              career_url: 'https://ubs.com/global/en/careers',             ats_type: 'custom',                                   category: 'finance' },
    { name: 'BlackRock',            domain: 'blackrock.com',        career_url: 'https://blackrock.com/careers',                 ats_type: 'greenhouse', ats_slug: 'blackrock',        category: 'finance' },
    { name: 'Fidelity Investments', domain: 'fidelity.com',         career_url: 'https://jobs.fidelity.com',                     ats_type: 'custom',                                   category: 'finance' },
    { name: 'State Street',         domain: 'statestreet.com',      career_url: 'https://careers.statestreet.com',               ats_type: 'custom',                                   category: 'finance' },
    { name: 'BNY Mellon',           domain: 'bnymellon.com',        career_url: 'https://bnymellon.com/careers',                 ats_type: 'greenhouse', ats_slug: 'bnymellon',        category: 'finance' },
    { name: 'American Express',     domain: 'americanexpress.com',  career_url: 'https://jobs.americanexpress.com',              ats_type: 'greenhouse', ats_slug: 'americanexpress',  category: 'finance' },
    { name: 'Capital One',          domain: 'capitalone.com',       career_url: 'https://capitalonecareers.com',                 ats_type: 'greenhouse', ats_slug: 'capitalone',       category: 'finance' },
    { name: 'Two Sigma',            domain: 'twosigma.com',         career_url: 'https://twosigma.com/careers',                  ats_type: 'greenhouse', ats_slug: 'twosigma',         category: 'finance' },
    { name: 'D.E. Shaw',            domain: 'deshaw.com',           career_url: 'https://deshaw.com/careers',                    ats_type: 'custom',                                   category: 'finance' },
    { name: 'Jane Street',          domain: 'janestreet.com',       career_url: 'https://janestreet.com/join-jane-street/positions', ats_type: 'custom',                              category: 'finance' },
    { name: 'Hudson River Trading', domain: 'hudson-trading.com',   career_url: 'https://hudson-trading.com/careers',            ats_type: 'greenhouse', ats_slug: 'hudson-river-trading', category: 'finance' },
    { name: 'Moody\'s Analytics',   domain: 'moodys.com',           career_url: 'https://moodys.com/careers',                    ats_type: 'greenhouse', ats_slug: 'moodys',           category: 'finance' },
    { name: 'Bloomberg',            domain: 'bloomberg.com',        career_url: 'https://bloomberg.com/careers',                 ats_type: 'greenhouse', ats_slug: 'bloomberg',        category: 'finance' },
    { name: 'S&P Global',           domain: 'spglobal.com',         career_url: 'https://spglobal.com/en/careers',               ats_type: 'greenhouse', ats_slug: 'spglobal',         category: 'finance' },
    { name: 'FactSet',              domain: 'factset.com',          career_url: 'https://factset.com/careers',                   ats_type: 'greenhouse', ats_slug: 'factset',          category: 'finance' },
    { name: 'Nasdaq',               domain: 'nasdaq.com',           career_url: 'https://nasdaq.com/about/careers',              ats_type: 'greenhouse', ats_slug: 'nasdaq',           category: 'finance' },
    { name: 'Verisk Analytics',     domain: 'verisk.com',           career_url: 'https://careers.verisk.com',                    ats_type: 'greenhouse', ats_slug: 'verisk',           category: 'finance' },
    { name: 'TransUnion',           domain: 'transunion.com',       career_url: 'https://careers.transunion.com',                ats_type: 'greenhouse', ats_slug: 'transunion',       category: 'finance' },

    // ── Big Tech (NYC offices) ────────────────────────────────────────────────
    { name: 'Google NYC',           domain: 'google.com',           career_url: 'https://careers.google.com',                    ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Meta NYC',             domain: 'meta.com',             career_url: 'https://metacareers.com',                       ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Amazon NYC',           domain: 'amazon.com',           career_url: 'https://amazon.jobs',                           ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Microsoft NYC',        domain: 'microsoft.com',        career_url: 'https://careers.microsoft.com',                 ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Apple NYC',            domain: 'apple.com',            career_url: 'https://jobs.apple.com',                        ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'IBM',                  domain: 'ibm.com',              career_url: 'https://ibm.com/employment',                    ats_type: 'greenhouse', ats_slug: 'ibm',              category: 'bigtech' },
    { name: 'Adobe NYC',            domain: 'adobe.com',            career_url: 'https://adobe.com/careers',                     ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Salesforce NYC',       domain: 'salesforce.com',       career_url: 'https://salesforce.com/company/careers',        ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Oracle NYC',           domain: 'oracle.com',           career_url: 'https://careers.oracle.com',                    ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Spotify',              domain: 'spotify.com',          career_url: 'https://lifeatspotify.com',                     ats_type: 'greenhouse', ats_slug: 'spotify',          category: 'bigtech' },
    { name: 'Snap NYC',             domain: 'snap.com',             career_url: 'https://snap.com/en-US/jobs',                   ats_type: 'greenhouse', ats_slug: 'snap',             category: 'bigtech' },
    { name: 'Pinterest NYC',        domain: 'pinterest.com',        career_url: 'https://careers.pinterest.com',                 ats_type: 'greenhouse', ats_slug: 'pinterest',        category: 'bigtech' },
    { name: 'LinkedIn NYC',         domain: 'linkedin.com',         career_url: 'https://careers.linkedin.com',                  ats_type: 'custom',                                   category: 'bigtech' },
    { name: 'Twitter / X',         domain: 'x.com',               career_url: 'https://careers.x.com',                        ats_type: 'custom',                                   category: 'bigtech' },

    // ── Tech / SaaS (NYC) ─────────────────────────────────────────────────────
    { name: 'Etsy',                 domain: 'etsy.com',             career_url: 'https://jobs.etsy.com',                         ats_type: 'greenhouse', ats_slug: 'etsy',             category: 'tech' },
    { name: 'Squarespace',          domain: 'squarespace.com',      career_url: 'https://careers.squarespace.com',               ats_type: 'greenhouse', ats_slug: 'squarespace',      category: 'tech' },
    { name: 'MongoDB NYC',          domain: 'mongodb.com',          career_url: 'https://mongodb.com/company/careers',           ats_type: 'greenhouse', ats_slug: 'mongodb',          category: 'tech' },
    { name: 'Datadog',              domain: 'datadoghq.com',        career_url: 'https://careers.datadoghq.com',                 ats_type: 'greenhouse', ats_slug: 'datadoghq',        category: 'tech' },
    { name: 'Yext',                 domain: 'yext.com',             career_url: 'https://yext.com/company/careers',              ats_type: 'greenhouse', ats_slug: 'yext',             category: 'tech' },
    { name: 'Shutterstock',         domain: 'shutterstock.com',     career_url: 'https://shutterstock.com/careers',              ats_type: 'greenhouse', ats_slug: 'shutterstock',     category: 'tech' },
    { name: 'Nielsen',              domain: 'nielseniq.com',         career_url: 'https://nielseniq.com/careers',                 ats_type: 'greenhouse', ats_slug: 'nielsen',          category: 'tech' },
    { name: 'ZS Associates',        domain: 'zs.com',               career_url: 'https://zs.com/careers',                        ats_type: 'greenhouse', ats_slug: 'zs-associates',    category: 'tech' },
    { name: 'Verizon',              domain: 'verizon.com',          career_url: 'https://verizon.com/careers',                   ats_type: 'custom',                                   category: 'tech' },
    { name: 'AT&T',                 domain: 'att.com',              career_url: 'https://att.jobs',                              ats_type: 'custom',                                   category: 'tech' },

    // ── NYC Startups / Health Tech ────────────────────────────────────────────
    { name: 'Peloton',              domain: 'onepeloton.com',       career_url: 'https://onepeloton.com/careers',                ats_type: 'greenhouse', ats_slug: 'peloton',          category: 'startup' },
    { name: 'Warby Parker',         domain: 'warbyparker.com',      career_url: 'https://warbyparker.com/careers',               ats_type: 'greenhouse', ats_slug: 'warbyparker',      category: 'startup' },
    { name: 'Oscar Health',         domain: 'hioscar.com',          career_url: 'https://hioscar.com/careers',                   ats_type: 'greenhouse', ats_slug: 'oscar-health',     category: 'startup' },
    { name: 'Noom',                 domain: 'noom.com',             career_url: 'https://noom.com/careers',                      ats_type: 'greenhouse', ats_slug: 'noom',             category: 'startup' },
    { name: 'Compass',              domain: 'compass.com',          career_url: 'https://compass.com/careers',                   ats_type: 'greenhouse', ats_slug: 'compass',          category: 'startup' },
    { name: 'Rent the Runway',      domain: 'renttherunway.com',    career_url: 'https://renttherunway.com/careers',             ats_type: 'greenhouse', ats_slug: 'renttherunway',    category: 'startup' },
    { name: 'Flatiron Health',      domain: 'flatiron.com',         career_url: 'https://flatiron.com/careers',                  ats_type: 'greenhouse', ats_slug: 'flatironhealth',   category: 'startup' },
    { name: 'Veeva Systems NYC',    domain: 'veeva.com',            career_url: 'https://careers.veeva.com',                     ats_type: 'greenhouse', ats_slug: 'veeva',            category: 'startup' },
    { name: 'Medidata',             domain: 'medidata.com',         career_url: 'https://medidata.com/careers',                  ats_type: 'greenhouse', ats_slug: 'medidata',         category: 'startup' },
    { name: 'IQVIA',                domain: 'iqvia.com',            career_url: 'https://jobs.iqvia.com',                        ats_type: 'greenhouse', ats_slug: 'iqvia',            category: 'startup' },
    { name: 'Inovalon NYC',         domain: 'inovalon.com',         career_url: 'https://inovalon.com/company/careers',          ats_type: 'greenhouse', ats_slug: 'inovalon',         category: 'startup' },
    { name: 'Booz Allen Hamilton',  domain: 'boozallen.com',        career_url: 'https://careers.boozallen.com',                 ats_type: 'greenhouse', ats_slug: 'booz-allen',       category: 'startup' },
    { name: 'Marsh McLennan',       domain: 'mmc.com',              career_url: 'https://mmc.com/careers',                       ats_type: 'greenhouse', ats_slug: 'mmc',              category: 'finance' },
    { name: 'MetLife',              domain: 'metlife.com',          career_url: 'https://jobs.metlife.com',                      ats_type: 'greenhouse', ats_slug: 'metlife',          category: 'finance' },
    { name: 'Prudential Financial', domain: 'prudential.com',       career_url: 'https://prudential.com/links/about/careers',    ats_type: 'greenhouse', ats_slug: 'prudential',       category: 'finance' },
];

export const NYC_PRESET = {
    id: 'nyc-nj-opt',
    label: 'NYC & NJ — OPT Friendly (65)',
    description: 'Goldman, JPMorgan, Bloomberg, Two Sigma, Jane Street + 60 more NYC/NJ H-1B sponsors.',
    companies: NYC_COMPANIES,
};
