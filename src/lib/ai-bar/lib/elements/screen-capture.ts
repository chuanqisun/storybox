import type { VisionProvider } from "../types";
import { attachShadowHtml } from "../wc-utils/attach-html";

export class ScreenCapture extends HTMLElement implements VisionProvider {
  private activeStream: MediaStream | null = null;
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;

  constructor() {
    super();
    this.drawVideoFrame = this.drawVideoFrame.bind(this);
  }

  shadowRoot = attachShadowHtml(
    this,
    `
    <style>
    canvas,video {
      display: block;
      max-width: 200px;
    }

    video {
      visibility: hidden
      width: 0;
      height: 0;
    }

    button {
      font-size: 16px;
    }

    :host:not([debug]) {
      canvas {
        display: none;        
      }
    }
    </style>
    <button title="Capture Screen" aria-pressed="false">📸</button>
    <video autoplay playsinline muted></video>
    <canvas></canvas>
  `
  );
  connectedCallback() {
    this.video = this.shadowRoot.querySelector("video")!;
    this.canvas = this.shadowRoot.querySelector("canvas")!;
    this.context = this.canvas.getContext("2d")!;

    this.setAttribute("provides", "toolbar-item vision");
    this.shadowRoot.querySelector("button")?.addEventListener("click", async () => {
      if (this.activeStream) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  public async getImageDataUrl() {
    if (!this.activeStream) return null;
    return this.canvas.toDataURL("image/webp");
  }

  private async start() {
    if (this.activeStream) return;

    this.activeStream = await navigator.mediaDevices.getDisplayMedia({
      selfBrowserSurface: "include",
      video: {
        frameRate: {
          ideal: 1,
          max: 1,
        },
      },
      audio: false,
    } as any);

    this.shadowRoot.querySelector("button")!.setAttribute("aria-pressed", "true");
    this.shadowRoot.querySelector("button")!.textContent = "🛑";

    this.video.srcObject = this.activeStream;
    console.log("connected to video");

    this.video.requestVideoFrameCallback(this.drawVideoFrame);
  }

  private drawVideoFrame() {
    if (!this.activeStream) return;

    const maxSideLength = 1920;
    const scaleDownFactor = Math.max(this.video.videoWidth, this.video.videoHeight) / maxSideLength;

    this.canvas.width = this.video.videoWidth / scaleDownFactor;
    this.canvas.height = this.video.videoHeight / scaleDownFactor;
    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    this.video.requestVideoFrameCallback(this.drawVideoFrame);
  }

  private stop() {
    this.activeStream?.getTracks()?.forEach((track) => track.stop());
    this.activeStream = null;
    this.shadowRoot.querySelector("button")!.setAttribute("aria-pressed", "false");
    this.shadowRoot.querySelector("button")!.textContent = "📸";
  }
}

export function defineScreenCapture(tagName = "screen-capture") {
  customElements.define(tagName, ScreenCapture);
}
