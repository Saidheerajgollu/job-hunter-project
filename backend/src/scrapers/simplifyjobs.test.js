import { describe, it, expect } from 'vitest';
import { sponsorshipText } from './simplifyjobs.js';
import { detectVisaWording } from '../utils/visaWording.js';
import { isUSCitizenshipRequired } from '../utils/helpers.js';

describe('sponsorshipText', () => {
    it("turns Simplify's flags into wording the visa badge and citizenship check understand", () => {
        expect(detectVisaWording('SWE', sponsorshipText('Does Not Offer Sponsorship'))).toBe('no_sponsorship');
        expect(detectVisaWording('SWE', sponsorshipText('Offers Sponsorship'))).toBe('sponsors');
        expect(isUSCitizenshipRequired('SWE', sponsorshipText('U.S. Citizenship is Required'))).toBe(true);
        expect(sponsorshipText('Other')).toBeNull();
    });
});
