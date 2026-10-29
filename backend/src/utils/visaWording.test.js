import { describe, it, expect } from 'vitest';
import { detectVisaWording } from './visaWording.js';

describe('detectVisaWording', () => {
    it.each([
        'We are unable to sponsor visas at this time',
        'The company will not sponsor work visas for this role',
        'This employer does not offer sponsorship',
        'Candidates must be authorized to work in the US without the need for sponsorship',
        'Visa sponsorship is not available for this position',
        'This role is not eligible for visa sponsorship',
        'No sponsorship.',
    ])('flags "%s" as no_sponsorship', (description) => {
        expect(detectVisaWording('Software Engineer', description)).toBe('no_sponsorship');
    });

    it.each([
        'Visa sponsorship available',
        'We will sponsor H-1B for the right candidate',
        'H-1B sponsorship provided',
    ])('flags "%s" as sponsors', (description) => {
        expect(detectVisaWording('Software Engineer', description)).toBe('sponsors');
    });

    it('lets negative wording win when both appear', () => {
        expect(detectVisaWording('SWE', 'Visa sponsorship available for some roles; this role will not sponsor')).toBe('no_sponsorship');
    });

    it('ignores unrelated uses of "sponsorship"', () => {
        expect(detectVisaWording('Partnerships Analyst', 'Manage event sponsorship deals')).toBeNull();
        expect(detectVisaWording('Software Engineer', 'We sponsor local hackathons and meetups')).toBeNull();
        expect(detectVisaWording('Software Engineer', 'Event sponsorship available for conference speakers')).toBeNull();
    });

    it('returns null when there is no description or nothing is said', () => {
        expect(detectVisaWording('Software Engineer')).toBeNull();
        expect(detectVisaWording('Software Engineer', '')).toBeNull();
        expect(detectVisaWording('Software Engineer', null)).toBeNull();
        expect(detectVisaWording('Software Engineer', 'Build distributed systems in Go.')).toBeNull();
    });
});
