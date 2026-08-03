// 1. Crash Guards (Prevents background errors from killing Express on Render)
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH GUARD] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[CRASH GUARD] Uncaught Exception thrown:', err);
});

// 2. Safe dotenv initialization
try {
  require('dotenv').config();
} catch (e) {
  // Gracefully ignored when environment variables are injected directly in production
}

const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer');
const { KnownDevices } = require('puppeteer');
const Steel = require('steel-sdk');

const app = express();

// Set up Multer for Multiple Files (Now only expects accountsFile and emailsFile)
const upload = multer({ storage: multer.memoryStorage() });
const uploadMiddleware = upload.fields([
  { name: 'accountsFile', maxCount: 1 },
  { name: 'emailsFile', maxCount: 1 }
]);

const PORT = process.env.PORT || 3000;
const mobileDevice = KnownDevices['iPhone 13 Pro'];

// 🎯 HARDCODE YOUR SINGLE URL HERE
const HARDCODED_URL = "https://rexify.com.ng?reference=bkolawole56";

// Initialize Steel SDK Client
const steel = new Steel({
  apiKey: process.env.STEEL_API_KEY,
});

// 3. Global CORS Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.static('public'));

let sseClients = [];

// --- GLOBAL QUEUE STATE ---
let isRunning = false;
let isStopping = false;

function sendLog(message, type = 'normal', done = false) {
  console.log(`[LOG] ${message}`);
  const payload = JSON.stringify({ message, type, done });

  sseClients = sseClients.filter((client) => {
    try {
      client.res.write(`data: ${payload}\n\n`);
      return true;
    } catch (err) {
      return false;
    }
  });
}

// Dynamic delay helpers
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1000, max = 3000) => 
  delay(Math.floor(Math.random() * (max - min + 1)) + min);

function generateRandomPassword() {
  return `Pass!${Math.random().toString(36).slice(-8)}`;
}

// 4. Server-Sent Events (SSE) Endpoint with Heartbeat Ping
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': keep-alive\n\n');

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });

  req.on('close', () => {
    sseClients = sseClients.filter((client) => client.id !== clientId);
  });
});

setInterval(() => {
  sseClients.forEach((client) => {
    try {
      client.res.write(': keep-alive\n\n');
    } catch (err) {
      // Cleaned up on disconnect
    }
  });
}, 10000);

// Parser for CSV Buffers (Accounts, Emails)
function parseCSVBuffer(buffer) {
  const content = buffer.toString('utf-8');
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
}

// Single Account Creation Handler using provided custom email
async function processAccountWithCredentials(row, emailToUse, passwordToUse, rowIndex, workerId, targetUrl) {
  const bankName = row.bankName || 'OPay';
  const accountNumber = row.accountNumber || row.account || Object.values(row)[0];

  sendLog(`[Worker ${workerId}] [Row ${rowIndex + 1}] Testing Account ${accountNumber} with Email (${emailToUse})`, 'info');

  let session = null;
  let browser = null;

  try {
    session = await steel.sessions.create({});
    browser = await puppeteer.connect({
      browserWSEndpoint: `${session.websocketUrl}&apiKey=${process.env.STEEL_API_KEY}`,
    });

    const openPages = await browser.pages();
    let page = openPages.length > 0 ? openPages[0] : await browser.newPage();

    await page.emulate(mobileDevice);
    page.setDefaultTimeout(25000);

    // STEP 1: Landing Page
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await randomDelay(1000, 2000);

    const getStartedBtn = await page.waitForSelector('text/Get started', { visible: true, timeout: 15000 });
    await randomDelay(500, 1000);
    await Promise.all([
      getStartedBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
    ]);

    const pages = await browser.pages();
    if (pages.length > 1) {
      page = pages[pages.length - 1];
      await page.emulate(mobileDevice);
      page.setDefaultTimeout(25000);
    }

    await randomDelay(1500, 3000);

    // STEP 2: Registration using custom uploaded email
    const emailSelector = await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { visible: true, timeout: 15000 });
    await emailSelector.type(emailToUse, { delay: 50 });

    const passSelector = await page.waitForSelector('input[type="password"], input[name="password"]', { visible: true, timeout: 10000 });
    await passSelector.type(passwordToUse, { delay: 50 });

    const checkbox = await page.$('input[type="checkbox"]');
    if (checkbox) {
      await checkbox.click();
    }

    const continueBtn = await page.waitForSelector('text/Continue', { visible: true, timeout: 15000 });
    await randomDelay(600, 1200);
    await Promise.all([
      continueBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {})
    ]);

    await randomDelay(3000, 5000);

    // STEP 3: Withdrawal Setup & Verification
    let isVerified = false;
    let verifyAttempt = 0;
    const MAX_VERIFY_ATTEMPTS = 1;

    while (!isVerified && verifyAttempt < MAX_VERIFY_ATTEMPTS) {
      if (isStopping) throw new Error('Process forcefully stopped by user.');

      verifyAttempt++;
      sendLog(`[Worker ${workerId}] Verification attempt ${verifyAttempt} for account ${accountNumber}...`);

      const accountInput = await page.waitForSelector('input[placeholder*="account number" i], input[name*="account" i]', { visible: true, timeout: 15000 });

      await accountInput.click({ clickCount: 3 });
      await accountInput.press('Backspace');
      await randomDelay(300, 600);
      await accountInput.type(accountNumber, { delay: 50 });

      try {
        await page.select('select', bankName);
      } catch (e) {
        await page.evaluate((bName) => {
          const select = document.querySelector('select');
          if (!select) return;
          for (let option of select.options) {
            if (
              option.text.toLowerCase().includes(bName.toLowerCase()) ||
              option.value.toLowerCase().includes(bName.toLowerCase())
            ) {
              select.value = option.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }, bankName);
      }

      const verifyBtn = await page.waitForSelector('text/Verify account', { visible: true, timeout: 15000 });
      await randomDelay(500, 1000);
      await verifyBtn.click();

      const startTime = Date.now();
      let status = 'pending';

      while (Date.now() - startTime < 12000) {
        const result = await page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          if (bodyText.includes('Account name') || bodyText.includes('Verified')) return 'success';
          if (bodyText.includes('Not verified') || bodyText.includes('Could not verify')) return 'failed';
          return 'pending';
        });

        if (result !== 'pending') {
          status = result;
          break;
        }
        await delay(1000);
      }

      if (status === 'success') {
        isVerified = true;
        sendLog(`[Worker ${workerId}] Account ${accountNumber} verified successfully!`, 'info');
      } else {
        sendLog(`[Worker ${workerId}] Verification failed for account ${accountNumber}. Trying next account...`, 'warn');
        await randomDelay(1500, 3000);
      }
    }

    if (!isVerified) throw new Error(`Account verification failed.`);

    const finishBtn = await page.waitForSelector('text/Finish & continue', { visible: true, timeout: 15000 });
    await randomDelay(800, 1500);
    await finishBtn.click();

    sendLog(`[Worker ${workerId}] Clicked 'Finish & continue'. Stabilizing (15s)...`);
    await delay(15000);

    return true;

  } catch (err) {
    sendLog(`[Worker ${workerId}] Error with account ${accountNumber}: ${err.message}`, 'error');
    return false;
  } finally {
    if (browser) await browser.disconnect().catch(() => {});
    if (session) await steel.sessions.release(session.id).catch(() => {});
  }
}

// --- API: STOP ROUTE ---
app.post('/api/stop', (req, res) => {
  if (!isRunning) {
    return res.json({ success: false, error: 'Automation is not currently running.' });
  }
  isStopping = true;
  res.json({ success: true });
});

// --- API: START ROUTE ---
app.post('/api/start', uploadMiddleware, async (req, res) => {
  try {
    if (isRunning) return res.status(400).json({ success: false, error: 'Process is already running!' });

    if (!req.files || !req.files['accountsFile'] || !req.files['emailsFile']) {
      return res.status(400).json({ success: false, error: 'Both Accounts CSV and Emails CSV are required!' });
    }

    const accountRows = parseCSVBuffer(req.files['accountsFile'][0].buffer);
    const emailRows = parseCSVBuffer(req.files['emailsFile'][0].buffer);

    if (accountRows.length === 0) return res.status(400).json({ success: false, error: 'Accounts CSV is empty' });
    if (emailRows.length === 0) return res.status(400).json({ success: false, error: 'Emails CSV is empty' });
    if (!process.env.STEEL_API_KEY) return res.status(500).json({ success: false, error: 'STEEL_API_KEY is missing' });

    res.json({ success: true, accounts: accountRows.length, emails: emailRows.length });

    isRunning = true;
    isStopping = false;

    runEngine(accountRows, emailRows, HARDCODED_URL);

  } catch (err) {
    console.error('Fatal API Error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
});

// --- CORE LOGIC: SINGLE URL CUSTOM EMAIL ENGINE ---
async function runEngine(accountRows, emailRows, targetUrl) {
  // Target set to 200 so it goes through your 200 emails
  const TARGET_SUCCESSES = 200; 

  let globalAccountIndex = 0; 
  let globalEmailIndex = 0;
  let currentSuccesses = 0;

  sendLog(`\n🚀 ENGINE STARTED | Accounts: ${accountRows.length} | Emails: ${emailRows.length}`, 'info');
  sendLog(`🎯 TARGET URL: ${targetUrl}\n`);

  while (currentSuccesses < TARGET_SUCCESSES && !isStopping) {
    if (globalAccountIndex >= accountRows.length || globalEmailIndex >= emailRows.length) {
      sendLog('⚠️ Accounts or Emails exhausted! Halting operation.', 'warn');
      break;
    }

    // Grab the next custom email
    const emailRow = emailRows[globalEmailIndex];
    const currentEmail = emailRow.email || Object.values(emailRow)[0];
    const currentPassword = generateRandomPassword();

    globalEmailIndex++; // Move to next email for the next attempt

    sendLog(`\n📧 USING UPLOADED EMAIL (${globalEmailIndex}/${emailRows.length}): ${currentEmail}`, 'info');
    let emailSuccess = false;

    // Test account numbers sequentially with THIS email until it successfully verifies
    while (!emailSuccess && currentSuccesses < TARGET_SUCCESSES && !isStopping) {
      if (globalAccountIndex >= accountRows.length) break;

      const myIndex = globalAccountIndex;
      globalAccountIndex++;
      const row = accountRows[myIndex];

      const success = await processAccountWithCredentials(row, currentEmail, currentPassword, myIndex, 1, targetUrl);

      if (success) {
        emailSuccess = true;
        currentSuccesses++;
        sendLog(`✅ SUCCESS (${currentSuccesses}/${TARGET_SUCCESSES})! Email ${currentEmail} verified with account row ${myIndex + 1}. Switching to next email...`, 'info');
      } else {
        sendLog(`❌ Account row ${myIndex + 1} failed. Trying next account number with the same email...`, 'warn');
      }

      await randomDelay(1000, 2000);
    }
  }

  if (isStopping) {
    sendLog(`🛑 Process was manually stopped by user.`, 'error', true);
  } else {
    sendLog(`✅ ALL OPERATIONS COMPLETE. Total Successes: ${currentSuccesses}`, 'info', true);
  }

  isRunning = false;
  isStopping = false;
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
      
