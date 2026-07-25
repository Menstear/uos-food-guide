import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "pages-dist");

const files = [
  "index.html",
  "styles.css",
  "script.js",
  "assets/uos-food-guide-hero.svg",
];

await rm(output, { force: true, recursive: true });
await mkdir(join(output, "assets"), { recursive: true });

await Promise.all(
  files.map((file) => copyFile(join(root, file), join(output, file))),
);
