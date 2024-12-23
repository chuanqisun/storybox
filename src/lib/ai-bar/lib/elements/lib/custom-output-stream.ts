import placeholderAudioUrl from "./silence1s.mp3?url";
export interface SegmentHandle {
  startTime: number;
  onStartCallback?: () => void;
  onEndCallback?: () => void;
}

/**
 * A sound output device with cancellation, time tracking, and rate control.
 */
export class CustomOutputStream {
  private audioElement?: HTMLAudioElement;
  private mediaSource?: MediaSource;
  private sourceBuffer?: SourceBuffer | null;
  private queue?: { audio: Uint8Array; onStartCallback: () => void; onEndCallback: () => void }[];
  private rate?: number;

  private onPlayCallbacks: SegmentHandle[] = [];

  private onStopCallback?: () => void;

  constructor(
    private options?: {
      rate?: number;
    }
  ) {}

  start(): void {
    this.audioElement = new Audio();
    this.mediaSource = new MediaSource();
    this.sourceBuffer = null;
    this.queue = [];
    this.rate = this.options?.rate ?? 1;

    let lastSeenTime = -1;

    this.audioElement.src = URL.createObjectURL(this.mediaSource);
    this.audioElement.addEventListener("canplay", (_e) => {
      try {
        this.audioElement!.play();
        this.audioElement!.playbackRate = this.rate ?? 1;
      } catch {}
    });

    const handleSourceopen = () => {
      this.sourceBuffer = this.mediaSource!.addSourceBuffer("audio/mpeg");
      this.sourceBuffer.addEventListener("updateend", () => this.onUpdateEnd());
      fetch(placeholderAudioUrl)
        .then((res) => res.arrayBuffer())
        .then((bu) => {
          this.sourceBuffer!.appendBuffer(bu);
        });
    };

    const handleTimeupdate = () => {
      const playingChunkIndex = this.onPlayCallbacks.findLastIndex((cb) => cb.startTime <= this.audioElement!.currentTime);

      const playStartCallbacks = this.onPlayCallbacks.slice(0, Math.max(0, playingChunkIndex + 1));
      const playEndCallbacks = this.onPlayCallbacks.slice(0, Math.max(0, playingChunkIndex));

      playEndCallbacks.forEach((cb) => {
        cb.onEndCallback?.();
        cb.onEndCallback = undefined;
      });

      playStartCallbacks.forEach((cb) => {
        cb.onStartCallback?.();
        cb.onStartCallback = undefined;
      });

      this.onPlayCallbacks = this.onPlayCallbacks.slice(Math.max(0, playingChunkIndex));

      // HACK we are unable to determine if the last chunk is played. However, chrome will fire the same timestamp twice at the end of stream
      if (this.audioElement?.currentTime === lastSeenTime) {
        this.onPlayCallbacks.forEach((cb) => {
          cb.onStartCallback?.();
          cb.onStartCallback = undefined;
          cb.onEndCallback?.();
          cb.onEndCallback = undefined;
        });
        this.onPlayCallbacks = [];
        lastSeenTime = -1;
      } else {
        lastSeenTime = this.audioElement?.currentTime ?? -1;
      }
    };

    // never added to the DOM, so no need to remove event listeners
    this.mediaSource.addEventListener("sourceopen", handleSourceopen);
    this.audioElement.addEventListener("timeupdate", handleTimeupdate);

    // ref: https://stackoverflow.com/questions/36803176/how-to-prevent-the-play-request-was-interrupted-by-a-call-to-pause-error

    this.onStopCallback = () => {
      try {
        this.mediaSource?.endOfStream();
        this.audioElement!.src = "";
      } catch (e) {}
    };
  }

  setRate(rate: number): void {
    this.audioElement!.playbackRate = rate;
    this.rate = rate;
  }

  stop(): void {
    this.onStopCallback?.();
  }

  pause(): void {
    this.queue = [];
    this.audioElement?.pause();
  }

  resume(): void {
    if (this.audioElement?.paused) {
      this.audioElement.play();
    }

    this.audioElement!.play();
  }

  appendBuffer(value: Uint8Array, options?: { onPlayStart?: () => void; onPlayEnd?: () => void }): void {
    if (this.sourceBuffer && !this.sourceBuffer.updating) {
      const segment: SegmentHandle = {
        startTime: this.calculateTimestamp(),
        onStartCallback: options?.onPlayStart ?? (() => {}),
        onEndCallback: options?.onPlayEnd ?? (() => {}),
      };
      this.onPlayCallbacks.push(segment);
      this.sourceBuffer.appendBuffer(value);
    } else {
      this.queue?.push({ audio: value, onStartCallback: options?.onPlayStart ?? (() => {}), onEndCallback: options?.onPlayEnd ?? (() => {}) });
    }
  }

  private onUpdateEnd(): void {
    if (this.queue!.length > 0) {
      const { audio, onStartCallback, onEndCallback } = this.queue!.shift()!;

      const segment: SegmentHandle = { startTime: this.calculateTimestamp(), onStartCallback, onEndCallback };
      this.onPlayCallbacks.push(segment);
      this.sourceBuffer!.appendBuffer(audio);
    }
  }

  private calculateTimestamp(): number {
    if (this.sourceBuffer) {
      const buffered = this.sourceBuffer.buffered;
      if (buffered.length > 0) {
        return buffered.end(buffered.length - 1);
      }
    }
    return 0;
  }
}
