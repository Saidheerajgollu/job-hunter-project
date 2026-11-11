import { describe, it, expect } from 'vitest';
import { extractMinYoe, extractWorkModel, extractSalary, detectEVerify, extractJobSignals } from './jobSignals.js';

describe('extractMinYoe', () => {
    it('reads the first experience requirement in the description', () => {
        expect(extractMinYoe('Software Engineer', 'Requirements: 3+ years of experience building APIs. 1+ years with Go.')).toBe(3);
        expect(extractMinYoe('Software Engineer', 'You have 2-4 years of professional software experience')).toBe(2);
        expect(extractMinYoe('Software Engineer', 'Minimum of five years of relevant experience')).toBe(5);
        expect(extractMinYoe('Data Analyst', 'At least 1 year experience with SQL')).toBe(1);
        expect(extractMinYoe('Software Engineer', "5+ years' experience in backend systems")).toBe(5);
        expect(extractMinYoe('Software Engineer', '0-2 years of experience')).toBe(0);
    });

    it('ignores year counts that are not about experience', () => {
        expect(extractMinYoe('Software Engineer', 'We have been building for 20 years and raised $50M over 3 years.')).toBeNull();
        expect(extractMinYoe('Software Engineer', 'Must be 18 years of age or older.')).toBeNull();
        expect(extractMinYoe('Software Engineer', '40 years of experience as a company')).toBeNull();
        expect(extractMinYoe('Software Engineer', null)).toBeNull();
        expect(extractMinYoe('Software Engineer', 'We have 12 years of experience serving clients. You bring 3+ years of experience.')).toBe(3);
    });

    it('treats intern, new grad and entry-level titles as zero years', () => {
        expect(extractMinYoe('Software Engineer Intern', null)).toBe(0);
        expect(extractMinYoe('Software Engineer, New Grad 2026', '5+ years of experience')).toBe(0);
        expect(extractMinYoe('Entry Level Data Analyst', '')).toBe(0);
        expect(extractMinYoe('Software Engineer I, University Graduate', '')).toBe(0);
        // "internal" and "international" are not internships
        expect(extractMinYoe('Internal Tools Engineer', '')).toBeNull();
    });
});

describe('extractWorkModel', () => {
    it('prefers what the location says', () => {
        expect(extractWorkModel('Remote - US', 'Work on-site with the team')).toBe('remote');
        expect(extractWorkModel('New York, NY (Hybrid)', '')).toBe('hybrid');
        expect(extractWorkModel('Austin, TX - Onsite', '')).toBe('onsite');
    });

    it('falls back to clear wording in the description', () => {
        expect(extractWorkModel('Austin, TX', 'This is a hybrid role, 3 days a week in the office.')).toBe('hybrid');
        expect(extractWorkModel('', 'This is a fully remote position.')).toBe('remote');
        expect(extractWorkModel('Austin, TX', 'This role is on-site five days a week.')).toBe('onsite');
        expect(extractWorkModel('Austin, TX', 'We build tools for remote sensing.')).toBeNull();
        expect(extractWorkModel('Austin, TX', 'This is not a remote position.')).toBeNull();
    });
});

describe('extractSalary', () => {
    it('finds a yearly pay range', () => {
        expect(extractSalary('The base salary range is $120,000 - $150,000 per year.')).toBe('$120,000 – $150,000');
        expect(extractSalary('Compensation: $95k–$130k plus equity')).toBe('$95,000 – $130,000');
        expect(extractSalary('Pay range: $110,500.00 to $165,750.00 USD')).toBe('$110,500 – $165,750');
        expect(extractSalary('$120K/yr - $150K/yr')).toBe('$120,000 – $150,000');
    });

    it('finds an hourly range', () => {
        expect(extractSalary('Interns earn $45.00 - $60.00 per hour.')).toBe('$45 – $60/hr');
        expect(extractSalary('Hourly rate: $38-$52/hr')).toBe('$38 – $52/hr');
    });

    it('ignores money that is not pay', () => {
        expect(extractSalary('We raised $50M and serve customers with $1,000 - $5,000 budgets.')).toBeNull();
        expect(extractSalary('A $500 - $1,000 signing bonus')).toBeNull();
        expect(extractSalary('Revenue grew from $200,000 - $90,000')).toBeNull();
        expect(extractSalary('Sign-on bonus of $50,000 - $60,000. Base salary $120,000 - $150,000.')).toBe('$120,000 – $150,000');
        expect(extractSalary(null)).toBeNull();
    });
});

describe('detectEVerify', () => {
    it('is true when the employer says it uses E-Verify', () => {
        expect(detectEVerify('Acme participates in E-Verify.')).toBe(true);
        expect(detectEVerify('We are an EVerify employer')).toBe(true);
    });
    it('is false when absent or negated', () => {
        expect(detectEVerify('We verify your identity.')).toBe(false);
        expect(detectEVerify('Acme does not participate in E-Verify.')).toBe(false);
        expect(detectEVerify(null)).toBe(false);
    });
});

describe('extractJobSignals', () => {
    it('returns every signal for a job, keeping values the source already gave', () => {
        expect(extractJobSignals({
            title: 'Backend Engineer', location: 'Seattle, WA',
            description: 'Hybrid role. 2+ years of experience. Salary $130,000 - $160,000. We use E-Verify.',
        })).toEqual({ min_yoe: 2, work_model: 'hybrid', salary: '$130,000 – $160,000', e_verify: true });

        expect(extractJobSignals({
            title: 'Backend Engineer', location: 'Seattle, WA', work_model: 'onsite', salary: '$100k',
            description: 'Hybrid role. Salary $130,000 - $160,000.',
        })).toMatchObject({ work_model: 'onsite', salary: '$100k' });
    });
});
