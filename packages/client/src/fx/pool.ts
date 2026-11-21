/** A free list of reusable objects (effect records, text labels), so a busy fight does not allocate per hit. */
export class Pool<T extends object> {
  private readonly items: T[] = [];
  private readonly inFree = new WeakSet<T>();
  private readonly max: number;
  private readonly dispose?: (item: T) => void;

  constructor(private readonly make: () => T, private readonly reset: (item: T) => void, opts: { max?: number; dispose?: (item: T) => void } = {}) {
    this.max = opts.max ?? 256;
    this.dispose = opts.dispose;
  }

  get free(): number { return this.items.length; }

  acquire(): T {
    const item = this.items.pop();
    if (!item) return this.make();
    this.inFree.delete(item);
    return item;
  }

  release(item: T): void {
    if (this.inFree.has(item)) return;
    this.reset(item);
    if (this.items.length >= this.max) { this.dispose?.(item); return; }
    this.inFree.add(item);
    this.items.push(item);
  }
}
