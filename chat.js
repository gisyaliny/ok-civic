/**
 * OKC Tree Chat Agent — floating chat panel
 *
 * Exposes nothing globally. Reads window.treeAgentContext for map state.
 * Calls POST /api/chat on the FastAPI backend.
 */

(function () {
    "use strict";

    const API_URL = "/api/chat";
    const MAX_HISTORY = 20; // max messages kept in conversation history

    // ── State ──────────────────────────────────────────────────────────────
    let isOpen = false;
    let isTyping = false;
    const conversationHistory = []; // { role, content }

    // ── DOM creation ───────────────────────────────────────────────────────

    function createChatUI() {
        // FAB button
        const fab = document.createElement("button");
        fab.id = "chatFab";
        fab.className = "chat-fab";
        fab.setAttribute("aria-label", "Open tree chat assistant");
        fab.setAttribute("title", "Ask the tree planting assistant");
        fab.innerHTML = `
            <span class="chat-fab-icon" aria-hidden="true">🌳</span>
            <span class="chat-fab-label">Tree Chat</span>
        `;

        // Chat panel
        const panel = document.createElement("div");
        panel.id = "chatPanel";
        panel.className = "chat-panel hidden";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Tree Chat Assistant");
        panel.innerHTML = `
            <div class="chat-header">
                <div class="chat-header-info">
                    <span class="chat-header-icon" aria-hidden="true">🌳</span>
                    <div>
                        <div class="chat-header-title">Tree Planting Assistant</div>
                        <div class="chat-header-sub">Powered by local Qwen AI · OKC knowledge base</div>
                    </div>
                </div>
                <button id="chatCloseBtn" class="chat-close-btn" aria-label="Close chat">✕</button>
            </div>

            <div id="chatMessages" class="chat-messages" aria-live="polite" aria-atomic="false">
                <div class="chat-message assistant">
                    <div class="chat-bubble">
                        Hello! I'm your OKC tree planting assistant. I can help you understand
                        suitability results, choose the right tree species, and follow
                        proper planting practices.<br><br>
                        Try asking: <em>"Why isn't this location suitable?"</em> or
                        <em>"Which trees are best for OKC?"</em>
                    </div>
                </div>
            </div>

            <div id="chatTypingIndicator" class="chat-typing hidden" aria-label="Assistant is typing">
                <span></span><span></span><span></span>
            </div>

            <div class="chat-input-row">
                <textarea
                    id="chatInput"
                    class="chat-input"
                    placeholder="Ask about tree planting in OKC…"
                    rows="1"
                    maxlength="800"
                    aria-label="Chat message"
                ></textarea>
                <button id="chatSendBtn" class="chat-send-btn" aria-label="Send message" disabled>
                    ➤
                </button>
            </div>
        `;

        document.body.appendChild(fab);
        document.body.appendChild(panel);
        return { fab, panel };
    }

    // ── Message rendering ──────────────────────────────────────────────────

    function appendMessage(role, content) {
        const messagesEl = document.getElementById("chatMessages");
        if (!messagesEl) return;

        const wrapper = document.createElement("div");
        wrapper.className = `chat-message ${role}`;

        const bubble = document.createElement("div");
        bubble.className = "chat-bubble";
        // Render newlines and basic markdown bold/italic
        bubble.innerHTML = formatMessageContent(content);

        wrapper.appendChild(bubble);
        messagesEl.appendChild(wrapper);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function formatMessageContent(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/\n/g, "<br>");
    }

    function setTyping(active) {
        isTyping = active;
        const indicator = document.getElementById("chatTypingIndicator");
        const sendBtn = document.getElementById("chatSendBtn");
        indicator?.classList.toggle("hidden", !active);
        if (sendBtn) sendBtn.disabled = active;

        if (active) {
            const msgs = document.getElementById("chatMessages");
            if (msgs) msgs.scrollTop = msgs.scrollHeight;
        }
    }

    // ── Auto-resize textarea ───────────────────────────────────────────────

    function autoResize(textarea) {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }

    // ── API call ───────────────────────────────────────────────────────────

    async function sendMessage(userText) {
        if (!userText.trim() || isTyping) return;

        appendMessage("user", userText);
        conversationHistory.push({ role: "user", content: userText });

        // Trim history to avoid huge payloads
        const historyToSend = conversationHistory.slice(-MAX_HISTORY);

        setTyping(true);

        try {
            const resp = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: historyToSend,
                    context: window.treeAgentContext || null
                })
            });

            if (!resp.ok) {
                let errMsg = `Server error ${resp.status}`;
                try {
                    const errData = await resp.json();
                    errMsg = errData.detail || errMsg;
                } catch (_) {}
                throw new Error(errMsg);
            }

            const data = await resp.json();
            const reply = data.reply || "(no response)";

            conversationHistory.push({ role: "assistant", content: reply });
            appendMessage("assistant", reply);

        } catch (err) {
            const errText = err.message.includes("Failed to fetch")
                ? "Cannot reach the server. Make sure the FastAPI backend is running:\n.venv/Scripts/activate && uvicorn backend.app:app --port 3000"
                : err.message;
            appendMessage("assistant", `⚠ Error: ${errText}`);
        } finally {
            setTyping(false);
        }
    }

    // ── Open/close panel ──────────────────────────────────────────────────

    function openChat() {
        isOpen = true;
        document.getElementById("chatPanel")?.classList.remove("hidden");
        document.getElementById("chatFab")?.classList.add("is-open");
        document.getElementById("chatInput")?.focus();
    }

    function closeChat() {
        isOpen = false;
        document.getElementById("chatPanel")?.classList.add("hidden");
        document.getElementById("chatFab")?.classList.remove("is-open");
    }

    // ── Event wiring ───────────────────────────────────────────────────────

    function wireEvents() {
        const fab = document.getElementById("chatFab");
        const closeBtn = document.getElementById("chatCloseBtn");
        const input = document.getElementById("chatInput");
        const sendBtn = document.getElementById("chatSendBtn");

        fab?.addEventListener("click", () => (isOpen ? closeChat() : openChat()));
        closeBtn?.addEventListener("click", closeChat);

        input?.addEventListener("input", () => {
            autoResize(input);
            if (sendBtn) sendBtn.disabled = !input.value.trim() || isTyping;
        });

        input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn?.disabled) triggerSend();
            }
        });

        sendBtn?.addEventListener("click", triggerSend);

        // Close on Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isOpen) closeChat();
        });
    }

    function triggerSend() {
        const input = document.getElementById("chatInput");
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = "";
        autoResize(input);
        const sendBtn = document.getElementById("chatSendBtn");
        if (sendBtn) sendBtn.disabled = true;
        sendMessage(text);
    }

    // ── Init ───────────────────────────────────────────────────────────────

    function init() {
        createChatUI();
        wireEvents();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
