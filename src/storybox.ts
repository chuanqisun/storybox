import { filter, fromEvent, map, merge, tap } from "rxjs";
import { AIBar } from "./lib/ai-bar/lib/ai-bar";
import { CameraNode } from "./lib/ai-bar/lib/elements/camera-node";
import { OpenAIRealtimeNode } from "./lib/ai-bar/lib/elements/openai-realtime-node";
import type { TogetherAINode } from "./lib/ai-bar/lib/elements/together-ai-node";
import { loadAIBar } from "./lib/ai-bar/loader";
import { $, parseActionEvent } from "./lib/dom";
import { StoryEngine } from "./story-engine/story-engine";
import { getVision } from "./story-engine/vision";
import "./storybox.css";

loadAIBar();

const aiBar = $<AIBar>("ai-bar")!;
const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const connectButton = $<HTMLButtonElement>(`button[data-action="connect"]`)!;
const muteButton = $<HTMLButtonElement>(`button[data-action="mute"]`)!;
const cameraButton = $<HTMLButtonElement>(`button[data-action="enable-camera"]`)!;
const cameraNode = $<CameraNode>("camera-node")!;
const togetherAINode = $<TogetherAINode>("together-ai-node")!;
const debugCaption = $<HTMLElement>("#debug-caption")!;
const visualOutput = $<HTMLImageElement>("#visual-output")!;
const captionStatus = $<HTMLElement>("#caption-status")!;

const storyEngine = new StoryEngine();

const globalClick$ = fromEvent(document, "click").pipe(
  map(parseActionEvent),
  filter((e) => e.action !== null),
  tap(async (e) => {
    switch (e.action) {
      case "connect": {
        connectButton.textContent = "Connecting...";
        await realtime.start();
        storyEngine.start();
        connectButton.textContent = "Disconnect";
        connectButton.dataset.action = "disconnect";
        break;
      }
      case "disconnect": {
        connectButton.textContent = "Connect";
        connectButton.dataset.action = "connect";
        storyEngine.stop();
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

const { pendingDescriptionCount$, vision$ } = getVision();

const renderCaptionStatus$ = pendingDescriptionCount$.pipe(
  tap((count) => {
    if (!count) {
      captionStatus.textContent = "Ready";
    } else {
      captionStatus.textContent = `Pending: ${count}`;
    }
  }),
);

globalClick$.subscribe();
merge(vision$, renderCaptionStatus$).subscribe();
