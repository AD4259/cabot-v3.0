# CABot — AI Chartered Accountant 🏦

> Your personal AI CA powered by Ollama (runs 100% locally)

## Features
- 💰 Income Tax calculations (Old vs New regime)
- 📊 GST registration & returns guidance
- 📚 Accounting & bookkeeping help
- 🏢 Company registration advisory
- 🔍 Audit & compliance checklists
- 👥 Payroll, PF & ESI guidance
- 🌙 Premium dark-mode UI with real-time streaming

## Prerequisites

1. **Node.js** — [Download](https://nodejs.org) v18+
2. **Ollama** — [Download](https://ollama.ai) and install

## Quick Start

```bash
# 1. Install Ollama and pull a model
ollama pull llama3

# 2. Start Ollama (usually auto-starts)
ollama serve

# 3. Install dependencies
npm install

# 4. Start CABot
npm start

# 5. Open browser
# Visit: http://localhost:3000
```

## Recommended Models

| Model | Speed | Quality | RAM |
|-------|-------|---------|-----|
| `llama3` | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | 8GB |
| `mistral` | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 5GB |
| `gemma:7b` | ⚡⚡⚡ | ⭐⭐⭐⭐ | 6GB |
| `phi3` | ⚡⚡⚡⚡⚡ | ⭐⭐⭐ | 3GB |

## Project Structure

```
ca ai/
├── server.js        — Express + Ollama proxy backend
├── package.json     — Node.js config
└── public/
    ├── index.html   — Main UI
    ├── style.css    — Premium dark theme
    └── app.js       — Frontend chat logic
```

## Development

```bash
npm run dev    # Hot-reload with nodemon
```

---
*CABot v3.0 — India Focused | FCA ICAI Knowledge Base*
