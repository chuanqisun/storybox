import Danmaku from "danmaku";
import { html, render } from "lit";
import {
  BehaviorSubject,
  concatMap,
  delay,
  distinct,
  distinctUntilChanged,
  distinctUntilKeyChanged,
  filter,
  finalize,
  firstValueFrom,
  from,
  fromEvent,
  last,
  map,
  merge,
  of,
  share,
  skipWhile,
  startWith,
  Subject,
  Subscription,
  switchMap,
  take,
  takeWhile,
  tap,
} from "rxjs";
import z from "zod";
import { AvatarElement } from "../components/avatar-element";
import { AzureDalleNode } from "../lib/ai-bar/lib/elements/azure-dalle-node";
import { AzureSttNode } from "../lib/ai-bar/lib/elements/azure-stt-node";
import { AzureTtsNode, type StateChangeEventDetail } from "../lib/ai-bar/lib/elements/azure-tts-node";
import type { ElevenLabsTtsNode } from "../lib/ai-bar/lib/elements/eleven-labs-tts-node";
import { LlmNode } from "../lib/ai-bar/lib/elements/llm-node";
import { RealtimeEvents, type OpenAIRealtimeNode } from "../lib/ai-bar/lib/elements/openai-realtime-node";
import type { TogetherAINode } from "../lib/ai-bar/lib/elements/together-ai-node";
import type { AIBarEventDetail } from "../lib/ai-bar/lib/events";
import { assistant, system, user } from "../lib/ai-bar/lib/message";
import { $, $all, getDetail } from "../lib/dom";
import { parseJsonStream } from "../lib/json-stream";
import { tryParse } from "../lib/parse";
import { getCaption } from "./caption";
import {
  getCharacterPrompt,
  getScenePrompt,
  getStoryboardSystemPrompt,
  getStoryboardUserPrompt,
  getTrailPrompt,
} from "./render-prompts";
import { getVision } from "./vision";
import { characterFallbackVoice, narratorVoice, voiceOptions, type VoiceOption } from "./voice-map";

export interface StoryState {
  stage: "new" | "customizing" | "editing" | "trailer";
  style: "realistic" | "flet" | "paper" | "manga";
  characters: StoryCharacter[];
  scenes: StoryScene[];
  story: string;
  guests: StoryGuest[];
  vision: string;
  trailer: TrailerScene[];
}

export interface StoryCharacter {
  dailyObject: string;
  characterName: string;
  characterBackstory: string;
  characterVisualSketch: string;
  imageUrl?: string;
}

export interface StoryScene {
  placeholderImgUrl: string;
  imageUrl?: string;
  narration: string;
  caption: string;
  refinedCaption: string;
}

export interface StoryGuest {
  name: string;
  background: string;
  expression: string;
}

export interface TrailerScene {
  isActive?: boolean;
  isCover?: boolean;
  isEnding?: boolean;
  sceneDescription: string;
  imageUrl?: string;
  voiceTracks: VoiceTrack[];
  reactions?: { username: string; message: string }[];
  played?: boolean;
}

export interface VoiceTrack {
  timestamp: string;
  speaker: string;
  utterance: string;
}

// AI nodes
const azureDalleNode = $<AzureDalleNode>("azure-dalle-node")!;
const azureSttNode = $<AzureSttNode>("azure-stt-node")!;
const azureTtsNode = $<AzureTtsNode>("azure-tts-node")!;
const eleventLabsTtsNode = $<ElevenLabsTtsNode>("eleven-labs-tts-node")!;
const llmNode = $<LlmNode>("llm-node")!;
const realtime = $<OpenAIRealtimeNode>("openai-realtime-node")!;
const togetherAINode = $<TogetherAINode>("together-ai-node")!;

// DOM Elements
const timeline = $<HTMLElement>("#timeline")!;
const captionStatus = $<HTMLElement>("#caption-status")!;
const charactersGrid = $<HTMLElement>("#characters")!;
const guests = $<HTMLElement>("#guests")!;
const trailerImage = $<HTMLImageElement>("#trailer-image")!;
const danmuContainer = $<HTMLElement>("#danmu")!;
const endingTitle = $<HTMLElement>("#ending-title")!;
const appLayout = $<HTMLElement>(".app-layout")!;

const vision = getVision();
const caption = getCaption();

const state$ = new BehaviorSubject<StoryState>({
  stage: "new",
  style: "realistic",
  characters: [],
  scenes: [],
  story: "",
  guests: [],
  vision: "",
  trailer: [],
});

const characterImagePrompt$ = new Subject<{ characterName: string; characterDescription: string }>();

export class StoryEngine {
  private subs: Subscription[] = [];
  private history = [] as string[];
  private danmaku: Danmaku | null = null;

  start() {
    const sharedSub = merge(this.useVisionLoadCounter(), this.useCaption()).subscribe();
    const stateSub = state$
      .pipe(
        tap((state) => console.log("debug state", state)),
        distinctUntilKeyChanged("stage"),
        switchMap(({ stage }) => {
          appLayout.setAttribute("data-stage", stage);

          switch (stage) {
            case "customizing": {
              return merge(
                this.useStableVision(),
                this.useCharacterBuilderInstruction(),
                this.useCharactersDisplay(),
                this.useIncrementalVision(),
                this.useCharacterGrid(),
              );
            }
            case "editing": {
              // FIXME: avoid using manual timing
              setTimeout(() => {
                realtime
                  .appendUserMessage("Please use add_next_scene to create the opening scene now")
                  .createResponse();
              }, 1000);

              this.generateGuests();

              return merge(
                this.useSceneDisplay(),
                this.useRenderGuests(),
                this.useGuestInterview(),
                this.useSceneEditorInstruction(),
                this.useStableVision(),
                this.useIncrementalVision(),
              );
            }

            case "trailer": {
              caption.clear();
              realtime.muteMicrophone();
              // realtime.muteSpeaker();
              this.generateTrailer();

              if (!this.danmaku) {
                this.danmaku = new Danmaku({ container: danmuContainer, speed: 120 });
              }

              return merge(
                this.useTrailerControl(),
                this.useTrailerPlay(),
                this.useTrailerVoiceover(),
                this.useTrailerAutoControl(),
                this.useTrailerDanmaku(),
              );
            }
          }

          return of();
        }),
      )
      .subscribe();

    this.changeStage("customizing");

    this.subs.push(sharedSub, stateSub);
  }

  stop() {
    this.subs.forEach((sub) => sub.unsubscribe());
    this.subs = [];
    this.danmaku?.destroy();
    this.danmaku = null;
  }

  useVisionLoadCounter() {
    return vision.pendingDescriptionCount$.pipe(
      tap((count) => {
        captionStatus.textContent = `${count} pending`;
      }),
    );
  }

  // SHARED
  useStableVision() {
    return vision.stableVision$.pipe(
      tap((visionUpdate) => {
        state$.next({ ...state$.value, vision: visionUpdate.description });
      }),
    );
  }

  useIncrementalVision() {
    return vision.stableVision$.pipe(
      tap((visionUpdate) => {
        realtime.appendUserMessage(`Now I'm showing you: ${visionUpdate.description}`);
      }),
    );
  }

  useCaption() {
    const agentTranscript$ = fromEvent(realtime, RealtimeEvents.agentTranscriptDelta).pipe(
      map(getDetail<string>),
      delay(1500),
      tap((transcript) => caption.appendPartial(`Narrator`, transcript)),
    );
    const userTranscript$ = fromEvent(realtime, RealtimeEvents.userTranscriptCompleted).pipe(
      map(getDetail<string>),
      filter((transcript) => transcript.trim().length > 0),
      tap((transcript) => caption.appendPartial(`User`, transcript + " ")),
    );

    return merge(agentTranscript$, userTranscript$);
  }

  // STAGE 1 - CUSTOMIZING
  useCharactersDisplay() {
    return characterImagePrompt$.pipe(
      switchMap(async (prompt) => {
        togetherAINode
          .generateImageDataURL(getCharacterPrompt(prompt.characterDescription), {
            width: 480,
            height: 400,
          })
          .then((dataUrl) => {
            state$.next({
              ...state$.value,
              characters: state$.value.characters.map((e) =>
                e.characterName === prompt.characterName ? { ...e, imageUrl: dataUrl } : e,
              ),
            });
          });
      }),
    );
  }

  useCharacterBuilderInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.characters, state.vision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "create_character",
            description: "Create a character in the story",
            parameters: z.object({
              dailyObject: z.string().describe("The real world object the user has shown"),
              characterName: z.string().describe("The name the character in the story"),
              characterBackstory: z.string().describe("Backstory, personality, origin of the character"),
              characterVisualSketch: z
                .string()
                .describe(
                  "Detailed visual description of the character, including age, ethnicity, gender, skin color, facial features, body build, hair style and color, clothing, accessories etc",
                ),
            }),
            run: (args) => {
              const newCharacter: StoryCharacter = {
                dailyObject: args.dailyObject,
                characterName: args.characterName,
                characterBackstory: args.characterBackstory,
                characterVisualSketch: args.characterVisualSketch,
              };

              state$.next({
                ...state$.value,
                characters: [...state$.value.characters, newCharacter],
              });

              characterImagePrompt$.next({
                characterName: args.characterName,
                characterDescription: args.characterVisualSketch,
              });

              return `Character added: ${args.dailyObject} represents ${args.characterName} (${args.characterBackstory})`;
            },
          })
          .addDraftTool({
            name: "remove_character",
            description: "Remove a character in the story",
            parameters: z.object({
              characterName: z.string().describe("The name of the character in the story"),
            }),
            run: (args) => {
              const existing = state$.value.characters.find((e) => e.characterName === args.characterName);
              if (!existing) return "Character not found";

              state$.next({
                ...state$.value,
                characters: state$.value.characters.filter((e) => e.characterName !== args.characterName),
              });

              return `Character ${args.characterName} is removed.`;
            },
          })
          .addDraftTool({
            name: "change_character",
            description: "Change a character in the story",
            parameters: z.object({
              previousCharacterName: z.string().describe("The current name of the character in the story"),
              update: z
                .object({
                  characterName: z.string().describe("The name the character in the story"),
                  characterBackstory: z.string().describe("Backstory, personality, origin of the character"),
                  characterVisualSketch: z
                    .string()
                    .describe(
                      "Detailed visual description of the character, including age, ethnicity, gender, skin color, facial features, body build, hair style and color, clothing, accessories etc",
                    ),
                })
                .describe("The updated name and description of the character in the story"),
            }),
            run: (args) => {
              const existing = state$.value.characters.find((e) => e.characterName === args.previousCharacterName);
              if (!existing) return "Character not found";

              const updatedElement: StoryCharacter = {
                ...existing,
                characterName: args.update.characterName,
                characterBackstory: args.update.characterBackstory,
                characterVisualSketch: args.update.characterVisualSketch,
              };

              characterImagePrompt$.next({
                characterName: args.update.characterName,
                characterDescription: updatedElement.characterVisualSketch,
              });

              state$.next({
                ...state$.value,
                characters: state$.value.characters.map((e) =>
                  e.characterName === args.previousCharacterName ? updatedElement : e,
                ),
              });

              return `Character changed: ${existing.dailyObject} now represents ${args.update.characterName} in the story.`;
            },
          })
          .addDraftTool({
            name: "start_story",
            description: "Start the story",
            parameters: z.object({}),
            run: () => {
              this.generateStory().then((story) => {
                if (!story.length) return "Error generating stories. Tell user to change the story or try again.";

                state$.next({
                  ...state$.value,
                  story,
                });

                this.history.push(`User: I'm creating scenes for the story: ${story}`);

                this.changeStage("editing");
              });

              return "Tell the use the story will start now.";
            },
          })
          .commitDraftTools()
          .updateSessionInstructions(
            `
You are hosting a workshop to help user understand and solve business problems by storytelling. The user is designing characters for the story.
The user will show you daily objects they would like to use to represent the characters in the story.
Your job is to keep track of what each daily object represents in the story.

${
  state.characters.length
    ? `Here is what you and user have agreed on so far:

${state.characters
  .map((ele) =>
    `
Daily object: ${ele.dailyObject} 
Character: ${ele.characterName} (${ele.characterBackstory})
  `.trim(),
  )
  .join("\n\n")}`
    : ""
}

The user is currently showing you: ${state.vision}

Now interact with the user in one of the following ways:
- Use the create_character tool to update your memory with the new information.
- Use change_character or remove_character tool to update your memory with the latest instruction from the user
- When user is ready, use the start_story tool to start the story. Do NOT start_story without user's explicit permission.

After each tool use, you MUST concisely tell user what you did.
          `.trim(),
          );
      }),
    );
  }

  useCharacterGrid() {
    return state$.pipe(
      map(
        (state) =>
          html`${state.characters.map(
            (character) => html`
              <div class="media-card">
                <img src="${character.imageUrl ?? `https://placehold.co/400?text=Sketching...`}" />
                <p>${character.characterName}</p>
              </div>
            `,
          )}`,
      ),
      tap((htmlTemplate) => render(htmlTemplate, charactersGrid)),
    );
  }

  async generateStory() {
    const aoai = llmNode.getClient("aoai");
    const story = await aoai.chat.completions.create({
      messages: [
        system`You are a talented story writer for business related storytelling. Write a stunning narrative featuring these elements:

${state$.value.characters.map((ele) => `${ele.characterName} (${ele.characterBackstory})`).join("\n")}

You must write a high level narrative for the story and leave out all the details. The narrative should be one very concise paragraph.

Respond in valid JSON, with the following type interface:

{
  story: string;
}
        
        `,
      ],
      model: "gpt-4o",
      response_format: {
        type: "json_object",
      },
    });

    const parsedStory = tryParse<{ story: string }>(story.choices[0].message.content!, {
      story: "",
    }).story;

    return parsedStory;
  }

  // STAGE 2 - EDITING
  useSceneDisplay() {
    return state$.pipe(
      map(
        (state) =>
          html`${state.scenes.map(
            (scene, i) => html`
              <div class="media-card text-first text-left" .hidden=${i !== state.scenes.length - 1}>
                <p>${scene.narration}</p>
                <img src="${scene.imageUrl ?? scene.placeholderImgUrl}" />
              </div>
            `,
          )}`,
      ),
      tap((htmlTemplate) => render(htmlTemplate, timeline)),
    );
  }

  async generateGuests() {
    const guestAvatars = [...$all<AvatarElement>("avatar-element")];
    const names = guestAvatars.map((avatar) => avatar.getAttribute("data-name")!);

    state$.next({
      ...state$.value,
      guests: guestAvatars.map((avatar) => ({
        name: avatar.getAttribute("data-name")!,
        background: "General audience", // To be replaced after generation
        expression: "smile",
      })),
    });

    const stream = await llmNode
      .getClient("aoai")
      .chat.completions.create({
        stream: true,
        messages: [
          system`You are organizing a collaborative storytelling events. Based on the main characters of the story and the names of the provided guest list, infer the diverse and story related background for each guest. Respond in this valid JSON format:
{
  guests: {
    name: ${names.join(" | ")},
    background: string, // detailed background of the guest, including age, gender, ethnicity, hometown, occupation, and personal details related to the story
  }[]        
}
        `,
          user`
Main characters:
${state$.value.characters.map((ele) => `${ele.characterName} (${ele.characterBackstory})`).join("\n")}

Guest list:
${guestAvatars.map((avatar, i) => `Guest ${i + 1}: ${avatar.getAttribute("data-name")!} (${avatar.getAttribute("data-gender")})`).join("\n")}
        `,
        ],
        model: "gpt-4o",
        temperature: 0.7,
        response_format: {
          type: "json_object",
        },
      })
      .then(parseJsonStream);

    stream
      .pipe(
        filter((value) => typeof value.key === "number"),
        tap((v) => {
          state$.next({
            ...state$.value,
            guests: state$.value.guests.map((guest) =>
              guest.name === (v.value as any).name ? { ...guest, background: (v.value as any).background } : guest,
            ),
          });
        }),
      )
      .subscribe();
  }

  useRenderGuests() {
    return state$.pipe(
      concatMap((state) => state.guests),
      tap((guest) => {
        const avatar = $<AvatarElement>(`avatar-element[data-name="${guest.name}"]`);
        avatar?.setAttribute("data-mouth", guest.expression);
        avatar?.setAttribute("data-background", guest.background);
      }),
    );
  }

  useGuestInterview() {
    let currentGuest: AvatarElement | null = null;
    let currentTasks: AbortController[] = [];

    const getAvatarName = (e: Event) => (e.target as HTMLElement).closest("avatar-element") as AvatarElement;

    const mouseDown$ = fromEvent(guests, "mousedown").pipe(
      map(getAvatarName),
      filter((name) => !!name),
      tap((avatar) => {
        currentGuest = avatar;
        azureSttNode.start();
        azureTtsNode.clear(); // intent to interrupt
        currentTasks.forEach((task) => task.abort());
        currentTasks = [];
        realtime.muteMicrophone();
        realtime.interrupt();
        AvatarElement.setSpeaking(undefined, false);
      }),
    );
    const mouseUp$ = fromEvent(guests, "mouseup").pipe(
      map(getAvatarName),
      filter((name) => !!name),
      tap(() => {
        azureSttNode.stop();
        realtime.unmuteMicrophone();
      }),
    );

    const updateSpeakingVoice$ = fromEvent<CustomEvent<StateChangeEventDetail>>(azureTtsNode, "statechange").pipe(
      tap((event) => {
        const { voice, isOn } = (event as CustomEvent<StateChangeEventDetail>).detail;
        AvatarElement.setSpeaking(voice, isOn);
      }),
    );

    const handleUserSpeech$ = fromEvent<CustomEvent<AIBarEventDetail>>(azureSttNode, "event").pipe(
      tap(async (event) => {
        if (!event.detail.recognized) return;

        // unconditionally intercept all speech events
        event.preventDefault();
        event.stopImmediatePropagation();

        if (!event.detail.recognized?.text) return;

        const recognizedText = event.detail.recognized.text;
        console.log({ recognizedText });

        const latestScene = state$.value.scenes.at(-1)!;

        const that = this;

        const abortController = new AbortController();
        currentTasks.push(abortController);
        const response = await llmNode.getClient("aoai").beta.chat.completions.runTools(
          {
            messages: [
              system`
Simulate an audience interview during a visual storytelling workshop. The user is interviewing the following audience:
${state$.value.guests.map((guest) => `${guest.name} (${guest.background})`).join("\n")}

Previous transcript:
${this.history.join("\n")}

User is currently showing on screen: ${latestScene.caption}
User is pointing the microphone at ${currentGuest?.getAttribute("data-name")}, but other guests may continue the discussion. 

Now use the speak_as tool to simulate the audience response, including **exaggerated** facial expression.
After speaking, respond with one sentence summarizing the audience response.

              `,
              user`${recognizedText}`,
            ],
            model: "gpt-4o",
            tools: [
              {
                type: "function",
                function: {
                  function: function speak_as(props: { name: string; utterance: string; expression: string }) {
                    azureTtsNode
                      .queue(props.utterance, {
                        voice: $<AvatarElement>(`avatar-element[data-name="${props.name}"]`)?.getAttribute(
                          "data-voice-id",
                        )!,
                        onStart: () => {
                          $<AvatarElement>(`avatar-element[data-name="${props.name}"]`)?.setExpression(
                            props.expression,
                          );

                          caption.appendLine(`${props.name}: ${props.utterance}`);
                        },
                      })
                      .then(() => {
                        $<AvatarElement>(`avatar-element[data-name="${props.name}"]`)?.setExpression("smile");
                        that.history.push(`${props.name}: ${props.utterance}`);
                        console.log(`${props.name}: ${props.utterance}`);
                      });

                    return `${props.name} ended speaking`;
                  },
                  description: "Speak as one of the guests",
                  parse: JSON.parse,

                  parameters: {
                    type: "object",
                    required: ["name", "utterance", "expression"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the character",
                        enum: state$.value.guests.map((guest) => guest.name),
                      },
                      utterance: {
                        type: "string",
                        description: "One sentence brief utterance",
                      },
                      expression: {
                        enum: AvatarElement.expressionOptions.filter((e) => e !== "smile"),
                        description: "Exaggerated facial expression during utterance",
                      },
                    },
                  },
                },
              },
            ],
          },
          {
            signal: abortController.signal,
          },
        );

        // store user speech after the response is generated
        this.history.push(`User: ${recognizedText}`);

        const summary = await response.finalContent();
        console.log(`[interview] summary: ${summary}`);
        realtime.appendUserMessage(`I just had a round of discussion with the guests. Here is the summary: ${summary}`);
      }),
    );

    return merge(mouseDown$, mouseUp$, updateSpeakingVoice$, handleUserSpeech$);
  }

  useSceneEditorInstruction() {
    return state$.pipe(
      distinct((state) => JSON.stringify([state.scenes, state.vision])),
      tap((state) => {
        realtime
          .addDraftTool({
            name: "add_next_scene",
            description: "Continue the story with a new scene",
            parameters: z.object({
              narration: z.string().describe("The story narration for the scene in one short sentence"),
              illustration: z
                .string()
                .describe("Describe a visual scene that complements or augments the narration in one concise sentence"),
            }),
            run: async (args) => {
              // select 2 other scenes to add consistency
              const otherScenes = state.scenes
                .filter((otherScene) => otherScene.narration && otherScene.refinedCaption)
                .slice(0, 2);

              const refinedCaption = await this.refineSceneCaption({
                state,
                fewShotScenes: otherScenes,
                narration: args.narration,
                illustration: args.illustration,
              });

              const dataUrl = await togetherAINode.generateImageDataURL(getScenePrompt(refinedCaption), {
                width: 768,
                height: 432,
              });

              state$.next({
                ...state$.value,
                scenes: [
                  ...state$.value.scenes,
                  {
                    placeholderImgUrl: dataUrl,
                    narration: args.narration,
                    caption: args.illustration,
                    refinedCaption,
                  },
                ],
              });

              guests.removeAttribute("hidden");

              this.history.push(`(User: I added scene ${state$.value.scenes.length}: ${args.narration}`);

              return `Scene ${state$.value.scenes.length} created. You must now respond with the narration: "${args.narration}"`;
            },
          })
          .addDraftTool({
            name: "edit_current_scene",
            description: "Edit the current scene",
            parameters: z.object({
              update: z.object({
                narration: z.string().describe("The story narration for the scene in one short sentence"),
                illustration: z
                  .string()
                  .describe(
                    "Describe a visual scene that complements or augments the narration in one concise sentence",
                  ),
              }),
            }),
            run: async (args) => {
              const previousScenes = state.scenes
                .slice(0, -1)
                .filter((scene) => scene.narration && scene.refinedCaption);
              const refinedCaption = await this.refineSceneCaption({
                state,
                fewShotScenes: previousScenes,
                narration: args.update.narration,
                illustration: args.update.illustration,
              });

              const dataUrl = await togetherAINode.generateImageDataURL(getScenePrompt(refinedCaption), {
                width: 768,
                height: 432,
              });

              state$.next({
                ...state$.value,
                scenes: state$.value.scenes.map((scene, i) =>
                  i === state$.value.scenes.length - 1
                    ? {
                        ...scene,
                        imageUrl: dataUrl,
                        narration: args.update.narration,
                        caption: args.update.illustration,
                        refinedCaption,
                      }
                    : scene,
                ),
              });

              this.history.push(`(User: I updated scene ${state$.value.scenes.length}: ${args.update.narration}`);

              return `Scene ${state$.value.scenes.length} updated.`;
            },
          })
          .addDraftTool({
            name: "convert_to_trailer",
            description: "Turn the story into a movie trailer",
            parameters: z.object({}),
            run: () => {
              this.changeStage("trailer");
              return "Done. Concisely let user seat back and enjoy the trailer. Don't spoil it";
            },
          })
          .commitDraftTools() // clear previous tools
          .updateSessionInstructions(
            `
You are a talented storyteller. You are developing a story with the user to help them understand and solve business problems. 
You and the user have agreed on using the following daily objects to represent characters in the story:

${state.characters
  .map((ele) =>
    `
Daily object: ${ele.dailyObject} 
Character: ${ele.characterName} (${ele.characterBackstory})
  `.trim(),
  )
  .join("\n\n")}

This is the main story you must tell with the user: ${state.story}
${
  state.scenes.length
    ? `Here is the story you have developed so far:
${state.scenes.map((scene, i) => `Scene ${i + 1}: ${scene.narration}`).join("\n")}`
    : "You are ready to develop the first scene with the user."
}

Now work with the user to develop the story one scene at a time.
- Let user guide you with the objects they show and the words the say. The user is currently showing you: ${state.vision}
- Use add_next_scene tool to continue the story. You must provide a narration and an illustration:
  - The narration should contribute to the overall story.
  - The illustration should NOT include the daily objects user are showing. Instead, come up with the best scene to complements or augments the narration.
  - After using the tool, you MUST respond with the narration
- Use edit_current_scene to edit the current scene.
  - After using the tool, concisely tell user what you did.
- When user has finished developing all the scenes, you can use convert_to_trailer tool to turn the story into a movie trailer. Encourage user to wrap up after three scenes.
          `.trim(),
          );
      }),
    );
  }

  async refineSceneCaption(options: {
    state: StoryState;
    fewShotScenes: StoryScene[];
    narration: string;
    illustration: string;
  }) {
    return llmNode
      .getClient("aoai")
      .chat.completions.create({
        messages: [
          system`${getStoryboardSystemPrompt(`
                      ${options.state.characters
                        .map((ele) => `${ele.characterName}: ${ele.characterVisualSketch}`.trim())
                        .join("\n")}
                      `)}`,
          ...options.fewShotScenes.flatMap((scene) => [
            user`${getStoryboardUserPrompt(scene.narration, scene.caption)}`,
            assistant`${scene.refinedCaption}`,
          ]),
          user`${getStoryboardUserPrompt(options.narration, options.illustration)}`,
        ],
        model: options.fewShotScenes.length ? "gpt-4o-mini" : "gpt-4o",
      })
      .then((response) => response.choices[0].message.content!)
      .catch(() => options.illustration);
  }

  async generateTrailer() {
    const aoai = llmNode.getClient("aoai");
    const task = await aoai.chat.completions.create({
      stream: true,
      messages: [
        system`You are a talented screenwriter. You will make an epic 60-second cinematic trailer for the user provided story.

You must describe the trailer as a sequence of scenes. In each scene:
- The scene description is highly detailed, including subjects, environment, camera angle, lighting, and every visual detail.
- Do NOT move camera or character. It must be a still frame with stunning composition.
- Each time you mention a character or creature in the scene, you must include the characters appearance, expression, pose, clothing. You must repeat this for each appearance.
- Design voice tracks with narrator voice-over and/or short character dialogue/monologue. Make sure each character has a chance to speak

Use this reference to determine the appearance of the characters:
${state$.value.characters.map((ele) => `${ele.characterName}: ${ele.characterBackstory}`).join("\n")}

The last scene must have an empty description with a single voice track item, creatively announcing the movie's name and tease that it will come to theater in Summer 2025.
Generate the movie name at the end.

Respond in valid JSON, with the following type interface:

{
  scenes: {
    sceneDescription: string;
    voiceTracks: {
      timestamp: string; // "MM:SS" format
      speaker: string; // "Voice-over" or the name of the character e.g. ${state$.value.characters.map((ele) => `"${ele.characterName}"`).join(", ")}
      utterance: string;
    }[]
  }[],
  movieName: string;
}
`,
        user`
Please make a movie trailer for this story. Make sure to create suspense and excitement:

${state$.value.scenes.map((scene, i) => `Chapter ${i + 1}: ${scene.narration}`).join("\n")}
`,
      ],
      response_format: {
        type: "json_object",
      },
      model: "gpt-4o",
    });

    const parsedValues$ = parseJsonStream(task).pipe(share());

    parsedValues$
      .pipe(
        last(),
        tap((item) => {
          endingTitle.textContent = (item.value as any)?.movieName ?? "The End";
        }),
      )
      .subscribe();

    parsedValues$
      .pipe(
        filter(
          (parsed) => typeof parsed.key === "number" && typeof (parsed.value as any)?.sceneDescription === "string",
        ),
        // offset the key by 1 to make room for the trailer scene
        map((parsed) => ({ ...parsed, key: (parsed.key as number) + 1 })),
        startWith({
          key: 0,
          value: {
            sceneDescription: `Green background trailer cover that says THE FOLLOWING PREVIEW HAS BEEN APPROVED FOR ALL AUDIENCES, RATED G. Rumor goes that the story might feature ${state$.value.characters.map((c) => c.characterName).join(", ")}`,
            isCover: true,
            voiceTracks: [],
          } satisfies TrailerScene,
        }),
        tap((parsed) => {
          const sceneIndex = parsed.key as number;
          const parsedScene = parsed.value as any as TrailerScene;
          const isCover = parsedScene.isCover;
          const isEnding = !parsedScene.sceneDescription.length;

          // Generate reactions
          aoai.chat.completions
            .create({
              messages: [
                system`
React to a movie trailer scene with "Bullet Screen" (弹幕).
Simulate ${parsedScene.isCover || isEnding ? "20" : "5 - 10"} comments from various online viewers. Use online forum idioms. Use exaggerated punctuation and Kaomoji sparingly. No Emoji. English only. 

Respond in this JSON format 

{
  reactions: {
    username: string;
    message: string;
  }[]
}
`,
                user`
Scene: ${parsedScene.sceneDescription.length ? parsedScene.sceneDescription : "Fade to black, showing movie title and release time"}
${parsedScene.isCover ? "" : "Voice-over:"}
${(parsed.value as any).voiceTracks.map((track: any) => `${track.speaker}: ${track.utterance}`).join("\n")}`,
              ],
              model: "gpt-4o",
              response_format: {
                type: "json_object",
              },
            })
            .then((response) => {
              const { reactions } = tryParse(response.choices[0].message.content!, { reactions: [] });
              state$.next({
                ...state$.value,
                trailer: state$.value.trailer.map((scene, i) =>
                  i === sceneIndex
                    ? {
                        ...scene,
                        reactions,
                        ...(sceneIndex === 0
                          ? {
                              // Trailer scene is active by default
                              isActive: true,
                              played: true,
                            }
                          : {}),
                      }
                    : scene,
                ),
              });
            });

          // Generate images
          if (isCover) {
            // leave out cover image
          } else if (isEnding) {
            // leave out ending image
          } else {
            aoai.chat.completions
              .create({
                messages: [
                  system`${getStoryboardSystemPrompt(`
                      ${state$.value.characters
                        .map((ele) => `${ele.characterName}: ${ele.characterVisualSketch}`.trim())
                        .join("\n")}
                      `)}`,
                  user`${parsedScene.sceneDescription}`,
                ],
                model: "gpt-4o",
              })
              .then((response) => response.choices[0].message.content!)
              .catch(() => parsedScene.sceneDescription)
              .then((refinedDescription) =>
                azureDalleNode.generateImage({
                  prompt: getTrailPrompt(refinedDescription),
                  style: "vivid",
                  size: "1792x1024",
                }),
              )
              .then((generatedImage) => {
                state$.next({
                  ...state$.value,
                  trailer: state$.value.trailer.map((scene, i) =>
                    i === sceneIndex
                      ? {
                          ...scene,
                          imageUrl: generatedImage.data.at(0)?.url ?? `https://placeholder.co/1600X900?text=Error`,
                        }
                      : scene,
                  ),
                });
              });
          }

          state$.next({
            ...state$.value,
            trailer: [
              ...state$.value.trailer,
              {
                ...parsedScene,
                isEnding,
                imageUrl: isCover
                  ? `${import.meta.env.BASE_URL}/trailer-cover.png`
                  : isEnding
                    ? `https://placehold.co/1600X900/black/black`
                    : undefined,
              },
            ],
          });
        }),
      )
      .subscribe();
  }

  // STAGE 3 - TRAILER
  useTrailerControl() {
    return fromEvent<KeyboardEvent>(document, "keydown").pipe(
      tap((e) => {
        switch (e.key) {
          case "ArrowRight": {
            e.preventDefault();
            const currentIndex = state$.value.trailer.findIndex((e) => e.isActive);
            const nextIndex = (currentIndex + 1) % state$.value.trailer.length;
            state$.next({
              ...state$.value,
              trailer: state$.value.trailer.map((scene, i) =>
                i === nextIndex ? { ...scene, isActive: true, played: false } : { ...scene, isActive: false },
              ),
            });
            break;
          }
          case "ArrowLeft": {
            e.preventDefault();
            const currentIndex = state$.value.trailer.findIndex((e) => e.isActive);
            const previousIndex = Math.max(currentIndex - 1, 0);
            state$.next({
              ...state$.value,
              trailer: state$.value.trailer.map((scene, i) =>
                i === previousIndex ? { ...scene, isActive: true, played: false } : { ...scene, isActive: false },
              ),
            });
            break;
          }
        }
      }),
    );
  }

  useTrailerAutoControl() {
    return state$.pipe(
      map((state) => {
        const isEnded = state.trailer.at(-1)?.played;

        const currentScene = state.trailer.find((e) => e.isActive);
        const currentIndex = state.trailer.findIndex((e) => e.isActive);
        const currentScenePlayed = currentScene?.played ?? currentScene === undefined;

        const nextIndex = (currentIndex + 1) % state.trailer.length;
        const nextScene = state.trailer[currentIndex + 1];
        const isNextSceneReady = nextScene?.imageUrl !== undefined && Array.isArray(nextScene?.reactions);

        if (!isEnded && currentScenePlayed && isNextSceneReady) {
          return { nextIndex, isEnded };
        } else {
          return { nextIndex: null, isEnded };
        }
      }),
      distinctUntilChanged((a, b) => a.nextIndex === b.nextIndex && a.isEnded === b.isEnded),
      takeWhile(({ isEnded }) => !isEnded),
      tap(({ nextIndex }) => {
        if (nextIndex === null) return;
        console.log(`[auto-control]`, { nextIndex });

        state$.next({
          ...state$.value,
          trailer: state$.value.trailer.map((scene, i) =>
            i === nextIndex ? { ...scene, isActive: true, played: false } : { ...scene, isActive: false },
          ),
        });
      }),
    );
  }

  useTrailerPlay() {
    return state$.pipe(
      map((state) => state.trailer.find((e) => e.isActive)),
      distinctUntilChanged((a, b) => a?.imageUrl === b?.imageUrl),
      tap((scene) => {
        if (!scene) return;

        trailerImage.src =
          scene.imageUrl ?? `https://placehold.co/400?text=${encodeURIComponent(scene.sceneDescription)}`;

        endingTitle.toggleAttribute("hidden", !scene.isEnding);
      }),
    );
  }

  useTrailerDanmaku() {
    return state$.pipe(
      map((state) => state.trailer.find((e) => e.isActive)),
      filter((scene) => !!scene?.reactions?.length),
      distinct((scene) => scene?.sceneDescription),
      tap((scene) => {
        // TODO avoid repeating
        console.log("[danmaku] play", scene?.reactions);
        scene?.reactions?.forEach(async (reaction) => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * (scene.isCover ? 10000 : 5000)));
          this.danmaku!.emit({
            text: reaction.message,
            style: {
              fontSize: "1.5vw",
              color: ["white", "yellow", "red", "green", "blue", "purple"][Math.floor(Math.random() * 6)],
              textShadow: "-1px -1px #000, -1px 1px #000, 1px -1px #000, 1px 1px #000",
            },
          });
        });
      }),
    );
  }

  useTrailerVoiceover() {
    // as soon as the all the scenes are designed, invite voice actors
    const voiceMapPromise = firstValueFrom(
      state$.pipe(
        skipWhile((state) => state.trailer.every((scene) => !scene.isEnding)), // skip until we have an ending scene
        take(1),
        tap((state) => console.log("[will invite voice actors]", state)),
        concatMap(async (state) => {
          const allCharacterNames = [
            ...new Set(
              state.trailer
                .flatMap((scene) => scene.voiceTracks.map((e) => e.speaker))
                .filter((speaker) => speaker !== "Voice-over"),
            ),
          ];
          const knownCharacterMap = new Map<string, string>(
            state.characters.map((c) => [c.characterName, c.characterBackstory]),
          );

          const response = await llmNode
            .getClient("aoai")
            .chat.completions.create({
              messages: [
                system`
You are a talented casting director. You will cast voice actors for the characters in the story. Match the best voice actor to each character provided by the user. Do NOT cast the same voice actor to multiple characters.

Respond in valid JSON, with the following type interface:

{
  matches: {
    storyCharacterName: string;
    voiceActorName: string;
  }[]
}
`,
                user`
Screenplay:
${state.trailer.map((scene, i) => `Scene ${i + 1}: ${scene.sceneDescription}`).join("\n")}

Story characters:
${allCharacterNames.map((name) => `${name}: ${knownCharacterMap.get(name) ?? "(No profile, use your best judgement)"}`).join("\n")}

Voice actors:
${voiceOptions.map((option) => `${option.name}: ${option.description}`).join("\n")}
            `,
              ],
              model: "gpt-4o",
              response_format: {
                type: "json_object",
              },
            })
            .then(
              (response) =>
                tryParse<{ matches: { storyCharacterName: string; voiceActorName: string }[] }>(
                  response.choices[0].message.content!,
                  { matches: [] },
                ).matches,
            );

          const voiceMap = new Map<string, VoiceOption>(
            response.map((match) => [
              match.storyCharacterName,
              voiceOptions.find((option) => option.name === match.voiceActorName)!,
            ]),
          );
          console.log(`[voice map ready]`, voiceMap);
          return voiceMap;
        }),
      ),
    );

    return state$.pipe(
      map((state) => state.trailer.find((e) => e.isActive)),
      distinctUntilChanged((a, b) => a?.sceneDescription === b?.sceneDescription),
      switchMap((scene) => {
        if (!scene) return of([]);

        return from(scene.voiceTracks).pipe(
          concatMap(async (track) => {
            const voiceMap = await voiceMapPromise;
            caption.appendLine(`${track.speaker}: ${track.utterance ?? ""}`);
            await eleventLabsTtsNode.queue(track.utterance, {
              voice:
                track.speaker === "Voice-over"
                  ? narratorVoice
                  : (voiceMap.get(track.speaker)?.id ?? characterFallbackVoice),
            });

            await new Promise((resolve) => setTimeout(resolve, 500)); // pause between scenes
          }),
          finalize(() => {
            // mark as played
            state$.next({
              ...state$.value,
              trailer: state$.value.trailer.map((e) =>
                e.sceneDescription === scene.sceneDescription ? { ...e, played: true } : e,
              ),
            });
          }),
        );
      }),
    );
  }

  changeStage(status: StoryState["stage"]) {
    state$.next({ ...state$.value, stage: status });
  }

  debugScenes() {
    state$.next({
      ...state$.value,
      stage: "editing",
      characters: [
        {
          characterName: "Supercrab",
          characterBackstory: "Grew up in the ocean, Supercrab loves to sing and has many friends",
          characterVisualSketch: "A friendly crab with a red bowtie and white boots",
          dailyObject: "A yellow rubber duck",
        },
      ],
      story: "Supercrab had to find his way home",
    });
  }

  debugTrailer() {
    state$.next({
      ...state$.value,
      stage: "trailer",
      characters: [
        {
          characterName: "Ducky",
          characterBackstory: "Grew up in the ocean, Ducky loves to sing and has many friends",
          characterVisualSketch: "A friendly duck with a red bowtie and white boots",
          dailyObject: "A yellow rubber duck",
        },
        {
          characterName: "Fox",
          characterBackstory: "A wanted mischievous fox, often making trouble",
          characterVisualSketch: "A mischievous fox with a bushy tail and a red scarf",
          dailyObject: "A red rubber duck",
        },
      ],
      story: "Ducky had to find his way home",
      scenes: [
        {
          placeholderImgUrl: "https://placehold.co/400",
          narration: "Ducky was walking home",
          caption: "Ducky is walking home",
          refinedCaption: "Ducky is walking home on a sunny day",
        },
        {
          placeholderImgUrl: "https://placehold.co/400",
          narration: "He got lost in the magic forest",
          caption: "Ducky is lost in the magic forest",
          refinedCaption: "Ducky is lost in the magic forest with a friendly fox",
        },
        {
          placeholderImgUrl: "https://placehold.co/400",
          narration: "He met a friendly fox",
          caption: "Ducky meets a friendly fox",
          refinedCaption: "Ducky meets a friendly fox in the magic forest",
        },
        {
          placeholderImgUrl: "https://placehold.co/400",
          narration: "They found his way home together",
          caption: "Ducky and the fox find his way home together",
          refinedCaption: "Ducky and the fox find his way home together on a sunny day",
        },
      ],
    });
  }
}
