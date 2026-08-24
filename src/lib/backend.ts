/** Public, same-origin Cloudflare Worker endpoint for inquiry capture. */
const INQUIRY_ENDPOINT = '/public/inquiry';

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
	/** Single-use Cloudflare Turnstile token. */
	turnstileToken?: string;
}

export function inquiryTurnstileToken(root: ParentNode): string | undefined {
	const value = root.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value.trim();
	return value || undefined;
}

type TurnstileApi = {
	render: (element: HTMLElement, options: { sitekey: string; action: string; theme: 'auto' }) => string;
	reset: (widgetId: string) => void;
};

export function renderInquiryTurnstile(root: ParentNode, attempts = 0): void {
	const element = root.querySelector<HTMLElement>('[data-turnstile-widget]');
	if (!element || element.dataset.rendered === 'true') return;
	const turnstile = (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
	if (!turnstile) {
		if (attempts < 40) window.setTimeout(() => renderInquiryTurnstile(root, attempts + 1), 100);
		return;
	}
	const sitekey = element.dataset.sitekey;
	if (!sitekey) return;
	element.dataset.widgetId = turnstile.render(element, { sitekey, action: 'inquiry', theme: 'auto' });
	element.dataset.rendered = 'true';
}

export function resetInquiryTurnstile(root: ParentNode): void {
	const element = root.querySelector<HTMLElement>('[data-turnstile-widget]');
	const widgetId = element?.dataset.widgetId;
	const turnstile = (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
	if (widgetId && turnstile) turnstile.reset(widgetId);
}

/**
 * Store an inquiry (and trigger the email forward) via the Cloudflare API Worker.
 * Throws on network/server failure so callers can fall back to mailto.
 */
export async function submitInquiry(payload: InquiryPayload): Promise<{ id: string }> {
	const { elapsedMs, turnstileToken, ...rest } = payload;
	const res = await fetch(INQUIRY_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'same-origin',
		body: JSON.stringify({ ...rest, elapsed_ms: elapsedMs, turnstile_token: turnstileToken, source_page: location.pathname }),
	});
	const parsed: unknown = await res.json().catch(() => null);
	const body = parsed && typeof parsed === 'object' ? parsed as { ok?: boolean; id?: string; error?: string } : {};
	if (!res.ok || !body.ok || !body.id) throw new Error(body.error ?? `submit failed (${res.status})`);
	return { id: body.id };
}
