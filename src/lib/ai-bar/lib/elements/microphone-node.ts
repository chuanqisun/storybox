import { attachShadowHtml } from "../wc-utils/attach-html";

export function defineMicrophoneNode() {
  customElements.define("microphone-node", MicrophoneNode);
}

export class MicrophoneNode extends HTMLElement {
  private stream: MediaStream | null = null;

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
  <form  method="dialog">
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

    // handle model close
    this.shadowRoot.querySelector("dialog")?.addEventListener("close", () => {
      this.stop();
    });
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
    } catch (error) {
      console.error("Error accessing webcam:", error);
    }
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
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
