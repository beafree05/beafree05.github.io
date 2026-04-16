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
