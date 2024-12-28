import { attachShadowHtml } from "../wc-utils/attach-html";

export function defineMicrophoneNode() {
  customElements.define("microphone-node", MicrophoneNode);
}

export class MicrophoneNode extends HTMLElement {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private animationFrameId: number | null = null;

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
<button>🎙️</button>
<dialog style="width: min(60rem, calc(100vw - 32px))">
  <form method="dialog">
    <label for="microphone">Select Microphone</label>
    <select name="microphone" id="microphoneSelect">
        <option value="" disabled selected>Select a microphone</option>
    </select>
    <label for="volume-meter">Volume meter<span id="volume-display"></span></label>
    <meter id="volume-meter" min="0" max="1"></meter>
    <button>OK</button>
  </form>
</dialog>
    `.trim(),
  );

  connectedCallback() {
    this.setAttribute("provides", "toolbar-item");
    this.shadowRoot.querySelector("button")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("dialog")?.showModal();
      this.start();
    });
    this.initSetupForm();

    // handle modal close
    this.shadowRoot.querySelector("dialog")?.addEventListener("close", () => {
      this.stop();
    });
  }

  get selectedDeviceId(): string | undefined {
    return localStorage.getItem("selectedMicrophoneDeviceId") ?? "";
  }

  async getDeviceList(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "audioinput");
    } catch (error) {
      console.error("Error enumerating devices:", error);
      return [];
    }
  }

  async start(): Promise<void> {
    try {
      const selectedId = localStorage.getItem("selectedMicrophoneDeviceId");
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedId ? { exact: selectedId } : undefined,
        },
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Initialize audio context and analyser
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);

      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      this.updateVolumeMeter();
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private updateVolumeMeter(): void {
    if (!this.analyser || !this.dataArray) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    const volume = this.dataArray.reduce((acc, val) => acc + val, 0) / this.dataArray.length / 255;

    const volumeMeter = this.shadowRoot!.getElementById("volume-meter") as HTMLMeterElement;
    const volumeDisplay = this.shadowRoot!.getElementById("volume-display") as HTMLSpanElement;
    volumeMeter.value = volume;
    volumeDisplay.textContent = ` (${(volume * 100).toFixed(0)}%)`;

    this.animationFrameId = requestAnimationFrame(() => this.updateVolumeMeter());
  }

  private async initSetupForm(): Promise<void> {
    const microphoneSelect = this.shadowRoot!.getElementById("microphoneSelect") as HTMLSelectElement;

    const saveSelectedDevice = () => {
      if (microphoneSelect) {
        const selectedDeviceId = microphoneSelect.value;

        if (selectedDeviceId) {
          // Save the selected device ID in local storage
          localStorage.setItem("selectedMicrophoneDeviceId", selectedDeviceId);
          console.log("Microphone device ID saved:", selectedDeviceId);

          this.stop();
          this.start();
        }
      }
    };

    try {
      // Request access to media devices
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioDevices = await this.getDeviceList();

      if (microphoneSelect) {
        audioDevices.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.textContent = device.label || `Audio input ${index + 1}`;
          microphoneSelect.appendChild(option);
        });

        microphoneSelect.addEventListener("change", saveSelectedDevice);

        const previousSelected = localStorage.getItem("selectedMicrophoneDeviceId");
        if (previousSelected && audioDevices.some((device) => device.deviceId === previousSelected)) {
          microphoneSelect.value = previousSelected;
        }
      }
    } catch (error) {
      console.error("Error accessing media devices.", error);
    }
  }
}
