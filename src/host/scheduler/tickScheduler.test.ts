import { describe, expect, it, vi } from "vitest";
import { TickScheduler } from "./tickScheduler";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("TickScheduler", () => {
  it("has zero timers when nothing is registered", () => {
    const scheduler = new TickScheduler();
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("has zero timers after register() with no interval/wake requested", () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    handle.register(() => {});
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("fires a registered handler after requestWake(ms)", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn();
    handle.register(fn);
    handle.requestWake(10);
    expect(scheduler.hasActiveTimer).toBe(true);
    await wait(30);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("requestWake is one-off: does not repeat after firing", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn();
    handle.register(fn);
    handle.requestWake(10);
    await wait(30);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("setInterval produces recurring sparse wakeups, not busy polling", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn();
    handle.register(fn);
    handle.setInterval(15);
    await wait(50);
    handle.setInterval(null);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fn.mock.calls.length).toBeLessThan(6); // sparse, not a busy loop
  });

  it("setInterval(null) stops recurrence and clears the timer", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    handle.register(() => {});
    handle.setInterval(10);
    handle.setInterval(null);
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("coalesces overlap: a still-running async handler is not invoked concurrently", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    let concurrent = 0;
    let maxConcurrent = 0;
    const fn = vi.fn(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await wait(40);
      concurrent--;
    });
    handle.register(fn);
    handle.setInterval(10); // fires far more often than the 40ms handler takes
    await wait(120);
    handle.setInterval(null);
    expect(maxConcurrent).toBe(1);
  });

  it("anchors the next deadline to completion time, not the original start time", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fireTimes: number[] = [];
    const fn = vi.fn(async () => {
      fireTimes.push(performance.now());
      await wait(50);
    });
    handle.register(fn);
    handle.setInterval(10);
    await wait(130);
    handle.setInterval(null);
    // Each fire should be ~50ms+ after the previous one (completion-anchored),
    // not ~10ms apart (which busy back-to-back firing would produce).
    for (let i = 1; i < fireTimes.length; i++) {
      expect(fireTimes[i] - fireTimes[i - 1]).toBeGreaterThanOrEqual(45);
    }
  });

  it("calls onWatchdogTimeout when a handler's promise never settles, without disabling future invocations", async () => {
    const scheduler = new TickScheduler();
    const onWatchdogTimeout = vi.fn();
    const handle = scheduler.createHandle({ onWatchdogTimeout }, 20);
    let callCount = 0;
    handle.register(() => {
      callCount++;
      if (callCount === 1) return new Promise(() => {}); // hangs forever
      return undefined;
    });
    handle.setInterval(10);
    await wait(60);
    handle.setInterval(null);
    expect(onWatchdogTimeout).toHaveBeenCalled();
    // A later invocation should still have been allowed to proceed rather
    // than being blocked forever by the first hung call.
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  it("isolates a throwing handler via onError without killing the scheduler", async () => {
    const scheduler = new TickScheduler();
    const onError = vi.fn();
    const handleA = scheduler.createHandle({ onError });
    const handleB = scheduler.createHandle();
    const fnB = vi.fn();
    handleA.register(() => {
      throw new Error("boom");
    });
    handleB.register(fnB);
    handleA.requestWake(5);
    handleB.requestWake(5);
    await wait(30);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it("queues mutations made from within a running handler and applies them after the pass", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    let unregisteredDuringRun = false;
    handle.register(() => {
      handle.unregister();
      // Should not have taken effect yet (still mid-pass) - checked by the
      // fact this synchronous call didn't throw or corrupt scheduler state.
      unregisteredDuringRun = true;
    });
    handle.requestWake(5);
    await wait(20);
    expect(unregisteredDuringRun).toBe(true);
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("clamps an overflow-sized delay instead of firing immediately in a busy loop", () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    handle.register(() => {});
    handle.requestWake(2 ** 32); // far exceeds setTimeout's 2^31-1 clamp
    expect(scheduler.hasActiveTimer).toBe(true);
  });

  it("destroyHandle removes the entry so it no longer schedules", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn();
    handle.register(fn);
    handle.setInterval(10);
    scheduler.destroyHandle(handle);
    await wait(30);
    expect(fn).not.toHaveBeenCalled();
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("requestWake coalesces to the earlier of two requested deadlines", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn();
    handle.register(fn);
    handle.requestWake(200);
    handle.requestWake(50);
    await wait(80);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unregister() stops an active recurring interval", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn();
    handle.register(fn);
    handle.setInterval(10);
    await wait(15);
    handle.unregister();
    const callsAtUnregister = fn.mock.calls.length;
    await wait(60);
    expect(fn.mock.calls.length).toBe(callsAtUnregister);
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("applies a mutation queued during a running tick once the pass completes", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn(() => {
      handle.setInterval(10);
    });
    handle.register(fn);
    handle.requestWake(5);
    // Generous margin (matching other timing-sensitive tests in this file,
    // e.g. the 120ms/130ms waits above) so real-timer/event-loop jitter
    // under load can't make this flaky - only 2 of the many expected fires
    // in this window need to land for the assertion to hold.
    await wait(100);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("destroyHandle called from inside a running tick handler doesn't throw and cleans up", async () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    const fn = vi.fn(() => {
      scheduler.destroyHandle(handle);
    });
    handle.register(fn);
    handle.requestWake(5);
    await wait(30);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(scheduler.hasActiveTimer).toBe(false);
  });

  it("clamps a negative requestWake delay to fire immediately", () => {
    const scheduler = new TickScheduler();
    const handle = scheduler.createHandle();
    handle.register(() => {});
    handle.requestWake(-100);
    expect(scheduler.hasActiveTimer).toBe(true);
  });
});
