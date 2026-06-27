import Anthropic from '@anthropic-ai/sdk';
import { DriveFile, PlaybookData, ChecklistData } from '@/types';
import * as XLSX from 'xlsx';

function client() {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey: k });
}

function ctx(files: (DriveFile & { content?: string })[], msa?: string): string {
  const p: string[] = [];
  if (msa) p.push(`=== MASTER SERVICE AGREEMENT ===\n${msa.substring(0, 80000)}`);
  if (files.length) { p.push('\n=== DRIVE DOCUMENTS ==='); for (const f of files) if (f.content) p.push(`\n--- ${f.name} ---\n${f.content.substring(0, 12000)}`); }
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

export async function extractMSAMetadata(msa: string): Promise<MSAMeta> {
  const c = client();
  const r = await c.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 1000,
    messages: [{ role: 'user', content: `Extract go-live metadata from this MSA. Return ONLY valid JSON, no markdown:\n{"creditUnionName":"full legal name","goLiveDate":"YYYY-MM-DD or empty","goLiveTime":"HH:MM or 09:00","coreSystem":"e.g. Symitar (JHA)","timezone":"one of: EST – Eastern Standard Time (UTC-5)|CST – Central Standard Time (UTC-6)|MST – Mountain Standard Time (UTC-7)|PST – Pacific Standard Time (UTC-8)|AKST – Alaska Standard Time (UTC-9)|HST – Hawaii Standard Time (UTC-10)","outgoingVendor":"current digital banking vendor","integrations":["array","of","vendor","names"],"notes":"special constraints"}\n\nMSA:\n${msa.substring(0, 50000)}` }],
  });
  const t = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { return parseJ<MSAMeta>(t, 'MSA metadata'); }
  catch { return { creditUnionName: '', goLiveDate: '', goLiveTime: '09:00', coreSystem: '', timezone: 'PST – Pacific Standard Time (UTC-8)', outgoingVendor: '', integrations: [], notes: '' }; }
}

export async function generatePlaybook(cuName: string, files: (DriveFile & { content?: string })[], msa?: string, extra?: string): Promise<PlaybookData> {
  const c = client();
  const r = await c.messages.create({
    model: 'claude-opus-4-6', max_tokens: 16000,
    system: `You are a senior Tyfone Delivery Manager creating a Go-Live Playbook for ${cuName}. Use ONLY provided MSA and documents. CRITICAL: Return ONLY valid complete JSON. No markdown.`,
    messages: [{ role: 'user', content: `Generate a Go-Live Playbook for ${cuName}.\n${extra ? `Context: ${extra}\n` : ''}\n${ctx(files, msa).substring(0, 70000)}\n\nReturn this exact JSON:\n{"creditUnion":"${cuName}","goLiveDate":"from MSA or TBD","summary":"2-3 sentence executive summary","sections":[{"phase":"Phase name","title":"Section title","tasks":[{"task":"Task max 80 chars","owner":"T or CU or T+CU or V","timeline":"T-30 or date","dependencies":"— or id","status":"Not Started","notes":"detail"}]}]}\nPhases: Pre-Requisites, Pilot Sign-Offs, Production Infra, Staging Validation, Go-Live Day -1, Go-Live Day, Post Go-Live. 5-8 tasks each.` }],
  });
  return parseJ<PlaybookData>(r.content.filter(b => b.type === 'text').map(b => b.text).join(''), 'playbook');
}

export async function generateChecklist(cuName: string, files: (DriveFile & { content?: string })[], msa?: string, extra?: string): Promise<ChecklistData> {
  const c = client();
  const r = await c.messages.create({
    model: 'claude-opus-4-6', max_tokens: 16000,
    system: `You are a senior Tyfone Delivery Manager creating a Pre Go-Live Checklist for ${cuName}. CRITICAL: Return ONLY valid complete JSON. No markdown.`,
    messages: [{ role: 'user', content: `Generate a Pre Go-Live Checklist for ${cuName}.\n${extra ? `Context: ${extra}\n` : ''}\n${ctx(files, msa).substring(0, 70000)}\n\nReturn this exact JSON:\n{"creditUnion":"${cuName}","summary":"2-3 sentence summary","items":[{"category":"Category","item":"Item max 80 chars","owner":"T or CU or T+CU or V","dueDate":"T-30 or date","status":"Not Started","priority":"High or Medium or Low","notes":"detail"}]}\nCategories: Data Migration, System Configuration, Integration Testing, Staff Training, Compliance & Legal, Member Communication, Vendor Coordination, Infrastructure & Security, Contingency Planning, Sign-off & Approvals. 40-60 items.` }],
  });
  return parseJ<ChecklistData>(r.content.filter(b => b.type === 'text').map(b => b.text).join(''), 'checklist');
}

// ── Excel ────────────────────────────────────────────────────────────────────
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

function tzAbbr(tz: string) { return tz.split('–')[0].trim().split(' ')[0]; }

function xc(v: string | number, bold = false, bg?: string, fg?: string, wrap = false, sz = 10): XLSX.CellObject {
  return { v, t: typeof v === 'number' ? 'n' : 's', s: { font: { name: 'Arial', bold, color: { rgb: fg || '1E293B' }, sz }, fill: bg ? { patternType: 'solid', fgColor: { rgb: bg } } : undefined, alignment: { vertical: 'center', wrapText: wrap }, border: { top: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } } } };
}
function hc(v: string) { return xc(v, true, '1C2E4A', 'FFFFFF'); }
function ws_set(ws: XLSX.WorkSheet, r: number, c: number, cell: XLSX.CellObject) { ws[XLSX.utils.encode_cell({ r, c })] = cell; }
function ws_ref(ws: XLSX.WorkSheet, maxR: number, maxC: number) { ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } }); }

const PH_COLORS = ['154360','0E6655','6E2F8B','784212','922B21','1A5276','1D6A39'];
const ST_STYLES: Record<string, { bg: string; fg: string }> = {
  'Not Started': { bg: 'F1F5F9', fg: '475569' }, 'In Progress': { bg: 'DBEAFE', fg: '1D4ED8' },
  'Complete': { bg: 'DCFCE7', fg: '15803D' }, 'Blocked': { bg: 'FEE2E2', fg: 'B91C1C' },
};
const PR_STYLES: Record<string, { bg: string; fg: string }> = {
  'High': { bg: 'FEE2E2', fg: 'B91C1C' }, 'Medium': { bg: 'FEF9C3', fg: 'A16207' }, 'Low': { bg: 'DCFCE7', fg: '15803D' },
};

export function buildPlaybookExcel(data: PlaybookData, meta?: PlaybookMeta): Buffer {
  const wb = XLSX.utils.book_new();
  const tz = meta?.timezone || 'PST – Pacific Standard Time (UTC-8)';
  const abbr = tzAbbr(tz);
  const cu = data.creditUnion;
  const goLive = meta?.goLiveDate || data.goLiveDate || 'TBD';

  // Summary sheet
  const sum: XLSX.WorkSheet = {};
  const sumData: [string, string][] = [
    [`${cu} — nFinia Go-Live Playbook`, ''], ['', ''],
    ['Credit Union', cu], ['Go-Live Date', goLive],
    ['Go-Live Time', `${meta?.goLiveTime || '09:00'} ${abbr}`], ['Timezone', tz],
    ['Core Banking System', meta?.coreSystem || 'TBD'], ['Outgoing Vendor', meta?.outgoingVendor || 'TBD'],
    ['Active Integrations', (meta?.integrations || []).join(', ') || 'See Phase 2'],
    ['Total Sections', String(data.sections.length)],
    ['Total Tasks', String(data.sections.reduce((n, s) => n + s.tasks.length, 0))],
    ['Generated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['', ''], ['EXECUTIVE SUMMARY', ''], [data.summary, ''],
  ];
  sumData.forEach(([a, b], i) => {
    const isT = i === 0, isH = i === 13;
    sum[XLSX.utils.encode_cell({ r: i, c: 0 })] = xc(a, isT || isH, isT ? '0F2540' : isH ? '1E3A5F' : undefined, isT || isH ? 'FFFFFF' : undefined, i === 14, isT ? 14 : 10);
    if (b) sum[XLSX.utils.encode_cell({ r: i, c: 1 })] = xc(b);
  });
  sum['!cols'] = [{ wch: 28 }, { wch: 70 }];
  sum['!rows'] = [{ hpt: 30 }, ...Array(13).fill({ hpt: 20 }), { hpt: 60 }];
  ws_ref(sum, 14, 1);
  XLSX.utils.book_append_sheet(wb, sum, 'Summary');

  // Activities sheet
  const aWs: XLSX.WorkSheet = {};
  ['#','Phase','Activity','Owner','Team','Date','Start (Local)','TZ','End (Local)','TZ','IST Start','IST End','Dep','Priority','Status','Notes'].forEach((h, ci) => ws_set(aWs, 0, ci, hc(h)));
  let row = 1, num = 1, phIdx = 0, lastPh = '';
  for (const sec of data.sections) {
    if (sec.phase !== lastPh) {
      lastPh = sec.phase; const pc = PH_COLORS[phIdx++ % PH_COLORS.length];
      aWs[XLSX.utils.encode_cell({ r: row, c: 0 })] = xc(`  ${sec.phase}  `, true, pc, 'FFFFFF');
      for (let c = 1; c < 16; c++) ws_set(aWs, row, c, xc('', false, pc, 'FFFFFF'));
      row++;
    }
    for (const task of sec.tasks) {
      const bg = num % 2 === 0 ? 'F8FAFC' : 'FFFFFF';
      const ss = ST_STYLES[task.status] || ST_STYLES['Not Started'];
      ws_set(aWs, row, 0, xc(String(num), true, undefined, undefined, false, 8));
      ws_set(aWs, row, 1, xc(sec.phase, false, bg));
      ws_set(aWs, row, 2, xc(task.task, false, bg, undefined, true));
      ws_set(aWs, row, 3, xc(task.owner, true, bg));
      ws_set(aWs, row, 4, xc(sec.title, false, bg, undefined, true));
      ws_set(aWs, row, 5, xc(goLive, false, bg));
      ws_set(aWs, row, 6, xc('', false, bg)); // start time
      ws_set(aWs, row, 7, xc(abbr, true, 'E8F4FD', '0A3D62'));
      ws_set(aWs, row, 8, xc('', false, bg)); // end time
      ws_set(aWs, row, 9, xc(abbr, true, 'E8F4FD', '0A3D62'));
      ws_set(aWs, row, 10, xc('', false, 'EBF5FB', '0A3D62')); // IST start
      ws_set(aWs, row, 11, xc('', false, 'EBF5FB', '0A3D62')); // IST end
      ws_set(aWs, row, 12, xc(task.dependencies || '—', false, bg));
      ws_set(aWs, row, 13, xc('HIGH', true, 'FFFFFF', 'E67E22'));
      ws_set(aWs, row, 14, xc(task.status, true, ss.bg, ss.fg));
      ws_set(aWs, row, 15, xc(task.notes || '—', false, bg, undefined, true));
      row++; num++;
    }
  }
  aWs['!cols'] = [5,14,50,8,26,13,13,7,13,7,14,14,10,10,12,50].map(w => ({ wch: w }));
  aWs['!rows'] = [{ hpt: 22 }, ...Array(row).fill({ hpt: 30 })];
  ws_ref(aWs, row, 15);
  XLSX.utils.book_append_sheet(wb, aWs, 'Activities');

  // Per-phase sheets
  [...new Set(data.sections.map(s => s.phase))].forEach((phase, pi) => {
    const pWs: XLSX.WorkSheet = {};
    const pc = PH_COLORS[pi % PH_COLORS.length];
    pWs[XLSX.utils.encode_cell({ r: 0, c: 0 })] = xc(`${cu} — ${phase}`, true, pc, 'FFFFFF', false, 12);
    for (let c = 1; c < 6; c++) ws_set(pWs, 0, c, xc('', false, pc, 'FFFFFF'));
    ['Task','Owner','Timeline','Dependencies','Status','Notes'].forEach((h, ci) => ws_set(pWs, 1, ci, hc(h)));
    let r = 2;
    for (const sec of data.sections.filter(s => s.phase === phase)) {
      pWs[XLSX.utils.encode_cell({ r, c: 0 })] = xc(sec.title, true, 'F1F5F9', '0F2540');
      for (let c = 1; c < 6; c++) ws_set(pWs, r, c, xc('', false, 'F1F5F9'));
      r++;
      for (const task of sec.tasks) {
        const ss = ST_STYLES[task.status] || ST_STYLES['Not Started'];
        ws_set(pWs, r, 0, xc(task.task, false, undefined, undefined, true));
        ws_set(pWs, r, 1, xc(task.owner, true));
        ws_set(pWs, r, 2, xc(task.timeline));
        ws_set(pWs, r, 3, xc(task.dependencies || '—', false, undefined, undefined, true));
        ws_set(pWs, r, 4, xc(task.status, true, ss.bg, ss.fg));
        ws_set(pWs, r, 5, xc(task.notes || '—', false, undefined, undefined, true));
        r++;
      }
    }
    pWs['!cols'] = [50,18,16,26,13,46].map(w => ({ wch: w }));
    pWs['!rows'] = [{ hpt: 26 }, { hpt: 20 }, ...Array(r).fill({ hpt: 30 })];
    ws_ref(pWs, r, 5);
    XLSX.utils.book_append_sheet(wb, pWs, phase.replace(/[\/\\?*[\]:]/g, '').substring(0, 31));
  });

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', bookSST: false, compression: true }) as Buffer;
}

export function buildChecklistExcel(data: ChecklistData, meta?: PlaybookMeta): Buffer {
  const wb = XLSX.utils.book_new();
  const cu = data.creditUnion;

  const sum: XLSX.WorkSheet = {};
  const sumData: [string, string][] = [
    [`${cu} — Pre-GoLive Questionnaire`, ''], ['', ''],
    ['Credit Union', cu], ['Generated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Total Items', String(data.items.length)], ['High Priority', String(data.items.filter(i => i.priority === 'High').length)],
    ['', ''], ['SUMMARY', ''], [data.summary, ''],
  ];
  sumData.forEach(([a, b], i) => {
    const isT = i === 0, isH = i === 7;
    sum[XLSX.utils.encode_cell({ r: i, c: 0 })] = xc(a, isT || isH, isT ? '0F2540' : isH ? '1E3A5F' : undefined, isT || isH ? 'FFFFFF' : undefined, i === 8, isT ? 14 : 10);
    if (b) sum[XLSX.utils.encode_cell({ r: i, c: 1 })] = xc(b);
  });
  sum['!cols'] = [{ wch: 22 }, { wch: 70 }];
  sum['!rows'] = [{ hpt: 30 }, ...Array(8).fill({ hpt: 20 }), { hpt: 60 }];
  ws_ref(sum, 8, 1);
  XLSX.utils.book_append_sheet(wb, sum, 'Summary');

  const aWs: XLSX.WorkSheet = {};
  ['Category','Checklist Item','Owner','Due Date','Priority','Status','Notes'].forEach((h, ci) => ws_set(aWs, 0, ci, hc(h)));
  let row = 1;
  const cats = [...new Set(data.items.map(i => i.category))];
  cats.forEach((cat, ci) => {
    const cc = PH_COLORS[ci % PH_COLORS.length];
    data.items.filter(i => i.category === cat).forEach(item => {
      const ss = ST_STYLES[item.status] || ST_STYLES['Not Started'];
      const ps = PR_STYLES[item.priority] || { bg: 'F1F5F9', fg: '475569' };
      ws_set(aWs, row, 0, xc(cat, false, cc + '22', cc));
      ws_set(aWs, row, 1, xc(item.item, false, undefined, undefined, true));
      ws_set(aWs, row, 2, xc(item.owner));
      ws_set(aWs, row, 3, xc(item.dueDate));
      ws_set(aWs, row, 4, xc(item.priority, true, ps.bg, ps.fg));
      ws_set(aWs, row, 5, xc(item.status, true, ss.bg, ss.fg));
      ws_set(aWs, row, 6, xc(item.notes || '—', false, undefined, undefined, true));
      row++;
    });
  });
  aWs['!cols'] = [26,54,20,12,11,14,44].map(w => ({ wch: w }));
  aWs['!rows'] = [{ hpt: 20 }, ...Array(row).fill({ hpt: 30 })];
  ws_ref(aWs, row, 6);
  XLSX.utils.book_append_sheet(wb, aWs, 'Pre Go-Live Checklist');

  cats.forEach((cat, ci) => {
    const cWs: XLSX.WorkSheet = {};
    const cc = PH_COLORS[ci % PH_COLORS.length];
    cWs[XLSX.utils.encode_cell({ r: 0, c: 0 })] = xc(cat, true, cc, 'FFFFFF', false, 12);
    for (let c = 1; c < 6; c++) ws_set(cWs, 0, c, xc('', false, cc, 'FFFFFF'));
    ['Checklist Item','Owner','Due Date','Priority','Status','Notes'].forEach((h, ci2) => ws_set(cWs, 1, ci2, hc(h)));
    let r = 2;
    data.items.filter(i => i.category === cat).forEach(item => {
      const ss = ST_STYLES[item.status] || ST_STYLES['Not Started'];
      const ps = PR_STYLES[item.priority] || { bg: 'F1F5F9', fg: '475569' };
      ws_set(cWs, r, 0, xc(item.item, false, undefined, undefined, true));
      ws_set(cWs, r, 1, xc(item.owner)); ws_set(cWs, r, 2, xc(item.dueDate));
      ws_set(cWs, r, 3, xc(item.priority, true, ps.bg, ps.fg));
      ws_set(cWs, r, 4, xc(item.status, true, ss.bg, ss.fg));
      ws_set(cWs, r, 5, xc(item.notes || '—', false, undefined, undefined, true));
      r++;
    });
    cWs['!cols'] = [54,20,12,11,14,44].map(w => ({ wch: w }));
    cWs['!rows'] = [{ hpt: 26 }, { hpt: 20 }, ...Array(r).fill({ hpt: 30 })];
    ws_ref(cWs, r, 5);
    XLSX.utils.book_append_sheet(wb, cWs, cat.replace(/[\/\\?*[\]:]/g, '').substring(0, 31));
  });

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', bookSST: false, compression: true }) as Buffer;
}
