/**
 * Elevate onboarding wizard logic — drives the ElevateWizard.astro dialog.
 *
 * Save as it goes, execute at the end: every answer autosaves into the single
 * `elevate_drafts` row (dictation is never lost, even across devices), but
 * `goals`/`assessments` are only written — and the affirmation set only
 * generated — when Marlon hits "Build my set" on the review card. The draft
 * row is deleted on completion.
 */
import { esc, invokeFn, type DB } from './client';
import { attachDictation, type DictationHandle } from './dictation';
import { ASSESSMENT_DIMENSIONS, ASSESSMENT_FREE_TEXT, DISCOMFORT_THRESHOLD } from '../../data/elevateAssessment';
import type { Json } from './db-types';

interface WizardState {
	text: Record<string, string>;
	commitment: string | null;
	sliders: Record<string, number>;
	goal_id: string | null;
	assessment_id: string | null;
}

const COMMITMENT_LABELS: Record<string, string> = {
	life_changing: 'Life-changing',
	sticking_point: 'A sticking point',
	exploring: 'Exploring',
};

const defaultSliders = () => {
	const sliders: Record<string, number> = {};
	for (const d of ASSESSMENT_DIMENSIONS) {
		sliders[`${d.id}:a`] = 5;
		sliders[`${d.id}:b`] = 8;
		sliders[`${d.id}:c`] = 3;
	}
	return sliders;
};

const freshState = (): WizardState => ({ text: {}, commitment: null, sliders: defaultSliders(), goal_id: null, assessment_id: null });

export function initElevateWizard(db: DB, { onComplete }: { onComplete: () => void }) {
	const dialog = document.querySelector<HTMLDialogElement>('[data-elevate-wizard]')!;
	const steps = [...dialog.querySelectorAll<HTMLElement>('[data-wiz-step]')].filter((s) => s.dataset.wizStep !== 'done');
	const doneEl = dialog.querySelector<HTMLElement>('[data-wiz-step="done"]')!;
	const track = dialog.querySelector<HTMLElement>('[data-wiz-track]')!;
	const bar = dialog.querySelector<HTMLElement>('[data-wiz-bar]')!;
	const count = dialog.querySelector<HTMLElement>('[data-wiz-count]')!;
	const savedEl = dialog.querySelector<HTMLElement>('[data-wiz-saved]')!;
	const noteEl = dialog.querySelector<HTMLElement>('[data-wiz-note]')!;
	const recapEl = dialog.querySelector<HTMLElement>('[data-wiz-recap]')!;
	const errorEl = dialog.querySelector<HTMLElement>('[data-wiz-error]')!;
	const setEl = dialog.querySelector<HTMLElement>('[data-wiz-set]')!;
	const backBtn = dialog.querySelector<HTMLButtonElement>('[data-wiz-back]')!;
	const nextBtn = dialog.querySelector<HTMLButtonElement>('[data-wiz-next]')!;

	let state = freshState();
	let draftId: string | null = null;
	let index = 0;
	let touched = false;
	let executing = false;
	let finished = false;
	let loaded = false;

	const stepKey = (i: number) => steps[i].dataset.wizStep!;

	// ------------------------------------------------ draft: save as it goes --
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let chain: Promise<void> = Promise.resolve();

	const doPersist = async () => {
		if (finished || (!draftId && !touched)) return;
		savedEl.textContent = 'Saving…';
		const payload = { state: state as unknown as Json, step: index, updated_at: new Date().toISOString() };
		const res = draftId
			? await db.from('elevate_drafts').update(payload).eq('id', draftId).select('id').single()
			: await db.from('elevate_drafts').insert(payload).select('id').single();
		if (res.error) {
			savedEl.textContent = 'Not saved — retries on your next change';
		} else {
			draftId = res.data.id;
			savedEl.textContent = 'Saved ✓';
		}
	};
	/** Serialized save — awaiting it guarantees the latest state is on the server. */
	const persist = () => (chain = chain.then(doPersist));
	const schedule = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void persist(), 1200);
	};
	const flush = () => {
		clearTimeout(saveTimer);
		void persist();
	};

	// ------------------------------------------------------------ dictation --
	const mics: DictationHandle[] = [];
	dialog.querySelectorAll<HTMLButtonElement>('[data-mic]').forEach((btn) => {
		const field = btn.parentElement?.querySelector<HTMLTextAreaElement>('textarea');
		if (!field) return;
		const hint = btn.closest('[data-wiz-step]')?.querySelector<HTMLElement>('[data-wiz-mic-hint]');
		mics.push(
			attachDictation(btn, field, (msg) => {
				if (hint) {
					hint.textContent = msg;
					hint.hidden = false;
				}
			}),
		);
	});
	const stopMics = () => mics.forEach((m) => m.stop());

	// --------------------------------------------------------------- fields --
	dialog.querySelectorAll<HTMLTextAreaElement>('[data-wiz-field]').forEach((field) => {
		field.addEventListener('input', () => {
			state.text[field.dataset.wizField!] = field.value;
			touched = true;
			validate();
			schedule();
		});
	});

	const commitBtns = [...dialog.querySelectorAll<HTMLButtonElement>('[data-wiz-commit]')];
	commitBtns.forEach((btn) =>
		btn.addEventListener('click', () => {
			state.commitment = btn.dataset.wizCommit!;
			commitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
			touched = true;
			validate();
			schedule();
		}),
	);

	dialog.querySelectorAll<HTMLInputElement>('[data-wiz-range]').forEach((range) => {
		range.addEventListener('input', () => {
			const key = range.dataset.wizRange!;
			state.sliders[key] = Number(range.value);
			const out = dialog.querySelector<HTMLElement>(`[data-wiz-out="${key}"]`);
			if (out) out.textContent = range.value;
			touched = true;
			schedule();
		});
	});

	const fillFromState = () => {
		dialog.querySelectorAll<HTMLTextAreaElement>('[data-wiz-field]').forEach((f) => {
			f.value = state.text[f.dataset.wizField!] ?? '';
		});
		commitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wizCommit === state.commitment)));
		dialog.querySelectorAll<HTMLInputElement>('[data-wiz-range]').forEach((r) => {
			const key = r.dataset.wizRange!;
			const value = state.sliders[key];
			if (value != null) r.value = String(value);
			const out = dialog.querySelector<HTMLElement>(`[data-wiz-out="${key}"]`);
			if (out) out.textContent = r.value;
		});
	};

	// ----------------------------------------------------------- navigation --
	const validate = () => {
		if (finished) {
			nextBtn.disabled = false;
			return;
		}
		backBtn.disabled = executing;
		if (executing) {
			nextBtn.disabled = true;
			return;
		}
		const key = stepKey(index);
		nextBtn.disabled =
			key === 'destination' ? !(state.text.destination ?? '').trim() : key === 'commitment' ? !state.commitment : false;
	};

	const seedsList = () =>
		(state.text.seeds ?? '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)
			.slice(0, 3);

	const renderRecap = () => {
		const row = (label: string, html: string) => `
			<div class="rounded-xl bg-ink/50 p-4">
				<dt class="text-xs font-bold tracking-wide text-paper/50 uppercase">${esc(label)}</dt>
				<dd class="mt-1 text-sm leading-relaxed text-paper/85">${html}</dd>
			</div>`;
		const worth = (state.text.worth ?? '').trim();
		const placeA = (state.text.place_a ?? '').trim();
		const flagged = ASSESSMENT_DIMENSIONS.filter((d) => (state.sliders[`${d.id}:c`] ?? 3) <= DISCOMFORT_THRESHOLD);
		const story = ASSESSMENT_FREE_TEXT.filter((q) => (state.text[q.id] ?? '').trim());
		const seeds = seedsList();
		recapEl.innerHTML = [
			row('The destination', `“${esc((state.text.destination ?? '').trim())}”`),
			worth ? row('The worth', esc(worth)) : '',
			row('Commitment', esc(COMMITMENT_LABELS[state.commitment ?? ''] ?? '—')),
			placeA ? row('Place A', esc(placeA)) : '',
			row(
				'The read',
				flagged.length
					? `${flagged.length} area${flagged.length === 1 ? '' : 's'} flagged to start from: ${esc(flagged.map((d) => d.label).join(' · '))}`
					: 'No flagged areas — comfortable across the board.',
			),
			story.length ? row('The story', `${story.length} of ${ASSESSMENT_FREE_TEXT.length} answered`) : '',
			seeds.length ? row('Your seeds', seeds.map((s) => `“${esc(s)}”`).join('<br />')) : '',
		]
			.filter(Boolean)
			.join('');
	};

	const goTo = (i: number, dir: 'fwd' | 'back') => {
		stopMics();
		index = Math.max(0, Math.min(steps.length - 1, i));
		steps.forEach((s) => {
			s.hidden = true;
		});
		doneEl.hidden = true;
		if (stepKey(index) === 'review') renderRecap();
		const el = steps[index];
		el.hidden = false;
		el.classList.add(dir === 'fwd' ? 'wiz-in-fwd' : 'wiz-in-back');
		requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('wiz-in-fwd', 'wiz-in-back')));
		bar.style.width = `${((index + 1) / steps.length) * 100}%`;
		count.textContent = `Step ${index + 1} of ${steps.length}`;
		backBtn.hidden = index === 0;
		nextBtn.textContent = stepKey(index) === 'review' ? 'Build my set →' : 'Next →';
		track.scrollTop = 0;
		validate();
		void persist();
	};

	// -------------------------------------------------- execute at the end --
	const execute = async () => {
		executing = true;
		validate();
		nextBtn.textContent = 'Elevate is writing…';
		errorEl.hidden = true;
		try {
			if (!state.goal_id) {
				const revised = await db
					.from('goals')
					.update({ status: 'revised', revised_at: new Date().toISOString() })
					.eq('status', 'active');
				if (revised.error) throw new Error(revised.error.message);
				const { data, error } = await db
					.from('goals')
					.insert({
						destination_text: (state.text.destination ?? '').trim(),
						worth_statement: (state.text.worth ?? '').trim() || null,
						place_a_summary: (state.text.place_a ?? '').trim() || null,
						commitment_level: state.commitment ?? 'exploring',
						status: 'active',
					})
					.select('id')
					.single();
				if (error) throw new Error(error.message);
				state.goal_id = data.id;
				await persist(); // a retry must never double-insert
				// Clean the dictation before the set is generated (generate reads the
				// goal row) — his words kept, artifacts out. Never blocks the set.
				try {
					await invokeFn(db, 'maverick-elevate', { action: 'rewrite', goal_id: state.goal_id });
				} catch {
					/* raw words still work */
				}
				// Paint Place B while the set writes; it lands on the Destination card.
				void invokeFn(db, 'maverick-elevate', { action: 'visualize', goal_id: state.goal_id }).catch(() => {});
			}
			if (!state.assessment_id) {
				const scored: Record<string, { a: number; b: number; comfort: number }> = {};
				const flags: string[] = [];
				for (const dim of ASSESSMENT_DIMENSIONS) {
					const entry = {
						a: state.sliders[`${dim.id}:a`] ?? 5,
						b: state.sliders[`${dim.id}:b`] ?? 8,
						comfort: state.sliders[`${dim.id}:c`] ?? 3,
					};
					scored[dim.id] = entry;
					if (entry.comfort <= DISCOMFORT_THRESHOLD) flags.push(dim.id);
				}
				const responses: Record<string, string> = {};
				for (const q of ASSESSMENT_FREE_TEXT) responses[q.id] = (state.text[q.id] ?? '').trim();
				const { data, error } = await db
					.from('assessments')
					.insert({ goal_id: state.goal_id, responses, scored_dimensions: scored, discomfort_flags: flags })
					.select('id')
					.single();
				if (error) throw new Error(error.message);
				state.assessment_id = data.id;
				await persist();
			}
			const result = await invokeFn<{ affirmations: { text: string }[] }>(db, 'maverick-elevate', {
				action: 'generate',
				goal_id: state.goal_id,
				seeds: seedsList(),
				replace: true,
			});
			finished = true;
			if (draftId) {
				await db.from('elevate_drafts').delete().eq('id', draftId);
				draftId = null;
			}
			renderFinale(result.affirmations ?? []);
			onComplete();
		} catch (err) {
			executing = false;
			errorEl.textContent = err instanceof Error ? err.message : 'Something slipped — try again.';
			errorEl.hidden = false;
			nextBtn.textContent = 'Try again →';
			validate();
		}
	};

	const renderFinale = (affirmations: { text: string }[]) => {
		steps.forEach((s) => {
			s.hidden = true;
		});
		setEl.innerHTML = affirmations.length
			? affirmations
					.map(
						(a, i) =>
							`<blockquote class="wiz-reveal rounded-2xl bg-ink/50 p-5 font-display text-xl leading-snug font-medium" style="--wiz-i:${i}">“${esc(a.text)}”</blockquote>`,
					)
					.join('')
			: '<p class="text-paper/70">The set is being shaped — check the active set on this page in a moment.</p>';
		doneEl.hidden = false;
		bar.style.width = '100%';
		count.textContent = 'Done';
		savedEl.textContent = '';
		backBtn.hidden = true;
		executing = false;
		nextBtn.textContent = 'Done';
		track.scrollTop = 0;
		validate();
	};

	// -------------------------------------------------------------- wiring --
	nextBtn.addEventListener('click', () => {
		if (finished) {
			dialog.close();
			return;
		}
		if (stepKey(index) === 'review') {
			void execute();
			return;
		}
		goTo(index + 1, 'fwd');
	});
	backBtn.addEventListener('click', () => goTo(index - 1, 'back'));
	dialog.querySelector('[data-wiz-close]')?.addEventListener('click', () => dialog.close());
	dialog.addEventListener('close', () => {
		stopMics();
		if (finished) {
			// Completed run — reset so a future "Start over" begins clean.
			finished = false;
			state = freshState();
			touched = false;
			index = 0;
			noteEl.hidden = true;
			savedEl.textContent = '';
			fillFromState();
		} else {
			flush();
		}
	});

	const open = async () => {
		if (!loaded) {
			loaded = true;
			const { data } = await db
				.from('elevate_drafts')
				.select('id,state,step')
				.order('updated_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			if (data) {
				draftId = data.id;
				const saved = (data.state ?? {}) as Partial<WizardState>;
				state = {
					text: saved.text ?? {},
					commitment: saved.commitment ?? null,
					sliders: { ...defaultSliders(), ...(saved.sliders ?? {}) },
					goal_id: saved.goal_id ?? null,
					assessment_id: saved.assessment_id ?? null,
				};
				touched = true;
				fillFromState();
				index = Math.max(0, Math.min(steps.length - 1, data.step ?? 0));
				noteEl.hidden = false;
			}
		}
		if (!dialog.open) dialog.showModal();
		goTo(index, 'fwd');
	};

	return { open };
}
