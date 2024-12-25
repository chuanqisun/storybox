import { filter, fromEvent, map, switchMap, tap } from "rxjs";
import { AIBar } from "./lib/ai-bar/lib/ai-bar";
import { CameraNode } from "./lib/ai-bar/lib/elements/camera-node";
import { OpenAIRealtimeNode } from "./lib/ai-bar/lib/elements/openai-realtime-node";
import type { TogetherAINode } from "./lib/ai-bar/lib/elements/together-ai-node";
import { loadAIBar } from "./lib/ai-bar/loader";
import { $, parseActionEvent } from "./lib/dom";
import { StoryEngine } from "./story-engine/state";
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
const debugOutput = $<HTMLImageElement>("#debug-output")!;
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

const { vision$, stableVision$, pendingDescriptionCount$ } = getVision();

const visualize$ = stableVision$.pipe(
  tap((state) => {
    debugCaption.textContent = state.description;
  }),
  switchMap(async (state) => {
    // const dataUrl = await togetherAINode.generateImageDataURL(
    //   state.description +
    //     ` Render in Needle felted miniature scene. The color palette is muted and pastel, featuring various shades of orange, pink, green, and teal. The lighting is soft and diffused, creating a gentle, whimsical atmosphere. The overall style is reminiscent of children's book illustration, with a focus on texture and detail. The rendering is highly detailed, with a focus on the texture of the felt and the three-dimensionality of the miniature elements.  The scene is highly saturated, but the colors are soft and not harsh. The overall feel is cozy and inviting.`,
    // );
    // debugOutput.src = dataUrl;
  }),
);

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
renderCaptionStatus$.subscribe();
visualize$.subscribe();
