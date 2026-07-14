/**
 * Supabase backend wiring.
 *
 * The URL and publishable key are safe to ship to the browser — data access
 * is governed by Row Level Security (anonymous visitors can only hit the
 * submit-inquiry edge function; reading anything requires Marlon's
 * authenticated session).
 */
export const SUPABASE_URL = 'https://nxqoskuddntalcgcuvvi.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rIFok8EotoLyJW2tc8Zs7g_ADDV3M4l';

const INQUIRY_ENDPOINT = `${SUPABASE_URL}/functions/v1/submit-inquiry`;

export interface InquiryPayload {
	intent: string;
	name?: string;
	email: string;
	organization?: string;
	answers: Record<string, string>;
	/** Honeypot — leave empty; bots that fill it are silently dropped */
	website?: string;
	/** Milliseconds between form render and submit — sub-human times are flagged as spam */
	elapsedMs?: number;
}

/**
 * Store an inquiry (and trigger the email forward) via the edge function.
 * Throws on network/server failure so callers can fall back to mailto.
 */
export async function submitInquiry(payload: InquiryPayload): Promise<{ id: string }> {
	const { elapsedMs, ...rest } = payload;
	const res = await fetch(INQUIRY_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...rest, elapsed_ms: elapsedMs, source_page: location.pathname }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok || !body.ok) throw new Error(body.error ?? `submit failed (${res.status})`);
	return { id: body.id };
}
