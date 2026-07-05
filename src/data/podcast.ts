/**
 * AI With Friends — Marlon's podcast. Platform URLs are placeholders until
 * Marlon supplies the real links; buttons render only for entries with a URL.
 */
export const PODCAST = {
	name: 'AI With Friends',
	tagline: 'Weekly conversations on generative AI, agents, voice, and the future of work.',
	cohosts: [
		{ name: 'Marlon Avery', title: 'VP, Applied AI Lead' },
		{ name: 'Adrian Green', title: 'VP of Engineering, Laugh Nation' },
		{ name: 'Sekou Doumbouya', title: 'Principal Senior Staff Cloud Systems Engineer, Pinterest' },
	],
	platforms: [
		{ label: 'Apple Podcasts', url: '#' },
		{ label: 'Spotify', url: '#' },
		{ label: 'YouTube', url: '#' },
		{ label: 'LinkedIn Live', url: '#' },
		{ label: 'Instagram', url: '#' },
	],
} as const;
