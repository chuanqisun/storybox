import { EndpointLoadBalancer } from "./lib/endpoint-balancer";

export interface ImageGenerationResult {
  created: number;
  data: {
    revised_prompt: string;
    url: string;
  }[];
}

export const promptImprovementsMap = new Map<string, string>();
const endpointLoadBalancer = new EndpointLoadBalancer();

export class AzureDalleNode extends HTMLElement {
  async generateImage(config: { prompt: string; style: "natural" | "vivid"; revise?: boolean }) {
    const { connection, capacityManager } = endpointLoadBalancer.next();
    await capacityManager.consumeCapacity();

    const fetchWithRetry = getFetchWithRetry(3);

    const response = await fetchWithRetry(
      `${connection.endpoint}openai/deployments/dall-e-3/images/generations?api-version=2024-10-21`,
      {
        method: "POST",
        headers: {
          "api-key": connection.key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...config }),
      },
    )
      .then((res) => res.json())
      .then((result) => result as ImageGenerationResult)
      .finally(() => capacityManager.recoverAfterMs(60_000));

    if (response.data.at(0)?.revised_prompt) {
      promptImprovementsMap.set(config.prompt, response.data.at(0)!.revised_prompt);
    }

    if ((response as any).error) throw new Error((response as any).message);

    return response;
  }
}

export function defineAzureDalleNode() {
  customElements.define("azure-dalle-node", AzureDalleNode);
}

function getFetchWithRetry(backoff = 5, maxRetry = 3): typeof fetch {
  return async function fetchWithRetry(...parameters: Parameters<typeof fetch>) {
    let retryLeft = maxRetry;

    while (retryLeft > 0) {
      const response = await fetch(...parameters);

      if (response.status === 429) {
        retryLeft--;
        console.log(`[fetch-with-retry] will retry after ${backoff} seconds`);
        await new Promise((resolve) => setTimeout(resolve, backoff * 1000));
      } else {
        return response;
      }
    }

    throw new Error(`Failed to fetch after ${maxRetry} retries`);
  };
}
