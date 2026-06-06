import { activate } from "./module";

declare global {
  interface Window {
    fishpi?: unknown;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  activate(window, document, window.fishpi);
}
