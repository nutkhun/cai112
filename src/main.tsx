import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA: lets Android/Chrome offer "Add to Home Screen" (see InstallPrompt).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* Install prompt still works on browsers that don't require a SW. */
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
