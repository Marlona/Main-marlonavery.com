/**
 * Dictation via the Web Speech API — Chrome and Safari (webkit-prefixed);
 * Firefox ships no recognizer, so `attachDictation` hides its button when
 * unsupported and typing stays the path everywhere. Recognition is
 * permission-gated by the browser; audio never touches our servers.
 */

// lib.dom omits the SpeechRecognition interfaces — minimal local typings.
interface SRResult {
	isFinal: boolean;
	0: { transcript: string };
}
interface SREvent {
	results: ArrayLike<SRResult>;
}
interface SpeechRec {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onend: (() => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	onresult: ((e: SREvent) => void) | null;
	start(): void;
	stop(): void;
}
type SRConstructor = new () => SpeechRec;

const ctor = (): SRConstructor | undefined => {
	const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
	return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const dictationSupported = (): boolean => Boolean(ctor());

export interface DictationHandle {
	/** Stop listening if active (safe to call any time). */
	stop(): void;
}

/**
 * Wire a mic toggle button to a text field. While listening the button gets
 * `data-listening` (style hook) and `aria-pressed="true"`; recognized speech
 * is appended to the field's existing text, with interim results shown live.
 * Every update dispatches an `input` event so autosave/validation hooks fire.
 */
export function attachDictation(
	button: HTMLButtonElement,
	field: HTMLTextAreaElement | HTMLInputElement,
	onError?: (message: string) => void,
): DictationHandle {
	const Rec = ctor();
	if (!Rec) {
		button.hidden = true;
		return { stop() {} };
	}

	let rec: SpeechRec | null = null;

	const setListening = (on: boolean) => {
		if (on) button.dataset.listening = 'true';
		else delete button.dataset.listening;
		button.setAttribute('aria-pressed', String(on));
	};

	button.addEventListener('click', () => {
		if (rec) {
			rec.stop();
			return;
		}
		const r = new Rec();
		r.continuous = true;
		r.interimResults = true;
		r.lang = 'en-US';
		// Dictation appends: whatever is already typed stays as the base.
		const base = field.value.trim() ? `${field.value.replace(/\s+$/, '')} ` : '';
		r.onresult = (e) => {
			let heard = '';
			for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
			field.value = base + heard.trimStart();
			field.dispatchEvent(new Event('input', { bubbles: true }));
		};
		r.onerror = (e) => {
			if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
				onError?.('Mic blocked — allow microphone access for this site and tap the mic again.');
			} else if (e.error !== 'aborted' && e.error !== 'no-speech') {
				onError?.(`Dictation hiccup (${e.error}) — tap the mic to go again.`);
			}
		};
		r.onend = () => {
			rec = null;
			setListening(false);
		};
		rec = r;
		setListening(true);
		try {
			r.start();
		} catch {
			rec = null;
			setListening(false);
		}
	});

	return {
		stop() {
			rec?.stop();
		},
	};
}
