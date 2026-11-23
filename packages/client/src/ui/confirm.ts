/** Press twice to confirm: the first press of a key arms it, a second one within `windowMs` goes through. */
export class PressConfirm {
  private key: string | null = null;
  private until = 0;

  constructor(private readonly windowMs = 2000) {}

  press(key: string, now: number): boolean {
    if (this.armed(key, now)) {
      this.clear();
      return true;
    }
    this.key = key;
    this.until = now + this.windowMs;
    return false;
  }

  armed(key: string, now: number): boolean {
    return this.key === key && now < this.until;
  }

  clear(): void {
    this.key = null;
  }
}
