# LeetCode → CPH

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?logo=google&logoColor=white)
![Groq API](https://img.shields.io/badge/Groq-Llama%204-F55036?logo=meta&logoColor=white)
![CPH](https://img.shields.io/badge/CPH-VS%20Code-007ACC?logo=visualstudiocode&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

A minimal Chrome Extension (Manifest V3) that extracts LeetCode problem examples, converts them into competitive programming format using the Groq API (Llama 4), and sends them directly to [CPH (Competitive Programming Helper)](https://github.com/agrawal-d/cph) running in VS Code.

## How it works

```
LeetCode page → extract examples → Groq API (Llama 4) → CPH (localhost:27121)
```

A top progress bar shows live status as each step completes.

## Setup

### 1. Get a Groq API key
Sign up at [console.groq.com](https://console.groq.com) — it's free.

### 2. Add your API key
Open `content.js` and replace the placeholder on line 1:
```js
const API_KEY = "YOUR_GROQ_API_KEY";
```

### 3. Load the extension in Chrome
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder

### 4. Make sure CPH is running
Open VS Code with the [CPH extension](https://marketplace.visualstudio.com/items?itemName=DivyanshuAgrawal.competitive-programming-helper) installed. It must be listening on port `27121`.

### 5. Use it
Navigate to any LeetCode problem page — the extension runs automatically.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension config (MV3) |
| `content.js` | Extracts examples, calls Groq API, shows progress bar |
| `background.js` | Proxies the CPH fetch (bypasses CORS) |

## Tech

- **API**: [Groq](https://groq.com) — `meta-llama/llama-4-scout-17b-16e-instruct`
- **Target**: [CPH](https://github.com/agrawal-d/cph) on `localhost:27121`
- **Manifest**: V3, no build step required
