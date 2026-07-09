#!/usr/bin/env node
// kappa-eeg-checker-mcp · MCP stdio server wrapping kappa-eeg-checker-sdk · MIT · AI-Native Solutions
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'kappa-eeg-checker-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

const TOOLS = [
  {
    name: 'kappa-eeg-checker_parse_e_d_f',
    description: 'parseEDF · from kappa-eeg-checker-sdk',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const { parseEDF } = await import('@ai-native-solutions/kappa-eeg-checker-sdk');
      return typeof parseEDF === 'function' ? await parseEDF(args) : { error: 'parseEDF not callable' };
    }
  },
  {
    name: 'kappa-eeg-checker_parse_c_s_v',
    description: 'parseCSV · from kappa-eeg-checker-sdk',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const { parseCSV } = await import('@ai-native-solutions/kappa-eeg-checker-sdk');
      return typeof parseCSV === 'function' ? await parseCSV(args) : { error: 'parseCSV not callable' };
    }
  },
  {
    name: 'kappa-eeg-checker_parse_j_s_o_n',
    description: 'parseJSON · from kappa-eeg-checker-sdk',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const { parseJSON } = await import('@ai-native-solutions/kappa-eeg-checker-sdk');
      return typeof parseJSON === 'function' ? await parseJSON(args) : { error: 'parseJSON not callable' };
    }
  },
  {
    name: 'kappa-eeg-checker_sample_entropy',
    description: 'sampleEntropy · from kappa-eeg-checker-sdk',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const { sampleEntropy } = await import('@ai-native-solutions/kappa-eeg-checker-sdk');
      return typeof sampleEntropy === 'function' ? await sampleEntropy(args) : { error: 'sampleEntropy not callable' };
    }
  },
  {
    name: 'kappa-eeg-checker_coarse_grain',
    description: 'coarseGrain · from kappa-eeg-checker-sdk',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const { coarseGrain } = await import('@ai-native-solutions/kappa-eeg-checker-sdk');
      return typeof coarseGrain === 'function' ? await coarseGrain(args) : { error: 'coarseGrain not callable' };
    }
  },
  {
    name: 'kappa-eeg-checker_multiscale_entropy',
    description: 'multiscaleEntropy · from kappa-eeg-checker-sdk',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args) => {
      const { multiscaleEntropy } = await import('@ai-native-solutions/kappa-eeg-checker-sdk');
      return typeof multiscaleEntropy === 'function' ? await multiscaleEntropy(args) : { error: 'multiscaleEntropy not callable' };
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ handler, ...rest }) => rest)
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const t = TOOLS.find(x => x.name === req.params.name);
  if (!t) throw new Error('unknown tool: ' + req.params.name);
  const result = await t.handler(req.params.arguments || {});
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

await server.connect(new StdioServerTransport());
console.error('kappa-eeg-checker-mcp v1.0.0 · stdio ready');
