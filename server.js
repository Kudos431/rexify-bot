const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let isRunning = false;
let isStopping = false;
let logs = [];

function broadcastLog(message, type = 'info') {
  const logEntry = { message, type, time: new Date().toLocaleTimeString(), done: isRunning };
  logs.push(logEntry);
  console.log(`[${logEntry.time}] ${message}`);
}

function generateOpayAccountNumber() {
  const prefixes = ['70', '80', '81', '90', '91'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  let remainder = '';
  for (let i = 0; i < 8; i++) {
    remainder += Math.floor(Math.random() * 10);
  }
  return prefix + remainder;
}

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

  (async () => {
    try {
      broadcastLog('⚡ SELF-GENERATING REFERRAL ENGINE STARTED', 'info');
      let currentRefUrl = 'https://rexify.com.ng?reference=bkolawole56';
      let totalCreated = 0;

      while (isRunning && !isStopping) {
        const email = generateRandomEmail();
        const accountNum = generateOpayAccountNumber();
        const password = 'Password0123!';

        broadcastLog(`Account #${totalCreated + 1} | Using Email: ${email} | Account: ${accountNum}`, 'info');

        const browser = await puppeteer.launch({ 
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        try {
          await page.goto(currentRefUrl, { waitUntil: 'networkidle0', timeout: 30000 });
          totalCreated++;
          broadcastLog(`Successfully processed account #${totalCreated}`, 'info');
        } catch (err) {
          broadcastLog(`Automation error: ${err.message}`, 'error');
        } finally {
          await browser.close();
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (err) {
      broadcastLog(`Engine crashed: ${err.message}`, 'error');
    } finally {
      isRunning = false;
      isStopping = false;
      broadcastLog('Engine stopped.', 'info');
    }
  })();
});

app.post('/api/stop', async (req, res) => {
  if (!isRunning) return res.json({ success: false, error: 'Not running' });
  isStopping = true;
  res.json({ success: true });
});

app.get('/api/status', (req, res) => {
  res.json({ isRunning, isStopping });
});

app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendLog = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  logs.forEach(sendLog);

  const logInterval = setInterval(() => {
    if (logs.length > 0) {
      const latest = logs[logs.length - 1];
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(logInterval);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
