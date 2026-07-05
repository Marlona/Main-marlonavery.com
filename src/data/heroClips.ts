/**
 * The cinematic hero film sequences (Higgsfield-generated, Marlon-approved).
 * A `null` entry means the clip hasn't been approved yet — sections render
 * their static photographic fallback until the clip lands here.
 */
export interface HeroClip {
	src: string;
	poster: string;
}

export const HERO_CLIPS: Record<'hero' | 'builder' | 'educator', HeroClip | null> = {
	/** Main hero — Marlon walking a live workshop classroom (Marlon-supplied render, 2026-07-05) */
	hero: {
		src: '/video/hero-main.mp4',
		poster: '/video/hero-main-poster.jpg',
	},
	/** The Builder — dark desk, holographic screens of real work, slow push-in */
	builder: {
		src: '/video/the-builder.mp4',
		poster: '/video/the-builder-poster.jpg',
	},
	/** The Educator — walking a screen-lined gallery toward camera, hero pose */
	educator: {
		src: '/video/the-educator.mp4',
		poster: '/video/the-educator-poster.jpg',
	},
};
