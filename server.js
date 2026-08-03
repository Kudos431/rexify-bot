const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Steel = require('@steel-dev/sdk').default;
const puppeteer = require('puppeteer-core');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const steel = new Steel({
  steelAPIKey: process.env.STEEL_API_KEY || 'your_steel_api_key_here'
});

let isRunning = false;
let isStopping = false;

function broadcastLog(message, type = 'info') {
  io.emit('log', { message, type, timestamp: new Date().toLocaleTimeString() });
}

function generateRandomEmail() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randStr = '';
  for (let i = 0; i < 8; i++) {
    randStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `rexify_${randStr}@gmail.com`;
}

function generateOpayAccountNumber() {
  const prefixes = ['70', '80', '90', '91', '81'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  let rest = '';
  for (let i = 0; i < 8; i++) {
    rest += Math.floor(Math.random() * 10);
  }
  return prefix + rest;
}

// Main Continuous Multi-Tier Automation Loop
async function runAutomationEngine() {
  isRunning = true;
  isStopping = false;
  const rootRefUrl = 'https://rexify.com.ng?reference=bkolawole56';

  broadcastLog('⚡ MULTI-TIER REFERRAL ENGINE STARTED', 'info');

  try {
    while (isRunning && !isStopping) {
      // ----------------------------------------------------
      // STEP 1: CREATE AND VERIFY PARENT ACCOUNT (ROOT LINK)
      // ----------------------------------------------------
      broadcastLog('🌱 Starting cycle: Creating new Parent account from Root Link...', 'info');
      let parentRefUrl = null;
      let parentEmail = null;

      while (isRunning && !isStopping && !parentRefUrl) {
        // Generate an email for the parent attempt. If numbers fail, we keep this email!
        if (!parentEmail) parentEmail = generateRandomEmail();
        const accountNum = generateOpayAccountNumber();

        broadcastLog(`Parent Trial | Email: ${parentEmail} | Trying Number: ${accountNum}`, 'info');

        let session, browser;
        let verified = false;

        try {
          session = await steel.sessions.create();
          if (isStopping) break;

          browser = await puppeteer.connect({ browserWSEndpoint: session.websocketUrl });
          const page = await browser.newPage();

          await page.goto(rootRefUrl, { waitUntil: 'networkidle0', timeout: 30000 });

          // --- AUTOMATION FORM FILLING STEPS GO HERE ---
          // Example: 
          // await page.type('#email', parentEmail);
          // await page.type('#phone', accountNum);
          // await page.click('#submit-btn');
          // await page.waitForSelector('#success-message', { timeout: 10000 });

          // Simulating verification status check (Replace with your actual validation logic)
          verified = true; // Set to true if verification succeeds

          if (verified) {
            // Captured or constructed parent reference link
            parentRefUrl = `https://rexify.com.ng?reference=parent_${accountNum}`;
            broadcastLog(`✅ Parent account successfully verified using number ${accountNum}!`, 'info');
          } else {
            broadcastLog(`❌ Parent number ${accountNum} failed verification. Keeping email, trying new number...`, 'error');
          }
        } catch (err) {
          broadcastLog(`Parent automation error: ${err.message}. Retrying number...`, 'error');
        } finally {
          if (browser) await browser.close().catch(() => {});
          if (session) await steel.sessions.release(session.id).catch(() => {});
        }

        if (!parentRefUrl) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      if (isStopping || !parentRefUrl) break;

      // ----------------------------------------------------
      // STEP 2: CREATE 20 SUB-ACCOUNTS UNDER THE PARENT LINK
      // ----------------------------------------------------
      broadcastLog(`🚀 Parent secured! Beginning 20 sub-accounts under parent link...`, 'info');
      let completedCount = 0;
      const targetCount = 20;

      while (completedCount < targetCount && isRunning && !isStopping) {
        // For each sub-account, generate a fresh email
        let subEmail = generateRandomEmail();
        let subVerified = false;
        let subAccountNum = '';

        // Keep trying numbers *for this specific email* until it verifies successfully
        while (!subVerified && isRunning && !isStopping) {
          subAccountNum = generateOpayAccountNumber();
          broadcastLog(`URL ${completedCount + 1}/${targetCount} | Email: ${subEmail} | Trying Number: ${subAccountNum}`, 'info');

          let session, browser;
          try {
            session = await steel.sessions.create();
            if (isStopping) break;

            browser = await puppeteer.connect({ browserWSEndpoint: session.websocketUrl });
            const page = await browser.newPage();

            await page.goto(parentRefUrl, { waitUntil: 'networkidle0', timeout: 30000 });

            // --- AUTOMATION FORM FILLING STEPS FOR SUB-ACCOUNT ---
            // await page.type('#email', subEmail);
            // await page.type('#phone', subAccountNum);
            // await page.click('#submit-btn');

            subVerified = true; // Set to true upon successful backend verification response

            if (subVerified) {
              completedCount++;
              broadcastLog(`✅ URL ${completedCount}/${targetCount} completed - Number ${subAccountNum} verified successfully.`, 'info');
            } else {
              broadcastLog(`❌ Sub-account number ${subAccountNum} failed verification. Keeping email, swapping number...`, 'error');
            }
          } catch (err) {
            broadcastLog(`Sub-account error: ${err.message}. Retrying number...`, 'error');
          } finally {
            if (browser) await browser.close().catch(() => {});
            if (session) await steel.sessions.release(session.id).catch(() => {});
          }

          if (!subVerified) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      if (completedCount >= targetCount) {
        broadcastLog(`🎉 Batch of 20/20 completed for this parent! Looping back to create a new parent...`, 'info');
      }
    }
  } catch (err) {
    broadcastLog(`Engine critical crash: ${err.message}`, 'error');
  } finally {
    isRunning = false;
    broadcastLog('⏹️ Automation engine stopped.', 'info');
  }
}

io.on('connection', (socket) => {
  socket.emit('status', { isRunning });

  socket.on('start', () => {
    if (!isRunning) {
      runAutomationEngine();
      io.emit('status', { isRunning: true });
    }
  });

  socket.on('stop', () => {
    isStopping = true;
    isRunning = false;
    io.emit('status', { isRunning: false });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
