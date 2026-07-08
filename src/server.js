#!/usr/bin/env node
// κ-EEG Checker MCP · Model Context Protocol server
// Exposes EDF parsing, sample entropy, multiscale entropy, and full session analysis
// as MCP tools for Claude/agent stacks.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  parseEDF, parseBDF, parseCSV, parseJSON,
  sampleEntropy, multiscaleEntropy,
  analyzeSession, buildReport,
  KAPPA_BANDS, KAPPA, PHI
} from '@ai-native-solutions/kappa-eeg-checker-sdk';

const server = new Server(
  { name: 'kappa-eeg-checker', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// ---------------------------------------------------------------------------
// TOOL LIST
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'kappa_parse_edf',
      description: 'Parse an EDF or BDF EEG file (base64-encoded bytes) into channels + sample rate. EDF is 16-bit; BDF is 24-bit.',
      inputSchema: {
        type: 'object',
        properties: {
          bytes: { type: 'string', description: 'Base64-encoded EDF/BDF file bytes.' },
          format: { type: 'string', enum: ['edf', 'bdf'], default: 'edf' }
        },
        required: ['bytes']
      }
    },
    {
      name: 'kappa_parse_csv',
      description: 'Parse CSV EEG data (one channel per column, optional header row). Delimiter auto-detects.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sampleRate: { type: 'number', default: 256 }
        },
        required: ['text']
      }
    },
    {
      name: 'kappa_sample_entropy',
      description: 'Compute sample entropy SampEn(m, r) for a numeric series (Richman-Moorman 2000).',
      inputSchema: {
        type: 'object',
        properties: {
          series: { type: 'array', items: { type: 'number' } },
          m: { type: 'integer', default: 2, minimum: 1, maximum: 6 },
          r: { type: 'number', description: 'Absolute tolerance (typically 0.15·σ). If omitted, auto-computed.' }
        },
        required: ['series']
      }
    },
    {
      name: 'kappa_multiscale',
      description: 'Compute multiscale entropy curve (Costa-Goldberger 2002) for scales 1..maxTau.',
      inputSchema: {
        type: 'object',
        properties: {
          series: { type: 'array', items: { type: 'number' } },
          m: { type: 'integer', default: 2 },
          rFrac: { type: 'number', default: 0.15, description: 'Tolerance as fraction of std.' },
          scales: { type: 'integer', default: 20, description: 'Max scale τ.' }
        },
        required: ['series']
      }
    },
    {
      name: 'kappa_analyze_session',
      description: 'Full session analysis: multiscale entropy curve + per-scale κ-band assignment + Δκ verdict.',
      inputSchema: {
        type: 'object',
        properties: {
          channels: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Array of channels; each channel is an array of samples.' },
          labels: { type: 'array', items: { type: 'string' } },
          sampleRate: { type: 'array', items: { type: 'number' }, description: 'Sample rate per channel.' },
          sessionLabel: { type: 'string', default: 'session' },
          m: { type: 'integer', default: 2 },
          rFrac: { type: 'number', default: 0.15 },
          maxTau: { type: 'integer', default: 20 },
          cap: { type: 'integer', default: 4000 },
          channelSelect: { type: 'string', enum: ['mean', 'first', 'all'], default: 'mean' }
        },
        required: ['channels']
      }
    },
    {
      name: 'kappa_build_report',
      description: 'Build a full multi-session report with aggregate verdict (κ SUPPORTED / NEAR-MISS / REJECTED).',
      inputSchema: {
        type: 'object',
        properties: {
          sessions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                labels: { type: 'array', items: { type: 'string' } },
                channels: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                sampleRate: { type: 'array', items: { type: 'number' } },
                label: { type: 'string' },
                source: { type: 'string' },
                format: { type: 'string' }
              },
              required: ['channels']
            }
          },
          m: { type: 'integer', default: 2 },
          rFrac: { type: 'number', default: 0.15 },
          maxTau: { type: 'integer', default: 20 },
          cap: { type: 'integer', default: 4000 },
          channelSelect: { type: 'string', enum: ['mean', 'first', 'all'], default: 'mean' },
          mode: { type: 'string', enum: ['single', 'group'], default: 'single' }
        },
        required: ['sessions']
      }
    }
  ]
}));

// ---------------------------------------------------------------------------
// TOOL DISPATCH
// ---------------------------------------------------------------------------
function b64ToArrayBuffer(b64) {
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function stdOf(series) {
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  return Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    switch (name) {
      case 'kappa_parse_edf': {
        const buf = b64ToArrayBuffer(args.bytes);
        const isBDF = (args.format || 'edf').toLowerCase() === 'bdf';
        const parsed = isBDF ? parseBDF(buf) : parseEDF(buf);
        result = {
          labels: parsed.labels,
          sampleRate: parsed.sampleRate,
          format: parsed.format,
          numRecords: parsed.numRecords,
          durRecord: parsed.durRecord,
          channels: parsed.channels
        };
        break;
      }
      case 'kappa_parse_csv': {
        result = parseCSV(args.text, { sampleRate: args.sampleRate });
        break;
      }
      case 'kappa_sample_entropy': {
        const series = args.series;
        const m = args.m ?? 2;
        const r = args.r ?? 0.15 * stdOf(series);
        result = { entropy: sampleEntropy(series, m, r), m, r };
        break;
      }
      case 'kappa_multiscale': {
        const mse = multiscaleEntropy(args.series, args.m ?? 2, args.rFrac ?? 0.15, args.scales ?? 20);
        result = { curve: mse.mse, scales: mse.scales, r: mse.r, std: mse.std };
        break;
      }
      case 'kappa_analyze_session': {
        const session = {
          labels: args.labels || args.channels.map((_, i) => 'ch' + i),
          channels: args.channels,
          sampleRate: args.sampleRate || args.channels.map(() => 256),
          label: args.sessionLabel,
          format: 'JSON'
        };
        result = analyzeSession(session, {
          m: args.m, rFrac: args.rFrac, maxTau: args.maxTau,
          cap: args.cap, channelSelect: args.channelSelect
        });
        break;
      }
      case 'kappa_build_report': {
        const sessions = args.sessions.map(s => ({
          labels: s.labels || s.channels.map((_, i) => 'ch' + i),
          channels: s.channels,
          sampleRate: s.sampleRate || s.channels.map(() => 256),
          label: s.label,
          source: s.source,
          format: s.format
        }));
        result = buildReport(sessions, {
          m: args.m, rFrac: args.rFrac, maxTau: args.maxTau,
          cap: args.cap, channelSelect: args.channelSelect, mode: args.mode
        });
        break;
      }
      default:
        throw new Error('unknown tool: ' + name);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: 'error: ' + err.message }], isError: true };
  }
});

// ---------------------------------------------------------------------------
// RESOURCES
// ---------------------------------------------------------------------------
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'kappa-eeg://bands',
      name: 'κ-bands (7 depth bands)',
      description: 'The seven κ-band gradient from the v21 origami addendum · orphan is the heart band (κ home).',
      mimeType: 'application/json'
    },
    {
      uri: 'kappa-eeg://constants',
      name: 'φ · κ · 7-prime spine',
      description: 'Framework constants: PHI, KAPPA, and the 7-prime spine [2, 3, 5, 7, 11, 13, 17].',
      mimeType: 'application/json'
    }
  ]
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  if (uri === 'kappa-eeg://bands') {
    return {
      contents: [{
        uri, mimeType: 'application/json',
        text: JSON.stringify(KAPPA_BANDS.map(b => ({
          name: b.name, glyph: b.glyph, ring: b.ring,
          min: b.min === -Infinity ? null : b.min,
          max: b.max === Infinity ? null : b.max,
          colour: b.colour, orphan: !!b.orphan
        })), null, 2)
      }]
    };
  }
  if (uri === 'kappa-eeg://constants') {
    return {
      contents: [{
        uri, mimeType: 'application/json',
        text: JSON.stringify({ PHI, KAPPA, SPINE: [2, 3, 5, 7, 11, 13, 17] }, null, 2)
      }]
    };
  }
  throw new Error('unknown resource: ' + uri);
});

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('κ-EEG Checker MCP · ready · stdio');
