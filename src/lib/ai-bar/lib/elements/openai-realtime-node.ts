import { zodResponseFormat } from "openai/helpers/zod";
import type { AutoParseableResponseFormat } from "openai/lib/parser.mjs";
import { z } from "zod";
import { $ } from "../../../dom";
import type { AIBar } from "../ai-bar";
import type { MicrophoneNode } from "./microphone-node";

export type Tool<T extends OpenAICompatibleSchema> = {
  name: string;
  description: string;
  parameters: T;
  /** use may provide hand written json schema. Parameters will be ignored when schema is present */
  schema?: Record<string, any>;
  run: (parsedArgs: z.infer<T>) => string | Promise<string>;
};

export type OpenAICompatibleSchema = z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;

export interface ParsedTool extends Tool<any> {
  format?: AutoParseableResponseFormat<any>;
}

export function defineOpenAIRealtimeNode() {
  return customElements.define("openai-realtime-node", OpenAIRealtimeNode);
}

export const RealtimeEvents = {
  userTranscriptCompleted: "conversation.item.input_audio_transcription.completed",
  agentTranscriptDelta: "response.audio_transcript.delta",
  agentTranscriptDone: "response.audio_transcript.done",
};

const microphoneNode = $<MicrophoneNode>("microphone-node");

/**
 * OpenAI 4o Realtime Client
 */
export class OpenAIRealtimeNode extends HTMLElement {
  private connection: {
    dc?: RTCDataChannel;
    pc?: RTCPeerConnection;
  } = {};

  private sessionTools: ParsedTool[] = [];
  private draftToos: Tool<any>[] = [];

  static defineTool<T extends OpenAICompatibleSchema>(tool: Tool<T>) {
    return tool;
  }

  async start() {
    const { dc, pc } = await this.#getWebRTCConnections();
    this.connection = { dc, pc };

    // handle function calling
    dc.addEventListener("message", async (e) => {
      const data = JSON.parse(e.data);
      // console.log(data);

      if (data.type === "response.done") {
        const responseOutput = data.response?.output?.at(0);
        if (responseOutput) {
          const { status, name, type, call_id } = responseOutput;
          if (type === "function_call" && status === "completed") {
            const tool = this.sessionTools.find((tool) => tool.name === name);
            if (!tool) return;

            console.log(`[realtime] tool called ${tool.name}`);

            try {
              const parsedArgs =
                tool.format?.$parseRaw(responseOutput.arguments) ?? JSON.parse(responseOutput.arguments);
              const output = await tool.run(parsedArgs);

              this.replyFunctionCall(call_id, output).createResponse();
            } catch (e) {
              const errorMessage = [(e as any).name, (e as any).message].filter(Boolean).join(" ");
              this.replyFunctionCall(call_id, errorMessage).createResponse();
            }
          }
        }
      }

      if (data.type === RealtimeEvents.userTranscriptCompleted) {
        this.dispatchEvent(
          new CustomEvent<string>(RealtimeEvents.userTranscriptCompleted, { detail: data.transcript }),
        );
      }

      if (data.type === RealtimeEvents.agentTranscriptDelta) {
        this.dispatchEvent(new CustomEvent<string>(RealtimeEvents.agentTranscriptDelta, { detail: data.delta }));
      }

      if (data.type === RealtimeEvents.agentTranscriptDone) {
        this.dispatchEvent(new CustomEvent<string>(RealtimeEvents.agentTranscriptDone, { detail: data.transcript }));
      }
    });

    return { dc, pc };
  }

  private replyFunctionCall(call_id: string, output: string) {
    this.connection?.dc?.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id,
          output,
        },
      }),
    );

    return this;
  }

  stop() {
    this.connection?.dc?.close();
    this.connection?.pc?.close();
    this.connection = {};
  }

  enableTranscription() {
    this.updateSession({
      input_audio_transcription: {
        model: "whisper-1",
      },
    });
  }

  disableTranscription() {
    this.updateSession({
      input_audio_transcription: null,
    });
  }

  updateSessionInstructions(instructions: string) {
    console.log(`[realtime] instruction changed`, { instructions });
    this.connection?.dc?.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: instructions.trim(),
        },
      }),
    );

    return this;
  }

  appendUserMessage(text: string) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      },
    };
    this.connection?.dc?.send(JSON.stringify(event));
    return this;
  }

  updateSession(update: any) {
    this.connection?.dc?.send(
      JSON.stringify({
        type: "session.update",
        session: {
          ...update,
        },
      }),
    );

    return this;
  }

  addDraftTool<T extends z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>>(tool: Tool<T>) {
    this.draftToos.push(tool);
    return this;
  }

  commitDraftTools(tool_choice: "auto" | "required" = "auto") {
    this.sessionTools = this.draftToos.map((tool) => {
      const formatedTool = tool.schema ? (null as any) : zodResponseFormat(tool.parameters, tool.name);
      return {
        ...tool,
        format: formatedTool,
      };
    });

    const serverTools = this.sessionTools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.schema ?? tool.format!.json_schema.schema!,
    }));

    this.connection?.dc?.send(
      JSON.stringify({
        type: "session.update",
        session: {
          tools: serverTools,
          tool_choice,
        },
      }),
    );

    this.draftToos = [];

    return this;
  }

  createResponse() {
    this.connection?.dc?.send(
      JSON.stringify({
        type: "response.create",
        response: {},
      }),
    );

    return this;
  }

  async #getWebRTCConnections() {
    // Get an ephemeral key from your server - see server code below
    const EPHEMERAL_KEY = await this.#getEphemeralKey();

    const pc = new RTCPeerConnection();

    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: {
          ideal: microphoneNode?.selectedDeviceId,
        },
      },
    });
    pc.addTrack(ms.getTracks()[0]);

    const dc = pc.createDataChannel("oai-events");

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    // waitg for dc channel to open
    await new Promise<void>((resolve) => dc.addEventListener("open", () => resolve(), { once: true }));

    return {
      dc,
      pc,
    };
  }

  async #getEphemeralKey() {
    const credentials = this.closest<AIBar>("ai-bar")?.getAzureConnection();
    if (!credentials)
      throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "echo",
      }),
    });

    const data = await response.json();

    // return the data to the client
    return data.client_secret.value as string;
  }

  interrupt() {
    this.connection?.dc?.send(
      JSON.stringify({
        type: "response.cancel",
      }),
    );

    return this;
  }

  muteMicrophone() {
    this.connection?.pc?.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === "audio") {
        sender.track.enabled = false;
      }
    });
  }

  unmuteMicrophone() {
    this.connection?.pc?.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === "audio") {
        sender.track.enabled = true;
      }
    });
  }

  muteSpeaker() {
    this.connection?.pc?.getReceivers().forEach((receiver) => {
      if (receiver.track && receiver.track.kind === "audio") {
        receiver.track.enabled = false;
      }
    });
  }

  unmuteSpeaker() {
    this.connection?.pc?.getReceivers().forEach((receiver) => {
      if (receiver.track && receiver.track.kind === "audio") {
        receiver.track.enabled = true;
      }
    });
  }
}
