import { resolve } from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: "/storybox", // align with the GitHub Pages repository nameq
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        prototype: resolve(__dirname, "prototype.html"),
      },
    },
  },
});
