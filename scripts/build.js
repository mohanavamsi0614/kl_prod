
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frontendDir = path.resolve(__dirname, '..', 'frontend');
const publicDir = path.resolve(__dirname, '..', 'public');

// 1) If frontend has a package.json, run npm install & npm run build
if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.log('Installing frontend dependencies (frontend/) ...');
  execSync('npm install', { stdio: 'inherit', cwd: frontendDir });

  // attempt several common build outputs: build/ (CRA/Vite), dist/ (Vite build sometimes), out/ (Next)
  console.log('Building frontend (frontend/) ...');
  // prefer "npm run build"
  execSync('npm run build', { stdio: 'inherit', cwd: frontendDir });
} else {
  console.warn('No frontend/package.json found — skipping build command. Assuming already built.');
}

// 2) Find build output
const candidates = ['build', 'dist', 'out'];
let buildOut = null;
for (const c of candidates) {
  const p = path.join(frontendDir, c);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    buildOut = p;
    break;
  }
}

if (!buildOut) {
  console.error('Could not find frontend build output (build/ or dist/). Please ensure your frontend was built into Frontend/build or Frontend/dist.');
  process.exit(1);
}

// 3) Clear public/ and copy buildOut => public/
if (fs.existsSync(publicDir)) {
  fs.rmSync(publicDir, { recursive: true, force: true });
}
fs.mkdirSync(publicDir, { recursive: true });

const copyRecursive = (src, dest) => {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

console.log(`Copying frontend build files from ${buildOut} -> ${publicDir}`);
copyRecursive(buildOut, publicDir);
console.log('frontend copied to public/. Done.');
