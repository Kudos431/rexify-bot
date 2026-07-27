const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Directs Puppeteer to store Chrome inside the project folder
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
