import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

function generateRandomPassword() {
  return 'Pass_' + Math.random().toString(36).slice(-8) + '!1';
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
      let parentEmail = null;
      let parentAccountNum = null;

      while (isRunning && !isStopping && !parentRefUrl) {
        parentEmail = generateRandomEmail();
        const password = generateRandomPassword();
        parentAccountNum = generateOpayAccountNumber();

        broadcastLog(`Parent Trial | Email: ${parentEmail} | Opay: ${parentAccountNum}`, 'info');

        let browser;
        let verified = false;

        try {
          if (isStopping) break;

          const steelWsUrl = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}`;
          browser = await puppeteer.connect({ browserWSEndpoint: steelWsUrl });
          const page = await browser.newPage();

          await page.goto(rootRefUrl, { waitUntil: 'networkidle0', timeout: 30000 });

          // Click "Get started" button dynamically by text content
          const getStartedBtn = await page.evaluateHandle(() => {
            const elements = Array.from(document.querySelectorAll('a, button'));
            return elements.find(el => el.innerText.includes('Get started'));
          });
          if (getStartedBtn && getStartedBtn.asElement()) {
            await getStartedBtn.asElement().evaluate(el => {
              el.scrollIntoView();
              el.click();
            });
          } else {
            // Fallback direct navigation if button isn't caught
            await page.goto('https://rexify.com.ng/user/register?reference=bkolawole56', { waitUntil: 'networkidle0' });
          }

          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});

          await page.waitForSelector('input[type="email"]', { timeout: 10000 });
          await page.type('input[type="email"]', parentEmail);
          await page.type('input[type="password"]', password);
          
          // Safe terms checkbox click
          const termsCheckbox = await page.$('input[type="checkbox"]');
          if (termsCheckbox) {
            await termsCheckbox.evaluate(el => el.scrollIntoView());
            await termsCheckbox.click();
          }

          // Click precise "Continue" button
          const continueBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.innerText.includes('Continue'));
          });
          if (continueBtn && continueBtn.asElement()) {
            await continueBtn.asElement().evaluate(el => {
              el.scrollIntoView();
              el.click();
            });
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
          const errorText = await page.evaluate(() => document.body.innerText);
          if (errorText.includes('already been taken')) {
            broadcastLog(`❌ Email already taken. Retrying with a new email...`, 'error');
            await browser.close();
            continue;
          }

          await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});

          // Step 2: Select Bank -> Opay & Input Number Loop
          await page.evaluate(() => {
            const selects = document.querySelectorAll('select');
            selects.forEach(s => {
              for (let i = 0; i < s.options.length; i++) {
                if (s.options[i].text.includes('Opay')) {
                  s.selectedIndex = i;
                  s.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            });
          });

          await page.evaluate(() => {
            const divs = Array.from(document.querySelectorAll('div'));
            const bankDiv = divs.find(d => d.innerText.includes('Select your bank'));
            if (bankDiv) bankDiv.click();
          }).catch(() => {});
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await page.evaluate(() => {
            const divs = Array.from(document.querySelectorAll('div, span'));
            const opayOpt = divs.find(d => d.textContent.trim() === 'Opay');
            if (opayOpt) opayOpt.click();
          }).catch(() => {});

          const inputFields = await page.$$('input');
          for (let input of inputFields) {
            const placeholder = await page.evaluate(el => el.placeholder, input);
            if (placeholder && placeholder.includes('digit')) {
              await input.evaluate(el => el.scrollIntoView());
              await input.type(parentAccountNum);
              break;
            }
          }

          const verifyBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => b.innerText.includes('Verify account'));
          });
          if (verifyBtn && verifyBtn.asElement()) {
            await verifyBtn.asElement().evaluate(el => {
              el.scrollIntoView();
              el.click();
            });
          }

          await new Promise(resolve => setTimeout(resolve, 5000));

          const pageContent = await page.evaluate(() => document.body.innerText);
          
          if (pageContent.includes('already linked to another Rexify account')) {
            broadcastLog(`❌ Opay number ${parentAccountNum} is already linked. Trying next number...`, 'error');
          } else if (pageContent.includes('Could not resolve account name')) {
            broadcastLog(`❌ Opay number ${parentAccountNum} cannot be resolved. Trying next number...`, 'error');
          } else if (pageContent.includes('Invalid')) {
            broadcastLog(`❌ Opay number ${parentAccountNum} is marked Invalid. Trying next number...`, 'error');
          } else if (pageContent.includes('Account verified') || pageContent.includes('Account name')) {
            verified = true;
            broadcastLog(`✅ Opay number ${parentAccountNum} verified successfully! Clicking Finish...`, 'info');
            
            const finishBtn = await page.evaluateHandle(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              return buttons.find(b => b.innerText.includes('Finish & continue'));
            });
            if (finishBtn && finishBtn.asElement()) {
              await finishBtn.asElement().evaluate(el => {
                el.scrollIntoView();
                el.click();
              });
            }
            await new Promise(resolve => setTimeout(resolve, 4000));

            const username = parentEmail.split('@')[0];
            parentRefUrl = `https://rexify.com.ng/?reference=${username}`;
            broadcastLog(`🔗 Parent Referral Link Generated: ${parentRefUrl}`, 'info');
          } else {
            broadcastLog(`⚠️ Verification state unclear for ${parentAccountNum}. Retrying number...`, 'error');
          }

          await browser.close();
        } catch (err) {
          broadcastLog(`Parent automation error: ${err.message}. Retrying...`, 'error');
          if (browser) await browser.close().catch(() => {});
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
        let subEmail = generateRandomEmail();
        let subPassword = generateRandomPassword();
        let subVerified = false;
        let subAccountNum = '';

        while (!subVerified && isRunning && !isStopping) {
          subAccountNum = generateOpayAccountNumber();
          broadcastLog(`Sub ${completedCount + 1}/${targetCount} | Email: ${subEmail} | Opay: ${subAccountNum}`, 'info');

          let browser;
          try {
            if (isStopping) break;

            const steelWsUrl = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}`;
            browser = await puppeteer.connect({ browserWSEndpoint: steelWsUrl });
            const page = await browser.newPage();

            await page.goto(parentRefUrl, { waitUntil: 'networkidle0', timeout: 30000 });

            const getStartedBtn = await page.evaluateHandle(() => {
              const elements = Array.from(document.querySelectorAll('a, button'));
              return elements.find(el => el.innerText.includes('Get started'));
            });
            if (getStartedBtn && getStartedBtn.asElement()) {
              await getStartedBtn.asElement().evaluate(el => {
                el.scrollIntoView();
                el.click();
              });
            } else {
              await page.goto(`${parentRefUrl}&action=register`, { waitUntil: 'networkidle0' });
            }

            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});

            await page.waitForSelector('input[type="email"]', { timeout: 10000 });
            await page.type('input[type="email"]', subEmail);
            await page.type('input[type="password"]', subPassword);
            
            const termsCheckbox = await page.$('input[type="checkbox"]');
            if (termsCheckbox) {
              await termsCheckbox.evaluate(el => el.scrollIntoView());
              await termsCheckbox.click();
            }

            const continueBtn = await page.evaluateHandle(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              return buttons.find(b => b.innerText.includes('Continue'));
            });
            if (continueBtn && continueBtn.asElement()) {
              await continueBtn.asElement().evaluate(el => {
                el.scrollIntoView();
                el.click();
              });
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            const errorText = await page.evaluate(() => document.body.innerText);
            if (errorText.includes('already been taken')) {
              subEmail = generateRandomEmail();
              await browser.close();
              continue;
            }

            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});

            await page.evaluate(() => {
              const selects = document.querySelectorAll('select');
              selects.forEach(s => {
                for (let i = 0; i < s.options.length; i++) {
                  if (s.options[i].text.includes('Opay')) {
                    s.selectedIndex = i;
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              });
            });

            await page.evaluate(() => {
              const divs = Array.from(document.querySelectorAll('div'));
              const bankDiv = divs.find(d => d.innerText.includes('Select your bank'));
              if (bankDiv) bankDiv.click();
            }).catch(() => {});
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await page.evaluate(() => {
              const divs = Array.from(document.querySelectorAll('div, span'));
              const opayOpt = divs.find(d => d.textContent.trim() === 'Opay');
              if (opayOpt) opayOpt.click();
            }).catch(() => {});

            const inputFields = await page.$$('input');
            for (let input of inputFields) {
              const placeholder = await page.evaluate(el => el.placeholder, input);
              if (placeholder && placeholder.includes('digit')) {
                await input.evaluate(el => el.scrollIntoView());
                await input.type(subAccountNum);
                break;
              }
            }

            const verifyBtn = await page.evaluateHandle(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              return buttons.find(b => b.innerText.includes('Verify account'));
            });
            if (verifyBtn && verifyBtn.asElement()) {
              await verifyBtn.asElement().evaluate(el => {
                el.scrollIntoView();
                el.click();
              });
            }

            await new Promise(resolve => setTimeout(resolve, 5000));

            const pageContent = await page.evaluate(() => document.body.innerText);

            if (pageContent.includes('already linked to another Rexify account')) {
              broadcastLog(`❌ Sub Opay number ${subAccountNum} already linked. Swapping number...`, 'error');
            } else if (pageContent.includes('Could not resolve account name')) {
              broadcastLog(`❌ Sub Opay number ${subAccountNum} cannot be resolved. Swapping number...`, 'error');
            } else if (pageContent.includes('Invalid')) {
              broadcastLog(`❌ Sub Opay number ${subAccountNum} is marked Invalid. Swapping number...`, 'error');
            } else if (pageContent.includes('Account verified') || pageContent.includes('Account name')) {
              subVerified = true;
              broadcastLog(`✅ Sub Opay number ${subAccountNum} verified successfully! Clicking Finish...`, 'info');
              
              const finishBtn = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => b.innerText.includes('Finish & continue'));
              });
              if (finishBtn && finishBtn.asElement()) {
                await finishBtn.asElement().evaluate(el => {
                  el.scrollIntoView();
                  el.click();
                });
              }
              await new Promise(resolve => setTimeout(resolve, 4000));

              completedCount++;
              broadcastLog(`✅ Sub-account ${completedCount}/${targetCount} completed successfully!`, 'info');
            } else {
              broadcastLog(`⚠️ Sub verification state unclear for ${subAccountNum}. Retrying number...`, 'error');
            }

            await browser.close();
          } catch (err) {
            broadcastLog(`Sub-account error: ${err.message}. Retrying...`, 'error');
            if (browser) await browser.close().catch(() => {});
          }

          if (!subVerified) {
            await new Promise(resolve => setTimeout(resolve, 3000));
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
                                            
