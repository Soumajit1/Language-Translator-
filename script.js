// script.js — resilient translator with fallback servers
(() => {
  const apiBases = [
    "https://libretranslate.com",
    "https://translate.argosopentech.com",
    "https://libretranslate.de"
  ];
  let preferredIndex = 0;

  // DOM
  const inputText = document.getElementById("inputText");
  const outputText = document.getElementById("outputText");
  const inputLanguage = document.getElementById("inputLanguage");
  const outputLanguage = document.getElementById("outputLanguage");
  const swapBtn = document.getElementById("swapBtn");
  const chars = document.getElementById("chars");
  const detectedLabel = document.getElementById("detected");
  const status = document.getElementById("status");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const clearBtn = document.getElementById("clearBtn");

  const MAX_CHARS = 5000;

  function setStatus(msg, isError = false) {
    status.textContent = msg || "";
    status.style.color = isError ? "#b91c1c" : "#0f9d58";
    if (!msg) status.style.color = "#000";
    console.log("STATUS:", msg);
  }

  // Try POST to each server until success
  async function tryPost(path, body) {
    const tried = [];
    for (let i = 0; i < apiBases.length; i++) {
      const index = (preferredIndex + i) % apiBases.length;
      const url = apiBases[index] + path;
      try {
        console.log("Trying:", url, body);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(()=>"");
          console.warn(`Server ${url} returned status ${resp.status}`, txt);
          tried.push({ url, status: resp.status, text: txt });
          // try next server
          continue;
        }
        // success => make this server preferred
        preferredIndex = index;
        const json = await resp.json();
        console.log("Success from", url, json);
        return json;
      } catch (err) {
        console.warn("Network/Fetch error for", url, err.message);
        tried.push({ url, error: err.message });
        // try next
        continue;
      }
    }
    // all failed
    throw new Error("All translation servers failed: " + JSON.stringify(tried));
  }

  // Detect language (returns language code or null)
  async function detectLanguage(text) {
    try {
      const data = await tryPost("/detect", { q: text });
      if (Array.isArray(data) && data.length > 0 && data[0].language) {
        return data[0].language;
      }
      return null;
    } catch (e) {
      console.warn("Detect failed:", e.message);
      return null;
    }
  }

  // Translate
  async function translateNow() {
    const text = inputText.value.trim();
    if (!text) {
      outputText.value = "";
      detectedLabel.textContent = "";
      setStatus("");
      return;
    }

    if (text.length > MAX_CHARS) {
      inputText.value = text.slice(0, MAX_CHARS);
    }

    outputText.value = "Translating...";
    setStatus("Translating...");

    let source = inputLanguage.value;
    const target = outputLanguage.value;

    try {
      if (source === "auto") {
        const detected = await detectLanguage(text);
        if (detected) {
          detectedLabel.textContent = `Detected: ${detected}`;
          source = detected;
        } else {
          detectedLabel.textContent = "Detected: unknown";
        }
      } else {
        detectedLabel.textContent = "";
      }

      if (source === target) {
        outputText.value = text;
        setStatus("Source and target are the same — copied.");
        return;
      }

      const body = { q: text, source: source, target: target, format: "text" };
      const res = await tryPost("/translate", body);
      if (res && typeof res.translatedText === "string") {
        outputText.value = res.translatedText;
        setStatus("");
      } else {
        outputText.value = "Unexpected response from translation server.";
        setStatus("Unexpected response format", true);
        console.warn("unexpected translate response:", res);
      }
    } catch (err) {
      outputText.value = "Translation failed. See console.";
      setStatus("Translation failed: " + err.message, true);
      console.error(err);
    }
  }

  // debounce
  function debounce(fn, wait = 500) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const debouncedTranslate = debounce(translateNow, 600);

  // Events
  inputText.addEventListener("input", () => {
    if (inputText.value.length > MAX_CHARS) inputText.value = inputText.value.slice(0, MAX_CHARS);
    chars.textContent = `${inputText.value.length} / ${MAX_CHARS}`;
    debouncedTranslate();
  });

  inputLanguage.addEventListener("change", translateNow);
  outputLanguage.addEventListener("change", translateNow);

  swapBtn.addEventListener("click", () => {
    // do not swap if source is auto; visually flash
    if (inputLanguage.value === "auto") {
      inputLanguage.classList.add("flash");
      setTimeout(() => inputLanguage.classList.remove("flash"), 400);
      return;
    }
    const a = inputLanguage.value;
    inputLanguage.value = outputLanguage.value;
    outputLanguage.value = a;

    const t = inputText.value;
    inputText.value = outputText.value;
    outputText.value = t;
    chars.textContent = `${inputText.value.length} / ${MAX_CHARS}`;
    translateNow();
  });

  copyBtn.addEventListener("click", async () => {
    const txt = outputText.value.trim();
    if (!txt) { alert("Nothing to copy"); return; }
    try {
      await navigator.clipboard.writeText(txt);
      setStatus("Copied to clipboard");
      setTimeout(()=>setStatus(""), 1200);
    } catch (e) {
      alert("Copy failed: " + e.message);
    }
  });

  downloadBtn.addEventListener("click", () => {
    const txt = outputText.value.trim();
    if (!txt) { alert("Nothing to download"); return; }
    const filename = `translation-${outputLanguage.value}-${new Date().toISOString().replace(/[:.]/g,"-")}.txt`;
    const blob = new Blob([txt], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
  });

  clearBtn.addEventListener("click", () => {
    inputText.value = "";
    outputText.value = "";
    chars.textContent = `0 / ${MAX_CHARS}`;
    detectedLabel.textContent = "";
    setStatus("");
  });

  // initial
  chars.textContent = `0 / ${MAX_CHARS}`;
  setStatus("Ready");
})();



