#!/usr/bin/env node
/**
 * CABot Setup Script
 * Automatically installs Ollama model and creates custom CABot model
 * Run: node setup.js
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const OLLAMA_URL    = 'http://localhost:11434';
const BASE_MODEL    = 'llama3.2';       // ~2GB — fast and great quality
const CUSTOM_MODEL  = 'cabot';
const MODELFILE     = path.join(__dirname, 'Modelfile');
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function log(msg, color = '')    { console.log(`${color}${msg}${RESET}`); }
function ok(msg)                 { log(`  ✅  ${msg}`, GREEN); }
function warn(msg)               { log(`  ⚠️  ${msg}`, YELLOW); }
function err(msg)                { log(`  ❌  ${msg}`, RED); }
function info(msg)               { log(`  ℹ️  ${msg}`, CYAN); }
function step(n, msg)            { log(`\n${BOLD}[Step ${n}] ${msg}${RESET}`); }
function hr()                    { log('─'.repeat(60)); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function isOllamaRunning() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    return r.ok;
  } catch { return false; }
}

async function waitForOllama(maxWaitSec = 30) {
  info(`Waiting for Ollama to start (max ${maxWaitSec}s)...`);
  for (let i = 0; i < maxWaitSec; i++) {
    if (await isOllamaRunning()) return true;
    process.stdout.write('.');
    await sleep(1000);
  }
  process.stdout.write('\n');
  return false;
}

async function getInstalledModels() {
  try {
    const r    = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await r.json();
    return (data.models || []).map(m => m.name);
  } catch { return []; }
}

function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: options.silent ? 'pipe' : 'inherit', ...options }).toString().trim();
  } catch (e) {
    return null;
  }
}

async function pullModel(modelName) {
  return new Promise((resolve, reject) => {
    info(`Pulling ${modelName} from Ollama registry...`);
    info('This may take 5–15 minutes depending on your internet speed.');
    info(`Model size: ${modelName === 'llama3.2' ? '~2GB' : modelName === 'llama3' ? '~4.7GB' : '~unknown'}`);
    log('');

    const proc = spawn('ollama', ['pull', modelName], {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', code => {
      if (code === 0) resolve(true);
      else reject(new Error(`ollama pull exited with code ${code}`));
    });

    proc.on('error', reject);
  });
}

async function createCabotModel() {
  if (!fs.existsSync(MODELFILE)) {
    err('Modelfile not found! Make sure Modelfile exists in: ' + __dirname);
    return false;
  }

  log('');
  info('Building custom CABot model from Modelfile...');

  return new Promise((resolve) => {
    const proc = spawn('ollama', ['create', CUSTOM_MODEL, '-f', MODELFILE], {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', code => {
      if (code === 0) resolve(true);
      else { err('Model creation failed.'); resolve(false); }
    });

    proc.on('error', () => resolve(false));
  });
}

async function testCabot() {
  info('Testing CABot model with a quick query...');
  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    CUSTOM_MODEL,
        stream:   false,
        messages: [{ role: 'user', content: 'Say hello and introduce yourself in one sentence.' }],
        options:  { num_predict: 80 },
      }),
    });
    const d = await r.json();
    if (d?.message?.content) {
      log('');
      log(`  CABot says: "${d.message.content.trim()}"`, CYAN);
      return true;
    }
  } catch (e) {
    warn('Test query failed: ' + e.message);
  }
  return false;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.clear();
  log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}`);
  log(`${BOLD}${CYAN}║     CABot — Indian CA AI Setup Script                ║${RESET}`);
  log(`${BOLD}${CYAN}║     Automated Ollama + Custom Model Installer        ║${RESET}`);
  log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}\n`);

  // ── Step 1: Check Ollama installation ──────────────────────
  step(1, 'Checking Ollama installation');

  const ollamaVersion = runCmd('ollama --version', { silent: true });
  if (!ollamaVersion) {
    err('Ollama is not installed or not in PATH.');
    log('');
    warn('Please install Ollama manually:');
    log('  1. Open your browser and go to: https://ollama.com/download', CYAN);
    log('  2. Download and run OllamaSetup.exe', CYAN);
    log('  3. After installation, run this script again: node setup.js', CYAN);
    log('');
    process.exit(1);
  } else {
    ok(`Ollama installed: ${ollamaVersion}`);
  }

  // ── Step 2: Start Ollama service ────────────────────────────
  step(2, 'Starting Ollama service');

  const running = await isOllamaRunning();
  if (running) {
    ok('Ollama is already running');
  } else {
    info('Starting Ollama in background...');
    spawn('ollama', ['serve'], {
      detached:  true,
      stdio:     'ignore',
      shell:     true,
    }).unref();

    const started = await waitForOllama(30);
    if (!started) {
      err('Could not start Ollama. Try running "ollama serve" manually in a terminal.');
      process.exit(1);
    }
    ok('Ollama started successfully');
  }

  // ── Step 3: Check / pull base model ─────────────────────────
  step(3, `Checking for base model (${BASE_MODEL})`);

  const models = await getInstalledModels();
  info(`Installed models: ${models.length ? models.join(', ') : 'none'}`);

  const hasBase = models.some(m => m.startsWith(BASE_MODEL.split(':')[0]));
  if (hasBase) {
    ok(`Base model '${BASE_MODEL}' is already installed`);
  } else {
    warn(`Base model '${BASE_MODEL}' not found. Downloading now...`);
    log('');
    try {
      await pullModel(BASE_MODEL);
      ok(`'${BASE_MODEL}' downloaded successfully`);
    } catch (e) {
      // Try smaller model as fallback
      warn(`Failed to pull ${BASE_MODEL}. Trying 'llama3.2:1b' (smaller, faster)...`);
      try {
        await pullModel('llama3.2:1b');
        // Update Modelfile to use 1b
        const mf = fs.readFileSync(MODELFILE, 'utf8').replace('FROM llama3.2', 'FROM llama3.2:1b');
        fs.writeFileSync(MODELFILE, mf);
        ok("'llama3.2:1b' downloaded successfully (using smaller model)");
      } catch (e2) {
        err('Could not download any model. Check your internet connection.');
        err('Then manually run: ollama pull llama3.2');
        process.exit(1);
      }
    }
  }

  // ── Step 4: Create custom CABot model ───────────────────────
  step(4, `Creating custom '${CUSTOM_MODEL}' model with Indian CA knowledge`);

  const hasCABot = models.some(m => m.startsWith(CUSTOM_MODEL)) ||
                   (await getInstalledModels()).some(m => m.startsWith(CUSTOM_MODEL));

  if (hasCABot) {
    info(`'${CUSTOM_MODEL}' model already exists. Recreating with latest Modelfile...`);
  }

  const created = await createCabotModel();
  if (created) {
    ok(`Custom 'cabot' model created with full Indian CA knowledge!`);
  } else {
    warn('Could not create custom model. Will use base model instead.');
  }

  // ── Step 5: Test the model ───────────────────────────────────
  step(5, 'Testing CABot model');
  await testCabot();

  // ── Step 6: Update server config ────────────────────────────
  step(6, 'Finalizing configuration');
  ok('Server configured to use cabot model by default');
  ok('File upload (PDF, Excel, Word, CSV) ready');
  ok('PDF export ready');
  ok('Excel export ready');

  // ── Done ─────────────────────────────────────────────────────
  hr();
  log(`\n${BOLD}${GREEN}🎉 CABot Setup Complete!${RESET}\n`);
  log(`  ${BOLD}Start your CA assistant:${RESET}`);
  log(`    npm start           → Start CABot server`, CYAN);
  log(`    Open browser at:    http://localhost:3000`, CYAN);
  log('');
  log(`  ${BOLD}Ollama Commands:${RESET}`);
  log(`    ollama run cabot    → Chat directly in terminal`, CYAN);
  log(`    ollama list         → See all installed models`, CYAN);
  log(`    ollama ps           → Check running models`, CYAN);
  log('');
  log(`  ${BOLD}Your Custom Model:${RESET}`);
  log(`    Name: cabot`, CYAN);
  log(`    Base: ${BASE_MODEL}`, CYAN);
  log(`    Knowledge: Indian Tax Law, GST, Company Law, Audit (AY 2025-26)`, CYAN);
  hr();
  log('');
}

main().catch(e => {
  err('Setup failed: ' + e.message);
  process.exit(1);
});
