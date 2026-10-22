/**
 * Tiny synchronous event bus used to keep game systems decoupled.
 * Listeners registered with `on` receive (payload) and are removed with the
 * function returned from `on`, or via `off`.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  on(event, handler) {
    if (typeof handler !== 'function') return () => {};
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const wrapped = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  off(event, handler) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.listeners.delete(event);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy so handlers can safely unsubscribe during dispatch.
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${event}" failed`, err);
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}
