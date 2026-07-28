import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Handler for Vite preload errors to reload the page when chunks fail
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const key = 'sv:last-preload-reload';
  const now = Date.now();
  const last = Number(sessionStorage.getItem(key) || 0);
  
  if (now - last > 15000) {
    sessionStorage.setItem(key, String(now));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
