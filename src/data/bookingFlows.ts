/**
 * Book Marlon — dynamic booking flows.
 *
 * Every booking/contact surface on the site routes to /book, which renders
 * these flows. Each intent asks its own questions. To add a new pathway
 * (e.g. "Sponsor an event"), add an entry here — no component changes needed.
 * Submissions compose a structured email today; the same payload shape is
 * ready for a Cloudflare Worker + D1 endpoint when the backend lands.
 */
export interface FlowQuestion {
	id: string;
	label: string;
	type: 'text' | 'textarea' | 'select';
	options?: string[];
	placeholder?: string;
	required?: boolean;
}

export interface BookingFlow {
	id: string;
	title: string;
	tagline: string;
	questions: FlowQuestion[];
}

export const BOOKING_FLOWS: BookingFlow[] = [
	{
		id: 'keynote',
		title: 'Book a Keynote',
		tagline: 'Conferences, summits, and executive events.',
		questions: [
			{ id: 'event', label: 'Event name', type: 'text', required: true },
			{ id: 'date', label: 'Event date', type: 'text', placeholder: 'e.g. October 14, 2026', required: true },
			{ id: 'location', label: 'Location', type: 'text', placeholder: 'City, venue, or virtual' },
			{ id: 'audienceSize', label: 'Expected audience size', type: 'text', placeholder: 'e.g. 300' },
			{
				id: 'audienceType',
				label: 'Who is in the room?',
				type: 'select',
				options: ['Executives & leadership', 'Engineers & technical teams', 'General business audience', 'Founders & entrepreneurs', 'Educators & students', 'Mixed audience'],
			},
			{
				id: 'topic',
				label: 'Topic direction',
				type: 'select',
				options: ['AI in Operations', 'Voice AI in Production', 'AI Without Fear', 'The Applied AI Executive', 'Equity by Design', 'Not sure yet — advise me'],
			},
			{ id: 'budget', label: 'Speaking budget (optional)', type: 'text' },
			{ id: 'details', label: 'Tell Marlon about the moment you’re planning', type: 'textarea', required: true },
		],
	},
	{
		id: 'workshop',
		title: 'Book a Workshop',
		tagline: 'Hands-on AI training for your team or organization.',
		questions: [
			{ id: 'org', label: 'Organization', type: 'text', required: true },
			{ id: 'teamSize', label: 'How many participants?', type: 'text', placeholder: 'e.g. 25' },
			{
				id: 'level',
				label: 'Where is the team today?',
				type: 'select',
				options: ['Complete beginners', 'Some exposure', 'Regular AI users', 'Advanced / technical'],
			},
			{
				id: 'format',
				label: 'Preferred format',
				type: 'select',
				options: ['Virtual', 'In-person', 'Hybrid', 'No preference'],
			},
			{ id: 'timeline', label: 'Timeline', type: 'text', placeholder: 'e.g. Q4 2026' },
			{ id: 'goals', label: 'What would success look like?', type: 'textarea', required: true },
		],
	},
	{
		id: 'podcast',
		title: 'Podcast & Media',
		tagline: 'Interviews, panels, video, and press.',
		questions: [
			{ id: 'show', label: 'Show / outlet name', type: 'text', required: true },
			{
				id: 'format',
				label: 'Format',
				type: 'select',
				options: ['Audio podcast', 'Video podcast', 'Live stream', 'Panel', 'Written interview / press'],
			},
			{ id: 'topic', label: 'Topic or angle', type: 'text', required: true },
			{ id: 'date', label: 'Target recording date', type: 'text' },
			{ id: 'links', label: 'Links to your show or outlet', type: 'textarea', placeholder: 'Apple/Spotify/YouTube links…' },
		],
	},
	{
		id: 'curriculum',
		title: 'Build an AI Curriculum',
		tagline: 'Custom curricula for organizations, universities, and programs.',
		questions: [
			{ id: 'org', label: 'Organization or program', type: 'text', required: true },
			{
				id: 'audience',
				label: 'Who is the curriculum for?',
				type: 'select',
				options: ['Corporate teams', 'University students', 'Community program', 'K-12 / youth', 'Train-the-trainer'],
			},
			{ id: 'duration', label: 'Program length', type: 'text', placeholder: 'e.g. 6-week course, 2-day intensive' },
			{ id: 'timeline', label: 'When do you need it?', type: 'text' },
			{ id: 'goals', label: 'What should learners walk away able to do?', type: 'textarea', required: true },
		],
	},
	{
		id: 'learn',
		title: 'Learn AI',
		tagline: 'Start your own journey from curiosity to capability.',
		questions: [
			{
				id: 'role',
				label: 'Which sounds most like you?',
				type: 'select',
				options: ['Business professional', 'Executive or leader', 'Founder', 'Engineer', 'Educator', 'Student'],
			},
			{
				id: 'comfort',
				label: 'Comfort with AI today',
				type: 'select',
				options: ['Complete beginner', 'Tried it a few times', 'Use it regularly', 'Build with it'],
			},
			{ id: 'interests', label: 'What do you want to learn?', type: 'textarea', placeholder: 'Prompting, assistants, automation, strategy…', required: true },
		],
	},
	{
		id: 'advisory',
		title: 'Advisory & Consulting',
		tagline: 'AI strategy, voice AI engagements, and enterprise adoption.',
		questions: [
			{ id: 'org', label: 'Company', type: 'text', required: true },
			{
				id: 'scope',
				label: 'What kind of help?',
				type: 'select',
				options: ['AI roadmap & strategy', 'Voice AI engagement (VoicePath)', 'Build-vs-buy evaluation', 'Responsible AI & governance', 'Ongoing advisory'],
			},
			{ id: 'timeline', label: 'Timeline', type: 'text' },
			{ id: 'details', label: 'Describe the challenge', type: 'textarea', required: true },
		],
	},
	{
		id: 'other',
		title: 'Something Else',
		tagline: 'Community, mentorship, partnerships, or just saying hi.',
		questions: [{ id: 'details', label: 'What’s on your mind?', type: 'textarea', required: true }],
	},
];
