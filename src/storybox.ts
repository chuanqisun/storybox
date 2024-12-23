import { debounceTime, filter, fromEvent, map, switchMap, tap } from "rxjs";
import { CameraNode } from "./lib/ai-bar/lib/elements/camera-node";
import { LlmNode } from "./lib/ai-bar/lib/elements/llm-node";
import { OpenAIRealtimeNode } from "./lib/ai-bar/lib/elements/openai-realtime-node";
import { system } from "./lib/ai-bar/lib/message";
import { loadAIBar } from "./lib/ai-bar/loader";
import { $, parseActionEvent } from "./lib/dom";
import "./storybox.css";

loadAIBar();

const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const connectButton = $<HTMLButtonElement>(`button[data-action="connect"]`)!;
const muteButton = $<HTMLButtonElement>(`button[data-action="mute"]`)!;
const cameraButton = $<HTMLButtonElement>(`button[data-action="enable-camera"]`)!;
const cameraNode = $<CameraNode>("camera-node")!;
const debugCapture = $<HTMLImageElement>("#debug-capture")!;

const globalClick$ = fromEvent(document, "click").pipe(
  map(parseActionEvent),
  filter((e) => e.action !== null),
  tap(async (e) => {
    switch (e.action) {
      case "connect": {
        connectButton.textContent = "Connecting...";
        await realtime.start();
        connectButton.textContent = "Disconnect";
        connectButton.dataset.action = "disconnect";
        break;
      }
      case "disconnect": {
        connectButton.textContent = "Connect";
        connectButton.dataset.action = "connect";
        await realtime.stop();
        break;
      }
      case "mute": {
        muteButton.textContent = "Unmute";
        muteButton.dataset.action = "unmute";
        await realtime.mute();
        break;
      }
      case "unmute": {
        muteButton.textContent = "Mute";
        muteButton.dataset.action = "mute";
        await realtime.unmute();
        break;
      }
      case "enable-camera": {
        const defaultDevice = (await cameraNode.getDeviceList()).at(0);
        cameraNode.start(defaultDevice?.deviceId);
        cameraButton.dataset.action = "disable-camera";
        cameraButton.textContent = "Disable Camera";
        break;
      }
      case "disable-camera": {
        cameraNode.stop();
        cameraButton.dataset.action = "enable-camera";
        cameraButton.textContent = "Enable Camera";
        break;
      }
    }
  }),
);

const vision$ = fromEvent(cameraNode, "framechange").pipe(
  debounceTime(1000),
  switchMap(async () => {
    const frame = cameraNode.capture();
    debugCapture.src = frame;
    const llm = $<LlmNode>("llm-node")!;
    const aoai = llm.getClient("openai");
    const response = await aoai.chat.completions.create({
      messages: [
        system`Describe the image in one brief sentence. Focus on objects in the foreground.`,
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: frame,
              },
            },
          ],
        },
      ],
      model: "gpt-4o-mini",
    });

    const description = response.choices[0].message.content;
    console.log(description);
  }),
);

globalClick$.subscribe();
vision$.subscribe();
