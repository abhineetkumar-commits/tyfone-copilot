import Anthropic from '@anthropic-ai/sdk';
import { DriveFile, PlaybookData, PlaybookSection, PlaybookTask, ChecklistData } from '@/types';
import ExcelJS from 'exceljs';

function client() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: k });
}

function ctx(files: (DriveFile & { content?: string })[], msa?: string): string {
  const p: string[] = [];
  if (msa) p.push(`=== MASTER SERVICE AGREEMENT ===\n${msa.substring(0, 60000)}`);
  if (files.length) {
    p.push('\n=== DRIVE DOCUMENTS (most relevant, capped) ===');
    // Cap to the 6 most relevant files and a smaller per-file slice to keep prompts fast.
    for (const f of files.slice(0, 6)) if (f.content) p.push(`\n--- ${f.name} ---\n${f.content.substring(0, 6000)}`);
  }
  return p.join('\n\n');
}

function repairJSON(raw: string): string {
  let t = raw.replace(/```json\n?|\n?```/g, '').trim();
  const stk: string[] = []; let inS = false, esc = false;
  for (const ch of t) {
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inS) { esc = true; continue; }
    if (ch === '"') { inS = !inS; continue; }
    if (inS) continue;
    if (ch === '{' || ch === '[') stk.push(ch);
    if (ch === '}' && stk[stk.length-1] === '{') stk.pop();
    if (ch === ']' && stk[stk.length-1] === '[') stk.pop();
  }
  if (!stk.length) return t;
  const cut = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (cut > t.length * 0.5) t = t.substring(0, cut + 1);
  return t;
}

function parseJ<T>(raw: string, label: string): T {
  const c = raw.replace(/```json\n?|\n?```/g, '').trim();
  try { return JSON.parse(c) as T; } catch {
    try { return JSON.parse(repairJSON(c)) as T; } catch (e) { throw new Error(`Failed to parse ${label}: ${e}`); }
  }
}

export interface MSAMeta {
  creditUnionName: string; goLiveDate: string; goLiveTime: string;
  coreSystem: string; timezone: string; outgoingVendor: string;
  integrations: string[]; notes: string;
}

export async function extractMSAMetadata(msa: string, additionalContext?: string): Promise<MSAMeta> {
  const c = client();
  const r = await c.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1500,
    messages: [{ role: 'user', content: `Extract go-live metadata from this MSA and any additional reference documents. Return ONLY valid JSON, no markdown:
{"creditUnionName":"full legal name","goLiveDate":"YYYY-MM-DD or empty","goLiveTime":"HH:MM or 09:00","coreSystem":"e.g. Symitar (JHA)","timezone":"one of: EST – Eastern Standard Time (UTC-5)|CST – Central Standard Time (UTC-6)|MST – Mountain Standard Time (UTC-7)|PST – Pacific Standard Time (UTC-8)|AKST – Alaska Standard Time (UTC-9)|HST – Hawaii Standard Time (UTC-10)","outgoingVendor":"current digital banking vendor","integrations":["array","of","vendor","names"],"notes":"special constraints"}

IMPORTANT: scan BOTH the MSA and any additional documents below for third-party vendor / integration names — these can appear in exhibits, SOWs, scope-of-work tables, appendices, integration lists, or vendor schedules, not just the main MSA body. Extract every distinct vendor/integration mentioned anywhere in the provided text, even if mentioned only once or in a table/list format.

=== MSA ===
${msa.substring(0, 50000)}
${additionalContext ? `\n=== ADDITIONAL REFERENCE DOCUMENTS ===\n${additionalContext.substring(0, 40000)}` : ''}` }],
  });
  const t = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { return parseJ<MSAMeta>(t, 'MSA metadata'); }
  catch { return { creditUnionName: '', goLiveDate: '', goLiveTime: '09:00', coreSystem: '', timezone: 'PST – Pacific Standard Time (UTC-8)', outgoingVendor: '', integrations: [], notes: '' }; }
}

// ── Playbook generation — matches master template structure exactly ──────────
export async function generatePlaybook(cuName: string, files: (DriveFile & { content?: string })[], msa?: string, extra?: string): Promise<PlaybookData> {
  const c = client();
  const r = await c.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 8000,
    system: `You are a senior Tyfone Delivery Manager creating a Go-Live Playbook for ${cuName} on the nFinia platform. Use ONLY the provided MSA and reference documents to ground specifics (dates, vendor names, integrations). CRITICAL: Return ONLY valid complete JSON. No markdown, no commentary.`,
    messages: [{ role: 'user', content: `Generate a Go-Live Playbook for ${cuName}.
${extra ? `Context: ${extra}\n` : ''}
${ctx(files, msa).substring(0, 35000)}

Return this exact JSON shape:
{
  "creditUnion": "${cuName}",
  "goLiveDate": "from MSA or TBD, format like 'Friday, 22 August 2025'",
  "summary": "2-3 sentence executive summary",
  "sections": [
    {
      "phase": "PHASE 1 – PRE-REQUISITES",
      "title": "Section title within the phase",
      "phaseTarget": "Target: By Fri 8-Aug 2025 (a realistic target date string for this phase, or empty for Go-Live Day/Day-1 phases which use exact dates)",
      "tasks": [
        {
          "task": "Task description, max 90 chars",
          "owner": "CU or T or CU + T or V (V = vendor)",
          "startTime": "HH:MM 24hr local CU time",
          "endTime": "HH:MM 24hr local CU time",
          "dependencies": "— or task id like 1.02",
          "priority": "CRITICAL or HIGH or MEDIUM or LOW",
          "status": "YET TO START",
          "notes": "specific detail referencing the MSA/context where relevant"
        }
      ]
    }
  ]
}

REQUIRED 7 PHASES IN THIS EXACT ORDER:
1. "PHASE 1 – PRE-REQUISITES" — domain/SSL setup, app store prep, core credential confirmation, bridge call setup. 6-9 tasks, business hours.
2. "PHASE 2 – PILOT INTEGRATION SIGN-OFFS" — one task per active integration (use the integrations supplied in context), each "[Vendor] – [purpose]: Pilot sign-off in OLB & MB". Plus a final code-freeze task. Business hours.
3. "PHASE 3 – PRODUCTION INFRA & APP PREP" — server prep, load balancer, pre go-live testing, app store submission. Business hours.
4. "PHASE 4 – WEEKEND STAGING VALIDATION" — full regression testing over the weekend before go-live. Daytime hours Sat/Sun.
5. "PHASE 5 — GO-LIVE DAY MINUS 1" — password change, vendor read-only cutover, SRT data dump & import, DB purge, app publish, DNS update. MUST be sequenced overnight starting evening (e.g. 15:00-23:59) through to early morning of Go-Live Day. Times must flow logically in sequence with dependencies.
6. "PHASE 6 — GO-LIVE DAY" — QA verification, production sanity, CU validation, go/no-go decision, outage removal, member-facing enablement. MUST start in the early morning hours (e.g. 02:00) and progress through to go-live time and beyond (e.g. through 17:00).
7. "PHASE 7 — POST GO-LIVE" — hypercare, transaction search re-enable, retrospective. Spread across days post go-live, business hours.

CRITICAL REQUIREMENTS:
- EVERY task must have startTime and endTime in realistic 24hr format — never blank, never guessed randomly. Times must make sense within the phase narrative (e.g. Phase 5/6 are an overnight-to-morning sequence).
- Owner field must be exactly one of: "CU", "T", "CU + T", "V" — no other values.
- Priority must be exactly one of: CRITICAL, HIGH, MEDIUM, LOW. Mark genuinely blocking/time-sensitive tasks (data migration, core password change, DNS cutover, go/no-go decisions) as CRITICAL.
- Phase 2 must contain one sign-off task per integration mentioned in the context — do not invent integrations not mentioned, but do not skip any either.
- 5-10 tasks per phase except Phase 2 which should match the integration count + 1.` }],
  });
  return parseJ<PlaybookData>(r.content.filter(b => b.type === 'text').map(b => b.text).join(''), 'playbook');
}

// ── Risk register generation ──────────────────────────────────────────────────
export interface RiskItem {
  riskId: string; phase: string; description: string;
  likelihood: number; impact: number; severity: 'HIGH' | 'MEDIUM' | 'LOW';
  mitigation: string; owner: string; contingency: string; notes: string;
}
export interface RiskData { risks: RiskItem[]; }

export async function generateRisks(cuName: string, playbook: PlaybookData, extra?: string): Promise<RiskData> {
  const c = client();
  const taskSummary = playbook.sections.map(s => `${s.phase}: ${s.tasks.map(t => t.task).join('; ')}`).join('\n');
  const r = await c.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 8000,
    system: `You are a senior Tyfone Delivery Manager identifying go-live risks for ${cuName}. Return ONLY valid JSON, no markdown.`,
    messages: [{ role: 'user', content: `Based on this Go-Live Playbook, generate a risk register.
${extra ? `Context: ${extra}\n` : ''}
PLAYBOOK TASKS:
${taskSummary.substring(0, 12000)}

Return JSON:
{"risks":[{"riskId":"R-01","phase":"PRE-2/PRE-3 or GOLIVE etc","description":"specific risk tied to an actual task above","likelihood":1-5,"impact":1-5,"severity":"HIGH or MEDIUM or LOW (HIGH if likelihood*impact>=12, MEDIUM if 6-11, LOW if <=5)","mitigation":"specific mitigation strategy","owner":"who owns mitigating this","contingency":"fallback plan if risk materialises","notes":""}]}

Generate 8-12 risks covering: data migration failures, vendor delays, integration breakage, infrastructure/DNS issues, core connectivity, app store delays, member communication gaps. Each risk must reference a specific task or phase from the playbook above.` }],
  });
  return parseJ<RiskData>(r.content.filter(b => b.type === 'text').map(b => b.text).join(''), 'risks');
}

export async function generateChecklist(cuName: string, files: (DriveFile & { content?: string })[], msa?: string, extra?: string): Promise<ChecklistData> {
  const c = client();
  const r = await c.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 8000,
    system: `You are a senior Tyfone Delivery Manager creating a Pre Go-Live Discovery Questionnaire for ${cuName}. CRITICAL: Return ONLY valid complete JSON. No markdown.`,
    messages: [{ role: 'user', content: `Generate a Pre Go-Live Discovery Questionnaire for ${cuName}.
${extra ? `Context: ${extra}\n` : ''}
${ctx(files, msa).substring(0, 35000)}

Return this exact JSON:
{"creditUnion":"${cuName}","summary":"2-3 sentence summary","items":[{"category":"Category","item":"A direct QUESTION to ask the CU, phrased professionally, max 200 chars","owner":"CU","dueDate":"","status":"Not Started","priority":"Critical or High or Medium or Low","notes":""}]}

REQUIRED CATEGORIES IN THIS ORDER (use exactly these category names):
"GO-LIVE DATE & TIMELINE", "INCUMBENT DIGITAL BANKING VENDOR", "DOMAIN, SSL & INFRASTRUCTURE", "MEMBER COMMUNICATION & APP STORE", "DATA MIGRATION", "CORE BANKING SYSTEM", "THIRD-PARTY INTEGRATIONS", "MOBILE BANKING APPS", "MEMBER COMMUNICATIONS", "POST GO-LIVE & HYPERCARE"

For "THIRD-PARTY INTEGRATIONS" category: include one specific question per integration mentioned in context (asking about production credentials, on-call contact, and any required migration file for that specific vendor), plus 2-3 general integration questions.

Each item is a QUESTION the Tyfone delivery team asks the CU before go-live — not a checklist task. Write in second person addressing the CU's situation. 3-6 questions per category, ~40 total. Priority should be "Critical" for blocking items (go-live date, core credentials, data migration ownership, DNS/SSL ownership, sign-off authority) and "High" for important-but-not-blocking items (app store content, training, communications).` }],
  });
  return parseJ<ChecklistData>(r.content.filter(b => b.type === 'text').map(b => b.text).join(''), 'checklist');
}

// ══════════════════════════════════════════════════════════════════════════════
// EXCEL GENERATION — matches Tyfone master templates exactly (ExcelJS for full styling support)
// ══════════════════════════════════════════════════════════════════════════════

export interface PlaybookMeta {
  goLiveDate?: string; goLiveTime?: string; timezone?: string;
  coreSystem?: string; outgoingVendor?: string; integrations?: string[];
}

const TZ_OFFSETS: Record<string, number> = {
  'EST – Eastern Standard Time (UTC-5)': -5, 'EDT – Eastern Daylight Time (UTC-4)': -4,
  'CST – Central Standard Time (UTC-6)': -6, 'CDT – Central Daylight Time (UTC-5)': -5,
  'MST – Mountain Standard Time (UTC-7)': -7, 'MDT – Mountain Daylight Time (UTC-6)': -6,
  'PST – Pacific Standard Time (UTC-8)': -8, 'PDT – Pacific Daylight Time (UTC-7)': -7,
  'AKST – Alaska Standard Time (UTC-9)': -9, 'AKDT – Alaska Daylight Time (UTC-8)': -8,
  'HST – Hawaii Standard Time (UTC-10)': -10,
};
const TZ_CONFIG_ORDER = Object.keys(TZ_OFFSETS);

function tzAbbr(tz: string) { return tz.split('–')[0].trim(); }

function normaliseTime24(raw?: string): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1]); const mins = m[2];
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${mins}`;
}

function timelineToTime(phaseIdx: number, taskIdx: number, explicitStart?: string, explicitEnd?: string): { start: string; end: string } {
  const start = normaliseTime24(explicitStart);
  const end = normaliseTime24(explicitEnd);
  if (start && end) return { start, end };
  const baseHour = 9 + (phaseIdx * 2 + taskIdx) % 8;
  return {
    start: start || `${String(baseHour).padStart(2,'0')}:00`,
    end: end || `${String((baseHour + 1) % 24).padStart(2,'0')}:00`,
  };
}

function timeToDecimal(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h + m / 60;
}

const ARGB = (hex: string) => 'FF' + hex.toUpperCase();
const FONT_NAME = 'Arial';
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: ARGB('E2E8F0') } },
  bottom: { style: 'thin', color: { argb: ARGB('E2E8F0') } },
  left: { style: 'thin', color: { argb: ARGB('E2E8F0') } },
  right: { style: 'thin', color: { argb: ARGB('E2E8F0') } },
};

interface StyleOpts { bold?: boolean; bg?: string; fg?: string; wrap?: boolean; sz?: number; italic?: boolean; align?: 'left'|'center'|'right'; }
function styleCell(cell: ExcelJS.Cell, opts: StyleOpts = {}) {
  const { bold = false, bg, fg, wrap = false, sz = 10, italic = false, align } = opts;
  cell.font = { name: FONT_NAME, bold, italic, size: sz, color: { argb: ARGB(fg || '1E293B') } };
  if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(bg) } };
  cell.alignment = { vertical: 'middle', wrapText: wrap, horizontal: align };
  cell.border = THIN_BORDER;
}
function headerCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  styleCell(cell, { bold: true, bg: '1C2E4A', fg: 'FFFFFF', wrap: true, sz: 9 });
}
function mergeAndFillRow(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number, bg: string) {
  for (let c = fromCol; c <= toCol; c++) styleCell(ws.getRow(row).getCell(c), { bg });
}
function safeSheetName(name: string) { return name.replace(/[\/\\?*[\]:]/g, '').substring(0, 31); }

const PHASE_COLOR_MAP: Record<string, string> = {
  '1': '154360', '2': '0E6655', '3': '6E2F8B', '4': '784212',
  '5': '922B21', '6': '1A5276', '7': '1D6A39',
};
function phaseColor(phaseLabel: string, idx: number): string {
  const m = phaseLabel.match(/PHASE\s*(\d+)/i);
  if (m && PHASE_COLOR_MAP[m[1]]) return PHASE_COLOR_MAP[m[1]];
  const fallback = ['154360','0E6655','6E2F8B','784212','922B21','1A5276','1D6A39'];
  return fallback[idx % fallback.length];
}

const OWNER_COLORS: Record<string, string> = {
  'T': 'D4E6F1', 'CU': 'D5F5E3', 'CU + T': 'D1ECF1', 'V': 'FDEBD0',
};
const CRITICAL_ROW_COLOR = 'F1948A';
function ownerRowColor(owner: string, priority: string): string {
  if (priority === 'CRITICAL') return CRITICAL_ROW_COLOR;
  return OWNER_COLORS[owner] || OWNER_COLORS['T'];
}

const PRIORITY_BADGE: Record<string, { bg: string; fg: string }> = {
  CRITICAL: { bg: 'E74C3C', fg: 'FFFFFF' },
  HIGH: { bg: 'FFFFFF', fg: 'E67E22' },
  MEDIUM: { bg: 'FFF9C4', fg: '7D6608' },
  LOW: { bg: 'D5F5E3', fg: '1E8449' },
};

export async function buildPlaybookExcel(data: PlaybookData, meta?: PlaybookMeta, riskData?: RiskData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cu = data.creditUnion;
  const tz = meta?.timezone || 'PST – Pacific Standard Time (UTC-8)';
  const abbr = tzAbbr(tz);
  const goLive = meta?.goLiveDate || data.goLiveDate || 'TBD';

  // ── Sheet 1: TZ_Config ──────────────────────────────────────────────────
  const tzWs = wb.addWorksheet('TZ_Config');
  tzWs.getColumn(1).width = 40; tzWs.getColumn(2).width = 18;
  headerCell(tzWs.getCell(1, 1), 'Timezone');
  headerCell(tzWs.getCell(1, 2), 'UTC Offset (hours)');
  TZ_CONFIG_ORDER.forEach((label, i) => {
    const r = i + 2;
    styleCell(tzWs.getCell(r, 1), {}); tzWs.getCell(r, 1).value = label;
    styleCell(tzWs.getCell(r, 2), {}); tzWs.getCell(r, 2).value = TZ_OFFSETS[label];
  });
  styleCell(tzWs.getCell(15, 1), {}); tzWs.getCell(15, 1).value = 'IST_OFFSET';
  styleCell(tzWs.getCell(15, 2), {}); tzWs.getCell(15, 2).value = 5.5;

  // ── Sheet 2: Summary ──────────────────────────────────────────────────
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 30 },{ width: 70 },{ width: 14 },{ width: 14 },{ width: 14 },{ width: 14 },{ width: 14 },{ width: 14 }];
  let sr = 1;
  const banner = (text: string, bg: string, sz = 13) => { const c = sum.getCell(sr, 1); c.value = text; styleCell(c, { bold: true, bg, fg: 'FFFFFF', sz }); mergeAndFillRow(sum, sr, 2, 8, bg); sr++; };
  const kv = (k: string, v: string) => { const ck = sum.getCell(sr, 1); ck.value = k; styleCell(ck, { bold: true, bg: 'F4F6F7' }); const cv = sum.getCell(sr, 2); cv.value = v; styleCell(cv, {}); sr++; };

  banner(`${cu} — nFinia Go-Live Playbook`, '1B3A6B', 16);
  banner('Tyfone Internal Delivery Knowledge Assistant', '0B5E5E', 10);
  sr++;
  banner('PROJECT OVERVIEW', '0B5E5E', 11);
  kv('Credit Union', cu);
  kv('Location', 'USA');
  kv('Timezone', tz);
  kv('Core Banking System', meta?.coreSystem || 'TBD');
  kv('Outgoing Vendor', meta?.outgoingVendor || 'TBD');
  kv('Banking Scope', 'Retail + Business Banking');
  kv('nFinia Go-Live Time', `${meta?.goLiveTime || '09:00'} ${abbr}`);
  kv('Go-Live Date', goLive);
  kv('Playbook Version', 'v1.0');
  kv('Prepared by', 'Tyfone Delivery Management');
  kv('Active Integrations', (meta?.integrations || []).join(', ') || 'See Phase 2');
  sr++;
  banner('EXECUTIVE SUMMARY', '0B5E5E', 11);
  const sumCell = sum.getCell(sr, 1); sumCell.value = data.summary; styleCell(sumCell, { wrap: true }); mergeAndFillRow(sum, sr, 2, 8, 'FFFFFF'); sr++;
  sr++;
  banner('⏰  TIMEZONE SELECTOR  (drives IST formula columns in Activities sheet)', '0B5E5E', 11);
  const tzLabelCell = sum.getCell(sr, 1); tzLabelCell.value = 'Select Customer Timezone:'; styleCell(tzLabelCell, { bold: true, bg: 'F4F6F7' });
  const tzValueCell = sum.getCell(sr, 2); tzValueCell.value = tz; styleCell(tzValueCell, { bg: 'FFF9C4', bold: true });
  const tzSelectorRow = sr;
  sr++;
  const infoCell = sum.getCell(sr, 1); infoCell.value = 'ℹ  The Activities sheet reads the cell above to auto-calculate IST Start and IST End. Change to update all rows.'; styleCell(infoCell, { italic: true, bg: 'EBF5FB', wrap: true }); mergeAndFillRow(sum, sr, 2, 8, 'EBF5FB'); sr++; sr++;
  banner('COLOUR CODING LEGEND', '0B5E5E', 11);
  const legend: [string, string][] = [
    [OWNER_COLORS['T'], 'Tyfone — Activities owned by Tyfone Engineering / QA / DevOps / Delivery'],
    [OWNER_COLORS['CU'], `${cu} — Activities owned by the Credit Union team`],
    [OWNER_COLORS['CU + T'], 'Joint (CU + Tyfone) — Shared ownership activities'],
    [OWNER_COLORS['V'], `Vendor / Third-Party — Activities owned by ${meta?.outgoingVendor || 'outgoing vendor'} or integration vendors`],
    [CRITICAL_ROW_COLOR, 'CRITICAL — Time-sensitive or blocking activities (red row)'],
  ];
  legend.forEach(([color, desc]) => {
    const sampleCell = sum.getCell(sr, 1); sampleCell.value = '   Sample   '; styleCell(sampleCell, { bg: color, fg: 'FFFFFF' });
    const descCell = sum.getCell(sr, 2); descCell.value = desc; styleCell(descCell, {});
    sr++;
  });

  const tzCellRef = `Summary!$B$${tzSelectorRow}`;

  // ── Sheet 3: Activities ──────────────────────────────────────────────────
  const aWs = wb.addWorksheet('Activities');
  aWs.columns = [6,12,52,9,26,16,13,9,13,9,13,13,11,11,13,55].map(w => ({ width: w }));

  const titleCell = aWs.getCell(1, 1); titleCell.value = `${cu} — Go-Live Activities (All Phases)`; styleCell(titleCell, { bold: true, bg: '1B3A6B', fg: 'FFFFFF', sz: 13 }); mergeAndFillRow(aWs, 1, 2, 16, '1B3A6B');
  const subCell = aWs.getCell(2, 1); subCell.value = 'Enter Start/End in local TZ. IST columns auto-calculate from the Summary timezone selector.'; styleCell(subCell, { italic: true, bg: '0B5E5E', fg: 'FFFFFF', wrap: true }); mergeAndFillRow(aWs, 2, 2, 16, '0B5E5E');

  const headers = ['#','Phase','Activity','Owner','Responsible Team','Date','Start Time\n(Local TZ)','Active\nTimezone','End Time\n(Local TZ)','Active\nTimezone','IST Start\n(UTC+5:30)','IST End\n(UTC+5:30)','Dependency','Priority','Status','Notes / Comments'];
  headers.forEach((h, ci) => headerCell(aWs.getCell(3, ci + 1), h));

  let row = 4, phIdx = 0;
  for (let si = 0; si < data.sections.length; si++) {
    const sec = data.sections[si] as PlaybookSection & { phaseTarget?: string };
    const pc = phaseColor(sec.phase, phIdx);
    const phaseLabel = `  ${sec.phase}${sec.phaseTarget ? '  (' + sec.phaseTarget + ')' : ''}  `;
    const phCell = aWs.getCell(row, 1); phCell.value = phaseLabel; styleCell(phCell, { bold: true, bg: pc, fg: 'FFFFFF' }); mergeAndFillRow(aWs, row, 2, 16, pc);
    row++; phIdx++;

    for (let ti = 0; ti < sec.tasks.length; ti++) {
      const task = sec.tasks[ti] as PlaybookTask & { startTime?: string; endTime?: string; priority?: string };
      const owner = ['CU','T','CU + T','V'].includes(task.owner) ? task.owner : 'T';
      const priority = ['CRITICAL','HIGH','MEDIUM','LOW'].includes((task.priority || '').toUpperCase()) ? task.priority!.toUpperCase() : 'HIGH';
      const rowBg = ownerRowColor(owner, priority);
      const { start, end } = timelineToTime(si, ti, task.startTime, task.endTime);
      const badge = PRIORITY_BADGE[priority];

      const phaseNumMatch = sec.phase.match(/PHASE\s*(\d+)/i);
      const phaseNum = phaseNumMatch ? phaseNumMatch[1] : String(si + 1);
      const idCell = aWs.getCell(row, 1); idCell.value = `${phaseNum}.${String(ti+1).padStart(2,'0')}`; styleCell(idCell, { bold: true, sz: 8 });
      const PHASE_SHORT_CODES: Record<string, string> = {
        '1': 'PRE-1', '2': 'PRE-2', '3': 'PRE-3', '4': 'PRE-4',
        '5': 'GOLIVE-1', '6': 'GOLIVE', '7': 'POST',
      };
      const phaseShortCell = aWs.getCell(row, 2); phaseShortCell.value = PHASE_SHORT_CODES[phaseNum] || `PH-${phaseNum}`; styleCell(phaseShortCell, { bg: rowBg, align: 'center' });
      const taskCell = aWs.getCell(row, 3); taskCell.value = task.task; styleCell(taskCell, { bg: rowBg, wrap: true });
      const ownerCell = aWs.getCell(row, 4); ownerCell.value = owner; styleCell(ownerCell, { bold: true, bg: rowBg, align: 'center' });
      const teamCell = aWs.getCell(row, 5); teamCell.value = sec.title; styleCell(teamCell, { bg: rowBg, wrap: true });
      const dateCell = aWs.getCell(row, 6); dateCell.value = goLive; styleCell(dateCell, { bg: rowBg });

      const startCell = aWs.getCell(row, 7); startCell.value = timeToDecimal(start); startCell.numFmt = 'h:mm AM/PM'; styleCell(startCell, { bg: rowBg, align: 'center' });
      const startTzCell = aWs.getCell(row, 8); startTzCell.value = { formula: `LEFT(${tzCellRef},FIND("–",${tzCellRef})-2)` }; styleCell(startTzCell, { bold: true, bg: 'E8F4FD', fg: '0A3D62', align: 'center' });
      const endCell = aWs.getCell(row, 9); endCell.value = timeToDecimal(end); endCell.numFmt = 'h:mm AM/PM'; styleCell(endCell, { bg: rowBg, align: 'center' });
      const endTzCell = aWs.getCell(row, 10); endTzCell.value = { formula: `LEFT(${tzCellRef},FIND("–",${tzCellRef})-2)` }; styleCell(endTzCell, { bold: true, bg: 'E8F4FD', fg: '0A3D62', align: 'center' });

      const gRef = `G${row}`, iRef = `I${row}`;
      const istStartCell = aWs.getCell(row, 11);
      istStartCell.value = { formula: `IF(ISNUMBER(${gRef}),${gRef}+(5.5-VLOOKUP(${tzCellRef},TZ_Config!$A$2:$B$12,2,0))/24,"")` };
      istStartCell.numFmt = 'h:mm AM/PM'; styleCell(istStartCell, { bg: 'EBF5FB', fg: '0A3D62', align: 'center' });
      const istEndCell = aWs.getCell(row, 12);
      istEndCell.value = { formula: `IF(ISNUMBER(${iRef}),${iRef}+(5.5-VLOOKUP(${tzCellRef},TZ_Config!$A$2:$B$12,2,0))/24,"")` };
      istEndCell.numFmt = 'h:mm AM/PM'; styleCell(istEndCell, { bg: 'EBF5FB', fg: '0A3D62', align: 'center' });

      const depCell = aWs.getCell(row, 13); depCell.value = task.dependencies || '—'; styleCell(depCell, { bg: rowBg, align: 'center' });
      const prCell = aWs.getCell(row, 14); prCell.value = priority; styleCell(prCell, { bold: true, bg: badge.bg, fg: badge.fg, align: 'center' });
      const stCell = aWs.getCell(row, 15); stCell.value = task.status || 'YET TO START'; styleCell(stCell, { bold: true, bg: '2E4057', fg: 'FFFFFF', align: 'center' });
      const noteCell = aWs.getCell(row, 16); noteCell.value = task.notes || '—'; styleCell(noteCell, { bg: rowBg, wrap: true });

      row++;
    }
  }

  // ── Sheet 4: Risks ──────────────────────────────────────────────────────
  const rWs = wb.addWorksheet('Risks');
  rWs.columns = [8,12,50,9,9,9,10,45,22,40,20].map(w => ({ width: w }));
  const rTitleCell = rWs.getCell(1,1); rTitleCell.value = `${cu} — Risk Register`; styleCell(rTitleCell, { bold: true, bg: '7B241C', fg: 'FFFFFF', sz: 13 }); mergeAndFillRow(rWs, 1, 2, 11, '7B241C');
  const rSubCell = rWs.getCell(2,1); rSubCell.value = 'Risk Score = Likelihood × Impact  |  Severity: HIGH ≥ 12  |  MEDIUM 6–11  |  LOW ≤ 5'; styleCell(rSubCell, { italic: true, bg: 'A93226', fg: 'FFFFFF' }); mergeAndFillRow(rWs, 2, 2, 11, 'A93226');
  ['Risk ID','Phase','Risk Description','Likelihood\n(1-5)','Impact\n(1-5)','Risk Score','Severity','Mitigation Strategy','Owner','Contingency / Fallback','Notes'].forEach((h, ci) => headerCell(rWs.getCell(3, ci + 1), h));

  const SEV_COLORS: Record<string, { bg: string; fg: string }> = {
    HIGH: { bg: 'FADBD8', fg: '922B21' }, MEDIUM: { bg: 'FDEBD0', fg: '784212' }, LOW: { bg: 'D5F5E3', fg: '1E8449' },
  };
  let rRow = 4;
  for (const risk of (riskData?.risks || [])) {
    const sevC = SEV_COLORS[risk.severity] || SEV_COLORS.MEDIUM;
    const score = risk.likelihood * risk.impact;
    styleCell(rWs.getCell(rRow,1), { bold: true }); rWs.getCell(rRow,1).value = risk.riskId;
    styleCell(rWs.getCell(rRow,2), {}); rWs.getCell(rRow,2).value = risk.phase;
    styleCell(rWs.getCell(rRow,3), { wrap: true }); rWs.getCell(rRow,3).value = risk.description;
    styleCell(rWs.getCell(rRow,4), { align: 'center' }); rWs.getCell(rRow,4).value = risk.likelihood;
    styleCell(rWs.getCell(rRow,5), { align: 'center' }); rWs.getCell(rRow,5).value = risk.impact;
    styleCell(rWs.getCell(rRow,6), { bold: true, align: 'center' }); rWs.getCell(rRow,6).value = score;
    styleCell(rWs.getCell(rRow,7), { bold: true, bg: sevC.bg, fg: sevC.fg, align: 'center' }); rWs.getCell(rRow,7).value = risk.severity;
    styleCell(rWs.getCell(rRow,8), { wrap: true }); rWs.getCell(rRow,8).value = risk.mitigation;
    styleCell(rWs.getCell(rRow,9), {}); rWs.getCell(rRow,9).value = risk.owner;
    styleCell(rWs.getCell(rRow,10), { wrap: true }); rWs.getCell(rRow,10).value = risk.contingency;
    styleCell(rWs.getCell(rRow,11), {}); rWs.getCell(rRow,11).value = risk.notes || '';
    rRow++;
  }

  // ── Sheet 5: Validation Checklist ──────────────────────────────────────────
  const vWs = wb.addWorksheet('Validation Checklist');
  vWs.columns = [9,16,48,12,18,20,32,16,16,24].map(w => ({ width: w }));
  const vTitleCell = vWs.getCell(1,1); vTitleCell.value = `${cu} — Go-Live Validation Checklist (Production)`; styleCell(vTitleCell, { bold: true, bg: '1E8449', fg: 'FFFFFF', sz: 13 }); mergeAndFillRow(vWs, 1, 2, 10, '1E8449');
  const vSubCell = vWs.getCell(2,1); vSubCell.value = 'Result column (Pass/Fail/N/A) is pre-highlighted in yellow — fill in during go-live validation'; styleCell(vSubCell, { italic: true, bg: '186A3B', fg: 'FFFFFF' }); mergeAndFillRow(vWs, 2, 2, 10, '186A3B');
  ['Check ID','Category','Validation Item','Owner','Timing','Method','Pass Criteria','Result\n(Pass/Fail/N/A)','Tester','Notes'].forEach((h, ci) => headerCell(vWs.getCell(3, ci + 1), h));

  const STD_CHECKS: [string, string, string, string, string, string][] = [
    ['Infrastructure', 'Production server connectivity: OLB, MCB, Connector all responding', 'T – DevOps', 'Pre Go-Live', 'URL health-check', 'HTTP 200 on all endpoints'],
    ['Infrastructure', 'Load balancer routing traffic correctly to production cluster', 'T – DevOps', 'Pre Go-Live', 'LB health endpoint', 'All nodes active'],
    ['Infrastructure', 'DNS resolving correctly to production OLB IP', 'CU + T', 'Pre Go-Live', 'nslookup / DNS checker', 'Correct IP from multiple regions'],
    ['Infrastructure', 'SSL certificate valid and not expiring within 90 days', 'T – DevOps', 'Pre Go-Live', 'Browser cert check', 'Valid, correct domain'],
    ['Data Migration', 'SRT import: record count matches source dump', 'CU + T', 'Pre Go-Live', 'Count comparison report', '0% discrepancy (or agreed tolerance)'],
    ['Data Migration', 'Username pre-population: members can enroll using existing username', 'T – QA', 'Pre Go-Live', 'Enrollment test with pre-seeded user', 'Successful enrollment'],
    ['Retail – OLB', 'OLB login with test credentials (retail account)', 'T – QA', 'Production Sanity', 'Manual test', 'Successful login, correct account data'],
    ['Retail – MCB', 'Mobile app login (iOS and Android) with test credentials', 'T – QA', 'Production Sanity', 'Manual test on device', 'Successful login'],
  ];
  let vRow = 4, vNum = 1;
  for (const [cat, item, owner, timing, method, criteria] of STD_CHECKS) {
    styleCell(vWs.getCell(vRow,1), { bold: true }); vWs.getCell(vRow,1).value = `V-${String(vNum).padStart(2,'0')}`;
    styleCell(vWs.getCell(vRow,2), {}); vWs.getCell(vRow,2).value = cat;
    styleCell(vWs.getCell(vRow,3), { wrap: true }); vWs.getCell(vRow,3).value = item;
    styleCell(vWs.getCell(vRow,4), { bold: true }); vWs.getCell(vRow,4).value = owner;
    styleCell(vWs.getCell(vRow,5), {}); vWs.getCell(vRow,5).value = timing;
    styleCell(vWs.getCell(vRow,6), {}); vWs.getCell(vRow,6).value = method;
    styleCell(vWs.getCell(vRow,7), { wrap: true }); vWs.getCell(vRow,7).value = criteria;
    styleCell(vWs.getCell(vRow,8), { bg: 'FFF9C4' }); vWs.getCell(vRow,8).value = '';
    styleCell(vWs.getCell(vRow,9), {}); vWs.getCell(vRow,9).value = 'Tyfone QA';
    styleCell(vWs.getCell(vRow,10), {}); vWs.getCell(vRow,10).value = '';
    vRow++; vNum++;
  }
  for (const integ of (meta?.integrations || [])) {
    styleCell(vWs.getCell(vRow,1), { bold: true }); vWs.getCell(vRow,1).value = `V-${String(vNum).padStart(2,'0')}`;
    styleCell(vWs.getCell(vRow,2), {}); vWs.getCell(vRow,2).value = 'Integrations';
    styleCell(vWs.getCell(vRow,3), { wrap: true }); vWs.getCell(vRow,3).value = `${integ} — verify production credentials and end-to-end functionality`;
    styleCell(vWs.getCell(vRow,4), { bold: true }); vWs.getCell(vRow,4).value = 'CU';
    styleCell(vWs.getCell(vRow,5), {}); vWs.getCell(vRow,5).value = 'CU Validation';
    styleCell(vWs.getCell(vRow,6), {}); vWs.getCell(vRow,6).value = 'Manual test';
    styleCell(vWs.getCell(vRow,7), { wrap: true }); vWs.getCell(vRow,7).value = 'Confirmed working, no errors';
    styleCell(vWs.getCell(vRow,8), { bg: 'FFF9C4' }); vWs.getCell(vRow,8).value = '';
    styleCell(vWs.getCell(vRow,9), {}); vWs.getCell(vRow,9).value = 'Customer CU';
    styleCell(vWs.getCell(vRow,10), {}); vWs.getCell(vRow,10).value = '';
    vRow++; vNum++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRE-GOLIVE DISCOVERY QUESTIONNAIRE — matches master template exactly
// ══════════════════════════════════════════════════════════════════════════════

const SECTION_STYLE: Record<string, { bg: string; icon: string }> = {
  'GO-LIVE DATE & TIMELINE': { bg: '1A3C5E', icon: '📅' },
  'INCUMBENT DIGITAL BANKING VENDOR': { bg: '7B3F00', icon: '🏦' },
  'DOMAIN, SSL & INFRASTRUCTURE': { bg: '0A4D52', icon: '🔒' },
  'MEMBER COMMUNICATION & APP STORE': { bg: '4A235A', icon: '📣' },
  'DATA MIGRATION': { bg: '7D1C1C', icon: '🔄' },
  'CORE BANKING SYSTEM': { bg: '0B5345', icon: '⚙️' },
  'THIRD-PARTY INTEGRATIONS': { bg: '1A5276', icon: '🔗' },
  'MOBILE BANKING APPS': { bg: '6D4C41', icon: '📱' },
  'MEMBER COMMUNICATIONS': { bg: '145A32', icon: '💬' },
  'POST GO-LIVE & HYPERCARE': { bg: '1B2631', icon: '✅' },
};

const PRIORITY_QUESTION_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  Critical: { bg: 'FDECEA', fg: 'B71C1C', label: '🔴 Critical' },
  High: { bg: 'FFF3E0', fg: 'E65100', label: '🟠 High' },
  Medium: { bg: 'FFFDE7', fg: 'F9A825', label: '🟡 Medium' },
  Low: { bg: 'E8F5E9', fg: '2E7D32', label: '🟢 Low' },
};

export async function buildChecklistExcel(data: ChecklistData, meta?: PlaybookMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cu = data.creditUnion;
  const ws = wb.addWorksheet('CU Questions');
  ws.columns = [{ width: 72 }, { width: 16 }, { width: 48 }];

  let r = 1;
  const titleCell = ws.getCell(r,1); titleCell.value = `Tyfone  ·  ${cu}  ·  Pre-Go-Live Discovery Questionnaire`; styleCell(titleCell, { bold: true, bg: '0D2137', fg: 'FFFFFF', sz: 14 }); mergeAndFillRow(ws, r, 2, 3, '0D2137'); r++;
  const legendCell = ws.getCell(r,1); legendCell.value = 'Complete all items before Go-Live dates are finalised.   🔴 Critical = Go-Live blocker     🟠 High = Required before kickoff     🟡 Medium = Required before launch     🟢 Low = Nice to have'; styleCell(legendCell, { bg: '1A3C5E', fg: 'DDEEFF', wrap: true }); mergeAndFillRow(ws, r, 2, 3, '1A3C5E'); r++;
  headerCell(ws.getCell(r,1), 'Question'); headerCell(ws.getCell(r,2), 'Priority'); headerCell(ws.getCell(r,3), 'CU Response / Answer'); r++;

  const cats = [...new Set(data.items.map(i => i.category))];
  for (const cat of cats) {
    const style = SECTION_STYLE[cat] || { bg: '34495E', icon: '📌' };
    const catCell = ws.getCell(r,1); catCell.value = `  ${style.icon}  ${cat}`; styleCell(catCell, { bold: true, bg: style.bg, fg: 'FFFFFF' }); mergeAndFillRow(ws, r, 2, 3, style.bg); r++;
    let altRow = false;
    for (const item of data.items.filter(i => i.category === cat)) {
      const pStyle = PRIORITY_QUESTION_STYLE[item.priority as keyof typeof PRIORITY_QUESTION_STYLE] || PRIORITY_QUESTION_STYLE.High;
      const qCell = ws.getCell(r,1); qCell.value = item.item; styleCell(qCell, { bg: altRow ? 'F4F8FC' : 'FFFFFF', wrap: true });
      const pCell = ws.getCell(r,2); pCell.value = pStyle.label; styleCell(pCell, { bold: true, bg: pStyle.bg, fg: pStyle.fg, align: 'center' });
      const aCell = ws.getCell(r,3); aCell.value = ''; styleCell(aCell, { bg: altRow ? 'F4F8FC' : 'FFFFFF' });
      r++; altRow = !altRow;
    }
  }
  const footerCell = ws.getCell(r,1); footerCell.value = 'Tyfone Delivery Management  ·  This document is confidential and intended for the named Credit Union only.'; styleCell(footerCell, { italic: true, bg: 'F0F3F4', fg: '7F8C8D' }); mergeAndFillRow(ws, r, 2, 3, 'F0F3F4');

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}