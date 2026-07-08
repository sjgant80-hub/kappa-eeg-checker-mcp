# κ-EEG Checker MCP

Model Context Protocol server for the [κ-EEG Checker](https://github.com/sjgant80-hub/kappa-eeg-checker). Exposes the SDK's EDF/BDF parsing, sample entropy, multiscale entropy, and full session analysis to any MCP-capable client (Claude Desktop, Claude Code, agent stacks).

## Install

```bash
npm install -g @ai-native-solutions/kappa-eeg-checker-mcp
```

## Wire into Claude Desktop / Claude Code

`claude_desktop_config.json` (or `.mcp.json`):

```json
{
  "mcpServers": {
    "kappa-eeg": {
      "command": "npx",
      "args": ["-y", "@ai-native-solutions/kappa-eeg-checker-mcp"]
    }
  }
}
```

Restart Claude. The server appears as `kappa-eeg`.

## Tools

| Tool | Input | Output |
|---|---|---|
| `kappa_parse_edf` | `{ bytes: base64, format?: "edf" \| "bdf" }` | `{ channels, sample_rate, labels, format, ... }` |
| `kappa_parse_csv` | `{ text, sampleRate? }` | parsed signal |
| `kappa_sample_entropy` | `{ series, m?, r? }` | `{ entropy, m, r }` |
| `kappa_multiscale` | `{ series, m?, rFrac?, scales? }` | `{ curve, scales, r, std }` |
| `kappa_analyze_session` | `{ channels, labels?, sampleRate?, sessionLabel?, ... }` | per-scale band matches + Δκ |
| `kappa_build_report` | `{ sessions, m?, rFrac?, maxTau?, ... }` | full report with aggregate verdict |

## Resources

| URI | Contents |
|---|---|
| `kappa-eeg://bands` | The seven κ-bands (collapse · recognition · naming · **heart** · gate · perception · ground) |
| `kappa-eeg://constants` | `PHI`, `KAPPA = 1/φ`, 7-prime spine `[2, 3, 5, 7, 11, 13, 17]` |

## Example prompt

> Load the EDF from `subject_01.edf`, use `kappa_parse_edf`, then call `kappa_build_report` with the parsed channels. Tell me if this subject's neural entropy lives in the heart band.

## Companion surfaces

- **SDK**: [`kappa-eeg-checker-sdk`](https://github.com/sjgant80-hub/kappa-eeg-checker-sdk) — pure JS library
- **HTTP API**: [`kappa-eeg-checker-api`](https://github.com/sjgant80-hub/kappa-eeg-checker-api) — Dockerised HTTP proxy
- **App**: [`kappa-eeg-checker`](https://github.com/sjgant80-hub/kappa-eeg-checker) — sovereign single-file browser app

## License

MIT · AI-Native Solutions · ◊·κ=1
