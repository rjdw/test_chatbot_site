import tmplHTML from "./widget.html?raw";

const tmplElem = document.createElement("template");
tmplElem.id = "gc-chat-template";
tmplElem.innerHTML = tmplHTML.trim();
document.head.appendChild(tmplElem); // or document.body

import("./widget.js").then(() => {
  if (!document.querySelector("gc-chat")) {
    document.body.appendChild(document.createElement("gc-chat"));
  }
});
