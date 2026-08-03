// 1. Crash Guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH GUARD] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[CRASH GUARD] Uncaught Exception thrown:', err);
});

try {
  require('dotenv').config();
} catch (e) {}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const { KnownDevices } = require('puppeteer');
const Steel = require('steel-sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const mobileDevice = KnownDevices['iPhone 13 Pro'];
const steel = new Steel({
  apiKey: process.env.STEEL_API_KEY,
});

let isRunning = false;
let isStopping = false;

function broadcastLog(message, type = 'info') {
  console.log(`[LOG] ${message}`);
  io.emit('log', { message, type, timestamp: new Date().toLocaleTimeString() });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = (min = 1000, max = 3000) => 
  delay(Math.floor(Math.random() * (max - min + 1)) + min);

function generateRandomEmail() {
  const randStr = Math.random().toString(36).substring(2, 8);
  return `rexify_${Date.now()}_${randStr}@gmail.com`;
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

function generateRandomPassword() {
  return `Pass!${Math.random().toString(36).slice(-8)}`;
}

async function runAutomationEngine() {
  isRunning = true;
  isStopping = false;
  const rootRefUrl = 'https://rexify.com.ng/?reference=bkolawole56';

  broadcastLog('⚡ MULTI-TIER REFERRAL ENGINE STARTED', 'info');

  try {
    while (isRunning && !isStopping) {
      // ----------------------------------------------------
      // STEP 1: CREATE PARENT ACCOUNT USING ROOT LINK
      // ----------------------------------------------------
      broadcastLog('🌱 Starting cycle: Creating new Parent account from Root Link...', 'info');
      let parentRefUrl = null;

      while (isRunning && !isStopping && !parentRefUrl) {
        // FIXED: Email and Password are generated ONCE for this account attempt, outside the number loop
        const parentEmail = generateRandomEmail();
        const password = generateRandomPassword();
        let verified = false;

        // Keep trying different phone numbers with THIS SAME email until it succeeds
        while (isRunning && !isStopping && !parentRefUrl && !verified) {
          const parentAccountNum = generateOpayAccountNumber();
          broadcastLog(`Parent Trial | Email: ${parentEmail} | Opay: ${parentAccountNum}`, 'info');

          let session = null;
          let browser = null;

          try {
            if (isStopping) break;

            session = await steel.sessions.create({});
            browser = await puppeteer.connect({
              browserWSEndpoint: `${session.websocketUrl}&apiKey=${process.env.STEEL_API_KEY}`,
            });

            const openPages = await browser.pages();
            let page = openPages.length > 0 ? openPages[0] : await browser.newPage();

            await page.emulate(mobileDevice);
            page.setDefaultTimeout(30000);

            await page.goto(rootRefUrl, { waitUntil: 'networkidle2', timeout: 35000 });
            await randomDelay(1500, 2500);

            const getStartedBtn = await page.waitForSelector('text/Get started', { visible: true, timeout: 20000 });
            await randomDelay(500, 1000);
            await Promise.all([
              getStartedBtn.click(),
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {})
            ]);

            await randomDelay(1500, 3000);

            const emailSelector = await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { visible: true, timeout: 15000 });
            await emailSelector.type(parentEmail, { delay: 50 });

            const passSelector = await page.waitForSelector('input[type="password"], input[name="password"]', { visible: true, timeout: 10000 });
            await passSelector.type(password, { delay: 50 });

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

            await randomDelay(2000, 3000);
            const errorText = await page.evaluate(() => document.body.innerText);
            if (errorText.includes('already been taken')) {
              broadcastLog(`❌ Email already taken. Retrying with a new email...`, 'error');
              if (browser) await browser.disconnect().catch(() => {});
              if (session) await steel.sessions.release(session.id).catch(() => {});
              break; // Breaks inner number loop to generate a brand new email
            }

            const accountInput = await page.waitForSelector('input[placeholder*="account number" i], input[name*="account" i]', { visible: true, timeout: 15000 });
            await accountInput.type(parentAccountNum, { delay: 50 });

            try {
              await page.select('select', 'OPay');
            } catch (e) {
              await page.evaluate(() => {
                const select = document.querySelector('select');
                if (!select) return;
                for (let option of select.options) {
                  if (option.text.toLowerCase().includes('opay') || option.value.toLowerCase().includes('opay')) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                  }
                }
              });
            }

            const verifyBtn = await page.waitForSelector('text/Verify account', { visible: true, timeout: 15000 });
            await randomDelay(500, 1000);
            await verifyBtn.click();

            await randomDelay(6000, 8000);
            const pageContent = await page.evaluate(() => document.body.innerText);

            if (pageContent.includes('already linked to another Rexify account')) {
              broadcastLog(`❌ Opay number ${parentAccountNum} is already linked. Trying next number...`, 'error');
            } else if (pageContent.includes('Could not resolve account name')) {
              broadcastLog(`❌ Opay number ${parentAccountNum} cannot be resolved. Trying next number...`, 'error');
            } else if (pageContent.includes('Invalid')) {
              broadcastLog(`❌ Opay number ${parentAccountNum} is marked Invalid. Trying next number...`, 'error');
            } else if (pageContent.includes('Account verified') || pageContent.includes('Account name') || pageContent.includes('Verified')) {
              verified = true;
              broadcastLog(`✅ Opay number ${parentAccountNum} verified successfully! Clicking Finish...`, 'info');

              const finishBtn = await page.waitForSelector('text/Finish & continue', { visible: true, timeout: 15000 });
              await randomDelay(800, 1500);
              await finishBtn.click();
              await delay(4000);

              const username = parentEmail.split('@')[0];
              parentRefUrl = `https://rexify.com.ng/?reference=${username}`;
              broadcastLog(`🔗 Parent Referral Link Generated: ${parentRefUrl}`, 'info');
            } else {
              broadcastLog(`⚠️ Verification state unclear for ${parentAccountNum}. Retrying number...`, 'error');
            }

            if (browser) await browser.disconnect().catch(() => {});
            if (session) await steel.sessions.release(session.id).catch(() => {});
          } catch (err) {
            broadcastLog(`Parent automation error: ${err.message}. Retrying...`, 'error');
            if (browser) await browser.disconnect().catch(() => {});
            if (session) await steel.sessions.release(session.id).catch(() => {});
          }

          if (!verified && !parentRefUrl) {
            await randomDelay(2000, 4000);
          }
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
        // FIXED: Sub-email and password generated ONCE for this account attempt
        let subEmail = generateRandomEmail();
        let subPassword = generateRandomPassword();
        let subVerified = false;

        while (!subVerified && isRunning && !isStopping) {
          let subAccountNum = generateOpayAccountNumber();
          broadcastLog(`Sub ${completedCount + 1}/${targetCount} | Email: ${subEmail} | Opay: ${subAccountNum}`, 'info');

          let session = null;
          let browser = null;

          try {
            if (isStopping) break;

            session = await steel.sessions.create({});
            browser = await puppeteer.connect({
              browserWSEndpoint: `${session.websocketUrl}&apiKey=${process.env.STEEL_API_KEY}`,
            });

            const openPages = await browser.pages();
            let page = openPages.length > 0 ? openPages[0] : await browser.newPage();

            await page.emulate(mobileDevice);
            page.setDefaultTimeout(30000);

            await page.goto(parentRefUrl, { waitUntil: 'networkidle2', timeout: 35000 });
            await randomDelay(1500, 2500);

            const getStartedBtn = await page.waitForSelector('text/Get started', { visible: true, timeout: 20000 });
            await randomDelay(500, 1000);
            await Promise.all([
              getStartedBtn.click(),
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25005 }).catch(() => {})
            ]);

            await randomDelay(1500, 3000);

            const emailSelector = await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { visible: true, timeout: 15000 });
            await emailSelector.type(subEmail, { delay: 50 });

            const passSelector = await page.waitForSelector('input[type="password"], input[name="password"]', { visible: true, timeout: 10000 });
            await passSelector.type(subPassword, { delay: 50 });

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

            await randomDelay(2000, 3000);
            const errorText = await page.evaluate(() => document.body.innerText);
            if (errorText.includes('already been taken')) {
              broadcastLog(`❌ Sub email already taken. Retrying with a new email...`, 'error');
              if (browser) await browser.disconnect().catch(() => {});
              if (session) await steel.sessions.release(session.id).catch(() => {});
              break; // Breaks inner number loop to generate a brand new email
            }

            const accountInput = await page.waitForSelector('input[placeholder*="account number" i], input[name*="account" i]', { visible: true, timeout: 15000 });
            await accountInput.type(subAccountNum, { delay: 50 });

            try {
              await page.select('select', 'OPay');
            } catch (e) {
              await page.evaluate(() => {
                const select = document.querySelector('select');
                if (!select) return;
                for (let option of select.options) {
                  if (option.text.toLowerCase().includes('opay') || option.value.toLowerCase().includes('opay')) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                  }
                }
              });
            }

            const verifyBtn = await page.waitForSelector('text/Verify account', { visible: true, timeout: 15000 });
            await randomDelay(500, 1000);
            await verifyBtn.click();

            await randomDelay(6000, 8000);
            const pageContent = await page.evaluate(() => document.body.innerText);

            if (pageContent.includes('already linked to another Rexify account')) {
              broadcastLog(`❌ Sub Opay number ${subAccountNum} already linked. Swapping number...`, 'error');
            } else if (pageContent.includes('Could not resolve account name')) {
              broadcastLog(`❌ Sub Opay number ${subAccountNum} cannot be resolved. Swapping number...`, 'error');
            } else if (pageContent.includes('Invalid')) {
              broadcastLog(`❌ Sub Opay number ${subAccountNum} is marked Invalid. Swapping number...`, 'error');
            } else if (pageContent.includes('Account verified') || pageContent.includes('Account name') || pageContent.includes('Verified')) {
              subVerified = true;
              broadcastLog(`✅ Sub Opay number ${subAccountNum} verified successfully! Clicking Finish...`, 'info');

              const finishBtn = await page.waitForSelector('text/Finish & continue', { visible: true, timeout: 15000 });
              await randomDelay(800, 1500);
              await finishBtn.click();
              await delay(4000);

              completedCount++;
              broadcastLog(`✅ Sub-account ${completedCount}/${targetCount} completed successfully!`, 'info');
            } else {
              broadcastLog(`⚠️ Sub verification state unclear for ${subAccountNum}. Retrying number...`, 'error');
            }

            if (browser) await browser.disconnect().catch(() => {});
            if (session) await steel.sessions.release(session.id).catch(() => {});
          } catch (err) {
            broadcastLog(`Sub-account error: ${err.message}. Retrying...`, 'error');
            if (browser) await browser.disconnect().catch(() => {});
            if (session) await steel.sessions.release(session.id).catch(() => {});
          }

          if (!subVerified) {
            await randomDelay(2000, 4000);
          }
        }
      }

      if (completedCount >= targetCount) {
        broadcastLog(`🎉 Batch of 20/20 completed successfully! Looping back to create new parent...`, 'info');
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
                
