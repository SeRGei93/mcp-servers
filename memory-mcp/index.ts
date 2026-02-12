#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { statelessHandler } from "express-mcp-handler";
import { z } from "zod";
import { promises as fs } from 'fs';
import path from 'path';
import express from 'express';

// Define memory file path using environment variable with fallback
export const defaultMemoryPath = process.env.MEMORY_FILE_PATH || '/data/memory.jsonl';

// Handle backward compatibility: migrate memory.json to memory.jsonl if needed
export async function ensureMemoryFilePath(): Promise<string> {
  if (process.env.MEMORY_FILE_PATH) {
    return path.isAbsolute(process.env.MEMORY_FILE_PATH)
      ? process.env.MEMORY_FILE_PATH
      : path.resolve(process.env.MEMORY_FILE_PATH);
  }
  
  const oldMemoryPath = '/data/memory.json';
  const newMemoryPath = defaultMemoryPath;
  
  try {
    await fs.access(oldMemoryPath);
    try {
      await fs.access(newMemoryPath);
      return newMemoryPath;
    } catch {
      console.error('DETECTED: Found legacy memory.json file, migrating to memory.jsonl');
      await fs.rename(oldMemoryPath, newMemoryPath);
      console.error('COMPLETED: Successfully migrated memory.json to memory.jsonl');
      return newMemoryPath;
    }
  } catch {
    return newMemoryPath;
  }
}

let MEMORY_FILE_PATH: string;

// Knowledge Graph types
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

export interface Relation {
  from: string;
  to: string;
  relationType: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Knowledge Graph Manager
export class KnowledgeGraphManager {
  constructor(private memoryFilePath: string) {}

  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      const data = await fs.readFile(this.memoryFilePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        const item = JSON.parse(line);
        if (item.type === "entity") {
          graph.entities.push({
            name: item.name,
            entityType: item.entityType,
            observations: item.observations
          });
        }
        if (item.type === "relation") {
          graph.relations.push({
            from: item.from,
            to: item.to,
            relationType: item.relationType
          });
        }
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({
        type: "entity",
        name: e.name,
        entityType: e.entityType,
        observations: e.observations
      })),
      ...graph.relations.map(r => JSON.stringify({
        type: "relation",
        from: r.from,
        to: r.to,
        relationType: r.relationType
      })),
    ];
    await fs.writeFile(this.memoryFilePath, lines.join("\n"));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
    graph.entities.push(...newEntities);
    await this.saveGraph(graph);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    const newRelations = relations.filter(r => !graph.relations.some(existingRelation => 
      existingRelation.from === r.from && 
      existingRelation.to === r.to && 
      existingRelation.relationType === r.relationType
    ));
    graph.relations.push(...newRelations);
    await this.saveGraph(graph);
    return newRelations;
  }

  async addObservations(observations: { entityName: string; contents: string[] }[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const graph = await this.loadGraph();
    const results = observations.map(o => {
      const entity = graph.entities.find(e => e.name === o.entityName);
      if (!entity) {
        throw new Error(`Entity with name ${o.entityName} not found`);
      }
      const newObservations = o.contents.filter(content => !entity.observations.includes(content));
      entity.observations.push(...newObservations);
      return { entityName: o.entityName, addedObservations: newObservations };
    });
    await this.saveGraph(graph);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
    await this.saveGraph(graph);
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    const graph = await this.loadGraph();
    deletions.forEach(d => {
      const entity = graph.entities.find(e => e.name === d.entityName);
      if (entity) {
        entity.observations = entity.observations.filter(o => !d.observations.includes(o));
      }
    });
    await this.saveGraph(graph);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    graph.relations = graph.relations.filter(r => !relations.some(delRelation => 
      r.from === delRelation.from && 
      r.to === delRelation.to && 
      r.relationType === delRelation.relationType
    ));
    await this.saveGraph(graph);
  }

  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.entityType.toLowerCase().includes(query.toLowerCase()) ||
      e.observations.some(o => o.toLowerCase().includes(query.toLowerCase()))
    );
    
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
    
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
    
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
    
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
    
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }
}

let knowledgeGraphManager: KnowledgeGraphManager;

// Zod schemas
const EntitySchema = z.object({
  name: z.string().describe("The name of the entity"),
  entityType: z.string().describe("The type of the entity"),
  observations: z.array(z.string()).describe("An array of observation contents associated with the entity")
});

const RelationSchema = z.object({
  from: z.string().describe("The name of the entity where the relation starts"),
  to: z.string().describe("The name of the entity where the relation ends"),
  relationType: z.string().describe("The type of the relation")
});

// Create MCP Server
const server = new McpServer({
  name: "memory-server",
  version: "0.6.3-http",
});

// Register all tools (same as original)
server.registerTool(
  "create_entities",
  {
    title: "Create Entities",
    description: "Create multiple new entities in the knowledge graph",
    inputSchema: { entities: z.array(EntitySchema) },
    outputSchema: { entities: z.array(EntitySchema) }
  },
  async ({ entities }) => {
    const result = await knowledgeGraphManager.createEntities(entities);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { entities: result }
    };
  }
);

server.registerTool(
  "create_relations",
  {
    title: "Create Relations",
    description: "Create multiple new relations between entities in the knowledge graph",
    inputSchema: { relations: z.array(RelationSchema) },
    outputSchema: { relations: z.array(RelationSchema) }
  },
  async ({ relations }) => {
    const result = await knowledgeGraphManager.createRelations(relations);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { relations: result }
    };
  }
);

server.registerTool(
  "add_observations",
  {
    title: "Add Observations",
    description: "Add new observations to existing entities in the knowledge graph",
    inputSchema: {
      observations: z.array(z.object({
        entityName: z.string(),
        contents: z.array(z.string())
      }))
    },
    outputSchema: {
      results: z.array(z.object({
        entityName: z.string(),
        addedObservations: z.array(z.string())
      }))
    }
  },
  async ({ observations }) => {
    const result = await knowledgeGraphManager.addObservations(observations);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: { results: result }
    };
  }
);

server.registerTool(
  "delete_entities",
  {
    title: "Delete Entities",
    description: "Delete multiple entities and their associated relations from the knowledge graph",
    inputSchema: { entityNames: z.array(z.string()) },
    outputSchema: { success: z.boolean(), message: z.string() }
  },
  async ({ entityNames }) => {
    await knowledgeGraphManager.deleteEntities(entityNames);
    return {
      content: [{ type: "text" as const, text: "Entities deleted successfully" }],
      structuredContent: { success: true, message: "Entities deleted successfully" }
    };
  }
);

server.registerTool(
  "delete_observations",
  {
    title: "Delete Observations",
    description: "Delete specific observations from entities in the knowledge graph",
    inputSchema: {
      deletions: z.array(z.object({
        entityName: z.string(),
        observations: z.array(z.string())
      }))
    },
    outputSchema: { success: z.boolean(), message: z.string() }
  },
  async ({ deletions }) => {
    await knowledgeGraphManager.deleteObservations(deletions);
    return {
      content: [{ type: "text" as const, text: "Observations deleted successfully" }],
      structuredContent: { success: true, message: "Observations deleted successfully" }
    };
  }
);

server.registerTool(
  "delete_relations",
  {
    title: "Delete Relations",
    description: "Delete multiple relations from the knowledge graph",
    inputSchema: { relations: z.array(RelationSchema) },
    outputSchema: { success: z.boolean(), message: z.string() }
  },
  async ({ relations }) => {
    await knowledgeGraphManager.deleteRelations(relations);
    return {
      content: [{ type: "text" as const, text: "Relations deleted successfully" }],
      structuredContent: { success: true, message: "Relations deleted successfully" }
    };
  }
);

server.registerTool(
  "read_graph",
  {
    title: "Read Graph",
    description: "Read the entire knowledge graph",
    inputSchema: {},
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async () => {
    const graph = await knowledgeGraphManager.readGraph();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

server.registerTool(
  "search_nodes",
  {
    title: "Search Nodes",
    description: "Search for nodes in the knowledge graph based on a query",
    inputSchema: { query: z.string() },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ query }) => {
    const graph = await knowledgeGraphManager.searchNodes(query);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

server.registerTool(
  "open_nodes",
  {
    title: "Open Nodes",
    description: "Open specific nodes in the knowledge graph by their names",
    inputSchema: { names: z.array(z.string()) },
    outputSchema: {
      entities: z.array(EntitySchema),
      relations: z.array(RelationSchema)
    }
  },
  async ({ names }) => {
    const graph = await knowledgeGraphManager.openNodes(names);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(graph, null, 2) }],
      structuredContent: { ...graph }
    };
  }
);

// Create server factory function
function createServer(): McpServer {
  return server;
}

// HTTP Server setup
async function main() {
  MEMORY_FILE_PATH = await ensureMemoryFilePath();
  knowledgeGraphManager = new KnowledgeGraphManager(MEMORY_FILE_PATH);

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000');

  app.use(express.json({ limit: '10mb' }));

  // Root endpoint
  app.get('/', (_req, res) => {
    res.status(200).json({
      name: 'memory-server',
      version: '0.6.3-http',
      transport: 'streamable-http',
      endpoint: '/mcp',
      memoryFile: MEMORY_FILE_PATH
    });
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'memory-server',
      version: '0.6.3-http',
      memoryFile: MEMORY_FILE_PATH
    });
  });

  // MCP endpoint (GET returns 405)
  app.get('/mcp', (_req, res) => {
    res.status(405).set('Allow', 'POST').json({
      error: 'Method Not Allowed',
      message: 'This server only supports POST requests (stateless mode).'
    });
  });

  // MCP endpoint (POST with stateless handler)
  app.post(
    '/mcp',
    statelessHandler(createServer, {
      onError: (error: Error) => {
        console.error('[ERROR] MCP request failed:', error);
      }
    })
  );

  app.listen(PORT, () => {
    console.error(`[INFO] memory-server started on http://localhost:${PORT}`);
    console.error(`[INFO] MCP endpoint: POST http://localhost:${PORT}/mcp`);
    console.error(`[INFO] Memory file: ${MEMORY_FILE_PATH}`);
  });
}

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('[FATAL] Failed to start server:', error);
  process.exit(1);
});
