import type { Metadata } from 'next';
import { Syne, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const syne = Syne({
    subsets: ['latin'],
    variable: '--font-display',
    weight: ['500', '600', '700', '800'],
});

const dmSans = DM_Sans({
    subsets: ['latin'],
    variable: '--font-body',
    weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
    weight: ['500', '600', '700'],
});

export const metadata: Metadata = {
    title: 'Job Hunter — New Grad Roles',
    description: 'Personal job aggregator for 2026 new grads. Syncs Greenhouse, Lever, Ashby, Workday, and more. Track applications, watch companies, get push alerts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${syne.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
            <head>
                <link
                    rel="icon"
                    href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%231C1B19'/><rect x='6' y='6' width='20' height='20' fill='none' stroke='%23C41E3A' stroke-width='2'/><line x1='6' y1='16' x2='26' y2='16' stroke='%23C41E3A' stroke-width='1'/><line x1='16' y1='6' x2='16' y2='26' stroke='%23C41E3A' stroke-width='1'/></svg>"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
