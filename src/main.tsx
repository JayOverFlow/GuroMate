import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./theme.css";
import "./styles.css";

if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  void import("@oddbird/popover-polyfill");
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found.");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
