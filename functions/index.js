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

function setCorsHeaders(response) {
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");
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
