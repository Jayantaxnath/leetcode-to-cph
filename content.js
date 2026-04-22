const API_KEY = ""; // Replace with your key from console.groq.com
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CPH_URL = "http://localhost:27121";

// ── Top progress-bar UI ─────────────────────────────────────────
function createProgressBar() {
  // Container that spans full width at the very top
  const bar = document.createElement("div");
  bar.id = "cph-progress-bar";
  bar.style.cssText = [
    "position:fixed", "top:0", "left:0", "right:0", "z-index:999999",
    "height:auto", "font:13px/1.5 'Segoe UI',system-ui,sans-serif",
    "background:#1e1e2e", "color:#cdd6f4",
    "box-shadow:0 2px 12px rgba(0,0,0,.4)",
    "transition:opacity .3s, transform .3s",
    "transform:translateY(0)"
  ].join(";");

  // Inner progress track
  const track = document.createElement("div");
  track.id = "cph-progress-track";
  track.style.cssText = [
    "height:3px", "background:#89b4fa", "width:0%",
    "transition:width .4s ease"
  ].join(";");
  bar.appendChild(track);

  // Status text row
  const status = document.createElement("div");
  status.id = "cph-progress-status";
  status.style.cssText = [
    "padding:6px 16px", "display:flex", "align-items:center", "gap:8px"
  ].join(";");
  bar.appendChild(status);

  document.body.appendChild(bar);
  return bar;
}

function setProgress(bar, msg, pct, state /* 'info'|'ok'|'err' */) {
  const colors = { info: "#89b4fa", ok: "#a6e3a1", err: "#f38ba8" };
  const icons = { info: "⏳", ok: "✅", err: "❌" };

  const track = bar.querySelector("#cph-progress-track");
  const status = bar.querySelector("#cph-progress-status");

  track.style.background = colors[state] || colors.info;
  track.style.width = `${pct}%`;

  status.textContent = `${icons[state] || "⏳"}  ${msg}`;
  bar.style.opacity = "1";
  bar.style.transform = "translateY(0)";
}

function dismissProgress(bar, delay = 4000) {
  setTimeout(() => {
    bar.style.transform = "translateY(-100%)";
    bar.style.opacity = "0";
    setTimeout(() => bar.remove(), 350);
  }, delay);
}
// ─────────────────────────────────────────────────────────────────

function extractExamples() {
  const examples = [];

  // ── Pass 0: Contest / modern problem page layout ─────────────────
  // Structure: [data-track-load="description_content"]
  //              └── .example-block
  //                    ├── .example-io  (input)
  //                    └── .example-io  (output)
  const descRoot = document.querySelector('[data-track-load="description_content"]');
  const contestBlocks = (descRoot || document).querySelectorAll(".example-block");

  contestBlocks.forEach((block) => {
    const ios = block.querySelectorAll(".example-io");
    if (ios.length >= 2) {
      // Strip leading label like "Input: " or "Output: " from each line
      const stripLabel = (raw) =>
        raw
          .split("\n")
          .map((line) => line.replace(/^\s*(Input|Output)\s*:\s*/i, "").trim())
          .filter(Boolean)
          .join("\n");

      const input = stripLabel(ios[0].innerText || ios[0].textContent || "");
      const output = stripLabel(ios[1].innerText || ios[1].textContent || "");

      if (input && output) {
        examples.push({ input, output });
      }
    }
  });

  if (examples.length > 0) return examples;

  // ── Pass 1: <pre> blocks inside example containers ────────────────
  const exampleBlocks = document.querySelectorAll(
    '[class*="example"] pre, .example-block, pre'
  );

  if (exampleBlocks.length > 0) {
    exampleBlocks.forEach((block) => {
      const text = block.innerText || block.textContent || "";
      const inputMatch = text.match(/Input[:\s]+([\s\S]*?)(?:Output[:\s]+|$)/i);
      const outputMatch = text.match(/Output[:\s]+([\s\S]*?)(?:Explanation[:\s]+|$)/i);
      if (inputMatch && outputMatch) {
        examples.push({
          input: inputMatch[1].trim(),
          output: outputMatch[1].trim(),
        });
      }
    });
  }

  if (examples.length > 0) return examples;

  // ── Pass 2: data-example-id / ExampleTestcases containers ─────────
  const containers = document.querySelectorAll('[data-example-id], [class*="ExampleTestcases"]');
  containers.forEach((container) => {
    const text = container.innerText || container.textContent || "";
    const inputMatch = text.match(/Input[:\s]+([\s\S]*?)Output[:\s]+/i);
    const outputMatch = text.match(/Output[:\s]+([\s\S]*?)(?:Explanation|$)/i);
    if (inputMatch && outputMatch) {
      examples.push({
        input: inputMatch[1].trim(),
        output: outputMatch[1].trim(),
      });
    }
  });

  if (examples.length > 0) return examples;

  // ── Pass 3: full-page regex fallback ──────────────────────────────
  const allText = document.body.innerText;
  const pattern = /Input:\s*([\s\S]*?)\nOutput:\s*([\s\S]*?)(?:\nExplanation:|\nExample \d|$)/gi;
  let match;
  while ((match = pattern.exec(allText)) !== null) {
    examples.push({
      input: match[1].trim(),
      output: match[2].trim(),
    });
  }

  return examples;
}

function buildPrompt(examples) {
  const examplesText = examples
    .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`)
    .join("\n\n");

  return `Here are the examples extracted from a LeetCode problem page:\n\n${examplesText}\n\nConvert each example into competitive programming stdin/stdout format and return the result.`;
}

async function callGroqAPI(prompt) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "system",
          content: `Convert LeetCode examples into stdin/stdout format.
Return ONLY valid JSON: {"tests":[{"input":"...","output":"..."}]}.
Each example is one test.
Use plain strings and end each line with \\n.
No explanations or extra text.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

function parseGroqResponse(raw) {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[CPH] Failed to parse API response:", err);
    return null;
  }
}

async function sendToCPH(tests) {
  const payload = {
    name: document.title,
    group: "LeetCode",
    url: window.location.href,
    interactive: false,
    tests,
  };

  // Delegate to background.js — content scripts can't fetch localhost (CORS)
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "SEND_TO_CPH", payload }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (response && response.ok) {
        resolve();
      } else {
        reject(new Error(`CPH error: ${response?.error}`));
      }
    });
  });
}


async function main() {
  const bar = createProgressBar();
  setProgress(bar, "Extracting examples…", 10, "info");

  const examples = extractExamples();

  if (examples.length === 0) {
    setProgress(bar, "No examples found on this page.", 100, "err");
    dismissProgress(bar, 5000);
    return;
  }

  setProgress(bar, `Found ${examples.length} example(s) — calling API…`, 30, "info");
  const prompt = buildPrompt(examples);
  let rawResponse;

  try {
    rawResponse = await callGroqAPI(prompt);
  } catch (err) {
    setProgress(bar, "Groq API call failed. Check console.", 100, "err");
    dismissProgress(bar, 6000);
    console.error("[CPH]", err);
    return;
  }

  setProgress(bar, "Parsing response…", 65, "info");
  const parsed = parseGroqResponse(rawResponse);

  if (!parsed || !Array.isArray(parsed.tests) || parsed.tests.length === 0) {
    setProgress(bar, "Bad API response — couldn't parse tests.", 100, "err");
    dismissProgress(bar, 6000);
    return;
  }

  setProgress(bar, `Sending ${parsed.tests.length} test(s) to CPH…`, 80, "info");

  try {
    await sendToCPH(parsed.tests);
    setProgress(bar, `Done! ${parsed.tests.length} test(s) sent. Switch to VS Code ⟶`, 100, "ok");
    dismissProgress(bar, 5000);
  } catch (err) {
    setProgress(bar, "Failed to send to CPH. Is it running?", 100, "err");
    dismissProgress(bar, 6000);
    console.error("[CPH]", err);
  }
}

main();
