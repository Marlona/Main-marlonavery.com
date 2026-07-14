/**
 * Elevate intake assessment (spec Step 2) — ~5 minutes, retaken quarterly so
 * the Place A→B delta is measurable. Each dimension gets: where I am today
 * (Place A, 1–10), where I want to be (Place B, 1–10), and how comfortable I
 * am discussing it (1–5). Comfort ≤ 2 becomes a discomfort flag the coach
 * deliberately starts from ("you mentioned X felt uncomfortable — let's
 * start there").
 */
export interface AssessmentDimension {
	id: string;
	label: string;
}

export const ASSESSMENT_DIMENSIONS: AssessmentDimension[] = [
	{ id: 'clarity', label: 'Clarity of where I’m going' },
	{ id: 'focus', label: 'Daily focus on what matters most' },
	{ id: 'discipline', label: 'Consistency & discipline' },
	{ id: 'self_talk', label: 'Quality of my self-talk' },
	{ id: 'relationships', label: 'Relationships that support my direction' },
	{ id: 'media', label: 'What I consume vs. where I’m going' },
	{ id: 'finances', label: 'Stewardship of my finances' },
	{ id: 'health', label: 'Physical energy & health' },
	{ id: 'faith', label: 'Faith & groundedness' },
	{ id: 'learning', label: 'Learning & growth habits' },
	{ id: 'boundaries', label: 'Boundaries & saying no' },
	{ id: 'execution', label: 'Follow-through on commitments' },
];

export const ASSESSMENT_FREE_TEXT = [
	{ id: 'current_habits', label: 'What are you doing today that already points at where you want to go?' },
	{ id: 'prior_attempts', label: 'What have you tried before, and what happened?' },
	{ id: 'confidence', label: 'How confident are you that you get there — and what would make you more so?' },
] as const;

/** Comfort scores at or below this become discomfort flags. */
export const DISCOMFORT_THRESHOLD = 2;

/** One observation prompt per day for the morning ritual (spec Step 5). */
export const OBSERVATION_PROMPTS = [
	'Today, just observe one conversation without labeling it.',
	'Notice one moment where your self-talk kicks in. Just notice it.',
	'Observe what you reach for first when you check out of life’s strain today.',
	'Watch one outcome today without attaching a person’s voice to it.',
	'Notice one thing that happened FOR you today that felt like it happened TO you.',
	'Observe which conversation today leaves you with more energy — and which takes it.',
	'Notice one moment you were about to judge — and just describe it instead.',
];
