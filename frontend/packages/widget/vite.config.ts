import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: packageRoot,
  base: "/packages/widget/",
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        widget: resolve(packageRoot, "widget.html"),
        loader: resolve(packageRoot, "src/loader.ts"),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "loader" ? "widget.js" : "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
    outDir: resolve(packageRoot, "../../dist/packages/widget"),
    minify: "oxc",
    target: "es2020",
  },
});
