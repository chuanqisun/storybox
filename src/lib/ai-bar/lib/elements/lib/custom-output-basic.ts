import placeholderAudioUrl from "./silence1s.mp3?url";

export interface SegmentHandle {
  startTime: number;
  onStartCallback?: () => void;
  onEndCallback?: () => void;
}

/**
 * A sound output device with cancellation, time tracking, and rate control.
 */
export class CustomOutputBasic {
  private rate = 1;
  private currentAudio: HTMLAudioElement | null = null;
  private queue = [] as { audio: HTMLAudioElement; onStartCallback: () => void; onEndCallback: () => void }[];

  start(): void {
    // play a tone for testing
    this.queue = [];
    this.currentAudio = null;
    const placeholderAudio = new Audio(placeholderAudioUrl);
    placeholderAudio.volume = 0.1;
    this.queue.push({ audio: placeholderAudio, onStartCallback: () => {}, onEndCallback: () => {} });
    this.handleUpdate();
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  stop(): void {
    this.currentAudio?.pause();
    this.currentAudio = null;
    this.queue = [];
  }

  pause(): void {
    this.currentAudio?.pause();
  }

  resume(): void {
    this.currentAudio?.play();
  }

  appendBuffer(value: Uint8Array, options?: { onPlayStart?: () => void; onPlayEnd?: () => void }): void {
    const playableAudio = new Audio(URL.createObjectURL(new Blob([value])));
    playableAudio.load();
    this.queue.push({ audio: playableAudio, onStartCallback: options?.onPlayStart ?? (() => {}), onEndCallback: options?.onPlayEnd ?? (() => {}) });

    // TODO announce change
    this.handleUpdate();
  }

  private handleUpdate(): void {
    if (this.currentAudio) return;

    if (this.queue!.length > 0) {
      const { audio, onStartCallback, onEndCallback } = this.queue!.shift()!;
      onStartCallback();
      this.currentAudio = audio;
      audio.onended = () => {
        this.currentAudio = null;
        this.handleUpdate();
        onEndCallback();
      };
      audio.playbackRate = this.rate;
      audio.play();
    }
  }
}
