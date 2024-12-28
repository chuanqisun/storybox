import Pixelmatch from "pixelmatch";
import { debounceTime, Subject, Subscription, tap } from "rxjs";
import { $new } from "../../../dom";
import { attachShadowHtml } from "../wc-utils/attach-html";
import { WindowedMovingAverage } from "./lib/moving-average";

export function defineCameraNode() {
  customElements.define("camera-node", CameraNode);
}

export class CameraNode extends HTMLElement {
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private canvasContext: CanvasRenderingContext2D;
  private referenceFrame: ImageData | null = null;
  private captureTriggerRatio: number = 0.01; // ratio of changed pixels to trigger a capture
  private pixelTriggerRadio: number = 0.04; // sensitivity for detecting pixel level change
  private dynamicScanDebounce = 200;
  private stream: MediaStream | null = null;
  private diffStream$ = new Subject<number>();
  private diffStreamSub: Subscription | null = null;

  shadowRoot = attachShadowHtml(
    this,
    `
<style>
:host {
  select {
      display: block;
      font-size: 16px;
  }

  button {
    font-size: 16px;
  }

  form {
    display: grid;
    gap: 1rem;

    meter {
      width: 100%;
    }
  }
}
</style>
<button>📹</button>
<dialog style="width: min(60rem, calc(100vw - 32px))">
  <form  method="dialog">
    <label for="webcam">Select Webcam</label>
    <select name="webcam" id="webcamSelect">
        <option value="" disabled selected>Select a webcam</option>
    </select>
    <label for="pixelTriggerRadio">Pixel Trigger Ratio <span data-value="pixelTriggerRadio"></span></label>
    <input type="range" id="pixelTriggerRadio" name="pixelTriggerRadio" min="0" max="1" step="0.01" value="0.2">
    <label for="captureTriggerRatio">Capture Trigger Ratio <span data-value="capturueTriggerRatio"></span></label>
    <input type="range" id="captureTriggerRatio" name="captureTriggerRatio" min="0" max="1" step="0.001" value="0.02">
    <label for="capture-meter">Capture meter <span id="radio-display"></span></label>
    <meter id="capture-meter" min="0" max="1" low="0.02" value="0.01"></meter>
    <canvas id="diff-preview"></canvas>
    <div id="capture-list"></div>
    <button>OK</button>
  </form>
</dialog>
    `.trim(),
  );

  private diffPreviewCanvas = this.shadowRoot!.getElementById("diff-preview") as HTMLCanvasElement;
  private radioDisplay = this.shadowRoot!.getElementById("radio-display") as HTMLDivElement;
  private captureMeter = this.shadowRoot!.getElementById("capture-meter") as HTMLMeterElement;
  private captureList = this.shadowRoot!.getElementById("capture-list")!;
  private diffPreviewContext: CanvasRenderingContext2D | null = null;
  // private movingDiffAverage = new ExponentialMovingAverage(0.1);
  private movingDiffAverage = new WindowedMovingAverage(10);

  constructor() {
    super();

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
    this.canvasElement.style.display = "none";

    if (!externalCanvas) {
      this.shadowRoot!.append(this.canvasElement);
    }
  }

  connectedCallback() {
    this.setAttribute("provides", "toolbar-item");
    this.shadowRoot.querySelector("button")?.addEventListener("click", () => {
      this.diffPreviewContext = this.diffPreviewCanvas.getContext("2d")!;
      this.shadowRoot.querySelector("dialog")?.showModal();
      this.start();
    });
    this.initSetupForm();

    // handle model close
    this.shadowRoot.querySelector("dialog")?.addEventListener("close", () => {
      this.diffPreviewContext = null;
      this.stop();
    });
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

  async start(): Promise<void> {
    try {
      const selectedId = localStorage.getItem("selectedWebcamDeviceId") ?? "";
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { ideal: selectedId },
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
          if (this.diffPreviewContext) {
            const debugCapture = this.capture();

            const img = $new("img", { src: debugCapture, width: "64", height: "64" });
            this.captureList.append(img);
          }
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

  private processFrame(): void {
    if (!this.videoElement.paused && !this.videoElement.ended) {
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;
      this.canvasContext.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
      const currentFrame = this.canvasContext.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
      if (this.diffPreviewContext) {
        this.diffPreviewCanvas.width = this.canvasElement.width;
        this.diffPreviewCanvas.height = this.canvasElement.height;
      }
      const diffBuffer = this.diffPreviewContext
        ? this.diffPreviewContext.createImageData(this.canvasElement.width, this.canvasElement.height)
        : null;

      if (this.referenceFrame) {
        const pixelmatchOutput = Pixelmatch(
          this.referenceFrame.data,
          currentFrame.data,
          diffBuffer?.data ?? null,
          this.referenceFrame.width,
          this.referenceFrame.height,
          { threshold: this.pixelTriggerRadio, includeAA: true },
        );

        // visualize diff when debugging
        if (this.diffPreviewContext && diffBuffer) this.diffPreviewContext.putImageData(diffBuffer, 0, 0);

        const totalPixel = this.referenceFrame.width * this.referenceFrame.height;
        const diffPercentageV2 = pixelmatchOutput / totalPixel;
        const avgDiff = this.movingDiffAverage.add(diffPercentageV2);

        this.radioDisplay.textContent = (100 * avgDiff).toFixed(2).padStart(5, "0") + "%";
        this.captureMeter.value = avgDiff;

        this.referenceFrame = currentFrame;
        if (avgDiff > this.captureTriggerRatio) {
          this.diffStream$.next(avgDiff);
        }
      } else {
        this.referenceFrame = currentFrame;
      }

      requestAnimationFrame(this.processFrame.bind(this));
    }
  }

  private async initSetupForm(): Promise<void> {
    const webcamSelect = this.shadowRoot!.getElementById("webcamSelect") as HTMLSelectElement;

    const saveSelectedDevice = () => {
      if (webcamSelect) {
        const selectedDeviceId = webcamSelect.value;

        if (selectedDeviceId) {
          // Save the selected device ID in local storage
          localStorage.setItem("selectedWebcamDeviceId", selectedDeviceId);
          console.log("Webcam device ID saved:", selectedDeviceId);

          this.stop();
          this.start();
        }
      }
    };

    try {
      // Request access to media devices
      await navigator.mediaDevices.getUserMedia({ video: true });

      const videoDevices = await this.getDeviceList();

      if (webcamSelect) {
        videoDevices.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.textContent = device.label || `Camera ${index + 1}`;
          webcamSelect.appendChild(option);
        });

        webcamSelect.addEventListener("change", saveSelectedDevice);

        const previousSelected = localStorage.getItem("selectedWebcamDeviceId");
        if (previousSelected && videoDevices.some((device) => device.deviceId === previousSelected)) {
          webcamSelect.value = previousSelected;
        }

        const form = this.shadowRoot!.querySelector("form");
        const captureTriggerRatioInput = this.shadowRoot!.getElementById("captureTriggerRatio") as HTMLInputElement;
        const captureTriggerTextOutput = this.shadowRoot!.querySelector("[data-value=capturueTriggerRatio]");
        const pixelTriggerRadioInput = this.shadowRoot!.getElementById("pixelTriggerRadio") as HTMLInputElement;
        const pixelTriggerTextOutput = this.shadowRoot!.querySelector("[data-value=pixelTriggerRadio]");

        const previousCaptureTrigger = localStorage.getItem("captureTriggerRatio");
        const previousPixelTrigger = localStorage.getItem("pixelTriggerRadio");

        if (previousCaptureTrigger) {
          captureTriggerRatioInput.value = previousCaptureTrigger;
          this.captureTriggerRatio = parseFloat(previousCaptureTrigger);
          captureTriggerTextOutput!.textContent = (100 * this.captureTriggerRatio).toFixed(2) + "%";
          this.captureMeter.low = this.captureTriggerRatio;
        }

        if (previousPixelTrigger) {
          pixelTriggerRadioInput.value = previousPixelTrigger;
          this.pixelTriggerRadio = parseFloat(previousPixelTrigger);
          pixelTriggerTextOutput!.textContent = (100 * this.pixelTriggerRadio).toFixed(2) + "%";
        }

        // add formChangeEvent
        form?.addEventListener("input", () => {
          this.captureTriggerRatio = captureTriggerRatioInput.valueAsNumber;
          captureTriggerTextOutput!.textContent = (100 * this.captureTriggerRatio).toFixed(2) + "%";
          this.captureMeter.low = this.captureTriggerRatio;

          this.pixelTriggerRadio = pixelTriggerRadioInput.valueAsNumber;
          pixelTriggerTextOutput!.textContent = (100 * this.pixelTriggerRadio).toFixed(2) + "%";

          localStorage.setItem("captureTriggerRatio", this.captureTriggerRatio.toString());
          localStorage.setItem("pixelTriggerRadio", this.pixelTriggerRadio.toString());
        });
      }
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  }
}
