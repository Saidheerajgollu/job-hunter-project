import { describe, it, expect } from 'vitest';
import { parseJobrightReadme } from './jobright.js';

const NOW = new Date('2026-11-11T20:00:00Z');
const table = rows => [
    '# Daily New Grad Jobs in Software Engineering by Jobright.ai',
    '| Company | Job Title | Location | Work Model | Date Posted |',
    '| ----- | --------- |  --------- | ---- | ------- |',
    ...rows,
].join('\n');

describe('parseJobrightReadme', () => {
    it('maps a table row to a job', () => {
        const [job] = parseJobrightReadme(table([
            '| **[ZT Systems](https://www.ztsystems.com)** | **[Test Software Developer](https://jobright.ai/jobs/info/6af4928bcbd2ee75d155adb9?utm_campaign=Software%20Engineering&utm_source=1103)** | Secaucus, NJ, United States | On Site | Nov 11 |',
        ]), { now: NOW });
        expect(job).toMatchObject({
            title: 'Test Software Developer',
            company: 'ZT Systems',
            location: 'Secaucus, NJ',
            url: 'https://jobright.ai/jobs/info/6af4928bcbd2ee75d155adb9',
            source: 'jobright',
            category: 'swe',
            work_model: 'onsite',
            company_domain: 'ztsystems.com',
            posted_at: '2026-11-11T00:00:00.000Z',
        });
    });

    it('reuses the company from the row above for "↳" rows', () => {
        const jobs = parseJobrightReadme(table([
            '| **[RTX](http://rtx.com/)** | **[Software Engineer I (Onsite)](https://jobright.ai/jobs/info/aaa)** | Cedar Rapids, IA, United States | On Site | Nov 11 |',
            '| ↳ | **[Software Engineer I (CMA-P1-1)](https://jobright.ai/jobs/info/bbb)** | Fort Wayne, IN, United States | Hybrid | Nov 10 |',
        ]), { now: NOW });
        expect(jobs.map(j => [j.company, j.company_domain, j.work_model])).toEqual([
            ['RTX', 'rtx.com', 'onsite'],
            ['RTX', 'rtx.com', 'hybrid'],
        ]);
    });

    it('moves a pay range out of the title', () => {
        const [job] = parseJobrightReadme(table([
            '| **[Grand Casino](https://grandcasinomn.com/)** | **[Software Development Engineer $60,000-$99,000/annually](https://jobright.ai/jobs/info/ccc)** | Hinckley, Minnesota, United States | Remote | Nov 11 |',
        ]), { now: NOW });
        expect(job.title).toBe('Software Development Engineer');
        expect(job.salary).toBe('$60,000 – $99,000');
        expect(job.work_model).toBe('remote');
    });

    it('keeps the title whole when the "$" is not a pay range, and leaves an unreadable date empty', () => {
        const [job] = parseJobrightReadme(table([
            '| **[Acme](https://acme.com)** | **[Software Engineer, Ca$h App](https://jobright.ai/jobs/info/fff)** | Austin, TX, United States | On Site | soon |',
        ]), { now: NOW });
        expect(job.title).toBe('Software Engineer, Ca$h App');
        expect(job.posted_at).toBeNull();
    });

    it('puts a December date in the previous year when read in January', () => {
        const [job] = parseJobrightReadme(table([
            '| **[Acme](https://acme.com)** | **[Software Engineer](https://jobright.ai/jobs/info/ddd)** | Austin, TX, United States | On Site | Dec 28 |',
        ]), { now: new Date('2027-01-03T10:00:00Z') });
        expect(job.posted_at).toBe('2026-12-28T00:00:00.000Z');
    });

    it('drops non-tech titles, senior titles, rows without a link, and non-Jobright links', () => {
        const jobs = parseJobrightReadme(table([
            '| **[Acme](https://acme.com)** | **[Sales Specialist Track](https://jobright.ai/jobs/info/e1)** | Mason, OH, United States | On Site | Nov 11 |',
            '| **[Acme](https://acme.com)** | **[Senior Software Engineer](https://jobright.ai/jobs/info/e2)** | Mason, OH, United States | On Site | Nov 11 |',
            '| **[Acme](https://acme.com)** | Software Engineer | Mason, OH, United States | On Site | Nov 11 |',
            '| **[Acme](https://acme.com)** | **[Software Engineer](https://evil.example/jobs/info/e4)** | Mason, OH, United States | On Site | Nov 11 |',
        ]), { now: NOW, filterSenior: true });
        expect(jobs).toEqual([]);
    });
});
