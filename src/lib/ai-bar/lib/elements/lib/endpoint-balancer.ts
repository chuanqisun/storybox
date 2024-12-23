import type { AIBar } from "../../ai-bar";
import { CapacityManager } from "./capacity-manager";

export class EndpointLoadBalancer {
  capacityManagerMaps = new Map<string, CapacityManager>();

  next() {
    const connections = this.#listConnections();

    if (!connections.length) throw new Error("No connections available");

    // make sure each endpoint has a capacity manager
    connections.forEach((connection) => {
      if (!this.capacityManagerMaps.has(connection.endpoint)) {
        let capacity = 3;

        if (connection.endpoint.includes("chusun")) {
          capacity = 6;
        }

        this.capacityManagerMaps.set(connection.endpoint, new CapacityManager({ capacity: 6 }));
      }
    });

    // select the manager with the most capacity
    const [bestEndpoint, bestManager] = [...this.capacityManagerMaps.entries()].reduce(
      ([bestEndpoint, bestManager], [endpoint, manager]) => {
        if (manager.peekCapacity() > bestManager.peekCapacity()) {
          return [endpoint, manager];
        }
        return [bestEndpoint, bestManager];
      },
    );

    const connection = connections.find((connection) => connection.endpoint === bestEndpoint)!;

    return { connection, capacityManager: bestManager };
  }

  #listConnections() {
    const credentials = document.querySelector<AIBar>("ai-bar")?.getAzureConnection();
    if (!credentials)
      throw new Error("Unable to get credentials from the closest <ai-bar>. Did you forget to provide them?");

    const currentConnections: { endpoint: string; key: string }[] = [];
    if (credentials.aoaiEndpoint && credentials.aoaiKey)
      currentConnections.push({ endpoint: credentials.aoaiEndpoint, key: credentials.aoaiKey });
    if (credentials.aoaiEndpoint2 && credentials.aoaiKey2)
      currentConnections.push({ endpoint: credentials.aoaiEndpoint2, key: credentials.aoaiKey2 });

    return currentConnections;
  }
}
