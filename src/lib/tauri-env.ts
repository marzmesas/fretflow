/** True when running inside the Tauri webview (not plain `vite dev` in a browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
