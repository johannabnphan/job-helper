// Highlights around filled and flagged fields, plus a small draggable pill.
// Everything lives in a shadow root on top of the page so it never touches the
// site's own DOM (React re-renders can't wipe it) and never blocks clicks:
// only the pill and the Draft buttons take pointer events.
import type { FieldStatus } from '../shared/messages';

export interface Mark {
  anchor: HTMLElement;
  /** Element whose user edits clear the flag. */
  watch: HTMLElement;
  status: Exclude<FieldStatus, 'skipped'>;
  message: string;
  label?: string;
  /**
   * Returns true once the problem is gone (e.g. a required field now has a
   * value). Checked continuously, so flags clear even when a custom dropdown
   * changes without firing input/change events.
   */
  resolved?: () => boolean;
  /** Open-ended question: show a "Draft with AI" button. Returns an error message or undefined. */
  draft?: () => Promise<string | undefined>;
}

interface LiveMark extends Mark {
  box: HTMLElement;
  touched: boolean;
  done: boolean;
}

const COLORS: Record<Mark['status'], { border: string; bg: string; tag: string }> = {
  filled: { border: '#16a34a', bg: 'rgba(22,163,74,0.05)', tag: '#15803d' },
  review: { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', tag: '#b45309' },
  missing: { border: '#ef4444', bg: 'rgba(239,68,68,0.06)', tag: '#b91c1c' },
};

const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.box { position: fixed; border: 2px solid; border-radius: 6px; box-sizing: border-box; }
.box.filled { border-width: 1px; opacity: .8; }
.box.done { border-color: #16a34a !important; background: transparent !important; border-width: 1px; opacity: .5; }
.box.done .tag { display: none; }
.tag { position: absolute; right: -2px; bottom: 100%; margin-bottom: 2px; display: flex; gap: 6px; align-items: center;
  font: 600 11px/1.4 system-ui, sans-serif; color: #fff; padding: 1px 6px; border-radius: 4px; white-space: nowrap; max-width: 380px; }
.tag span { overflow: hidden; text-overflow: ellipsis; }
.box.filled .tag { display: none; }
.box.current { box-shadow: 0 0 0 4px rgba(37,99,235,.35); }
.draft { pointer-events: auto; font: 600 11px/1.4 system-ui, sans-serif; border: 0; border-radius: 4px; padding: 1px 6px;
  background: #fff; color: #6d28d9; cursor: pointer; }
.draft:disabled { opacity: .6; cursor: default; }
.pill { position: fixed; right: 16px; bottom: 16px; pointer-events: auto; z-index: 2147483647; display: flex; align-items: center; gap: 8px;
  font: 600 12px/1 system-ui, sans-serif; color: #18181b; background: #fff; border: 1px solid #e2e2e7; border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0,0,0,.15); padding: 6px 6px 6px 12px; cursor: grab; user-select: none; }
.pill.dragging { cursor: grabbing; }
.pill .dot { width: 8px; height: 8px; border-radius: 50%; }
.pill button { font: inherit; font-size: 12px; border: 0; border-radius: 999px; padding: 5px 10px; cursor: pointer; background: #2563eb; color: #fff; }
.pill button.ghost { background: transparent; color: #71717a; padding: 5px 6px; }
.pill.min { padding: 6px; }
.pill.min .text, .pill.min .next { display: none; }
@media (prefers-color-scheme: dark) {
  .pill { background: #1c1c20; color: #ececf1; border-color: #2e2e35; }
}
`;

class Overlay {
  private host?: HTMLElement;
  private layer?: HTMLElement;
  private pill?: HTMLElement;
  private marks: LiveMark[] = [];
  private cursor = -1;
  private raf = 0;
  private timer = 0;
  private minimized = false;
  private lastSignature = '';

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
    for (const t of ['input', 'change', 'pointerdown', 'keydown']) document.addEventListener(t, this.onUserEvent, true);
    this.timer = window.setInterval(this.tick, 600);
    return shadow;
  }

  show(marks: Mark[]): void {
    const shadow = this.ensure();
    this.clearBoxes();
    for (const m of marks) {
      const box = document.createElement('div');
      const live: LiveMark = { ...m, box, touched: false, done: false };
      box.className = `box ${m.status}`;
      const c = COLORS[m.status];
      box.style.borderColor = c.border;
      box.style.background = c.bg;
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.style.background = c.tag;
      const text = document.createElement('span');
      text.textContent = m.message;
      tag.append(text);
      if (m.draft) tag.append(this.draftButton(live));
      box.append(tag);
      box.title = m.message;
      this.layer!.append(box);
      this.marks.push(live);
    }
    this.renderPill(shadow);
    this.position();
    this.broadcast();
  }

  private draftButton(m: LiveMark): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'draft';
    btn.textContent = '✨ Draft with AI';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = 'Drafting…';
      const err = await m.draft!();
      btn.disabled = false;
      btn.textContent = err ? '✨ Try again' : '✨ Redraft';
      const text = btn.previousElementSibling as HTMLElement;
      text.textContent = err ? `Needs you: ${err}` : 'Review: AI draft. Read it and make it yours';
      if (!err) this.setStatus(m, 'review');
    });
    return btn;
  }

  private setStatus(m: LiveMark, status: Mark['status']): void {
    m.status = status;
    m.done = false;
    m.touched = false;
    const c = COLORS[status];
    m.box.className = `box ${status}`;
    m.box.style.borderColor = c.border;
    m.box.style.background = c.bg;
    (m.box.querySelector('.tag') as HTMLElement).style.background = c.tag;
    this.update();
  }

  /** Fields still needing attention. */
  private open(): LiveMark[] {
    return this.marks.filter((m) => m.status !== 'filled' && !m.done);
  }

  private renderPill(shadow: ShadowRoot): void {
    if (!this.pill) {
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.innerHTML = `<span class="dot"></span><span class="text"></span><button class="next">Next ↓</button><button class="ghost min-btn" title="Minimize">–</button><button class="ghost close" title="Hide highlights">×</button>`;
      pill.querySelector('.next')!.addEventListener('click', () => this.next());
      pill.querySelector('.close')!.addEventListener('click', () => this.clear());
      pill.querySelector('.min-btn')!.addEventListener('click', () => {
        this.minimized = !this.minimized;
        this.updatePill();
      });
      this.makeDraggable(pill);
      shadow.append(pill);
      this.pill = pill;
    }
    this.updatePill();
  }

  private updatePill(): void {
    if (!this.pill) return;
    const left = this.open();
    const missing = left.filter((m) => m.status === 'missing').length;
    this.pill.classList.toggle('min', this.minimized);
    (this.pill.querySelector('.dot') as HTMLElement).style.background = missing ? COLORS.missing.border : left.length ? COLORS.review.border : COLORS.filled.border;
    this.pill.querySelector('.text')!.textContent = left.length ? `${left.length} to check` : 'All checked. Submit when ready';
    (this.pill.querySelector('.next') as HTMLButtonElement).style.display = left.length && !this.minimized ? '' : 'none';
    (this.pill.querySelector('.min-btn') as HTMLElement).textContent = this.minimized ? '+' : '–';
    this.pill.title = 'Job Helper never submits. Drag to move.';
  }

  /** Drag the pill anywhere so it never covers what you're reading. */
  private makeDraggable(pill: HTMLElement): void {
    let start: { x: number; y: number; right: number; bottom: number } | undefined;
    pill.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const r = pill.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom };
      pill.setPointerCapture(e.pointerId);
      pill.classList.add('dragging');
    });
    pill.addEventListener('pointermove', (e) => {
      if (!start) return;
      const right = Math.min(window.innerWidth - 60, Math.max(4, start.right - (e.clientX - start.x)));
      const bottom = Math.min(window.innerHeight - 40, Math.max(4, start.bottom - (e.clientY - start.y)));
      pill.style.right = `${right}px`;
      pill.style.bottom = `${bottom}px`;
    });
    const end = () => {
      start = undefined;
      pill.classList.remove('dragging');
    };
    pill.addEventListener('pointerup', end);
    pill.addEventListener('pointercancel', end);
  }

  next(): void {
    const left = this.open();
    if (!left.length) return;
    this.cursor = (this.cursor + 1) % left.length;
    this.focusMark(left[this.cursor]);
  }

  /** Scrolls to the first open flag whose label matches (used by the side panel). */
  focusLabel(label: string): boolean {
    const m = this.open().find((x) => x.label === label) ?? this.marks.find((x) => x.label === label);
    if (!m) return false;
    this.focusMark(m);
    return true;
  }

  private focusMark(m: LiveMark): void {
    this.marks.forEach((x) => x.box.classList.toggle('current', x === m));
    m.anchor.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = m.watch.matches('input, select, textarea, button, [tabindex]') ? m.watch : m.anchor.querySelector<HTMLElement>('input, select, textarea, button');
    setTimeout(() => focusable?.focus({ preventScroll: true }), 300);
  }

  /** Real user interaction with a flagged field (works through shadow roots). */
  private onUserEvent = (e: Event) => {
    if (!e.isTrusted) return;
    const path = e.composedPath();
    if (this.host && path.includes(this.host)) return;
    for (const m of this.marks) {
      if (m.status !== 'filled' && (path.includes(m.watch) || path.includes(m.anchor))) {
        if (e.type === 'input' || e.type === 'change' || e.type === 'keydown') m.touched = true;
        else if (e.type === 'pointerdown') m.touched = m.touched || m.status === 'review';
      }
    }
    // Let the field update first (custom dropdowns apply the choice after the click).
    setTimeout(this.tick, 50);
  };

  /** Re-checks every flag against the page's real state. */
  private tick = () => {
    let changed = false;
    for (const m of this.marks) {
      if (m.status === 'filled' || !m.anchor.isConnected) continue;
      let ok = false;
      try {
        const hasValue = m.resolved ? m.resolved() : false;
        // Missing: fixed once it has a value. Review: fixed once you've looked/edited and it still has a value.
        ok = m.status === 'missing' ? hasValue : m.touched && (hasValue || !m.resolved);
      } catch {
        ok = false;
      }
      if (ok !== m.done) {
        m.done = ok;
        m.box.classList.toggle('done', ok);
        changed = true;
      }
    }
    if (changed) this.update();
  };

  private update(): void {
    this.updatePill();
    this.broadcast();
  }

  /** Tells the side panel which flags are still open, so its list stays in sync. */
  private broadcast(): void {
    const flags = this.open().map((m) => ({ label: m.label ?? '', status: m.status, detail: m.message.replace(/^(Review|Needs you): /, '') }));
    const signature = JSON.stringify(flags);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    try {
      void chrome.runtime.sendMessage({ type: 'jh:flags', frameUrl: location.href, flags }).catch(() => undefined);
    } catch {
      /* extension reloaded; ignore */
    }
  }

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
    this.pill?.remove();
    this.pill = undefined;
    this.lastSignature = '';
    this.broadcast();
    window.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    for (const t of ['input', 'change', 'pointerdown', 'keydown']) document.removeEventListener(t, this.onUserEvent, true);
    clearInterval(this.timer);
    this.host?.remove();
    this.host = undefined;
  }
}

export const overlay = new Overlay();
