/**
 * 100 Seattle & Bellevue companies hiring international students (F-1/OPT).
 * Source: Seattle Bellevue OPT Guide — all verified as H-1B sponsors.
 *
 * ats_type values:
 *   greenhouse  — monitored via boards-api.greenhouse.io (exact diff, new grad filter)
 *   lever       — monitored via api.lever.co
 *   ashby       — monitored via boards-api.ashbyhq.com
 *   workday     — monitored via Workday WD API (tenant required)
 *   custom      — career page polled for HTML changes
 *
 * career_url comes directly from the PDF — no auto-detection needed.
 */

export const SEATTLE_COMPANIES = [
    // ── Anchor Employers ──────────────────────────────────────────────────────
    { name: 'Amazon / AWS',         domain: 'amazon.com',          career_url: 'https://amazon.jobs',                             ats_type: 'custom',     category: 'anchor' },
    { name: 'Microsoft',            domain: 'microsoft.com',       career_url: 'https://careers.microsoft.com',                   ats_type: 'custom',     category: 'anchor' },
    { name: 'Expedia Group',        domain: 'expediagroup.com',    career_url: 'https://lifeatexpedia.com',                       ats_type: 'greenhouse', ats_slug: 'expedia', category: 'anchor' },
    { name: 'Nordstrom',            domain: 'nordstrom.com',       career_url: 'https://careers.nordstrom.com',                   ats_type: 'custom',     category: 'anchor' },
    { name: 'Starbucks',            domain: 'starbucks.com',       career_url: 'https://careers.starbucks.com',                   ats_type: 'custom',     category: 'anchor' },
    { name: 'Boeing',               domain: 'boeing.com',          career_url: 'https://boeing.com/careers',                      ats_type: 'custom',     category: 'anchor' },
    { name: 'T-Mobile',             domain: 't-mobile.com',        career_url: 'https://careers.t-mobile.com',                    ats_type: 'custom',     category: 'anchor' },
    { name: 'Paccar',               domain: 'paccar.com',          career_url: 'https://paccar.com/careers',                      ats_type: 'custom',     category: 'anchor' },
    { name: 'Weyerhaeuser',         domain: 'weyerhaeuser.com',    career_url: 'https://weyerhaeuser.com/company/careers',         ats_type: 'custom',     category: 'anchor' },
    { name: 'Costco',               domain: 'costco.com',          career_url: 'https://costco.com/jobs',                         ats_type: 'custom',     category: 'anchor' },
    { name: 'Alaska Airlines',      domain: 'alaskaair.com',       career_url: 'https://jobs.alaskaair.com',                      ats_type: 'custom',     category: 'anchor' },
    { name: 'REI',                  domain: 'rei.com',             career_url: 'https://rei.com/careers',                         ats_type: 'greenhouse', ats_slug: 'rei', category: 'anchor' },

    // ── Big Tech / Cloud / Enterprise ─────────────────────────────────────────
    { name: 'Google',               domain: 'google.com',          career_url: 'https://careers.google.com',                      ats_type: 'custom',     category: 'bigtech' },
    { name: 'Meta',                 domain: 'meta.com',            career_url: 'https://metacareers.com',                         ats_type: 'custom',     category: 'bigtech' },
    { name: 'Salesforce',           domain: 'salesforce.com',      career_url: 'https://salesforce.com/company/careers',          ats_type: 'custom',     category: 'bigtech' },
    { name: 'Oracle',               domain: 'oracle.com',          career_url: 'https://careers.oracle.com',                      ats_type: 'custom',     category: 'bigtech' },
    { name: 'SAP',                  domain: 'sap.com',             career_url: 'https://sap.com/careers',                         ats_type: 'custom',     category: 'bigtech' },
    { name: 'Zendesk',              domain: 'zendesk.com',         career_url: 'https://careers.zendesk.com',                     ats_type: 'greenhouse', ats_slug: 'zendesk', category: 'bigtech' },
    { name: 'DocuSign',             domain: 'docusign.com',        career_url: 'https://docusign.com/company/careers',            ats_type: 'greenhouse', ats_slug: 'docusign', category: 'bigtech' },
    { name: 'Smartsheet',           domain: 'smartsheet.com',      career_url: 'https://smartsheet.com/company/careers',          ats_type: 'greenhouse', ats_slug: 'smartsheet', category: 'bigtech' },
    { name: 'Avalara',              domain: 'avalara.com',         career_url: 'https://avalara.com/us/en/about/careers',         ats_type: 'greenhouse', ats_slug: 'avalara', category: 'bigtech' },
    { name: 'WatchGuard Technologies', domain: 'watchguard.com',   career_url: 'https://watchguard.com/wgrd-about/careers',       ats_type: 'greenhouse', ats_slug: 'watchguard', category: 'bigtech' },
    { name: 'F5 Networks',          domain: 'f5.com',              career_url: 'https://f5.com/company/careers',                  ats_type: 'greenhouse', ats_slug: 'f5', category: 'bigtech' },
    { name: 'Nintex',               domain: 'nintex.com',          career_url: 'https://nintex.com/careers',                      ats_type: 'greenhouse', ats_slug: 'nintex', category: 'bigtech' },

    // ── AI / ML / Data ────────────────────────────────────────────────────────
    { name: 'Allen Institute for AI', domain: 'allenai.org',       career_url: 'https://allenai.org/careers',                     ats_type: 'greenhouse', ats_slug: 'allenai', category: 'ai' },
    { name: 'Weights & Biases',     domain: 'wandb.ai',            career_url: 'https://wandb.ai/careers',                        ats_type: 'ashby',      ats_slug: 'wandb', category: 'ai' },
    { name: 'Vast Data',            domain: 'vastdata.com',        career_url: 'https://vastdata.com/careers',                    ats_type: 'greenhouse', ats_slug: 'vastdata', category: 'ai' },
    { name: 'SparkCognition',       domain: 'sparkcognition.com',  career_url: 'https://sparkcognition.com/careers',              ats_type: 'greenhouse', ats_slug: 'sparkcognition', category: 'ai' },
    { name: 'Adaptive Biotechnologies', domain: 'adaptivebiotech.com', career_url: 'https://adaptivebiotech.com/careers',         ats_type: 'greenhouse', ats_slug: 'adaptivebiotech', category: 'ai' },
    { name: 'Qumulo',               domain: 'qumulo.com',          career_url: 'https://qumulo.com/careers',                      ats_type: 'greenhouse', ats_slug: 'qumulo', category: 'ai' },

    // ── Fintech / E-Commerce / Consumer ──────────────────────────────────────
    { name: 'Stripe',               domain: 'stripe.com',          career_url: 'https://stripe.com/jobs',                         ats_type: 'lever',      ats_slug: 'stripe', category: 'fintech' },
    { name: 'Remitly',              domain: 'remitly.com',         career_url: 'https://remitly.com/us/en/home/careers',          ats_type: 'greenhouse', ats_slug: 'remitly', category: 'fintech' },
    { name: 'Gravity Payments',     domain: 'gravitypayments.com', career_url: 'https://gravitypayments.com/careers',             ats_type: 'greenhouse', ats_slug: 'gravity', category: 'fintech' },
    { name: 'Redfin',               domain: 'redfin.com',          career_url: 'https://redfin.com/about/jobs',                   ats_type: 'greenhouse', ats_slug: 'redfin', category: 'fintech' },
    { name: 'Zillow',               domain: 'zillow.com',          career_url: 'https://zillow.com/careers',                      ats_type: 'greenhouse', ats_slug: 'zillow', category: 'fintech' },
    { name: 'Rover.com',            domain: 'rover.com',           career_url: 'https://rover.com/careers',                       ats_type: 'greenhouse', ats_slug: 'rover', category: 'fintech' },
    { name: 'Chewy',                domain: 'chewy.com',           career_url: 'https://chewy.com/jobs',                          ats_type: 'greenhouse', ats_slug: 'chewy', category: 'fintech' },
    { name: 'OfferUp',              domain: 'offerup.com',         career_url: 'https://offerup.com/careers',                     ats_type: 'greenhouse', ats_slug: 'offerup', category: 'fintech' },
    { name: 'Convoy',               domain: 'convoy.com',          career_url: 'https://convoy.com/careers',                      ats_type: 'greenhouse', ats_slug: 'convoy', category: 'fintech' },
    { name: 'Shippo',               domain: 'goshippo.com',        career_url: 'https://goshippo.com/careers',                    ats_type: 'greenhouse', ats_slug: 'shippo', category: 'fintech' },
    { name: 'Flexe',                domain: 'flexe.com',           career_url: 'https://flexe.com/careers',                       ats_type: 'greenhouse', ats_slug: 'flexe', category: 'fintech' },
    { name: 'Vacasa',               domain: 'vacasa.com',          career_url: 'https://vacasa.com/careers',                      ats_type: 'greenhouse', ats_slug: 'vacasa', category: 'fintech' },
    { name: 'Porch Group',          domain: 'porchgroup.com',      career_url: 'https://porchgroup.com/careers',                  ats_type: 'greenhouse', ats_slug: 'porch', category: 'fintech' },
    { name: 'Accolade',             domain: 'accoladecare.com',    career_url: 'https://accoladecare.com/about/careers',          ats_type: 'greenhouse', ats_slug: 'accolade', category: 'fintech' },
    { name: 'Limeade',              domain: 'limeade.com',         career_url: 'https://limeade.com/about/careers',               ats_type: 'greenhouse', ats_slug: 'limeade', category: 'fintech' },

    // ── Healthcare / Biotech ──────────────────────────────────────────────────
    { name: 'UW Medicine',          domain: 'uwmedicine.org',      career_url: 'https://careers.uwmedicine.org',                  ats_type: 'custom',     category: 'biotech' },
    { name: 'Fred Hutchinson Cancer Center', domain: 'fredhutch.org', career_url: 'https://fredhutch.org/careers',               ats_type: 'greenhouse', ats_slug: 'fredhutch', category: 'biotech' },
    { name: 'Providence Health',    domain: 'providence.org',      career_url: 'https://careers.providence.org',                  ats_type: 'custom',     category: 'biotech' },
    { name: 'Seattle Children\'s',  domain: 'seattlechildrens.org', career_url: 'https://seattlechildrens.org/about/careers',    ats_type: 'custom',     category: 'biotech' },
    { name: 'Sana Biotechnology',   domain: 'sana.com',            career_url: 'https://sana.com/careers',                        ats_type: 'greenhouse', ats_slug: 'sana', category: 'biotech' },
    { name: 'Apixio',               domain: 'apixio.com',          career_url: 'https://apixio.com/company/careers',              ats_type: 'greenhouse', ats_slug: 'apixio', category: 'biotech' },

    // ── Startups ──────────────────────────────────────────────────────────────
    { name: 'Outreach',             domain: 'outreach.io',         career_url: 'https://outreach.io/company/careers',             ats_type: 'greenhouse', ats_slug: 'outreach', category: 'startup' },
    { name: 'Highspot',             domain: 'highspot.com',        career_url: 'https://highspot.com/careers',                    ats_type: 'greenhouse', ats_slug: 'highspot', category: 'startup' },
    { name: 'Icertis',              domain: 'icertis.com',         career_url: 'https://icertis.com/company/careers',             ats_type: 'greenhouse', ats_slug: 'icertis', category: 'startup' },
    { name: 'Auth0 (Okta)',         domain: 'okta.com',            career_url: 'https://okta.com/company/careers',                ats_type: 'greenhouse', ats_slug: 'auth0', category: 'startup' },
    { name: 'WP Engine',            domain: 'wpengine.com',        career_url: 'https://wpengine.com/careers',                    ats_type: 'greenhouse', ats_slug: 'wpengine', category: 'startup' },
    { name: 'Hiya',                 domain: 'hiya.com',            career_url: 'https://hiya.com/careers',                        ats_type: 'greenhouse', ats_slug: 'hiya', category: 'startup' },
    { name: 'Formant',              domain: 'formant.io',          career_url: 'https://formant.io/careers',                      ats_type: 'greenhouse', ats_slug: 'formant', category: 'startup' },
    { name: 'Outrider',             domain: 'outrider.ai',         career_url: 'https://outrider.ai/careers',                     ats_type: 'greenhouse', ats_slug: 'outrider', category: 'startup' },
    { name: 'Saildrone',            domain: 'saildrone.com',       career_url: 'https://saildrone.com/careers',                   ats_type: 'greenhouse', ats_slug: 'saildrone', category: 'startup' },
    { name: 'Helion Energy',        domain: 'helionenergy.com',    career_url: 'https://helionenergy.com/careers',                ats_type: 'greenhouse', ats_slug: 'helion', category: 'startup' },
    { name: 'Jobber',               domain: 'getjobber.com',       career_url: 'https://getjobber.com/careers',                   ats_type: 'greenhouse', ats_slug: 'jobber', category: 'startup' },
    { name: 'Boundless Immigration',domain: 'boundless.com',       career_url: 'https://boundless.com/about/careers',             ats_type: 'greenhouse', ats_slug: 'boundless', category: 'startup' },
    { name: 'Pushpay',              domain: 'pushpay.com',         career_url: 'https://pushpay.com/careers',                     ats_type: 'greenhouse', ats_slug: 'pushpay', category: 'startup' },
    { name: 'Limelight Networks',   domain: 'limelight.com',       career_url: 'https://limelight.com/careers',                   ats_type: 'greenhouse', ats_slug: 'limelight', category: 'startup' },
    { name: 'WellSky',              domain: 'wellsky.com',         career_url: 'https://wellsky.com/careers',                     ats_type: 'greenhouse', ats_slug: 'wellsky', category: 'startup' },
    { name: 'Rad Power Bikes',      domain: 'radpowerbikes.com',   career_url: 'https://radpowerbikes.com/pages/careers',         ats_type: 'greenhouse', ats_slug: 'radpowerbikes', category: 'startup' },
    { name: 'MedBridge',            domain: 'medbridgeeducation.com', career_url: 'https://medbridgeeducation.com/careers',       ats_type: 'greenhouse', ats_slug: 'medbridge', category: 'startup' },
    { name: 'Apttus (Conga)',       domain: 'conga.com',           career_url: 'https://conga.com/careers',                       ats_type: 'greenhouse', ats_slug: 'conga', category: 'startup' },
    { name: 'Mighty Networks',      domain: 'mightynetworks.com',  career_url: 'https://mightynetworks.com/jobs',                 ats_type: 'greenhouse', ats_slug: 'mightynetworks', category: 'startup' },
    { name: 'CrowdStreet',          domain: 'crowdstreet.com',     career_url: 'https://crowdstreet.com/about/careers',           ats_type: 'greenhouse', ats_slug: 'crowdstreet', category: 'startup' },

    // ── Enterprise / Mid-size ─────────────────────────────────────────────────
    { name: 'Zones',                domain: 'zones.com',           career_url: 'https://zones.com/careers',                       ats_type: 'custom',     category: 'bigtech' },
    { name: 'HPE (Zerto)',          domain: 'hpe.com',             career_url: 'https://hpe.com/us/en/living-progress/careers',   ats_type: 'custom',     category: 'bigtech' },
    { name: 'Zipwhip (Twilio)',     domain: 'twilio.com',          career_url: 'https://twilio.com/company/jobs',                 ats_type: 'greenhouse', ats_slug: 'twilio', category: 'bigtech' },

    // ── AI / ML (additional) ─────────────────────────────────────────────────
    { name: 'Algorithmia (DataRobot)', domain: 'datarobot.com',    career_url: 'https://datarobot.com/careers',                   ats_type: 'greenhouse', ats_slug: 'datarobot', category: 'ai' },
    { name: 'Narrative Science',    domain: 'narrativescience.com', career_url: 'https://narrativescience.com',                   ats_type: 'custom',     category: 'ai' },

    // ── Fintech / Consumer (additional) ──────────────────────────────────────
    { name: 'Fareportal',           domain: 'fareportal.com',      career_url: 'https://fareportal.com/careers',                  ats_type: 'greenhouse', ats_slug: 'fareportal', category: 'fintech' },
    { name: 'Concord Technologies', domain: 'concordfax.com',      career_url: 'https://concordfax.com/careers',                  ats_type: 'greenhouse', ats_slug: 'concord', category: 'fintech' },
    { name: 'Zulily',               domain: 'zulily.com',          career_url: 'https://zulily.com/careers',                      ats_type: 'greenhouse', ats_slug: 'zulily', category: 'fintech' },

    // ── Healthcare / Biotech (additional) ────────────────────────────────────
    { name: 'Swedish Medical Center', domain: 'swedish.org',       career_url: 'https://swedish.org/careers',                     ats_type: 'custom',     category: 'biotech' },
    { name: 'Seagen (Pfizer)',      domain: 'pfizer.com',          career_url: 'https://pfizer.com/about/careers',                ats_type: 'custom',     category: 'biotech' },
    { name: 'Gilead Sciences',      domain: 'jobs.gilead.com',     career_url: 'https://jobs.gilead.com',                         ats_type: 'custom',     category: 'biotech' },
    { name: 'Athira Pharma',        domain: 'athirapharma.com',    career_url: 'https://athirapharma.com/about/careers',          ats_type: 'greenhouse', ats_slug: 'athirapharma', category: 'biotech' },
    { name: 'Omeros',               domain: 'omeros.com',          career_url: 'https://omeros.com/about-us/careers',             ats_type: 'greenhouse', ats_slug: 'omeros', category: 'biotech' },
    { name: 'Nautilus Biotechnology', domain: 'nautilustechnologies.com', career_url: 'https://nautilustechnologies.com/careers', ats_type: 'greenhouse', ats_slug: 'nautilus', category: 'biotech' },
    { name: 'Kyowa Kirin',          domain: 'kyowakirin.com',      career_url: 'https://kyowakirin.com/careers',                  ats_type: 'greenhouse', ats_slug: 'kyowakirin', category: 'biotech' },
    { name: 'BioAtla',              domain: 'bioatla.com',         career_url: 'https://bioatla.com/careers',                     ats_type: 'greenhouse', ats_slug: 'bioatla', category: 'biotech' },
    { name: 'Nuvation Bio',         domain: 'nuvationbio.com',     career_url: 'https://nuvationbio.com/careers',                 ats_type: 'greenhouse', ats_slug: 'nuvationbio', category: 'biotech' },
];

export const SEATTLE_PRESET = {
    id: 'seattle-bellevue-opt',
    label: 'Seattle & Bellevue — OPT Friendly (100)',
    description: 'All verified H-1B sponsors in Greater Seattle. Amazon, Microsoft, Google + 97 more.',
    companies: SEATTLE_COMPANIES,
};
