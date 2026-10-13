import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same "@/..." shortcut the app uses.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
