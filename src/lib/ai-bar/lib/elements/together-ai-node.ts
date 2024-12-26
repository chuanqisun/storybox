import Together from "together-ai";
import { AIBar } from "../ai-bar";

export interface GenerateImageOptions {
  width?: number;
  height?: number;
  steps?: number;
}

export function defineTogetherAINode() {
  return customElements.define("together-ai-node", TogetherAINode);
}

export class TogetherAINode extends HTMLElement {
  async generateImageDataURL(prompt: string, options?: GenerateImageOptions) {
    const connection = this.closest<AIBar>("ai-bar")?.getAzureConnection();
    if (!connection)
      throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");
    if (!connection.togetherAIKey) {
      console.warn("No Together AI key provided");
    }

    const together = new Together({ apiKey: connection.togetherAIKey });

    const response = await together.images.create({
      model: "black-forest-labs/FLUX.1-schnell-Free",
      // model: "black-forest-labs/FLUX.1-schnell",
      prompt: prompt,
      width: options?.width ?? 400,
      height: options?.height ?? 400,
      steps: options?.steps ?? 4,
      n: 1,
      response_format: "base64",
    });

    const imageDataURL = `data:image/jpeg;base64,${response.data[0].b64_json}`;
    return imageDataURL;
  }
}
