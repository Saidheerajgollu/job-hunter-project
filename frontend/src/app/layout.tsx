import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Job Hunter Pro — New Grad AI / SWE / Data Jobs',
    description: 'Personal job aggregator for 2026 new grads. Syncs Greenhouse, Lever, Ashby, Workday, and 7 more sources hourly. Track applications, watch companies, get push alerts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🎯</text></svg>" />
            </head>
            <body>{children}</body>
        </html>
    );
}
