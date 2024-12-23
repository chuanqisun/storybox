import { AzureOpenAI } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/index.mjs";
import type { AIBar, LlmProvider } from "../ai-bar";
import { emit } from "../events";

export interface OpenAIChatPayload {
  messages: ChatMessage[];
  temperature: number;
  top_p: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  stop: string | string[];
  response_format?: ChatCompletionResponseFormat;
  seed?: number;
}

export interface ChatMessage {
  role: "assistant" | "user" | "system";
  content: ChatMessagePart[] | string;
}

export type ChatMessagePart = ChatMessageTextPart | ChatMessageImagePart;

export interface ChatMessageImagePart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface ChatMessageTextPart {
  type: "text";
  text: string;
}

export interface ChatCompletionResponseFormat {
  type: "json_object" | "text";
}

export type OpenAIChatResponse = {
  choices: {
    finish_reason: "stop" | "length" | "content_filter" | null;
    index: number;
    message: {
      content?: string; // blank when content_filter is active
      role: "assistant";
    };
  }[];
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
};

export interface ChatStreamItem {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta?: {
      content?: string;
    };
    index: number;
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
  usage: null;
}

export class LlmNode extends HTMLElement implements LlmProvider {
  private messages: ChatCompletionMessageParam[] = [];
  private abortControllers = new Set<AbortController>();
  private activeTools: ChatCompletionTool[] = [];
  private customHandler: ((context: { submission: string; ai: AzureOpenAI }) => any) | null = null;
  private isToolRequired = false;
  private activeSystemMessage: string | null = null;
  private userMessageTransform: ((text: string) => string) | null = null;

  connectedCallback() {
    this.setAttribute("provides", "llm");
  }

  public async clear() {
    this.messages = [];
  }

  public appendAssistantMessage(text: string) {
    this.messages.push({ role: "assistant", content: text });

    emit(this, { sentenceGenerated: text });
  }

  public setTools(tools: ChatCompletionTool[], required = false) {
    if (required && !tools.length) {
      console.error("Cannot require tools without providing any");
      return;
    }
    this.activeTools = tools;
    this.isToolRequired = required;
  }

  public setCustomHandler(handler: ((context: { submission: string; ai: AzureOpenAI }) => any) | null) {
    this.customHandler = handler;
  }

  public setUserMessageTransformer(transform: ((text: string) => string) | null) {
    this.userMessageTransform = transform;
  }

  public setSystemMessage(text: string | null) {
    this.activeSystemMessage = text;
  }

  public getClient() {
    const credentials = this.closest<AIBar>("ai-bar")?.getAzureConnection();
    if (!credentials)
      throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");
    const openai = new AzureOpenAI({
      endpoint: credentials.aoaiEndpoint,
      apiKey: credentials.aoaiKey,
      apiVersion: "2024-10-21",
      dangerouslyAllowBrowser: true,
    });

    return openai;
  }

  public async submit(text: string) {
    const credentials = this.closest<AIBar>("ai-bar")?.getAzureConnection();
    if (!credentials)
      throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");
    const openai = new AzureOpenAI({
      endpoint: credentials.aoaiEndpoint,
      apiKey: credentials.aoaiKey,
      apiVersion: "2024-10-21",
      dangerouslyAllowBrowser: true,
    });

    if (this.customHandler) {
      this.customHandler({ submission: text, ai: openai });
      return;
    }

    const ac = new AbortController();
    this.abortControllers.add(ac);

    const segmenter = this.createSentenceSegmenter();
    segmenter.sentenceEmitter.addEventListener("sentence", (event) => {
      const sentence = (event as CustomEvent<string>).detail;
      emit(this, { sentenceGenerated: sentence });
    });

    let submitMessages: ChatCompletionMessageParam[] = [];

    if (this.activeSystemMessage) {
      console.log(`[llm:user:systemMessage] ${this.activeSystemMessage}`);
      submitMessages = this.withSystemMessage(submitMessages, this.activeSystemMessage);
    }

    const finalMessage = this.userMessageTransform ? this.userMessageTransform(text) : text;
    console.log(`[llm:user:chat] ${finalMessage}`);
    this.messages.push({ role: "user" as const, content: [{ type: "text", text: finalMessage }] });
    submitMessages.push(...this.messages);
    const contextImage = await this.closest<AIBar>("ai-bar")?.getContextVision();

    if (contextImage) {
      console.log(`[llm:user:added-image]`);
      submitMessages = this.withContextImage(submitMessages, contextImage);
    }

    // TODO refactor to use automatic tool use API to
    // openai.beta.chat.completions.runTools()

    const stream = openai.beta.chat.completions.stream(
      {
        model: "gpt-4o",
        messages: submitMessages,
        tools: this.activeTools.length ? this.activeTools : undefined,
        tool_choice: this.activeTools.length && this.isToolRequired ? "required" : undefined,
        temperature: 0,
      },
      {
        signal: ac.signal,
      },
    );

    stream.on("content", (delta, _snapshot) => {
      if (delta) {
        segmenter.enqueue(delta);

        let lastMessage = this.messages.at(-1);
        if (lastMessage?.role !== "assistant") {
          lastMessage = { role: "assistant", content: "" };
          this.messages.push(lastMessage);
          console.log("[llm:assistant:started]");
        }
        lastMessage.content += delta;
      }
    });

    stream.on("functionCall", (fnCall) => {
      console.log(`[llm:assistant:tool]`, fnCall);

      emit(this.closest<AIBar>("ai-bar")!, {
        toolUsed: {
          name: fnCall.name,
          parsedArgs: JSON.parse(fnCall.arguments) as Record<string, any>,
        },
      });
    });

    try {
      const finalCompletion = await stream.finalChatCompletion();

      let lastMessage = this.messages.at(-1);
      if (lastMessage?.role !== "assistant") {
        lastMessage = { role: "assistant", content: null };
        this.messages.push(lastMessage);
        console.log("[llm:assistant:started]");
      }
      lastMessage.tool_calls = lastMessage.tool_calls ?? [];
      lastMessage.tool_calls.push(...finalCompletion.choices[0].message.tool_calls);
      if (lastMessage.tool_calls.length === 0) lastMessage.tool_calls = undefined;

      const toolResponse = finalCompletion.choices[0].message.tool_calls.map((toolCall) => ({
        role: "tool" as const,
        content: "success", // HACK. Use actual tool return content.
        tool_call_id: toolCall.id,
      }));

      this.messages.push(...toolResponse);

      console.log(`[llm:assistant:final]`, finalCompletion);
      segmenter.flush();
    } catch (e) {
      segmenter.discard();
      console.log(`[llm:assistant:error]`, (e as any)?.message);
    } finally {
      this.abortControllers.delete(ac);
    }
  }

  public abort() {
    for (const ac of this.abortControllers) {
      ac.abort();
      this.abortControllers.delete(ac);
    }
  }

  private withSystemMessage(messages: ChatCompletionMessageParam[], text: string): ChatCompletionMessageParam[] {
    return [{ role: "system", content: text }, ...messages];
  }

  private withContextImage(messages: ChatCompletionMessageParam[], maybeContextImageDataUrl?: string | null) {
    if (!maybeContextImageDataUrl) return messages;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role !== "user") return messages;

    const lastMessageParts =
      typeof lastMessage.content === "string"
        ? [{ type: "text", text: lastMessage.content } as ChatMessageTextPart]
        : lastMessage.content;
    const decoratedMessage = {
      ...lastMessage,
      content: [
        ...lastMessageParts,
        {
          type: "image_url",
          image_url: {
            url: maybeContextImageDataUrl,
            detail: "auto",
          },
        },
      ],
    } as ChatCompletionMessageParam;

    return [...messages.slice(0, -1), decoratedMessage];
  }

  private createSentenceSegmenter() {
    const sentenceEmitter = new EventTarget();

    let buffer = "";

    const enqueue = (text: string) => {
      const sentences = this.splitBySentence(buffer + text);
      // the last sentence is incomplete. only emit the first n-1 sentences

      const completeSpeech = sentences.slice(0, -1).join("");
      if (completeSpeech.trim()) {
        sentenceEmitter.dispatchEvent(new CustomEvent("sentence", { detail: completeSpeech }));
      }

      buffer = sentences.at(-1) ?? "";
    };

    function flush() {
      if (buffer.trim()) {
        sentenceEmitter.dispatchEvent(new CustomEvent("sentence", { detail: buffer }));
        buffer = "";
      }
    }

    function discard() {
      buffer = "";
    }

    return {
      sentenceEmitter,
      flush,
      enqueue,
      discard,
    };
  }

  private splitBySentence(input: string): string[] {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    const iterator = segmenter.segment(input);
    const items = [...iterator].map((item) => item.segment);
    return items;
  }
}

export function defineLlmNode(tagName = "llm-node") {
  customElements.define(tagName, LlmNode);
}
