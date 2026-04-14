const express  = require('express');
const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const cheerio   = require('cheerio');
const multer    = require('multer');
const Papa      = require('papaparse');
const iconv     = require('iconv-lite');
const path      = require('path');

puppeteer.use(Stealth());

const app  = express();
const PORT = 3131;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Persistent browser singleton ──────────────────────────────────────────
let browser = null;
let browserStarting = false;
let pageInUse = false;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  if (browserStarting) {
    // Wait for in-progress launch
    while (browserStarting) await sleep(200);
    return browser;
  }
  browserStarting = true;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
        '--lang=sv-SE',
      ],
    });
    console.log('🌐 Webbläsaren startad');
  } finally {
    browserStarting = false;
  }
  return browser;
}

// ─── Fetch one vehicle page using a real browser ───────────────────────────
async function fetchVehicle(id) {
  const cleanId = id.trim().toUpperCase().replace(/\s|-/g, '');
  const url     = `https://biluppgifter.se/fordon/${encodeURIComponent(cleanId)}`;

  // Serialize page access so we don't open too many pages at once
  while (pageInUse) await sleep(300);
  pageInUse = true;

  const br   = await getBrowser();
  const page = await br.newPage();

  try {
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8' });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait a bit for dynamic content
    await sleep(1500);

    const html = await page.content();
    const $    = cheerio.load(html);

    // ── Try to find reg & chassis numbers ──────────────────────────────────
    // biluppgifter.se layout: #summary contains summary boxes
    // Each box has a label and a value span
    let regVal     = '';
    let chassisVal = '';

    // Strategy 1: scan all spans/divs for label patterns
    $('*').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      const next = $(el).next().text().trim()
                || $(el).closest('div').find('span').last().text().trim();

      if (/^reg\.?nr\.?$|^regnummer$/.test(text) && next) regVal = next;
      if (/^chassi|^vin/.test(text) && next)               chassisVal = next;
    });

    // Strategy 2: XPath equivalent from original formula
    // //*[@id='summary']/div[1]/div[3]/span
    if (!regVal && !chassisVal) {
      const candidate = $('#summary > div:first-child > div:nth-child(3) span').first().text().trim();
      if (isVIN(candidate))   chassisVal = candidate;
      else if (isRegNr(candidate)) regVal = candidate;
    }

    // Strategy 3: look for VIN/reg patterns in full page text
    if (!chassisVal) {
      $('span, td, dd, p').each((_, el) => {
        const t = $(el).text().trim();
        if (isVIN(t) && !chassisVal) chassisVal = t;
      });
    }
    if (!regVal) {
      $('span, td, dd, p').each((_, el) => {
        const t = $(el).text().trim().toUpperCase().replace(/\s/g,'');
        if (isRegNr(t) && !regVal) regVal = t;
      });
    }

    return { ok: true, reg: regVal, chassis: chassisVal, url };

  } finally {
    await page.close();
    pageInUse = false;
  }
}

// ─── Identifier helpers ────────────────────────────────────────────────────
function isVIN(str) {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test((str || '').trim());
}
function isRegNr(str) {
  const s = (str || '').trim().toUpperCase().replace(/[\s-]/g, '');
  return /^[A-ZÅÄÖ]{3}[0-9]{2}[A-Z0-9]$/i.test(s);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── API: single lookup ────────────────────────────────────────────────────
app.get('/api/lookup/:id', async (req, res) => {
  try {
    const data = await fetchVehicle(req.params.id);
    res.json({ input: req.params.id, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, input: req.params.id, error: err.message });
  }
});

// ─── CSV helper ────────────────────────────────────────────────────────────
function parseCSV(buffer) {
  let text = buffer.toString('utf8');
  
  // Basic encoding check: if it contains the replacement character, it might be ISO-8859-1
  if (text.includes('\uFFFD')) {
    text = iconv.decode(buffer, 'win1252');
  }

  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: h => h.trim()
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}

// ─── API: parse CSV ────────────────────────────────────────────────────────
app.post('/api/parse-csv', upload.single('csv'), (req, res) => {
  try {
    const records = parseCSV(req.file.buffer);

    if (!records.length) return res.json({ ok: false, error: 'Filen är tom eller kunde inte tolkas' });

    const headers     = Object.keys(records[0]);
    const columnTypes = headers.map(h => {
      let regScore = 0, vinScore = 0, total = 0;
      for (const row of records.slice(0, 50)) {
        const val = (row[h] || '').toString().trim();
        if (!val) continue;
        total++;
        if (isVIN(val))   vinScore++;
        else if (isRegNr(val)) regScore++;
      }
      const type = vinScore > 0 && vinScore >= regScore ? 'chassis'
                 : regScore > 0 ? 'regnr' : 'other';
      return { header: h, type, regScore, vinScore, total };
    });

    res.json({ ok: true, headers, columnTypes, preview: records.slice(0, 5), totalRows: records.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── API: process CSV with SSE progress ───────────────────────────────────
app.post('/api/process', upload.single('csv'), async (req, res) => {
  const { column, targetColumn } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const records = parseCSV(req.file.buffer);
    const total   = records.length;

    send({ type: 'start', total });

    const results = [];

    for (let i = 0; i < records.length; i++) {
      const row      = records[i];
      const inputVal = (row[column] || '').toString().trim();
      let   converted = '';

      if (inputVal) {
        try {
          const data = await fetchVehicle(inputVal);
          const isInputReg = isRegNr(inputVal);
          converted = isInputReg
            ? (data.chassis || 'Ej hittad')
            : (data.reg     || 'Ej hittad');
        } catch (err) {
          converted = `FEL: ${err.message.slice(0, 60)}`;
        }
      }

      const resultRow = { ...row, [targetColumn]: converted };
      results.push(resultRow);
      send({ type: 'progress', completed: i + 1, total, row: resultRow });

      // Polite delay between requests (1.5 s)
      if (i < records.length - 1) await sleep(1500);
    }

    // Build CSV
    const outHeaders = Object.keys(results[0]);
    const csv = [
      outHeaders.join(','),
      ...results.map(r =>
        outHeaders.map(h => `"${(r[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    send({ type: 'done', csv, total });
    res.end();
  } catch (err) {
    send({ type: 'error', message: err.message });
    res.end();
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚗  Get-Chassi körs på http://localhost:${PORT}\n`);
  // Pre-warm browser
  try {
    await getBrowser();
  } catch (e) {
    console.warn('⚠️  Kunde inte starta webbläsaren:', e.message);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
