import { filter, fromEvent, map, tap } from "rxjs";
import { CameraNode } from "./lib/ai-bar/lib/elements/camera-node";
import { OpenAIRealtimeNode } from "./lib/ai-bar/lib/elements/openai-realtime-node";
import { loadAIBar } from "./lib/ai-bar/loader";
import { $, parseActionEvent } from "./lib/dom";
import { StoryEngine } from "./story-engine/story-engine";

import { defineAvatarElement } from "./components/avatar-element";
import type { AzureSttNode } from "./lib/ai-bar/lib/elements/azure-stt-node";
import type { AzureTtsNode } from "./lib/ai-bar/lib/elements/azure-tts-node";
import "./main.css";

loadAIBar();
defineAvatarElement();

const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const connectButton = $<HTMLButtonElement>(`button[data-action="connect"]`)!;
const muteButton = $<HTMLButtonElement>(`button[data-action="mute"]`)!;
const cameraButton = $<HTMLButtonElement>(`button[data-action="enable-camera"]`)!;
const cameraNode = $<CameraNode>("camera-node")!;
const azureSttNode = $<AzureSttNode>("azure-stt-node")!;
const azureTtsNode = $<AzureTtsNode>("azure-tts-node")!;

const storyEngine = new StoryEngine();

const globalClick$ = fromEvent(document, "click").pipe(
  map(parseActionEvent),
  filter((e) => e.action !== null),
  tap(async (e) => {
    switch (e.action) {
      case "present": {
        $<HTMLElement>(".app-layout")!.classList.add("presenting");
        break;
      }
      case "connect": {
        connectButton.textContent = "Connecting...";
        await realtime.start();
        storyEngine.start();
        azureSttNode.startMicrophone();
        azureTtsNode.startSpeaker();
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
        await realtime.muteMicrophone();
        break;
      }
      case "unmute": {
        muteButton.textContent = "Mute";
        muteButton.dataset.action = "mute";
        await realtime.unmuteMicrophone();
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
      case "debug-scenes": {
        storyEngine.debugScenes();
        break;
      }
    }
  }),
);

globalClick$.subscribe();
