'use strict';
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const multer = require('multer');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const PDFDoc = require('pdfkit');

// ── Optional pdf-parse ──────────────────────────────────────
let pdfParse;
try { pdfParse = require('pdf-parse'); } catch { pdfParse = null; }

// ── Config ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
let OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct'; // Default model for OpenRouter

// ── OpenRouter client check — key must be non-empty and non-placeholder ────
let openrouterClient = !!(OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your_api_key_here');
if (openrouterClient) {
  console.log('✅ OpenRouter API: Key found — will validate on first health check');
} else {
  console.log('ℹ️  OpenRouter API: No key set — will try Ollama fallback');
}

// Track whether the API key has been confirmed working
let apiKeyValid = null; // null = not tested yet, true = valid, false = invalid

// Use Node.js native fetch (v18+) — supports WHATWG ReadableStream + getReader()
// Do NOT use node-fetch here — it uses a different stream API
const app = express();
const server = http.createServer(app);

// ── File upload (in-memory, 20 MB) ──────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Elite Indian CA
// ══════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are CABot — an elite AI Chartered Accountant with 25+ years of experience, registered as FCA with ICAI. You are a SPECIALIST in Indian taxation, GST, corporate law, auditing, financial planning, and business advisory. Respond EXACTLY like a senior CA sitting across the table from a client.

PERSONALITY & EXPERTISE:
- You hold FCA, DISA, and LLB degrees. You are a master of Indian Income Tax, GST, Corporate Law, FEMA, SEBI, and Transfer Pricing.
- Speak like a top-tier CA/CFO: highly analytical, deeply knowledgeable, warm, confident, and direct.
- Proactive Advisory: Never just answer the question. Anticipate the next 3 questions the client will have and answer them too.
- Precision: ALWAYS cite exact sections, rules, circulars, and latest case laws where relevant.
- Protection: ALWAYS highlight penalties, late fees, prosecution risks, and upcoming statutory deadlines.
- Practicality: Provide actionable business solutions, not just academic theory. Give "Jugaad" (legal tax planning strategies) within the four corners of the law.
- Multilingual: If the client speaks Hindi or Hinglish, reply in the same tone but keep the technical terms in English.

ADVANCED CAPABILITIES & WORKFLOW:
1. TAX STRUCTURING: If a client asks about business, automatically compare Sole Proprietorship vs LLP vs Pvt Ltd for tax efficiency.
2. SALARY OPTIMIZATION: If asked about salary, restructure it to maximize take-home using NPS, LTA, Food Coupons, and Car Lease models.
3. FOREX & NRI: For foreign income, always analyze DTAA (Double Tax Avoidance Agreements), Section 90, and FEMA compliance.
4. STARTUP ADVISORY: For startups, suggest DPIIT registration, Section 80IAC tax holiday, and Angel Tax (Section 56) protections.

WHEN ANALYZING UPLOADED FILES (Bank Statements, Invoices, ITRs, Balance Sheets):
- Do a Forensic Review: Look for unrecorded liabilities, missing GST credits, or TDS defaults.
- Find the Money: Identify cash flow leaks and suggest working capital improvements.
- Tax Audit Mode: Treat every document as if you are auditing it u/s 44AB. Find the flaws before the Income Tax Dept does.
- Explain in simple terms what the document means for the client's pocket.

IF THE USER PROMPT STARTS WITH "[DRAFTING MODE]":
- You are writing a FORMAL, legally binding letter or document.
- Use strict professional legal formatting (e.g., "To, The Assessing Officer", "Subject:", "Sir/Madam", "Yours faithfully,").
- Cite correct sections of the law (Income Tax Act 1961, CGST Act 2017, Companies Act 2013).
- Do not use conversational language or pleasantries in the draft itself. Present it as a copy-paste ready template.
- Add placeholders like [Name of Assessee], [PAN], [Date] where necessary.

RESPONSE APPROACH (apply to EVERY query):
1. Understand what the client ACTUALLY needs (read between the lines)
2. Identify the relevant law/section/rule/standard
3. If numbers are involved — CALCULATE step-by-step, show every line
4. Give the answer + practical action steps
5. Proactively warn about risks, deadlines, penalties
6. Suggest tax-saving / cost-reduction / compliance shortcuts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INCOME TAX — AY 2025-26 (FY 2024-25)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEW TAX REGIME (Default):
| Income Slab              | Rate |
|--------------------------|------|
| Up to ₹3,00,000          | NIL  |
| ₹3,00,001 – ₹7,00,000   | 5%   |
| ₹7,00,001 – ₹10,00,000  | 10%  |
| ₹10,00,001 – ₹12,00,000 | 15%  |
| ₹12,00,001 – ₹15,00,000 | 20%  |
| Above ₹15,00,000         | 30%  |
Standard Deduction: ₹75,000. Rebate u/s 87A: full rebate if net income ≤ ₹7,00,000.

OLD TAX REGIME:
| Income Slab              | Rate |
|--------------------------|------|
| Up to ₹2,50,000          | NIL  |
| ₹2,50,001 – ₹5,00,000   | 5%   |
| ₹5,00,001 – ₹10,00,000  | 20%  |
| Above ₹10,00,000         | 30%  |
Standard Deduction: ₹50,000. Rebate u/s 87A: full rebate if net income ≤ ₹5,00,000.

SURCHARGE: 50L-1Cr→10% | 1Cr-2Cr→15% | 2Cr-5Cr→25% | >5Cr→37%(old)/25%(new)
CESS: 4% Health & Education Cess on (Tax + Surcharge)

KEY DEDUCTIONS (Old Regime):
- 80C: ₹1,50,000 — LIC, PPF, ELSS, EPF, NSC, 5yr FD, SSY, home loan principal
- 80CCD(1B): ₹50,000 — NPS (EXTRA over 80C limit)
- 80D: ₹25,000 self / ₹50,000 senior parents — health insurance premium
- 80E: Education loan interest — no upper limit
- 80G: Donations — 50% or 100% deduction based on fund
- 80TTA: ₹10,000 — savings bank interest (non-senior)
- 80TTB: ₹50,000 — all interest income for senior citizens
- Section 24(b): ₹2,00,000 — home loan interest (self-occupied property)
- HRA Exemption: Least of [Actual HRA | 50%/40% of Basic | Rent paid - 10% of Basic]

CAPITAL GAINS TAX (Budget 2024 Updated):
- STCG on Equity/MF (STT paid): 20% flat (u/s 111A)
- LTCG on Equity/MF >₹1,25,000: 12.5% (u/s 112A, no indexation)
- Holding period for equity LTCG: >12 months
- STCG on Property/Debt: As per income tax slab
- LTCG on Property (bought before 23 Jul 2024): 20% WITH indexation OR 12.5% WITHOUT indexation — client's choice
- LTCG on Property (bought after 23 Jul 2024): 12.5% WITHOUT indexation only

ITR FORMS:
- ITR-1 (Sahaj): Salaried + one house + income ≤₹50L (no capital gains)
- ITR-2: Salary/pension + capital gains + multiple properties
- ITR-3: Business/profession income (non-presumptive)
- ITR-4 (Sugam): Presumptive income u/s 44AD/44ADA/44AE
- ITR-5: Partnership firms, LLPs, AOPs, BOIs
- ITR-6: Companies (except those claiming 80G exemption)
- ITR-7: Trusts, political parties, research institutions

ADVANCE TAX SCHEDULE:
- 15 June      → Pay minimum 15% of estimated annual tax
- 15 September → Pay minimum 45% of estimated annual tax
- 15 December  → Pay minimum 75% of estimated annual tax
- 15 March     → Pay 100% of estimated annual tax

PENALTIES & INTEREST:
- 234A: 1% per month on tax due for late ITR filing
- 234B: 1% per month if advance tax paid < 90% of assessed tax
- 234C: 1% per month for shortfall in advance tax instalments
- 234F: ₹1,000 (income ≤₹5L) or ₹5,000 (income >₹5L) late filing fee
- 271(1)(c): 100%-300% of tax for concealment of income

KEY DEADLINES (FY 2024-25):
- ITR for individuals (no audit): 31 July 2025
- ITR for audit cases: 31 October 2025
- Belated/Revised return: 31 December 2025
- Tax Audit Report (3CA/3CB-3CD): 30 September 2025

TDS QUICK REFERENCE:
| Section | Nature          | Rate      | Threshold      |
|---------|-----------------|-----------|----------------|
| 192     | Salary          | Slab rate | Basic exemption |
| 194A    | Interest        | 10%       | ₹40,000/yr     |
| 194C    | Contractor      | 1%/2%     | ₹30,000/single |
| 194H    | Commission      | 5%        | ₹15,000/yr     |
| 194I    | Rent            | 10%       | ₹2,40,000/yr   |
| 194J    | Professional    | 10%       | ₹30,000/yr     |
| 194IA   | Property sale   | 1%        | ₹50L+          |
| 194Q    | Goods purchase  | 0.1%      | ₹50L+          |
TDS deposited by 7th of the following month.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GST — GOODS & SERVICES TAX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GST RATES: 0% | 5% | 12% | 18% | 28%
INTRA-STATE: CGST (half) + SGST (half). INTER-STATE: IGST (full).
REGISTRATION THRESHOLDS: Goods >₹40L | Services >₹20L | Special states >₹10L
GST RETURNS: GSTR-1 (11th) | GSTR-3B (20th) | GSTR-9 Annual (31 Dec)
ITC BLOCKED u/s 17(5): Motor vehicles (personal), food/beverages, beauty, club membership
COMPOSITION SCHEME: Goods <₹1.5Cr (1%) | Restaurants <₹1.5Cr (5%) | Services <₹50L (6%)
PENALTIES: Late filing ₹50/day (NIL: ₹20/day), max ₹5,000.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCOUNTING, COMPANY LAW, PAYROLL, AUDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GOLDEN RULES: Personal (Dr Receiver/Cr Giver) | Real (Dr In/Cr Out) | Nominal (Dr Expense/Cr Income)
EPF: Employee 12% + Employer 12% of Basic+DA. ESI: Employee 0.75% + Employer 3.25%.
GRATUITY: (15×Basic×Years)/26. Tax exempt up to ₹20L.
TAX AUDIT u/s 44AB: Business >₹1Cr (>₹10Cr if 95% digital) | Profession >₹50L.
ROC: AOC-4 (30 days from AGM) | MGT-7 (60 days from AGM) | AGM within 6 months of FY end.

RESPONSE FORMAT:
FOR CALCULATIONS: 📊 CALCULATION BREAKDOWN → Step-by-step → ✅ FINAL ANSWER → 💡 TIP → ⚠️ ALERT
FOR ADVISORY: 🎯 RECOMMENDATION → 📋 REASONING → 📝 ACTION STEPS → ⚠️ RISKS → 💰 TAX SAVING
FOR FILE ANALYSIS: 📁 DOCUMENT REVIEW → 🔍 FINDINGS → ⚠️ ISSUES FOUND → ✅ COMPLIANT ITEMS → 📝 RECOMMENDATIONS

ALWAYS end with: 📌 *This is professional CA guidance based on current Indian tax laws (AY 2025-26). Verify with latest government notifications before official filing.*`;

// ══════════════════════════════════════════════════════════════
// FILE EXTRACTION
// ══════════════════════════════════════════════════════════════
async function extractFileContent(buffer, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    if (!pdfParse) return { text: '[PDF library not available. Install pdf-parse.]', type: 'pdf' };
    try {
      const data = await pdfParse(buffer);
      return { text: data.text || '[No text in PDF]', pages: data.numpages, type: 'pdf' };
    } catch (e) {
      return { text: `[Could not parse PDF: ${e.message}]`, type: 'pdf' };
    }
  }

  if (['.xlsx', '.xls', '.csv'].includes(ext) || mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype === 'text/csv') {
    try {
      const wb = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      const lines = [];
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
        lines.push(`\n=== Sheet: ${name} ===`);
        data.forEach(row => { if (row.some(c => c !== '')) lines.push(row.join(' | ')); });
      });
      return { text: lines.join('\n'), sheets: wb.SheetNames, type: 'excel' };
    } catch (e) {
      return { text: `[Could not parse Excel/CSV: ${e.message}]`, type: 'excel' };
    }
  }

  if (ext === '.docx' || mimetype.includes('wordprocessingml') || mimetype.includes('msword')) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || '[No text in document]', type: 'docx' };
    } catch (e) {
      return { text: `[Could not parse Word: ${e.message}]`, type: 'docx' };
    }
  }

  if (mimetype.startsWith('text/') || ['.txt', '.json'].includes(ext)) {
    return { text: buffer.toString('utf8'), type: 'text' };
  }

  return { text: '[Unsupported file type. Supported: PDF, Excel, Word, CSV, TXT]', type: 'unknown' };
}

// ══════════════════════════════════════════════════════════════
// PDF EXPORT
// ══════════════════════════════════════════════════════════════
function generatePDF(messages, clientName, title) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDoc({ margin: 50, size: 'A4' });
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 100;
    const INDIGO = '#4f46e5';
    const GOLD = '#d4a017';
    const DARK = '#0a0a14';
    const GREY = '#555';

    // Cover
    doc.rect(0, 0, doc.page.width, 180).fill(DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28).text('CABot', 50, 50);
    doc.fillColor(INDIGO).font('Helvetica').fontSize(13).text('AI Chartered Accountant Report', 50, 88);
    doc.fillColor(GOLD).fontSize(11)
      .text(`${title || 'CA Advisory Report'}`, 50, 112)
      .text(`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 50, 128)
      .text(`Client: ${clientName || 'Not specified'}`, 50, 144);
    doc.rect(0, 180, doc.page.width, 3).fill(INDIGO);
    doc.moveDown(6);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Conversation Transcript', 50, doc.y, { underline: true });
    doc.moveDown(0.8);

    messages.forEach((msg, i) => {
      const isUser = msg.role === 'user';
      const label = isUser ? '👤 Client' : '🤖 CABot (FCA)';
      doc.fillColor(isUser ? INDIGO : '#059669').font('Helvetica-Bold').fontSize(10).text(label);
      doc.moveDown(0.2);
      const clean = (msg.content || '')
        .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
        .replace(/^#+\s/gm, '').replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
        .replace(/^[-*]\s/gm, '• ').replace(/^>\s/gm, '  ')
        .slice(0, 4000);
      doc.fillColor('#222').font('Helvetica').fontSize(10).text(clean, { width: W, align: 'left', lineGap: 2 });
      if (i < messages.length - 1) {
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(50 + W, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(0.5);
      }
    });

    doc.addPage();
    doc.rect(0, 0, doc.page.width, 60).fill(DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text('Disclaimer', 50, 20);
    doc.fillColor(GREY).font('Helvetica').fontSize(9).moveDown(6)
      .text('This report is generated by CABot, an AI tool trained on Indian tax laws and accounting standards (AY 2025-26). The content is for professional guidance only and should be verified against the latest government notifications before official filing.', { width: W, align: 'justify', lineGap: 2 });
    doc.moveDown(1);
    doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(10).text('CABot — AI Chartered Accountant | FCA ICAI Knowledge Base | India | AY 2025-26');
    doc.end();
  });
}

// ══════════════════════════════════════════════════════════════
// EXCEL EXPORT
// ══════════════════════════════════════════════════════════════
function generateExcel(messages, clientName, title) {
  const wb = xlsx.utils.book_new();
  const convRows = [
    ['CABot — AI Chartered Accountant Report'],
    [`Title: ${title || 'CA Advisory'}`],
    [`Client: ${clientName || 'Not specified'}`],
    [`Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`],
    [],
    ['#', 'Role', 'Message'],
  ];
  messages.forEach((m, i) => {
    convRows.push([i + 1, m.role === 'user' ? 'Client' : 'CABot (FCA)', (m.content || '').replace(/\*\*?/g, '').replace(/#+\s/g, '').slice(0, 3000)]);
  });
  const wsConv = xlsx.utils.aoa_to_sheet(convRows);
  wsConv['!cols'] = [{ wch: 4 }, { wch: 14 }, { wch: 100 }];
  xlsx.utils.book_append_sheet(wb, wsConv, 'Conversation');

  const taxRows = [
    ['New Tax Regime AY 2025-26', 'Rate'],
    ['Up to ₹3,00,000', 'NIL'],
    ['₹3L – ₹7L', '5%'],
    ['₹7L – ₹10L', '10%'],
    ['₹10L – ₹12L', '15%'],
    ['₹12L – ₹15L', '20%'],
    ['Above ₹15L', '30%'],
    [], ['Standard Deduction (New)', '₹75,000'], ['87A Rebate (New)', 'if income ≤ ₹7L'],
    [], ['Old Tax Regime AY 2025-26', 'Rate'],
    ['Up to ₹2,50,000', 'NIL'], ['₹2.5L – ₹5L', '5%'], ['₹5L – ₹10L', '20%'], ['Above ₹10L', '30%'],
    [], ['Key Deductions (Old)', 'Limit'],
    ['80C', '₹1,50,000'], ['80CCD(1B) NPS', '₹50,000'], ['80D Self', '₹25,000'], ['80D Senior Parents', '₹50,000'], ['24(b) Home Loan Int', '₹2,00,000'],
  ];
  const wsTax = xlsx.utils.aoa_to_sheet(taxRows);
  wsTax['!cols'] = [{ wch: 35 }, { wch: 20 }];
  xlsx.utils.book_append_sheet(wb, wsTax, 'Tax Reference');

  const deadlines = [
    ['Compliance Deadlines FY 2024-25', 'Date', 'Penalty'],
    ['ITR Individuals (no audit)', '31 Jul 2025', '₹5,000 u/s 234F'],
    ['ITR Audit Cases', '31 Oct 2025', '₹5,000 u/s 234F'],
    ['Belated/Revised ITR', '31 Dec 2025', 'Interest 234A'],
    ['Tax Audit (3CA/3CD)', '30 Sep 2025', '0.5% of turnover'],
    ['Advance Tax 1st', '15 Jun 2025', '1%/month 234C'],
    ['Advance Tax 2nd', '15 Sep 2025', '1%/month 234C'],
    ['Advance Tax 3rd', '15 Dec 2025', '1%/month 234C'],
    ['Advance Tax Final', '15 Mar 2026', '1%/month 234B'],
    ['GSTR-1 Monthly', '11th each month', '₹50/day'],
    ['GSTR-3B Monthly', '20th each month', '₹50/day'],
    ['TDS Deposit', '7th each month', '1.5%/month'],
  ];
  const wsD = xlsx.utils.aoa_to_sheet(deadlines);
  wsD['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 24 }];
  xlsx.utils.book_append_sheet(wb, wsD, 'Deadlines');

  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

/** GET /api/health — validates API key with a real probe request */
app.get('/api/health', async (_req, res) => {
  let ollamaOk = false;
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    ollamaOk = r.ok;
  } catch { }

  // Validate OpenRouter key with a real (non-streaming) probe
  if (openrouterClient && apiKeyValid !== false) {
    try {
      const probe = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        },
        signal: AbortSignal.timeout(8000),
      });
      const probeData = await probe.json();
      if (probe.ok && probeData?.data) {
        apiKeyValid = true;
        const credits = probeData.data?.limit_remaining;
        console.log(`✅ OpenRouter key valid | Credits remaining: ${credits ?? 'unknown'}`);
        return res.json({
          status: 'ok',
          provider: 'openrouter',
          openrouter: true,
          ollama: ollamaOk,
          credits: credits ?? null,
        });
      } else {
        apiKeyValid = false;
        console.warn('⚠️  OpenRouter key INVALID:', probeData?.error?.message || probe.status);
      }
    } catch (e) {
      console.warn('⚠️  OpenRouter health probe failed:', e.message);
      // Network error — don't mark key as invalid, just fall through
    }
  }

  if (ollamaOk) {
    return res.json({ status: 'ok', provider: 'ollama', openrouter: false, ollama: true });
  }

  const errMsg = apiKeyValid === false
    ? 'OpenRouter API key is invalid or expired. Get a new key at openrouter.ai'
    : 'No LLM available. Set OPENROUTER_API_KEY or run Ollama locally.';

  res.status(503).json({ status: 'error', openrouter: false, ollama: false, message: errMsg });
});

/** GET /api/models */
app.get('/api/models', async (req, res) => {
  const models = [];

  // Only include OpenRouter model if key is set and NOT confirmed invalid
  if (openrouterClient && apiKeyValid !== false) {
    models.push({ name: OPENROUTER_MODEL, label: '☁️ Llama 3.3 70B (OpenRouter Cloud)', provider: 'openrouter' });
  }

  // Also check Ollama
  try {
    const r = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await r.json();
    (data.models || []).forEach(m => {
      models.push({ name: `ollama:${m.name}`, provider: 'ollama', label: `🤖 ${m.name} (Local Ollama)` });
    });
  } catch { }

  if (!models.length) {
    const errMsg = apiKeyValid === false
      ? 'OpenRouter API key is invalid. Get a new free key at openrouter.ai'
      : 'No LLM available. Set OPENROUTER_API_KEY in .env or run Ollama locally.';
    return res.status(503).json({ error: errMsg, models: [], preferred: '', keyInvalid: apiKeyValid === false });
  }

  res.json({ models, hasOpenRouter: openrouterClient && apiKeyValid !== false, preferred: models[0]?.name });
});

/** POST /api/upload */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const result = await extractFileContent(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({
      ok: true, filename: req.file.originalname, size: req.file.size,
      type: result.type, pages: result.pages, sheets: result.sheets,
      extractedText: result.text.slice(0, 8000),
      truncated: result.text.length > 8000,
    });
  } catch (err) {
    res.status(500).json({ error: 'File processing failed: ' + err.message });
  }
});

/** POST /api/export/pdf */
app.post('/api/export/pdf', async (req, res) => {
  const { messages = [], clientName = '', title = '' } = req.body;
  if (!messages.length) return res.status(400).json({ error: 'No messages' });
  try {
    const buf = await generatePDF(messages, clientName, title);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CABot_Report_${Date.now()}.pdf"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

/** POST /api/export/excel */
app.post('/api/export/excel', (req, res) => {
  const { messages = [], clientName = '', title = '' } = req.body;
  if (!messages.length) return res.status(400).json({ error: 'No messages' });
  try {
    const buf = generateExcel(messages, clientName, title);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="CABot_Report_${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Excel generation failed: ' + err.message });
  }
});

/** GET /api/test-sse — instant SSE smoke test */
app.get('/api/test-sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  res.write('data: {"msg":"hello from main server"}\n\n');
  res.write('data: {"done":true}\n\n');
  res.end();
});


app.post('/api/chat', (req, res) => {
  const { messages, model, crm } = req.body;
  if (!model || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'model and messages[] required' });
  }

  // SSE headers — use setHeader + flushHeaders (NOT writeHead)
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  const done  = () => { if (!res.writableEnded) res.end(); };
  const abort = new AbortController();
  res.on('close', () => abort.abort()); // res.close fires when client disconnects SSE

  const isOllama    = model.startsWith('ollama:');
  const actualModel = isOllama ? model.replace('ollama:', '') : model;
  const useCloud    = !isOllama && openrouterClient;

  let dynamicSystemPrompt = SYSTEM_PROMPT;
  if (crm && (crm.name || crm.id || crm.entity)) {
    dynamicSystemPrompt = `[CLIENT CRM PROFILE]\nClient Name: ${crm.name || 'Not provided'}\nPAN/GSTIN: ${crm.id || 'Not provided'}\nEntity Type: ${crm.entity || 'Individual'}\n\nIMPORTANT INSTRUCTION: Use the above Client Entity profile to determine tax rates, compliances, and available deductions. For example, if it is a Private Limited Company or LLP, apply corporate/partnership tax rates and ignore 80C. Do NOT ask the user for entity type if provided here.\n\n` + SYSTEM_PROMPT;
  }

  // Fire-and-forget — do NOT await, so res.write() flushes in real-time
  (async () => {
    try {
      if (useCloud) {
        const cloudRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method:  'POST',
          signal:  abort.signal,
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'CABot',
          },
          body: JSON.stringify({
            model: actualModel, stream: true, temperature: 0.7, max_tokens: 4096,
            messages: [
              { role: 'system', content: dynamicSystemPrompt },
              ...messages.map(m => ({ role: m.role, content: m.content })),
            ],
          }),
        });

        if (!cloudRes.ok) {
          let errMsg = `Cloud API error (${cloudRes.status})`;
          try {
            const e = await cloudRes.json();
            errMsg = e?.error?.message || errMsg;
            // Mark key as invalid on 401
            if (cloudRes.status === 401) {
              apiKeyValid = false;
              errMsg = '❌ OpenRouter API key is invalid or expired. Please get a new free key at openrouter.ai and update your .env file.';
            }
          } catch {}
          send({ error: errMsg });
          return done();
        }

        // Use WHATWG reader — required for Node.js v18+ built-in fetch
        const reader  = cloudRes.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = '';

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone || abort.signal.aborted) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();

          for (const raw of lines) {
            const line = raw.trim();
            if (!line || line === 'data: [DONE]') continue;
            if (!line.startsWith('data:')) continue;
            try {
              const j   = JSON.parse(line.slice(5).trim());
              const tok = j?.choices?.[0]?.delta?.content;
              if (tok) send({ token: tok });
            } catch {}
          }
        }
        reader.releaseLock();

      } else {
        // Ollama fallback
        const r = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method:  'POST',
          signal:  abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: actualModel,
            stream: true,
            messages: [
              { role: 'system', content: dynamicSystemPrompt },
              ...messages.map(m => ({ role: m.role, content: m.content })),
            ],
            options: { temperature: 0.7, num_predict: 4096 },
          }),
        });

        if (!r.ok) {
          send({ error: `Ollama error (${r.status})` });
          return done();
        }

        const reader  = r.body.getReader();
        const decoder = new TextDecoder();
        let   buf     = '';

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone || abort.signal.aborted) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const p = JSON.parse(line);
              if (p?.message?.content) send({ token: p.message.content });
            } catch {}
          }
        }
        reader.releaseLock();
      }

      send({ done: true });

    } catch (err) {
      if (err.name !== 'AbortError') {
        let msg = err.message || 'Unknown error';
        if (msg.includes('API key') || msg.includes('auth') || msg.includes('401') || msg.includes('User not found')) {
          apiKeyValid = false;
          msg = '❌ OpenRouter API key is invalid or expired. Get a new free key at openrouter.ai and update OPENROUTER_API_KEY in .env';
        } else if (msg.includes('rate') || msg.includes('429')) {
          msg = '⚠️ Rate limit hit. Please wait a moment and try again.';
        } else if (msg.includes('credits') || msg.includes('402')) {
          msg = '💳 OpenRouter credits exhausted. Add credits at openrouter.ai or use a free model.';
        }
        send({ error: msg });
      }
    } finally {
      done();
    }
  })();
});



/** POST /api/save-key — save a new OpenRouter API key to .env */
const fs = require('fs');
app.post('/api/save-key', async (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== 'string' || !key.startsWith('sk-or-')) {
    return res.status(400).json({ error: 'Invalid key format. OpenRouter keys start with sk-or-' });
  }
  try {
    const envPath = require('path').join(__dirname, '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
    if (content.includes('OPENROUTER_API_KEY=')) {
      content = content.replace(/OPENROUTER_API_KEY=.*/m, `OPENROUTER_API_KEY=${key}`);
    } else {
      content += `\nOPENROUTER_API_KEY=${key}`;
    }
    fs.writeFileSync(envPath, content);
    // Update in-memory
    OPENROUTER_API_KEY = key;
    openrouterClient = true;
    apiKeyValid = null; // reset — will re-validate on next health check
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not save key: ' + e.message });
  }
});

/** GET /api/config — check if API key is configured */
app.get('/api/config', (_req, res) => {
  res.json({
    hasOpenRouterKey: !!(openrouterClient),
    keyValid: apiKeyValid,
    keyHint: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.slice(0, 8) + '...' : 'not set',
  });
});

app.get('/chat', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'chat.html'))
);

/** Catch-all → SPA */
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// ── Start ──────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   CABot — AI Chartered Accountant v4.0          ║');
  console.log('║   OpenRouter Cloud LLM + Ollama Fallback        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`\n  🌐  Open  →  http://localhost:${PORT}`);
  console.log(`  🤖  LLM   →  ${openrouterClient ? 'OpenRouter API (key found, validating...)' : 'No API key — Ollama fallback'}`);
  console.log(`  📁  Upload: PDF, Excel, Word, CSV, TXT`);
  console.log(`  📤  Export: PDF Report, Excel\n`);
  if (!openrouterClient) {
    console.log(`  💡  Tip: Get a FREE key at openrouter.ai and add OPENROUTER_API_KEY to .env`);
  }
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
