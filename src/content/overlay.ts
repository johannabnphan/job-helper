// Draws highlights around filled and flagged fields, plus a small summary card.
// Everything lives in a shadow root on top of the page so it never touches the
// site's own DOM or styles (React re-renders can't wipe it).
import type { FieldStatus } from '../shared/messages';

export interface Mark {
  anchor: HTMLElement;
  /** Element whose user edits clear the flag. */
  watch: HTMLElement;
  status: Exclude<FieldStatus, 'skipped'>;
  message: string;
}

const COLORS: Record<Mark['status'], { border: string; bg: string; tag: string }> = {
  filled: { border: '#16a34a', bg: 'rgba(22,163,74,0.06)', tag: '#15803d' },
  review: { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)', tag: '#b45309' },
  missing: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', tag: '#b91c1c' },
};

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.box { position: fixed; border: 2px solid; border-radius: 6px; box-sizing: border-box; transition: opacity .2s; }
.box.filled { border-width: 1px; }
.tag { position: absolute; right: -2px; bottom: 100%; margin-bottom: 2px; font: 600 11px/1.4 system-ui, sans-serif;
  color: #fff; padding: 1px 6px; border-radius: 4px; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
.box.filled .tag { display: none; }
.box.current { box-shadow: 0 0 0 4px rgba(37,99,235,.35); }
.card { position: fixed; right: 16px; bottom: 16px; pointer-events: auto; z-index: 2147483647;
  font: 13px/1.4 system-ui, sans-serif; color: #18181b; background: #fff; border: 1px solid #e2e2e7;
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.15); padding: 12px 14px; width: 280px; }
.card h1 { font-size: 13px; margin: 0 0 6px; display: flex; align-items: center; gap: 6px; }
.card .counts { display: flex; gap: 10px; margin-bottom: 8px; }
.card .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.card p { margin: 0 0 8px; color: #52525b; font-size: 12px; }
.card .row { display: flex; gap: 6px; }
.card button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; color: #18181b; cursor: pointer; }
.card button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.card .close { margin-left: auto; border: 0; padding: 0 4px; font-size: 16px; line-height: 1; }
@media (prefers-color-scheme: dark) {
  .card { background: #1c1c20; color: #ececf1; border-color: #2e2e35; }
  .card p { color: #a1a1aa; }
  .card button { background: #27272a; color: #ececf1; border-color: #3f3f46; }
}
`;

class Overlay {
  private host?: HTMLElement;
  private layer?: HTMLElement;
  private card?: HTMLElement;
  private marks: Array<Mark & { box: HTMLElement }> = [];
  private cursor = -1;
  private raf = 0;
  private timer = 0;

  private ensure(): ShadowRoot {
    if (this.host?.isConnected) return this.host.shadowRoot!;
    this.host = document.createElement('div');
    this.host.setAttribute('data-job-helper', '');
    const shadow = this.host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style><div class="layer"></div>`;
    this.layer = shadow.querySelector('.layer') as HTMLElement;
    document.documentElement.append(this.host);
    window.addEventListener('scroll', this.schedule, { passive: true, capture: true });
    window.addEventListener('resize', this.schedule, { passive: true });
    document.addEventListener('input', this.onUserEdit, true);
    document.addEventListener('change', this.onUserEdit, true);
    this.timer = window.setInterval(this.schedule, 700);
    return shadow;
  }

  show(marks: Mark[]): void {
    const shadow = this.ensure();
    this.clearBoxes();
    for (const m of marks) {
      const box = document.createElement('div');
      box.className = `box ${m.status}`;
      const c = COLORS[m.status];
      box.style.borderColor = c.border;
      box.style.background = c.bg;
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.style.background = c.tag;
      tag.textContent = m.message;
      box.append(tag);
      box.title = m.message;
      this.layer!.append(box);
      this.marks.push({ ...m, box });
    }
    this.renderCard(shadow);
    this.position();
  }

  private flagged() {
    return this.marks.filter((m) => m.status !== 'filled');
  }

  private renderCard(shadow: ShadowRoot): void {
    this.card?.remove();
    const counts = { filled: 0, review: 0, missing: 0 };
    for (const m of this.marks) counts[m.status]++;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h1>Job Helper <button class="close" title="Hide highlights">×</button></h1>
      <div class="counts">
        <span><span class="dot" style="background:${COLORS.filled.border}"></span>${counts.filled} filled</span>
        <span><span class="dot" style="background:${COLORS.review.border}"></span>${counts.review} to review</span>
        <span><span class="dot" style="background:${COLORS.missing.border}"></span>${counts.missing} need you</span>
      </div>
      <p>Check the highlighted fields, then submit the application yourself. Job Helper never submits.</p>
      <div class="row"><button class="primary next">Next flagged field</button></div>`;
    card.querySelector('.close')!.addEventListener('click', () => this.clear());
    const next = card.querySelector('.next') as HTMLButtonElement;
    next.disabled = this.flagged().length === 0;
    next.addEventListener('click', () => this.next());
    shadow.append(card);
    this.card = card;
  }

  private next(): void {
    const flagged = this.flagged();
    if (!flagged.length) return;
    this.cursor = (this.cursor + 1) % flagged.length;
    const m = flagged[this.cursor];
    this.marks.forEach((x) => x.box.classList.toggle('current', x === m));
    m.anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = m.watch.matches('input, select, textarea, button, [tabindex]') ? m.watch : m.anchor.querySelector<HTMLElement>('input, select, textarea, button');
    setTimeout(() => focusable?.focus({ preventScroll: true }), 300);
  }

  /** A real (trusted) edit by the user on a flagged field clears its flag. */
  private onUserEdit = (e: Event) => {
    if (!e.isTrusted) return;
    const target = e.target as Node;
    const m = this.marks.find((x) => x.status !== 'filled' && (x.watch === target || x.anchor.contains(target)));
    if (!m) return;
    m.status = 'filled';
    m.box.className = 'box filled';
    m.box.style.borderColor = COLORS.filled.border;
    m.box.style.background = 'transparent';
    if (this.host?.shadowRoot) this.renderCard(this.host.shadowRoot);
  };

  private schedule = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.position();
    });
  };

  private position(): void {
    for (const m of this.marks) {
      const r = m.anchor.isConnected ? m.anchor.getBoundingClientRect() : null;
      if (!r || (r.width === 0 && r.height === 0)) {
        m.box.style.display = 'none';
        continue;
      }
      m.box.style.display = '';
      m.box.style.left = `${r.left - 3}px`;
      m.box.style.top = `${r.top - 3}px`;
      m.box.style.width = `${r.width + 6}px`;
      m.box.style.height = `${r.height + 6}px`;
    }
  }

  private clearBoxes(): void {
    this.marks.forEach((m) => m.box.remove());
    this.marks = [];
    this.cursor = -1;
  }

  clear(): void {
    this.clearBoxes();
    this.card?.remove();
    this.card = undefined;
    window.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    document.removeEventListener('input', this.onUserEdit, true);
    document.removeEventListener('change', this.onUserEdit, true);
    clearInterval(this.timer);
    this.host?.remove();
    this.host = undefined;
  }
}

export const overlay = new Overlay();
