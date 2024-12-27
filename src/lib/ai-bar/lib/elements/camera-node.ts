import Pixelmatch from "pixelmatch";
import { debounceTime, Subject, Subscription, tap } from "rxjs";

export function defineCameraNode() {
  customElements.define("camera-node", CameraNode);
}

export class CameraNode extends HTMLElement {
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private canvasContext: CanvasRenderingContext2D;
  private referenceFrame: ImageData | null = null;
  private changeThreshold: number = 0.02;
  private dynamicScanDebounce = 200;

  private stream: MediaStream | null = null;

  private diffStream$ = new Subject<number>();
  private diffStreamSub: Subscription | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // Create video and canvas elements
    const externalVideo = this.getAttribute("video")
      ? (document.getElementById(this.getAttribute("video")!) as HTMLVideoElement)
      : null;

    this.videoElement = externalVideo ?? document.createElement("video");
    this.videoElement.autoplay = true;

    if (!externalVideo) {
      this.videoElement.style.display = "none";
      this.shadowRoot!.append(this.videoElement);
    }

    const externalCanvas = this.getAttribute("canvas")
      ? (document.getElementById(this.getAttribute("canvas")!) as HTMLCanvasElement)
      : null;
    this.canvasElement = externalCanvas ?? document.createElement("canvas");
    this.canvasContext = this.canvasElement.getContext("2d")!;

    if (!externalCanvas) {
      this.shadowRoot!.append(this.canvasElement);
    }
  }

  async getDeviceList(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    } catch (error) {
      console.error("Error enumerating devices:", error);
      return [];
    }
  }

  async start(deviceId?: string): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { min: 200, ideal: 400 },
          height: { min: 200, ideal: 400 },
        },
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;

      this.videoElement.addEventListener("play", this.processFrame.bind(this));

      const debouncedScan = this.diffStream$.pipe(
        debounceTime(this.dynamicScanDebounce),
        tap((diffPercentage) => {
          this.dispatchEvent(new Event("framechange"));
          console.log("framechange", { diffPercentage });
        }),
      );

      this.diffStreamSub = debouncedScan.subscribe();
    } catch (error) {
      console.error("Error accessing webcam:", error);
    }
  }

  stop(): void {
    if (this.stream) {
      this.diffStreamSub?.unsubscribe();
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  capture(): string {
    if (this.videoElement.videoWidth && this.videoElement.videoHeight) {
      this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
      return this.canvasElement.toDataURL("image/jpeg");
    }
    return "";
  }

  updateSettings(colorDistanceThreshold: number, changeThreshold: number): void {
    this.colorDistanceThreshold = colorDistanceThreshold;
    this.changeThreshold = changeThreshold;
  }

  private processFrame(): void {
    if (!this.videoElement.paused && !this.videoElement.ended) {
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;
      this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
      const currentFrame = this.canvasContext.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);

      if (this.referenceFrame) {
        const pixelmatchOutput = Pixelmatch(
          this.referenceFrame.data,
          currentFrame.data,
          null,
          this.referenceFrame.width,
          this.referenceFrame.height,
          { threshold: 0.2, includeAA: true },
        );
        const totalPixel = this.referenceFrame.width * this.referenceFrame.height;
        const diffPercentageV2 = pixelmatchOutput / totalPixel;
        if (diffPercentageV2 > this.changeThreshold) {
          this.referenceFrame = currentFrame;
          this.diffStream$.next(diffPercentageV2);
        }
      } else {
        this.referenceFrame = currentFrame;
      }

      requestAnimationFrame(this.processFrame.bind(this));
    }
  }
}
