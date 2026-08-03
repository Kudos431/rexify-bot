const express = require('express');
const { chromium } = require('puppeteer'); // or steel-sdk depending on your setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let isRunning = false;
let isStopping = false;
let logs = [];

function broadcastLog(message, type = 'info') {
  const logEntry = { message, type, time: new Date().toLocaleTimeString(), done: !isRunning };
  logs.push(logEntry);
  console.log(`[${logEntry.time}] ${message}`);
}

// Helper to generate random 10-digit OPay account numbers (starting with valid Nigerian prefixes)
function generateOpayAccountNumber() {
  const prefixes = ['70', '80', '81', '90', '91'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  let remainder = '';
  for (let i = 0; i < 8; i++) {
    remainder += Math.floor(Math.random() * 10);
  }
  return prefix + remainder;
}

// Helper to generate random email
function generateRandomEmail() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randStr = '';
  for (let i = 0; i < 8; i++) {
    randStr += chars[Math.floor(Math.random() * chars.length)];
  }
  return `rexify_${randStr}@gmail.com`;
}

app.post('/api/start', async (req, res) => {
  if (isRunning) return res.json({ success: false, error: 'Already running' });
  
  isRunning = true;
  isStopping = false;
  res.json({ success: true });

  // Run the background automation loop
  (async () => {
    try {
      broadcastLog('🚀 SELF-GENERATING REFERRAL ENGINE STARTED', 'info');
      let currentRefUrl = 'https://rexify.com.ng?reference=bkolawole56';
      let totalCreated = 0;
      let currentTierCount = 0;
      let activeRefLink = currentRefUrl;

      while (isRunning && !isStopping) {
        currentTierCount++;
        const email = generateRandomEmail();
        const accountNum = generateOpayAccountNumber();
        const password = 'Password@123';

        broadcastLog(`📧 Account #${totalCreated + 1} | Using Email: ${email} | Account: ${accountNum}`, 'info');
        broadcastLog(`🔗 Using Ref Link: ${activeRefLink}`, 'info');

        // Launch browser session (using Steel / Chromium)
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
          // 1. Go to referral link
          await page.goto(activeRefLink, { waitUntil: 'networkidle', timeout: 30000 });

          // 2. Fill registration details (adjust selectors to match your site fields)
          // Fill Email
          const emailInput = await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
          await emailInput.fill(email);

          // Fill Password
          const passInput = await page.waitForSelector('input[type="password"]', { timeout: 10000 });
          await passInput.fill(password);

          // Submit registration / click continue
          const submitBtn = await page.waitForSelector('button[type="submit"], button:has-text("Get started"), button:has-text("Continue")', { timeout: 10000 });
          await submitBtn.click();
          await page.waitForTimeout(4000);

          // 3. Handle Account Verification Step (Step 2: Withdrawals / OPay)
          broadcastLog('Entering OPay account number details...', 'info');
          
          // Select Bank if dropdown exists
          try {
            await page.selectOption('select', { label: 'Opay' }).catch(() => {});
          } catch(e) {}

          // Type 10-digit Account Number
          const accountInput = await page.waitForSelector('input[type="text"], input[type="number"], input:not([type="hidden"])', { visible: true, timeout: 15000 });
          await accountInput.fill(accountNum);

          // Click Verify button
          const verifyBtn = await page.waitForSelector('button:has-text("Verify"), button:has-text("Continue")', { visible: true, timeout: 10000 });
          await verifyBtn.click();
          await page.waitForTimeout(4000);

          // Click Final Finish & Continue
          const finishBtn = await page.waitForSelector('button:has-text("Finish"), button:has-text("Complete")', { timeout: 10000 }).catch(() => null);
          if (finishBtn) await finishBtn.click();

          await page.waitForTimeout(3000);

          // 4. Extract new account's referral link from dashboard
          try {
            await page.goto('https://rexify.com.ng/user/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
            const refInputOrLink = await page.waitForSelector('input[value*="reference"], copy-link, .referral-link', { timeout: 5000 });
            const extractedLink = await refInputOrLink.evaluate(el => el.value || el.href || el.textContent);
            if (extractedLink && extractedLink.includes('reference=')) {
              activeRefLink = extractedLink.trim();
              broadcastLog(`✨ Successfully grabbed new downline referral link: ${activeRefLink}`, 'info');
            }
          } catch (err) {
            broadcastLog(`⚠️ Could not auto-extract ref link, continuing chain using fallback.`, 'warn');
          }

          totalCreated++;
          broadcastLog(`✅ Successfully created account #${totalCreated}!`, 'info');

          // If we hit 20 accounts under this branch, we reset the tier count (the chain updates automatically via activeRefLink)
          if (currentTierCount >= 20) {
            broadcastLog(`🔄 Reached 20 accounts on this branch. Shifting referral downline tree...`, 'info');
            currentTierCount = 0;
          }

        } catch (stepErr) {
          broadcastLog(`❌ Error on account creation: ${stepErr.message}. Retrying next...`, 'error');
        } finally {
          await browser.close();
        }

        // Brief cooldown between accounts to prevent rate limits
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

    } catch (err) {
      broadcastLog(`Engine crashed: ${err.message}`, 'error');
    } finally {
      isRunning = false;
      isStopping = false;
      broadcastLog('🛑 ENGINE STOPPED.', 'warn');
    }
  })();
});

app.post('/api/stop', (req, res) => {
  if (!isRunning) return res.json({ success: false, error: 'Not running' });
  isStopping = true;
  isRunning = false;
  broadcastLog('🛑 Stop signal received.', 'warn');
  res.json({ success: true });
});

app.get('/api/status', (req, res) => {
  res.json({ isRunning, isStopping });
});

app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLogs = () => {
    if (logs.length > 0) {
      const latest = logs[logs.length - 1];
      res.write(`data: ${JSON.stringify(latest)}\n\n`);
    }
  };

  const interval = setInterval(sendLogs, 1000);
  req.on('close', () => clearInterval(interval));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      
