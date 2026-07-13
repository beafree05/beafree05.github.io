const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = 4173;
const HOST = "127.0.0.1";
const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, "functions", ".env");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const env = loadDotEnv(ENV_PATH);
const apiKey = env.DEEPSEEK_API_KEY || "";
const baseUrl = String(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
const model = String(env.DEEPSEEK_MODEL || "deepseek-v4-flash");

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const parsedUrl = new URL(request.url, `http://${HOST}:${PORT}`);

  if (parsedUrl.pathname === "/api/vocab-analyze") {
    await handleVocabAnalyze(request, response);
    return;
  }

  serveStaticFile(parsedUrl.pathname, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Local vocab server running at http://${HOST}:${PORT}`);
});

async function handleVocabAnalyze(request, response) {
  if (request.method !== "POST") {
    respondJson(response, 405, { error: "Method not allowed." });
    return;
  }

  if (!apiKey) {
    respondJson(response, 500, { error: "本地代理没有读取到 DEEPSEEK_API_KEY。" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const word = String(body.word || "").trim();
    const contextNote = String(body.contextNote || "").trim();

    if (!word) {
      respondJson(response, 400, { error: "Missing word." });
      return;
    }

    const upstreamResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 2600,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: buildVocabSystemPrompt()
          },
          {
            role: "user",
            content: buildVocabUserPrompt(word, contextNote)
          }
        ]
      })
    });

    const upstreamPayload = await upstreamResponse.json().catch(() => ({}));
    if (!upstreamResponse.ok) {
      respondJson(response, 502, {
        error: upstreamPayload.error?.message || "DeepSeek upstream request failed."
      });
      return;
    }

    const content = upstreamPayload?.choices?.[0]?.message?.content;
    if (!content) {
      respondJson(response, 502, { error: "DeepSeek returned empty content." });
      return;
    }

    const report = normalizeAiVocabularyReport(JSON.parse(content), word, contextNote);
    respondJson(response, 200, {
      source: "DeepSeek",
      model,
      report
    });
  } catch (error) {
    console.error("Local vocab proxy failed:", error);
    respondJson(response, 500, { error: error.message || "Unable to generate vocabulary report." });
  }
}

function serveStaticFile(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const fullPath = path.normalize(path.join(ROOT, decodeURIComponent(safePath)));

  if (!fullPath.startsWith(ROOT)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("File not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("请求体不是合法 JSON。"));
      }
    });
    request.on("error", reject);
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const result = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const splitIndex = trimmed.indexOf("=");
    if (splitIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, splitIndex).trim();
    const value = trimmed.slice(splitIndex + 1).trim();
    result[key] = value;
  });
  return result;
}

function buildVocabSystemPrompt() {
  return [
    "You are a professional Japanese teacher.",
    "Return valid json only.",
    "Teach one Japanese word or expression for a Chinese-speaking learner.",
    "Be precise. If a reading, nuance, or usage detail is uncertain, write 需要确认 instead of guessing.",
    "Examples must sound natural in Japanese.",
    "Do not cite fake dictionary names or fake sources.",
    "Use simplified Chinese for explanations.",
    "Keep the response compact but genuinely useful for learning.",
    "JSON schema example:",
    JSON.stringify({
      writing: "獲得する",
      reading: "かくとくする",
      romaji: "kakutoku suru",
      partOfSpeech: "名词・サ变动词",
      frequencyLabel: "常用",
      registerLabel: "书面语偏多，可用于正式说明",
      coreMeaningCn: "通过努力、行动或竞争获得有价值的事物",
      meanings: [
        { title: "最常见含义", body: "..." },
        { title: "含义 2", body: "..." }
      ],
      usageNotes: [
        { label: "是否常用", value: "..." },
        { label: "使用场景", value: "..." },
        { label: "搭配或固定表达", value: "..." }
      ],
      collocations: ["知識を獲得する", "支持を獲得する"],
      examples: [
        { ja: "彼は新しい市場で大きな支持を獲得した。", zh: "他在新市场获得了很大的支持。", note: "展示书面语里常见的搭配。" },
        { ja: "大学で専門知識を獲得することが大切だ。", zh: "在大学获得专业知识很重要。", note: "展示抽象对象也能和这个词搭配。" }
      ],
      nuanceNotes: [
        { label: "与相似词的区别", value: "..." },
        { label: "常见错误用法", value: "..." },
        { label: "使用时需要注意", value: "..." }
      ],
      weakPoints: ["容易和「取得する」混淆", "口语里不一定要选这个词"],
      learningTip: "...",
      teacherNote: "..."
    })
  ].join("\n");
}

function buildVocabUserPrompt(word, contextNote) {
  return [
    "Please analyze this Japanese vocabulary item and return json.",
    `word: ${word}`,
    `context_note: ${contextNote || "无额外语境"}`,
    "Required teaching structure:",
    "1. Basic info: word, reading, romaji(optional), part of speech.",
    "2. Chinese meanings: most common meaning first, distinguish multiple senses if needed.",
    "3. Usage: whether common, scene/register, collocations/fixed expressions.",
    "4. Examples: 2 to 3 natural Japanese examples, each with Chinese translation and a short usage explanation.",
    "5. Nuance / caution: similar words, common mistakes, usage details.",
    "6. Learning tip: one short memory aid.",
    "Extra requirement: if the user context asks about interview, ES, thesis, formal writing, or casual speech, address that directly."
  ].join("\n");
}

function normalizeAiVocabularyReport(payload, fallbackWord, contextNote) {
  const data = payload && typeof payload === "object" ? payload : {};
  const meanings = normalizeTitledArray(data.meanings);
  const usageNotes = normalizeLabelValueArray(data.usageNotes);
  const nuanceNotes = normalizeLabelValueArray(data.nuanceNotes);
  const examples = normalizeExampleArray(data.examples);

  return {
    writing: cleanString(data.writing, fallbackWord),
    reading: cleanString(data.reading, "需要确认"),
    romaji: cleanString(data.romaji, ""),
    partOfSpeech: cleanString(data.partOfSpeech, "需要确认"),
    frequencyLabel: cleanString(data.frequencyLabel, "需要确认"),
    registerLabel: cleanString(data.registerLabel, "需要确认"),
    coreMeaningCn: cleanString(data.coreMeaningCn, meanings[0]?.body || "需要结合语境进一步确认"),
    meanings: meanings.length ? meanings : [
      {
        title: "最常见含义",
        body: "需要结合语境进一步确认。"
      }
    ],
    usageNotes: usageNotes.length ? usageNotes : [
      { label: "是否常用", value: "需要确认" },
      { label: "使用场景", value: "请结合真实句子进一步确认。" },
      { label: "搭配或固定表达", value: "本次结果未稳定提取出固定搭配。" }
    ],
    collocations: normalizeStringArray(data.collocations),
    examples: examples.length ? examples : [
      {
        ja: "例句需要确认。",
        zh: "这次没有成功提取出稳定例句。",
        note: "可以稍后重新查询。"
      }
    ],
    nuanceNotes: nuanceNotes.length ? nuanceNotes : [
      { label: "与相似词的区别", value: "需要确认" },
      { label: "常见错误用法", value: "请避免直接套用到正式语境中。" },
      { label: "使用时需要注意", value: "建议先通过例句理解语感。" }
    ],
    weakPoints: normalizeStringArray(data.weakPoints),
    learningTip: cleanString(data.learningTip, "先记住最自然的一句例句，再回头看它和近义词的区别。"),
    teacherNote: cleanString(data.teacherNote, "本次讲解由 DeepSeek 生成，并按学习者阅读结构整理。"),
    contextNote: cleanString(contextNote, "")
  };
}

function buildVocabSystemPrompt() {
  return [
    "You are a professional Japanese teacher.",
    "Return valid json only.",
    "Teach one Japanese word or expression for a Chinese-speaking learner.",
    "Use simplified Chinese for explanations and natural Japanese for examples.",
    "If the user provides a question about the word, answer that question directly in a dedicated field.",
    "If the question field is empty, leave contextAnswer as an empty string.",
    "Be precise. If a reading, nuance, or usage detail is uncertain, write 需要确认 instead of guessing.",
    "Do not cite fake dictionary names or fake sources.",
    "JSON schema example:",
    JSON.stringify({
      writing: "獲得する",
      reading: "かくとくする",
      romaji: "kakutoku suru",
      partOfSpeech: "名词・サ变动词",
      frequencyLabel: "常用",
      registerLabel: "书面语偏多，可用于正式说明",
      coreMeaningCn: "通过努力、行动或竞争获得有价值的事物",
      contextQuestion: "它和「取得する」有什么区别？",
      contextAnswer: "「獲得する」更强调通过努力争取到成果...",
      meanings: [
        { title: "最常见含义", body: "..." }
      ],
      usageNotes: [
        { label: "是否常用", value: "..." },
        { label: "使用场景", value: "..." },
        { label: "搭配或固定表达", value: "..." }
      ],
      collocations: ["知識を獲得する"],
      examples: [
        { ja: "彼は新しい資格を獲得した。", zh: "他获得了新的资格。", note: "展示正式书面语搭配。" }
      ],
      nuanceNotes: [
        { label: "与相似词的区别", value: "..." },
        { label: "常见错误用法", value: "..." },
        { label: "使用时需要注意", value: "..." }
      ],
      weakPoints: ["容易和「取得する」混淆"],
      learningTip: "...",
      teacherNote: "..."
    })
  ].join("\n");
}

function buildVocabUserPrompt(word, contextNote) {
  return [
    "Please analyze this Japanese vocabulary item and return json.",
    `word: ${word}`,
    `user_question: ${contextNote || "无额外问题"}`,
    "Required teaching structure:",
    "1. Basic info: word, reading, romaji(optional), part of speech.",
    "2. Chinese meanings: most common meaning first, distinguish multiple senses if needed.",
    "3. Usage: whether common, scene/register, collocations/fixed expressions.",
    "4. If user_question is not empty, answer it directly in contextAnswer. If it is empty, return contextAnswer as an empty string.",
    "5. Examples: 2 to 3 natural Japanese examples, each with Chinese translation and a short usage explanation.",
    "6. Nuance / caution: similar words, common mistakes, usage details.",
    "7. Learning tip: one short memory aid."
  ].join("\n");
}

function normalizeAiVocabularyReport(payload, fallbackWord, contextNote) {
  const data = payload && typeof payload === "object" ? payload : {};
  const meanings = normalizeTitledArray(data.meanings);
  const usageNotes = normalizeLabelValueArray(data.usageNotes);
  const nuanceNotes = normalizeLabelValueArray(data.nuanceNotes);
  const examples = normalizeExampleArray(data.examples);

  return {
    writing: cleanString(data.writing, fallbackWord),
    reading: cleanString(data.reading, "需要确认"),
    romaji: cleanString(data.romaji, ""),
    partOfSpeech: cleanString(data.partOfSpeech, "需要确认"),
    frequencyLabel: cleanString(data.frequencyLabel, "需要确认"),
    registerLabel: cleanString(data.registerLabel, "需要确认"),
    coreMeaningCn: cleanString(data.coreMeaningCn, meanings[0]?.body || "需要结合语境进一步确认"),
    contextQuestion: cleanString(data.contextQuestion, contextNote || ""),
    contextAnswer: cleanString(data.contextAnswer, ""),
    meanings: meanings.length ? meanings : [
      { title: "最常见含义", body: "需要结合语境进一步确认。" }
    ],
    usageNotes: usageNotes.length ? usageNotes : [
      { label: "是否常用", value: "需要确认" },
      { label: "使用场景", value: "请结合真实句子进一步确认。" },
      { label: "搭配或固定表达", value: "本次结果未稳定提取出固定搭配。" }
    ],
    collocations: normalizeStringArray(data.collocations),
    examples: examples.length ? examples : [
      {
        ja: "例句需要确认。",
        zh: "这次没有成功提取出稳定例句。",
        note: "可以稍后重新查询。"
      }
    ],
    nuanceNotes: nuanceNotes.length ? nuanceNotes : [
      { label: "与相似词的区别", value: "需要确认" },
      { label: "常见错误用法", value: "请避免直接套用到正式语境中。" },
      { label: "使用时需要注意", value: "建议先通过例句理解语感。" }
    ],
    weakPoints: normalizeStringArray(data.weakPoints),
    learningTip: cleanString(data.learningTip, "先记住最自然的一句例句，再回头看它和近义词的区别。"),
    teacherNote: cleanString(data.teacherNote, "本次讲解由 DeepSeek 生成，并按学习者阅读结构整理。"),
    contextNote: cleanString(contextNote, "")
  };
}

function normalizeTitledArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      title: cleanString(item?.title, ""),
      body: cleanString(item?.body, "")
    }))
    .filter((item) => item.title && item.body);
}

function normalizeLabelValueArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      label: cleanString(item?.label, ""),
      value: cleanString(item?.value, "")
    }))
    .filter((item) => item.label && item.value);
}

function normalizeExampleArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      ja: cleanString(item?.ja, ""),
      zh: cleanString(item?.zh, ""),
      note: cleanString(item?.note, "")
    }))
    .filter((item) => item.ja && item.zh);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => cleanString(item, "")).filter(Boolean))];
}

function cleanString(value, fallback = "") {
  const result = String(value || "").replace(/\s+/g, " ").trim();
  return result || fallback;
}
