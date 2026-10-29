// Wraps app.html (the page body, shared with the hosted Claude artifact) into a full
// standalone document at public/index.html. Run with `npm run build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const body = fs.readFileSync(path.join(here, "app.html"), "utf8");
const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Scan a draft for hidden watermark characters and AI-writing tells, rewrite it in your own voice, and verify before sending.">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${body}
</body>
</html>
`;
fs.mkdirSync(path.join(here, "public"), { recursive: true });
fs.writeFileSync(path.join(here, "public", "index.html"), doc);
console.log("built public/index.html");
