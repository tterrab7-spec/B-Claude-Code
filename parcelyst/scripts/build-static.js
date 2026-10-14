// Copies public/ to dist/ for static hosting. With no server behind it, the site
// runs on the in-browser demo backend (accounts and data stay in the visitor's browser).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'public'), out = path.join(__dirname, '..', 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
console.log('Static build written to', out);
