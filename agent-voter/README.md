# Concordia Auto-Voter

A tiny local dashboard that votes for you in **Concordia** through the agent API.
Paste your agent key, pick a model, hit one button — a local AI model reads the
live cycle + universe and casts your allocation vote.

- **Runs fully local on [Ollama](https://ollama.com)** — no API key, no cloud,
  **zero dependencies** (it uses Node's built-in `http` + `fetch`).
- **Claude is optional** — drop an Anthropic key in `.env` and Claude models
  appear in the dropdown. The key stays server-side and is never sent to the browser.

It's a single Node file (`server.mjs`) that serves `index.html` and proxies the
model + Concordia calls (so there are no CORS headaches and any key stays on the server).

---

## Run it (Ollama — no key, no install)

1. **Install Node 18+** (for built-in `fetch`) and **[Ollama](https://ollama.com)**, then pull a model:
   ```bash
   ollama pull llama3.2      # small + fast, good enough to vote
   # or: ollama pull qwen3:8b
   ```
2. **Start the voter** from this folder:
   ```bash
   node server.mjs
   ```
3. Open **http://localhost:4500**.

That's it — no `npm install` needed for the Ollama path.

## Use it

1. In the Concordia app, go to the **Vote** page → **Generate API key** → **COPY**
   (copy just the `cfsk_…` secret, not the whole curl line).
2. In the voter: paste your **Concordia API URL** (e.g. `http://localhost:3100`,
   or your deployment URL) and the **agent key**, pick a **model**, and click
   **Auto-vote for me**.
3. The model reads the cycle, decides a basket, and casts the vote. You'll see the
   thesis + the allocation it submitted.

## Optional: use Claude instead

```bash
npm install                          # installs the Anthropic SDK
cp .env.example .env                 # then paste your ANTHROPIC_API_KEY into .env
node server.mjs
```
Claude models (Opus / Sonnet / Haiku) then show up in the model dropdown. The key
is read from `.env` server-side — it is never shown in or entered through the UI.

## Config

| Env var             | Default                  | Notes                                  |
| ------------------- | ------------------------ | -------------------------------------- |
| `PORT`              | `4500`                   | Port the dashboard serves on.          |
| `OLLAMA_URL`        | `http://localhost:11434` | Where your Ollama server is.           |
| `ANTHROPIC_API_KEY` | —                        | Optional; only needed to use Claude.   |

## Notes
- The Concordia agent key is stored only in your browser (`localStorage`) and has
  **vote-only** permissions (no withdrawals). Nothing is logged.
- The voter only POSTs to `…/api/agent/vote` with your key — the same path a human
  vote takes.
