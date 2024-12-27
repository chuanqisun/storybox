export class ExponentialMovingAverage {
  private currentAverage: number | null = null;
  constructor(
    /** The decay factor, between 0 and 1. A higher decay factor means more weight is given to recent values.  */
    private decay: number,
  ) {}

  add(newValue: number) {
    if (this.currentAverage === null) {
      this.currentAverage = newValue;
    } else {
      this.currentAverage = this.currentAverage * (1 - this.decay) + newValue * this.decay;
    }
    return this.currentAverage;
  }
}

export class WindowedMovingAverage {
  private window: number[] = [];
  constructor(private windowSize: number) {}

  add(value: number) {
    // Add the new value to the window
    this.window.push(value);

    // If the window exceeds the desired size, remove the oldest element
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }

    // Calculate and return the current rolling average
    return this.window.reduce((sum, val) => sum + val, 0) / this.window.length;
  }
}
