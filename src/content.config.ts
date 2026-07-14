import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Shared media/resource shapes so every collection supports rich media consistently */
const resourceSchema = z.object({
	label: z.string(),
	url: z.string(),
	kind: z.enum(['download', 'link', 'video', 'slides']).default('link'),
});

const testimonialSchema = z.object({
	quote: z.string(),
	name: z.string(),
	title: z.string().optional(),
	org: z.string().optional(),
});

const blog = defineCollection({
	loader: glob({ pattern: ['**/*.{md,mdx}', '!**/CLAUDE.md'], base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		publishDate: z.coerce.date(),
		description: z.string().max(200, 'Keep descriptions short for SEO'),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		heroImage: z.string().optional(),
		canonicalUrl: z.string().url().optional(),
	}),
});

const projects = defineCollection({
	loader: glob({ pattern: ['**/*.{md,mdx}', '!**/CLAUDE.md'], base: './src/content/projects' }),
	schema: z.object({
		title: z.string(),
		publishDate: z.coerce.date(),
		description: z.string(),
		category: z.enum(['strategic', 'open-source']).default('strategic'),
		role: z.string().default('Builder'),
		organization: z.string(),
		impactSummary: z.string(),
		primaryTech: z.array(z.string()),
		contributions: z.array(z.string()).default([]),
		outcomes: z.array(z.string()).default([]),
		featured: z.boolean().default(false),
		confidential: z.boolean().default(false),
		tags: z.array(z.string()).default([]),
		repository: z.string().url().optional(),
		externalLink: z.string().url().optional(),
		heroImage: z.string().optional(),
		gallery: z.array(z.string()).default([]),
		videoUrl: z.string().optional(),
		videoPoster: z.string().optional(),
		/** Partner organizations — rendered as wordmark chips on the case study;
		 *  the first partner appears as "In partnership with X" on the home card */
		partners: z.array(z.string()).default([]),
		/** Tour/deployment footprint — "N cities and counting" band on the case study */
		cities: z.array(z.string()).default([]),
		/** Per-city recap films — click-to-play YouTube embeds on the case study */
		cityFilms: z.array(z.object({ city: z.string(), youtubeId: z.string() })).default([]),
		lessonsLearned: z.array(z.string()).default([]),
		resources: z.array(resourceSchema).default([]),
		// tolerated legacy fields from the 2026 repo
		slug: z.string().optional(),
		scale: z.union([z.string(), z.array(z.string())]).optional(),
		duration: z.string().optional(),
		generated: z.boolean().default(false),
		generatedAt: z.coerce.date().optional(),
		decisionCard: z
			.object({
				problem: z.string(),
				constraints: z.array(z.string()),
				tradeoffs: z
					.array(
						z.object({
							option: z.string(),
							pros: z.array(z.string()),
							cons: z.array(z.string()),
							chosen: z.boolean(),
						}),
					)
					.optional(),
				artifact: z
					.object({
						type: z.enum(['doc', 'code', 'diagram', 'dashboard']),
						title: z.string(),
						url: z.string().optional(),
						preview: z.string().optional(),
					})
					.optional(),
			})
			.optional(),
	}),
});

const experience = defineCollection({
	loader: glob({ pattern: '**/*.{yaml,json}', base: './src/content/experience' }),
	schema: z.object({
		company: z.string(),
		role: z.string(),
		level: z.string().optional(),
		location: z.string(),
		startDate: z.coerce.date(),
		endDate: z.coerce.date().nullable().optional(),
		description: z.string(),
		achievements: z.array(z.string()).default([]),
		skills: z.array(z.string()).default([]),
		domainTags: z.array(z.string()).default([]),
	}),
});

const narratives = defineCollection({
	loader: glob({ pattern: ['**/*.{md,mdx}'], base: './src/content/narratives' }),
	schema: z.object({
		experienceSlug: z.string(),
		title: z.string().optional(),
		lastUpdated: z.coerce.date().optional(),
		summary: z.string().optional(),
		highlights: z.array(z.string()).default([]),
	}),
});

const speaking = defineCollection({
	loader: glob({ pattern: '**/*.{json,md,mdx}', base: './src/content/speaking' }),
	schema: z.object({
		title: z.string(),
		abstract: z.string(),
		tier: z.enum(['signature', 'standard']).default('standard'),
		duration: z.string(),
		format: z.enum(['keynote', 'workshop', 'fireside', 'panel']).default('keynote'),
		audience: z.array(z.string()).default([]),
		objectives: z.array(z.string()).default([]),
		takeaways: z.array(z.string()).default([]),
		industries: z.array(z.string()).default([]),
		videoUrl: z.string().optional(),
		resources: z.array(resourceSchema).default([]),
		featured: z.boolean().default(false),
		order: z.number().default(0),
	}),
});

const workshops = defineCollection({
	loader: glob({ pattern: '**/*.{json,md,mdx}', base: './src/content/workshops' }),
	schema: z.object({
		title: z.string(),
		tagline: z.string(),
		description: z.string().optional(),
		level: z.enum(['beginner', 'intermediate', 'advanced', 'executive']),
		format: z.enum(['virtual', 'in-person', 'hybrid']),
		duration: z.string(),
		audience: z.array(z.string()),
		objectives: z.array(z.string()).default([]),
		outcomes: z.array(z.string()).default([]),
		deliverables: z.array(z.string()).default([]),
		industries: z.array(z.string()).default([]),
		curriculum: z
			.array(z.object({ module: z.string(), summary: z.string() }))
			.default([]),
		testimonials: z.array(testimonialSchema).default([]),
		resources: z.array(resourceSchema).default([]),
		heroImage: z.string().optional(),
		videoUrl: z.string().optional(),
		featured: z.boolean().default(false),
		capacity: z.string().optional(),
		enrollUrl: z.string().optional(),
	}),
});

const events = defineCollection({
	loader: glob({ pattern: '**/*.{json,md,mdx}', base: './src/content/events' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		endDate: z.coerce.date().optional(),
		type: z.enum(['keynote', 'workshop', 'panel', 'conference', 'podcast', 'meetup', 'live']),
		status: z.enum(['upcoming', 'past']),
		venue: z.string().optional(),
		city: z.string().optional(),
		description: z.string(),
		recap: z.string().optional(),
		photos: z.array(z.string()).default([]),
		videoUrl: z.string().optional(),
		testimonials: z.array(testimonialSchema).default([]),
		resources: z.array(resourceSchema).default([]),
		relatedWorkshops: z.array(z.string()).default([]),
		relatedTalks: z.array(z.string()).default([]),
		featured: z.boolean().default(false),
		slug: z.string().optional(),
	}),
});

const press = defineCollection({
	loader: glob({ pattern: '**/*.json', base: './src/content/press' }),
	schema: z.object({
		bios: z
			.array(z.object({ label: z.string(), content: z.string(), wordCount: z.number() }))
			.optional(),
		photos: z
			.array(
				z.object({
					label: z.string(),
					thumbnail: z.string(),
					fullRes: z.string(),
					dimensions: z.string(),
				}),
			)
			.optional(),
		topics: z
			.array(
				z.object({
					title: z.string(),
					abstract: z.string(),
					duration: z.string(),
					audience: z.array(z.string()),
					previouslyGiven: z.array(z.string()).optional(),
				}),
			)
			.optional(),
	}),
});

export const collections = {
	blog,
	projects,
	experience,
	narratives,
	speaking,
	workshops,
	events,
	press,
};
