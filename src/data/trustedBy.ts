/**
 * Companies and stages Marlon has worked with — single source of truth for
 * the TrustedBy marquee, the press page, and the llms.txt GEO endpoints.
 */
export interface Brand {
	name: string;
	color: string;
	/** Per-letter colors (used for multicolor wordmarks like Google) */
	letters?: string[];
}

export const TRUSTED_BRANDS: Brand[] = [
	{ name: 'JPMorgan Chase', color: '#117aca' },
	{ name: 'Microsoft', color: '#737373' },
	{
		name: 'Google',
		color: '#4285F4',
		letters: ['#4285F4', '#EA4335', '#FBBC05', '#4285F4', '#34A853', '#EA4335'],
	},
	{ name: 'Visa', color: '#1a1f71' },
	{ name: 'IBM', color: '#0f62fe' },
	{ name: 'Uber', color: '#0b0b0c' },
	{ name: 'HubSpot', color: '#ff7a59' },
	{ name: 'UNCF', color: '#005baa' },
	{ name: 'Invest Fest', color: '#d7263d' },
	{ name: 'Earn Your Leisure', color: '#0b0b0c' },
	{ name: 'National Black MBA Assoc.', color: '#c8102e' },
	{ name: 'DC Startup Week', color: '#ff2d78' },
	{ name: 'City of Miami', color: '#1b6ca8' },
	{ name: 'Rolling Out', color: '#e03a3e' },
	{ name: 'Black Ambition', color: '#0b0b0c' },
	{ name: 'Vizcaya Museum & Gardens', color: '#44604a' },
	{ name: 'GaETC', color: '#f58220' },
	{ name: 'Dream Machine', color: '#b8860b' },
	{ name: 'Udacity', color: '#02b3e4' },
	{ name: 'Treehouse', color: '#5fcf80' },
	{ name: 'LiveRamp', color: '#00b2e3' },
	{ name: 'Chime', color: '#1ec677' },
];
