/**
 * Site-wide configuration — single source of truth for personal info and settings
 */

export const SITE_CONFIG = {
	name: 'Marlon Avery',
	shortName: 'Marlon Avery',
	title: 'Building AI. Teaching the Future.',
	tagline:
		'Applied AI executive, engineer, founder, educator, and speaker — building real AI systems and teaching the world how to build with them.',
	email: 'hi@marlonavery.com',
	description:
		'Marlon Avery helps leaders, teams, and organizations understand artificial intelligence by building real systems, teaching practical workflows, and creating moments where complex technology finally clicks. VP of Applied AI at one of the world’s leading financial institutions, Founder & CEO of VoicePath, Head of AI at AImpact.',

	githubUsername: 'Marlona',
	linkedInUsername: 'marlon-avery-42751a60',
	twitterHandle: 'IamMarlonAvery',

	currentCompany: 'JPMorgan Chase',
	currentRole: 'VP, Applied AI Lead',
	location: 'Washington, DC',

	googleSiteVerification: '',
} as const;

export const SOCIAL_LINKS = {
	github: `https://github.com/${SITE_CONFIG.githubUsername}`,
	linkedin: `https://linkedin.com/in/${SITE_CONFIG.linkedInUsername}`,
	twitter: `https://twitter.com/${SITE_CONFIG.twitterHandle}`,
	email: `mailto:${SITE_CONFIG.email}`,
} as const;

export const NAV_LINKS = [
	{ href: '/about', label: 'About' },
	{ href: '/speaking', label: 'Speaking' },
	{ href: '/workshops', label: 'Workshops' },
	{ href: '/events', label: 'Events' },
	{ href: '/writing', label: 'Writing' },
	{ href: '/contact', label: 'Contact' },
] as const;

export const FOOTER_LINKS = [
	{ href: '/projects', label: 'Projects' },
	{ href: '/about', label: 'About' },
	{ href: '/speaking', label: 'Speaking' },
	{ href: '/press', label: 'Press Kit' },
	{ href: '/workshops', label: 'Workshops' },
	{ href: '/events', label: 'Events' },
	{ href: '/writing', label: 'Writing' },
	{ href: '/contact', label: 'Contact' },
] as const;

export const RESUME_PATH = '/Marlon_Avery_Resume.pdf';
