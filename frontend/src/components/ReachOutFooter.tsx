import { SOCIAL_LINKS } from '@/lib/socialLinks';

function GitHubIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-1.305-.225-2.67-.45-2.67-1.935 0-.885.315-1.605.825-2.175-.075-.195-.36-.99.075-2.055 0 0 .675-.225 2.205.825a7.65 7.65 0 0 1 2.025-.27c.69 0 1.38.09 2.025.27 1.53-1.065 2.205-.825 2.205-.825.435 1.065.15 1.86.075 2.055.51.57.825 1.275.825 2.175 0 1.485-1.365 1.71-2.67 1.935-.51.285-1.095 1.35-1.23 1.695-.24.675-1.02 1.965-4.035 1.41 0 1.005-.015 1.95-.015 2.235 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
            />
        </svg>
    );
}

function LinkedInIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 4.126 0 2.063 2.063 0 0 1-2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
            />
        </svg>
    );
}

function WebsiteIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"
            />
            <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                d="M2 12h20M12 2c2.5 2.8 4 6.2 4 10s-1.5 7.2-4 10M12 2C9.5 4.8 8 8.2 8 12s1.5 7.2 4 10"
            />
        </svg>
    );
}

const LINKS = [
    { href: SOCIAL_LINKS.github, label: 'GitHub profile', icon: GitHubIcon },
    { href: SOCIAL_LINKS.linkedin, label: 'LinkedIn profile', icon: LinkedInIcon },
    { href: SOCIAL_LINKS.website, label: 'Personal website', icon: WebsiteIcon },
] as const;

export function ReachOutFooter() {
    return (
        <footer className="reach-out-footer">
            <span className="reach-out-label">Reach out</span>
            <div className="reach-out-links">
                {LINKS.map(({ href, label, icon: Icon }) => (
                    <a
                        key={href}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="reach-out-link"
                        aria-label={label}
                        title={label}
                    >
                        <Icon />
                    </a>
                ))}
            </div>
        </footer>
    );
}
