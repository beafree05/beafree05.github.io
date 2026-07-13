const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onRequest } = require("firebase-functions/v2/https");

initializeApp();

exports.appleCalendarFeed = onRequest(
  {
    region: "asia-northeast1",
    invoker: "public"
  },
  async (request, response) => {
    try {
      const snapshot = await getFirestore()
        .collection("calendarEvents")
        .orderBy("date", "asc")
        .orderBy("startTime", "asc")
        .get();

      const events = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      const ics = buildCalendarIcs(events);

      response.set("Content-Type", "text/calendar; charset=utf-8");
      response.set("Cache-Control", "public, max-age=300");
      response.status(200).send(ics);
    } catch (error) {
      console.error("Generate Apple calendar feed failed:", error);
      response.status(500).send("Unable to generate calendar feed.");
    }
  }
);

exports.dictionaryLookup = onRequest(
  {
    region: "asia-northeast1",
    invoker: "public"
  },
  async (request, response) => {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "GET") {
      response.status(405).json({ error: "Method not allowed." });
      return;
    }

    const term = String(request.query.term || "").trim();
    if (!term) {
      response.status(400).json({ error: "Missing term." });
      return;
    }

    try {
      const remoteResponse = await fetch(`https://kotobank.jp/word/${encodeURIComponent(term)}`, {
        headers: {
          "User-Agent": "my-site-dictionary-lookup/1.0"
        },
        redirect: "follow"
      });

      if (!remoteResponse.ok) {
        response.status(502).json({ error: "Dictionary upstream request failed." });
        return;
      }

      const html = await remoteResponse.text();
      const payload = extractKotobankEntry(html, remoteResponse.url, term);
      response.set("Cache-Control", "public, max-age=1800");
      response.status(200).json(payload);
    } catch (error) {
      console.error("Dictionary lookup failed:", error);
      response.status(500).json({ error: "Unable to load dictionary entry." });
    }
  }
);

exports.vocabAnalyze = onRequest(
  {
    region: "asia-northeast1",
    invoker: "public",
    timeoutSeconds: 60
  },
  async (request, response) => {
    setCorsHeaders(response, "POST, OPTIONS");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({ error: "Method not allowed." });
      return;
    }

    const word = String(request.body?.word || "").trim();
    const contextNote = String(request.body?.contextNote || "").trim();

    if (!word) {
      response.status(400).json({ error: "Missing word." });
      return;
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseUrl = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
    const model = String(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash");

    if (!apiKey) {
      response.status(500).json({ error: "DEEPSEEK_API_KEY is not configured." });
      return;
    }

    try {
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
        console.error("DeepSeek upstream error:", upstreamPayload);
        response.status(502).json({
          error: upstreamPayload.error?.message || "DeepSeek upstream request failed."
        });
        return;
      }

      const content = upstreamPayload?.choices?.[0]?.message?.content;
      if (!content) {
        response.status(502).json({ error: "DeepSeek returned empty content." });
        return;
      }

      const parsed = JSON.parse(content);
      const report = normalizeAiVocabularyReport(parsed, word, contextNote);

      response.set("Cache-Control", "no-store");
      response.status(200).json({
        source: "DeepSeek",
        model,
        report
      });
    } catch (error) {
      console.error("Vocabulary analyze failed:", error);
      response.status(500).json({ error: "Unable to generate vocabulary report." });
    }
  }
);

function buildCalendarIcs(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Site Calendar//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:我的实时日历"
  ];

  events.forEach((eventItem) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${eventItem.id}@my-site`);
    lines.push(`DTSTAMP:${toIcsUtc(new Date())}`);

    if (eventItem.startTime) {
      lines.push(`DTSTART:${formatDateTime(eventItem.date, eventItem.startTime)}`);
      lines.push(`DTEND:${formatDateTime(eventItem.date, eventItem.endTime || addHour(eventItem.startTime))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(eventItem.date)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDate(addDays(eventItem.date, 1))}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(eventItem.title || "未命名事项")}`);

    if (eventItem.note) {
      lines.push(`DESCRIPTION:${escapeIcsText(eventItem.note)}`);
    }

    if (eventItem.repeat && eventItem.repeat !== "none") {
      lines.push(`RRULE:${repeatToRRule(eventItem.repeat)}`);
    }

    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function setCorsHeaders(response, methods = "GET, OPTIONS") {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", methods);
  response.set("Access-Control-Allow-Headers", "Content-Type");
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

function extractKotobankEntry(html, finalUrl, term) {
  const title = decodeHtml(matchFirst(html, /<title>([\s\S]*?)<\/title>/i) || "");
  const headingText = decodeHtml(matchFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || "");
  const cleanedHeading = stripTags(headingText).replace(/\s+/g, " ").trim();

  const headingMatch = cleanedHeading.match(/^(.+?)\uFF08\u8AAD\u307F\uFF09(.+)$/);
  const reading = headingMatch ? headingMatch[2].trim() : "\u8981\u78BA\u8A8D";
  const writing = headingMatch ? headingMatch[1].trim() : term;

  const dictionaries = Array.from(
    html.matchAll(/<h2[^>]*>[\s\S]*?\u300c[^\u300d]+\u300d\u306e\u610f\u5473[^<]*<\/h2>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi)
  )
    .slice(0, 3)
    .map((match) => {
      const subheading = stripTags(decodeHtml(match[1])).replace(/\s+/g, " ").trim();
      const definition = stripTags(decodeHtml(match[2])).replace(/\s+/g, " ").trim();
      return {
        subheading,
        definition
      };
    })
    .filter((item) => item.subheading || item.definition);

  const firstDefinition = dictionaries[0] ? dictionaries[0].definition : "";
  const partOfSpeech = inferPartOfSpeechFromDefinition(firstDefinition);

  return {
    source: "Kotobank",
    finalUrl,
    title,
    writing,
    reading,
    partOfSpeech,
    definitions: dictionaries
  };
}

function inferPartOfSpeechFromDefinition(text) {
  if (!text) {
    return "\u8981\u78BA\u8A8D";
  }

  const mapping = [
    { token: "\uFF3B\u540D\uFF3D", label: "\u540D\u8A5E" },
    { token: "\uFF3B\u52D5", label: "\u52D5\u8A5E" },
    { token: "\uFF3B\u5F62\u52D5", label: "\u5F62\u5BB9\u52D5\u8A5E" },
    { token: "\uFF3B\u5F62\uFF3D", label: "\u5F62\u5BB9\u8A5E" },
    { token: "\u3018 \u540D\u8A5E \u3019", label: "\u540D\u8A5E" },
    { token: "\u3018 \u52D5\u8A5E \u3019", label: "\u52D5\u8A5E" },
    { token: "\u3018 \u5F62\u5BB9\u8A5E \u3019", label: "\u5F62\u5BB9\u8A5E" }
  ];

  const found = mapping.find((item) => text.includes(item.token));
  return found ? found.label : "\u8981\u78BA\u8A8D";
}

function matchFirst(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function repeatToRRule(repeat) {
  switch (repeat) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "monthly":
      return "FREQ=MONTHLY";
    case "yearly":
      return "FREQ=YEARLY";
    default:
      return "";
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatDateTime(dateString, timeString) {
  const date = new Date(`${dateString}T${timeString}:00`);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addHour(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes, 0);
  date.setHours(date.getHours() + 1);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeIcsText(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}
