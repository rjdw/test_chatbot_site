import { callGemini } from "../api/gemini.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

class GitterCommFloating extends HTMLElement {
  constructor() {
    // super();
    // this.attachShadow({ mode: "open" }).appendChild(
    //   tmpl.content.cloneNode(true)
    // );
    super();
    const t = document
      .getElementById("gc-chat-template")
      .content.cloneNode(true);
    this.attachShadow({ mode: "open" }).appendChild(t);

    // NEW: link Tailwind stylesheet into the shadow root
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/assets/styles.css"; // path relative to site root
    this.shadowRoot.prepend(link); // make sure it loads first

    this.$panel = this.shadowRoot.getElementById("panel");
    this.$chat = this.shadowRoot.getElementById("chat");
    this.$input = this.shadowRoot.getElementById("input");
    this.$launcher = this.shadowRoot.getElementById("launcher");

    this.$launcher.addEventListener("click", () => {
      this.$panel.classList.toggle("open");
      if (this.$panel.classList.contains("open")) {
        this.$input.focus();
      }
    });

    this.$input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend(e);
      }
    });

    this.shadowRoot
      .getElementById("inputbar")
      .addEventListener("submit", (e) => this.handleSend(e));
  }

  autosize() {
    this.$input.style.height = "auto";
    this.$input.style.height = Math.min(this.$input.scrollHeight, 160) + "px";
  }

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

      // If the whole block is a single <p>…</p>, remove it
      if (html.startsWith("<p>") && html.endsWith("</p>")) {
        html = html.slice(3, -4);
      }
      // bubble.innerHTML = html;                        // unsafe if Gemini ever emits raw HTML
      bubble.innerHTML = DOMPurify.sanitize(html); // <‑‑ safer version
    } else {
      bubble.textContent = text;
    }
    row.appendChild(bubble);
    this.$chat.appendChild(row);
    this.$chat.scrollTop = this.$chat.scrollHeight;
  }

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
      const reply = await callGemini(msg);
      placeholder.remove();
      this.appendMessage("bot", reply);
    } catch (err) {
      placeholder.remove();
      this.appendMessage("bot", "Error: " + err.message);
    }

    // load ad only after first real content
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
