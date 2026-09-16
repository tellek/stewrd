// Framework-agnostic (no Tauri/React dependency) so it's unit-testable
// standalone. Goal: zero registered tick work -> zero timers/zero CPU;
// responsive when something is due. No min-heap, no rAF - premature
// complexity for a personal tool expected to run well under 20 plugins (see
// docs/architecture-plan.md "Tick scheduler").
export interface TickHandle {
  register(fn: () => void | Promise<void>): void;
  unregister(): void;
  requestWake(afterMs?: number): void;
  setInterval(ms: number | null): void;
}

export interface TickCallbacks {
  /** A tick handler threw/rejected. */
  onError?(err: unknown): void;
  /** A tick handler's promise didn't settle within the watchdog timeout. */
  onWatchdogTimeout?(): void;
}

const DEFAULT_WATCHDOG_MS = 30_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

interface Entry {
  id: number;
  fn: (() => void | Promise<void>) | null;
  intervalMs: number | null;
  /** performance.now()-based deadline; null = no active wake scheduled. */
  nextDueAt: number | null;
  isRunning: boolean;
  watchdogMs: number;
  callbacks: TickCallbacks;
}

export class TickScheduler {
  private entries = new Map<number, Entry>();
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inPass = false;
  private pendingMutations: Array<() => void> = [];

  /** For tests/introspection: is any timer currently armed. */
  get hasActiveTimer(): boolean {
    return this.timer !== null;
  }

  createHandle(callbacks: TickCallbacks = {}, watchdogMs = DEFAULT_WATCHDOG_MS): TickHandle & { readonly entryId: number } {
    const id = this.nextId++;
    const entry: Entry = {
      id,
      fn: null,
      intervalMs: null,
      nextDueAt: null,
      isRunning: false,
      watchdogMs,
      callbacks,
    };
    this.entries.set(id, entry);
    const scheduler = this;

    return {
      entryId: id,
      register(fn) {
        scheduler.mutate(() => {
          entry.fn = fn;
        });
      },
      unregister() {
        scheduler.mutate(() => {
          entry.fn = null;
          entry.intervalMs = null;
          entry.nextDueAt = null;
        });
      },
      requestWake(afterMs = 0) {
        scheduler.mutate(() => {
          const due = performance.now() + Math.max(0, afterMs);
          entry.nextDueAt = entry.nextDueAt === null ? due : Math.min(entry.nextDueAt, due);
        });
      },
      setInterval(ms) {
        scheduler.mutate(() => {
          entry.intervalMs = ms;
          entry.nextDueAt = ms === null ? null : performance.now() + ms;
        });
      },
    };
  }

  /** Fully removes a handle's entry (called by the host on plugin deactivate,
   * not exposed to plugin authors - unregister() alone would otherwise leak a
   * Map entry across many hot-reload cycles). */
  destroyHandle(handle: { entryId: number }): void {
    this.mutate(() => {
      this.entries.delete(handle.entryId);
    });
  }

  private mutate(fn: () => void): void {
    if (this.inPass) {
      this.pendingMutations.push(fn);
    } else {
      fn();
      this.reschedule();
    }
  }

  private flushPendingMutations(): void {
    const pending = this.pendingMutations;
    this.pendingMutations = [];
    for (const fn of pending) fn();
  }

  private reschedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    let earliest: number | null = null;
    for (const entry of this.entries.values()) {
      if (entry.fn && !entry.isRunning && entry.nextDueAt !== null) {
        if (earliest === null || entry.nextDueAt < earliest) earliest = entry.nextDueAt;
      }
    }
    if (earliest === null) return; // zero registered work due = zero timers

    const now = performance.now();
    // Timer overflow guard: setTimeout clamps at 2^31-1ms and fires
    // immediately if given more - clamp and let the next pass reschedule.
    const delay = Math.max(0, Math.min(earliest - now, MAX_TIMEOUT_MS));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.runPass();
    }, delay);
  }

  private runPass(): void {
    this.inPass = true;
    const now = performance.now();
    const due = [...this.entries.values()].filter(
      (e) => e.fn && !e.isRunning && e.nextDueAt !== null && e.nextDueAt <= now,
    );
    for (const entry of due) this.fire(entry);
    this.inPass = false;
    this.flushPendingMutations();
    this.reschedule();
  }

  private fire(entry: Entry): void {
    const fn = entry.fn;
    if (!fn) return;
    entry.isRunning = true;
    let settled = false;

    const watchdog = setTimeout(() => {
      if (!settled) entry.callbacks.onWatchdogTimeout?.();
    }, entry.watchdogMs);

    const finish = () => {
      settled = true;
      clearTimeout(watchdog);
      entry.isRunning = false;
      // Overlap handling: the next deadline is anchored to completion time,
      // not the original start time, so a slow handler self-throttles
      // instead of drifting into back-to-back execution.
      entry.nextDueAt = entry.intervalMs !== null ? performance.now() + entry.intervalMs : null;
      this.reschedule();
    };

    let result: void | Promise<void>;
    try {
      result = fn();
    } catch (err) {
      entry.callbacks.onError?.(err);
      finish();
      return;
    }
    Promise.resolve(result).then(finish, (err) => {
      entry.callbacks.onError?.(err);
      finish();
    });
  }
}

/** Singleton used by the running host app; tests construct their own instance. */
export const tickScheduler = new TickScheduler();
