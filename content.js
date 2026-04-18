const API_KEY = "YOUR_GROQ_API_KEY"; // Replace with your key from console.groq.com
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CPH_URL = "http://localhost:27121";

// ── Minimal toast UI ──────────────────────────────────────────────
function createToast() {
  const el = document.createElement("div");
  el.id = "cph-toast";
  el.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:999999",
    "background:#1e1e2e", "color:#cdd6f4", "font:13px/1.5 monospace",
    "padding:10px 16px", "border-radius:8px", "box-shadow:0 4px 20px rgba(0,0,0,.5)",
    "border-left:3px solid #89b4fa", "min-width:220px", "max-width:320px",
    "transition:opacity .3s"
  ].join(";");
  document.body.appendChild(el);
  return el;
}

function setToast(el, msg, state /* 'info'|'ok'|'err' */) {
  const colors = { info: "#89b4fa", ok: "#a6e3a1", err: "#f38ba8" };
  const icons  = { info: "⏳", ok: "✅", err: "❌" };
  el.style.borderLeftColor = colors[state] || colors.info;
  el.textContent = icons[state] + "  " + msg;
  el.style.opacity = "1";
}

function dismissToast(el, delay = 4000) {
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 350);
  }, delay);
}
// ─────────────────────────────────────────────────────────────────

function extractExamples() {
  const examples = [];

  // Pass 1: <pre> blocks inside example containers
  const exampleBlocks = document.querySelectorAll(
    '[class*="example"] pre, .example-block, pre'
  );

  if (exampleBlocks.length > 0) {
    exampleBlocks.forEach((block) => {
      const text = block.innerText || block.textContent || "";
      const inputMatch  = text.match(/Input[:\s]+([\s\S]*?)(?:Output[:\s]+|$)/i);
      const outputMatch = text.match(/Output[:\s]+([\s\S]*?)(?:Explanation[:\s]+|$)/i);
      if (inputMatch && outputMatch) {
        examples.push({
          input:  inputMatch[1].trim(),
          output: outputMatch[1].trim(),
        });
      }
    });
  }

  // Pass 2: data-example-id / ExampleTestcases containers
  if (examples.length === 0) {
    const containers = document.querySelectorAll('[data-example-id], [class*="ExampleTestcases"]');
    containers.forEach((container) => {
      const text = container.innerText || container.textContent || "";
      const inputMatch  = text.match(/Input[:\s]+([\s\S]*?)Output[:\s]+/i);
      const outputMatch = text.match(/Output[:\s]+([\s\S]*?)(?:Explanation|$)/i);
      if (inputMatch && outputMatch) {
        examples.push({
          input:  inputMatch[1].trim(),
          output: outputMatch[1].trim(),
        });
      }
    });
  }

  // Pass 3: full-page regex fallback
  if (examples.length === 0) {
    const allText = document.body.innerText;
    const pattern = /Input:\s*([\s\S]*?)\nOutput:\s*([\s\S]*?)(?:\nExplanation:|\nExample \d|$)/gi;
    let match;
    while ((match = pattern.exec(allText)) !== null) {
      examples.push({
        input:  match[1].trim(),
        output: match[2].trim(),
      });
    }
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
Use plain strings and end each line with \n.
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
  const toast = createToast();
  setToast(toast, "Extracting examples…", "info");

  const examples = extractExamples();

  if (examples.length === 0) {
    setToast(toast, "No examples found on this page.", "err");
    dismissToast(toast, 5000);
    return;
  }

  setToast(toast, `Found ${examples.length} example(s) — calling API…`, "info");
  const prompt = buildPrompt(examples);
  let rawResponse;

  try {
    rawResponse = await callGroqAPI(prompt);
  } catch (err) {
    setToast(toast, "Groq API call failed. Check console.", "err");
    dismissToast(toast, 6000);
    console.error("[CPH]", err);
    return;
  }

  setToast(toast, "Parsing response…", "info");
  const parsed = parseGroqResponse(rawResponse);

  if (!parsed || !Array.isArray(parsed.tests) || parsed.tests.length === 0) {
    setToast(toast, "Bad API response — couldn't parse tests.", "err");
    dismissToast(toast, 6000);
    return;
  }

  setToast(toast, `Sending ${parsed.tests.length} test(s) to CPH…`, "info");

  try {
    await sendToCPH(parsed.tests);
    setToast(toast, `Done! ${parsed.tests.length} test(s) sent to CPH.`, "ok");
    dismissToast(toast, 4000);
  } catch (err) {
    setToast(toast, "Failed to send to CPH. Is it running?", "err");
    dismissToast(toast, 6000);
    console.error("[CPH]", err);
  }
}

main();
