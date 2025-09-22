/* gc-chat.js — full copy-paste */

import { callGemini } from "../api/gemini.js";
import { marked } from "marked";
import DOMPurify from "dompurify";
import axios from "axios";

class GitterCommFloating extends HTMLElement {
  constructor() {
    super();

    /* --- template ------------------------------------------------------- */
    const t = document
      .getElementById("gc-chat-template")
      .content.cloneNode(true);
    this.attachShadow({ mode: "open" }).appendChild(t);

    /* load Tailwind inside the shadow-root */
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/assets/styles.css";
    this.shadowRoot.prepend(link);

    /* short-cuts --------------------------------------------------------- */
    this.$panel = this.shadowRoot.getElementById("panel");
    this.$chat = this.shadowRoot.getElementById("chat");
    this.$input = this.shadowRoot.getElementById("input");
    this.$launcher = this.shadowRoot.getElementById("launcher");

    /* launcher toggles the chat window */
    this.$launcher.addEventListener("click", () => {
      this.$panel.classList.toggle("open");
      if (this.$panel.classList.contains("open")) this.$input.focus();
    });

    /* send on Enter */
    this.$input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend(e);
      }
    });

    /* send on explicit form submit */
    this.shadowRoot
      .getElementById("inputbar")
      .addEventListener("submit", (e) => this.handleSend(e));

    /* discrete-mode toggle ------------------------------------------------ */
    this.toggleOn = false;
    this.$toggle = this.shadowRoot.getElementById("toggleSwitch");
    this.$toggleLabel = this.shadowRoot.getElementById("toggleLabel");
    this.$toggle.addEventListener("change", () => {
      this.toggleOn = this.$toggle.checked;
      this.$toggleLabel.textContent = this.toggleOn
        ? "Discrete ON"
        : "Discrete OFF";
    });

    this.msg_counter = 0;
  }

  /* auto-grow textarea */
  autosize() {
    this.$input.style.height = "auto";
    this.$input.style.height = Math.min(this.$input.scrollHeight, 160) + "px";
  }

  /* helper to append chat bubbles --------------------------------------- */
  appendMessage(sender, text) {
    const row = document.createElement("div");
    row.className =
      sender === "user" ? "flex justify-end" : "flex justify-start";

    const bubble = document.createElement("div");
    bubble.className =
      "chat-bubble " +
      (sender === "user" ? "chat-bubble-user" : "chat-bubble-bot");

    if (sender === "bot") {
      let html = marked.parse(text).trim();
      if (html.startsWith("<p>") && html.endsWith("</p>"))
        html = html.slice(3, -4);

      /* allow the ad’s <a onclick=...> to survive sanitising */
      bubble.innerHTML = DOMPurify.sanitize(html, {
        ADD_ATTR: ["onclick"],
      });
    } else {
      bubble.textContent = text;
    }

    row.appendChild(bubble);
    this.$chat.appendChild(row);
    this.$chat.scrollTop = this.$chat.scrollHeight;
  }

  /* main send-handler ---------------------------------------------------- */
  async handleSend(e) {
    e.preventDefault();
    const msg = this.$input.value.trim();
    if (!msg) return;

    this.appendMessage("user", msg);
    this.$input.value = "";
    this.autosize();

    this.appendMessage("bot", "⏳ …");
    const placeholder = this.$chat.lastChild;

    try {
      /* ---- backend call ------------------------------------------------ */
      const req = await axios.get(
        // "https://llads-rag-server.onrender.com/api/promptedMsg",
        "http://localhost:5000/api/promptedMsg",
        // "https://llads-rag-server-late-field-2621.fly.dev/api/promptedMsg",
        {
          params: {
            user_input: msg,
            msg_counter: this.msg_counter,
            discrete: this.toggleOn ? "true" : "false",
          },
        }
      );

      const prompted_msg = req.data.prompt;
      const promptType = req.data.promptType;
      const adHTML = req.data.html || "";

      this.msg_counter = promptType === "clean" ? this.msg_counter + 1 : 0;

      /* ---- call Gemini + render --------------------------------------- */
      const reply = await callGemini(prompted_msg);
      placeholder.remove();

      this.appendMessage("bot", `<div>${reply}</div>`);

      /* ---- render linked-ad bubble if provided ------------------------ */
      if (adHTML && !this.toggleOn) {
        // keep hidden in discrete mode
        const adRow = document.createElement("div");
        adRow.className = "flex justify-start";

        const adBubble = document.createElement("div");
        adBubble.className =
          "chat-bubble chat-bubble-bot bg-yellow-50 text-black";
        adBubble.innerHTML = DOMPurify.sanitize(adHTML, {
          ADD_ATTR: ["onclick", "target"],
        });
        adRow.appendChild(adBubble);
        this.$chat.appendChild(adRow);
        this.$chat.scrollTop = this.$chat.scrollHeight;
      }
    } catch (err) {
      placeholder.remove();
      this.appendMessage("bot", "Error: " + err.message);
    }

    /* example: display a real AdSense slot once chat is active ---------- */
    if (!window.adsLoaded) {
      googletag.cmd.push(() => googletag.display("native-ad"));
      window.adsLoaded = true;
    }
  }

  connectedCallback() {
    this.$input.addEventListener("input", () => this.autosize());
  }
}

customElements.define("gc-chat", GitterCommFloating);
export default GitterCommFloating;
