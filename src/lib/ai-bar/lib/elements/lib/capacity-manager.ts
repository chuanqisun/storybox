export class CapacityManager {
  #capacity: number;

  constructor(config: { capacity: number }) {
    this.#capacity = config.capacity;
  }

  events = new EventTarget();

  async consumeCapacity(): Promise<void> {
    if (this.#capacity > 0) {
      this.#capacity--;
      console.log(`[capacity-manager] capacity decreased to ${this.#capacity}`);
    } else {
      await new Promise((resolve) => this.events.addEventListener("capacityincreased", resolve, { once: true }));
      return this.consumeCapacity();
    }
  }

  hasCapacity() {
    return this.#capacity > 0;
  }

  peekCapacity() {
    return this.#capacity;
  }

  recoverAfterMs(timeoutMs: number) {
    setTimeout(() => {
      this.#capacity++;
      console.log(`[capacity-manager] capacity increased to ${this.#capacity}`);
      this.events.dispatchEvent(new Event("capacityincreased"));
    }, timeoutMs);
  }
}
