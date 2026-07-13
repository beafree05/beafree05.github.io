const PERSONA_CHAT_URL = "https://asia-northeast1-sairyushi-readinglist.cloudfunctions.net/personaChat";
const LOCAL_PERSONA_CHAT_URL = "http://127.0.0.1:4173/api/persona-chat";

const STORAGE_KEY = "taffy-theme-chat-session-v1";
const MAX_HISTORY = 12;
const welcomeMessage = {
  role: "assistant",
  content: "呀，你终于来啦。这里可以聊学习、日常，也可以单纯来发发牢骚——先说好，本小姐会认真听，但偶尔吐槽两句也很合理吧？"
};

const chat = {
  messages: readSessionMessages(),
  pending: false,
  dom: {}
};

initPersonaChat();

function initPersonaChat() {
  chat.dom.messages = document.getElementById("aiChatMessages");
  chat.dom.form = document.getElementById("aiChatForm");
  chat.dom.input = document.getElementById("aiChatInput");
  chat.dom.send = document.getElementById("aiChatSend");
  chat.dom.clear = document.getElementById("aiChatClear");
  chat.dom.status = document.getElementById("aiChatStatus");
  chat.dom.typing = document.getElementById("aiChatTyping");

  if (!chat.dom.messages || !chat.dom.form || !chat.dom.input) {
    return;
  }

  if (!chat.messages.length) {
    chat.messages = [welcomeMessage];
  }

  renderMessages();

  chat.dom.form.addEventListener("submit", handleSubmit);
  chat.dom.send.addEventListener("click", () => chat.dom.form.requestSubmit());
  chat.dom.clear.addEventListener("click", clearConversation);
  chat.dom.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chat.dom.form.requestSubmit();
    }
  });

  document.querySelectorAll("[data-chat-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      chat.dom.input.value = button.dataset.chatPrompt || "";
      chat.dom.input.focus();
    });
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  const message = chat.dom.input.value.trim();
  if (!message || chat.pending) {
    return;
  }

  const history = chat.messages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-MAX_HISTORY);

  chat.messages.push({ role: "user", content: message });
  chat.messages = chat.messages.slice(-(MAX_HISTORY + 1));
  chat.dom.input.value = "";
  setPending(true);
  renderMessages();

  try {
    const payload = await requestReply(message, history);
    chat.messages.push({ role: "assistant", content: payload.reply });
    chat.messages = chat.messages.slice(-(MAX_HISTORY + 1));
    saveSessionMessages();
    setStatus("永雏塔菲主题 AI 刚刚回复了你", "success");
  } catch (error) {
    console.error("Persona chat failed:", error);
    const detail = error instanceof Error && error.message ? `：${error.message}` : "";
    setStatus(`没有收到 AI 回复${detail}`, "error");
  } finally {
    setPending(false);
    renderMessages();
    chat.dom.input.focus();
  }
}

async function requestReply(message, history) {
  const endpoints = buildChatEndpoints();
  let lastError = new Error("No chat endpoint is available.");

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Chat request failed.");
      }

      const reply = String(payload.reply || "").trim();
      if (!reply) {
        throw new Error("The chat service returned an empty reply.");
      }

      return { ...payload, reply };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function buildChatEndpoints() {
  const endpoints = [];
  const hostname = window.location.hostname.toLowerCase();
  const isLocal =
    !hostname ||
    ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  if (isLocal) {
    if (["http:", "https:"].includes(window.location.protocol)) {
      endpoints.push(`${window.location.origin}/api/persona-chat`);
    }
    endpoints.push(LOCAL_PERSONA_CHAT_URL);
  }

  endpoints.push(PERSONA_CHAT_URL);
  return [...new Set(endpoints)];
}

function renderMessages() {
  if (!chat.dom.messages) {
    return;
  }

  chat.dom.messages.innerHTML = "";
  chat.messages.forEach((message) => {
    const row = document.createElement("div");
    row.className = `ai-message-row ${message.role === "user" ? "is-user" : "is-assistant"}`;

    const avatar = document.createElement("span");
    avatar.className = "ai-message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = message.role === "user" ? "你" : "菲";

    const bubble = document.createElement("p");
    bubble.className = "ai-message-bubble";
    bubble.textContent = message.content;

    row.append(avatar, bubble);
    chat.dom.messages.appendChild(row);
  });

  requestAnimationFrame(() => {
    chat.dom.messages.scrollTop = chat.dom.messages.scrollHeight;
  });
}

function setPending(nextPending) {
  chat.pending = nextPending;
  chat.dom.input.disabled = nextPending;
  chat.dom.send.disabled = nextPending;
  chat.dom.clear.disabled = nextPending;
  chat.dom.typing.hidden = !nextPending;
  chat.dom.send.firstChild.textContent = nextPending ? "思考中 " : "发送 ";
  if (nextPending) {
    setStatus("正在组织语言……");
  }
}

function setStatus(message, type = "") {
  chat.dom.status.textContent = message;
  chat.dom.status.dataset.type = type;
}

function clearConversation() {
  if (chat.pending) {
    return;
  }

  chat.messages = [welcomeMessage];
  sessionStorage.removeItem(STORAGE_KEY);
  setStatus("对话已清空，重新开始吧", "success");
  renderMessages();
  chat.dom.input.focus();
}

function readSessionMessages() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored
      .filter((item) => ["user", "assistant"].includes(item?.role) && typeof item?.content === "string")
      .map((item) => ({ role: item.role, content: item.content.slice(0, 1200) }))
      .slice(-(MAX_HISTORY + 1));
  } catch (error) {
    console.warn("Unable to restore chat session:", error);
    return [];
  }
}

function saveSessionMessages() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat.messages));
  } catch (error) {
    console.warn("Unable to save chat session:", error);
  }
}
