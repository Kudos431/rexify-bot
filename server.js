// 1. Safe dotenv initialization (won't crash if dotenv isn't installed in production)
try {
  require('dotenv').config();
} catch (e) {
  // Gracefully ignored when environment variables are injected directly
}

const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer');
const { KnownDevices } = require('puppeteer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL || 'https://rexify.com.ng?reference=sholaupdates';

// Mobile device profile for forcing smartphone layout/User-Agent
const mobileDevice = KnownDevices['iPhone 13 Pro'];

// Serve static frontend UI
app.use(express.static('public'));

// Server-Sent Events (SSE) Client registry for live terminal streaming
let sseClients = [];

function sendLog(message, type = 'normal', done = false) {
  console.log(`[LOG] ${message}`);
  const payload = JSON.stringify({ message, type, done });
  
  // Safe SSE broadcast (prevents process crash if client suddenly disconnects)
  sseClients = sseClients.filter((client) => {
    try {
      client.res.write(`data: ${payload}\n\n`);
      return true;
    } catch (err) {
      return false; // Remove dead connection
    }
  });
}

// Delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Identity Generators
function generateRandomEmail() {
  const randStr = Math.random().toString(36).substring(2, 8);
  return `user_${Date.now()}_${randStr}@gmail.com`;
}

function generateRandomPassword() {
  return `Pass!${Math.random().toString(36).slice(-8)}`;
}

// SSE Logging Endpoint
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });

  req.on('close', () => {
    sseClients = sseClients.filter((client) => client.id !== clientId);
  });
});

// Robust CSV Buffer Parser (Handles both Windows \r\n and Linux \n line endings)
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

// Automation Endpoint
app.post('/api/start', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No CSV file uploaded' });
  }

  const accountRows = parseCSVBuffer(req.file.buffer);
  if (accountRows.length === 0) {
    return res.status(400).json({ success: false, error: 'CSV file is empty' });
  }

  res.json({ success: true, count: accountRows.length });

  sendLog(`Loaded ${accountRows.length} account row(s) from CSV. Target: ${TARGET_URL}`, 'info');
  
  if (!process.env.BROWSERLESS_WS) {
    sendLog('ERROR: BROWSERLESS_WS environment variable is missing!', 'error', true);
    return;
  }

  sendLog('Connecting to remote Browserless instance via WebSocket...', 'info');

  let browser;
  try {
    // Connect to Browserless
    browser = await puppeteer.connect({
      browserWSEndpoint: process.env.BROWSERLESS_WS,
    });

    for (let i = 0; i < accountRows.length; i++) {
      const row = accountRows[i];
      const randomEmail = generateRandomEmail();
      const randomPassword = generateRandomPassword();
      const bankName = row.bankName || 'OPay';
      const accountNumber = row.accountNumber || row.account || Object.values(row)[0];

      sendLog(`--- Processing ${i + 1}/${accountRows.length} ---`, 'info');
      sendLog(`Generated Identity: ${randomEmail}`);

      let context;
      try {
        // Updated: createBrowserContext() for isolated contexts in modern Puppeteer
        context = await browser.createBrowserContext();
        const page = await context.newPage();

        // 📱 FORCE MOBILE EMULATION (Screen size, touch events, iOS User-Agent)
        await page.emulate(mobileDevice);

        // ==========================================
        // STEP 1: Landing Page
        // ==========================================
        sendLog(`Navigating to target URL in mobile view...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Wait & click 'Get started' using Puppeteer text selector
        const getStartedBtn = await page.waitForSelector('text/Get started', { timeout: 15000 });
        await getStartedBtn.click();
        sendLog(`Clicked 'Get started'. Pausing 10s...`);
        await delay(10000);

        // ==========================================
        // STEP 2: Registration
        // ==========================================
        sendLog(`Filling signup form with generated credentials...`);
        await page.waitForSelector('input[type="email"]', { timeout: 15000 });
        await page.type('input[type="email"]', randomEmail, { delay: 40 });
        await page.type('input[type="password"]', randomPassword, { delay: 40 });

        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();

        const continueBtn = await page.waitForSelector('text/Continue', { timeout: 15000 });
        await continueBtn.click();
        sendLog(`Clicked 'Continue'. Pausing 10s...`);
        await delay(10000);

        // ==========================================
        // STEP 3: Setup Withdrawals using CSV details
        // ==========================================
        sendLog(`Applying mapped Bank (${bankName}) & Account Number (${accountNumber})...`);
        await page.waitForSelector('input[placeholder*="account number"]', { timeout: 15000 });

        // Select dropdown value with custom search fallback
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

        await page.type('input[placeholder*="account number"]', accountNumber, { delay: 40 });

        const verifyBtn = await page.waitForSelector('text/Verify account', { timeout: 15000 });
        await verifyBtn.click();
        sendLog(`Clicked 'Verify account'. Pausing 10s for API verification...`);
        await delay(10000);

        const finishBtn = await page.waitForSelector('text/Finish & continue', { timeout: 15000 });
        await finishBtn.click();
        sendLog(`Clicked 'Finish & continue'. Pausing 10s...`);
        await delay(10000);

        sendLog(`Successfully finished account setup for: ${accountNumber}`, 'info');

      } catch (err) {
        sendLog(`Error processing row ${i + 1} (${accountNumber}): ${err.message}`, 'error');
      } finally {
        // Safe context destruction to free remote memory immediately
        if (context) {
          await context.close().catch(() => {});
        }
      }
    }

    sendLog(`All ${accountRows.length} account tasks executed completely!`, 'info', true);

  } catch (fatalError) {
    sendLog(`Fatal Automation Engine Error: ${fatalError.message}`, 'error', true);
  } finally {
    if (browser) {
      await browser.disconnect().catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
