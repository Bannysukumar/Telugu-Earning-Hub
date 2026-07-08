import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./lib/firebase";
import "./index.css";

const apiBase = import.meta.env.VITE_API_BASE_URL?.trim();
if (apiBase) {
  setBaseUrl(apiBase.replace(/\/+$/, ""));
}

createRoot(document.getElementById("root")!).render(<App />);
