'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { PlaybookData, ChecklistData } from '@/types';

type OutputType = 'playbook' | 'checklist' | 'both';
type Tab = 'playbook' | 'checklist';
type Step = 'setup' | 'generate';

const TIMEZONES = [
  'EST – Eastern Standard Time (UTC-5)','EDT – Eastern Daylight Time (UTC-4)',
  'CST – Central Standard Time (UTC-6)','CDT – Central Daylight Time (UTC-5)',
  'MST – Mountain Standard Time (UTC-7)','MDT – Mountain Daylight Time (UTC-6)',
  'PST – Pacific Standard Time (UTC-8)','PDT – Pacific Daylight Time (UTC-7)',
  'AKST – Alaska Standard Time (UTC-9)','AKDT – Alaska Daylight Time (UTC-8)',
  'HST – Hawaii Standard Time (UTC-10)',
];

const CORE_CATALOGUE: Record<string, { abbr: string; vendor: string }> = {
  'Symitar (JHA)':          { abbr: 'Symitar',       vendor: 'Jack Henry & Associates' },
  'Corelation KeyStone':    { abbr: 'KeyStone',      vendor: 'Corelation' },
  'Fiserv DNA':             { abbr: 'DNA',           vendor: 'Fiserv' },
  'Fiserv Portico':         { abbr: 'Portico',       vendor: 'Fiserv' },
  'FIS IBS':                { abbr: 'IBS',           vendor: 'FIS' },
  'FIS Horizon':            { abbr: 'Horizon',       vendor: 'FIS' },
  'Jack Henry Silverlake':  { abbr: 'Silverlake',    vendor: 'Jack Henry' },
  'Episys':                 { abbr: 'Episys',        vendor: 'Jack Henry' },
  'CUSA':                   { abbr: 'CUSA',          vendor: 'CUSA' },
  'Temenos':                { abbr: 'Temenos',       vendor: 'Temenos' },
  'Nymbus':                 { abbr: 'Nymbus',        vendor: 'Nymbus' },
  'Q2':                     { abbr: 'Q2',            vendor: 'Q2' },
};

const VENDOR_CATALOGUE: Record<string, { category: string }> = {
  'Banno':                  { category: 'Digital Banking' },
  'Q2':                     { category: 'Digital Banking' },
  'Alkami':                 { category: 'Digital Banking' },
  'Digital Insight':        { category: 'Digital Banking' },
  'NCR Digital Insight':    { category: 'Digital Banking' },
  'S1 Corporation':         { category: 'Digital Banking' },
  'Online Banking Solutions': { category: 'Digital Banking' },
  'Malauzai':               { category: 'Digital Banking' },
  'Access Softek':          { category: 'Digital Banking' },
  'D3 Banking':             { category: 'Digital Banking' },
  'Narmi':                  { category: 'Account Opening' },
  'Backbase':               { category: 'Digital Banking' },
  'Finastra':               { category: 'Digital Banking' },
  'Mahalo Banking':         { category: 'Digital Banking' },
};

const CORE_SUGGESTIONS = Object.keys(CORE_CATALOGUE);

// Master integration catalogue — all known Tyfone integrations
// Used for fuzzy-matching MSA-extracted names and for manual add
const INTEGRATION_CATALOGUE: Record<string, { label: string; category: string }> = {
  // Core / Payments
  'Twilio':                  { label: 'Twilio CDA',                        category: 'Messaging' },
  'Amazon SES':              { label: 'Amazon SES',                        category: 'Messaging' },
  'Clickatell':              { label: 'Clickatell SMS',                    category: 'Messaging' },
  'Fiserv CheckFree RXP':   { label: 'Fiserv CheckFree RXP (Bill Pay)',   category: 'Payments' },
  'Fiserv Wire Exchange':   { label: 'Fiserv Wire Exchange',              category: 'Payments' },
  'Fiserv CardHub':         { label: 'Fiserv CardHub',                    category: 'Payments' },
  'Payfinia':               { label: 'Payfinia Payments',                 category: 'Payments' },
  'International Payments': { label: 'International Payments',            category: 'Payments' },
  // Fraud & Security
  'BioCatch':               { label: 'BioCatch ATO Prevention',           category: 'Fraud & Security' },
  'Verafin':                { label: 'Verafin Fraud Analytics',           category: 'Fraud & Security' },
  'Real-Time Fraud':        { label: 'Real-Time Fraud Vendor',            category: 'Fraud & Security' },
  'CASAP':                  { label: 'CASAP Disputes',                    category: 'Fraud & Security' },
  // Deposits & RDC
  'Vertifi RDC':            { label: 'Vertifi Mobile RDC',                category: 'Deposits' },
  'FIS Image Center':       { label: 'FIS Image Center',                  category: 'Deposits' },
  // Data & Analytics
  'FinGoal':                { label: 'FinGoal Transaction Cleansing',     category: 'Data & Analytics' },
  'Snowflake':              { label: 'Snowflake Data Lake',               category: 'Data & Analytics' },
  'StatusGator':            { label: 'StatusGator Integration',           category: 'Data & Analytics' },
  // Lending
  'Akuvo':                  { label: 'Akuvo Collections',                 category: 'Lending' },
  'Loan Vantage':           { label: 'Loan Vantage LOS',                  category: 'Lending' },
  'ICE Encompass':          { label: 'ICE Encompass Mortgage',            category: 'Lending' },
  'Strategy Corps':         { label: 'Strategy Corps',                    category: 'Lending' },
  'Salus Micro Loans':      { label: 'Salus Micro Loans',                 category: 'Lending' },
  'Student Choice':         { label: 'Student Choice',                    category: 'Lending' },
  // Financial Wellness
  'Prisma':                 { label: 'Prisma Financial Wellness',         category: 'Financial Wellness' },
  'Penny Finance':          { label: 'Penny Finance',                     category: 'Financial Wellness' },
  'SavvyMoney':             { label: 'SavvyMoney Credit Score',           category: 'Financial Wellness' },
  'Greenlight':             { label: 'Greenlight Family Banking',         category: 'Financial Wellness' },
  // Account Opening & Onboarding
  'Narmi':                  { label: 'Narmi Account Opening',             category: 'Account Opening' },
  'Digital Onboarding':     { label: 'Digital Onboarding',               category: 'Account Opening' },
  'Coconut':                { label: 'Coconut Appointment Booking',       category: 'Account Opening' },
  // Rewards & Engagement
  'Metro CU Rewards':       { label: 'Metro CU Rewards API',              category: 'Rewards' },
  'CURewards':              { label: 'CURewards',                         category: 'Rewards' },
  'Kasasa':                 { label: 'Kasasa Rewards Checking',           category: 'Rewards' },
  // Documents & Communications
  'Computershare':          { label: 'Computershare eDocuments',          category: 'Documents' },
  'Deluxe Orderpoint':      { label: 'Deluxe Orderpoint Check Reorder',  category: 'Documents' },
  'Intuit':                 { label: 'Intuit Quicken/QuickBooks',         category: 'Documents' },
  // Communications & Support
  'Genesys Messaging':      { label: 'Genesys Messaging',                category: 'Communications' },
  'Genesys Cloud':          { label: 'Genesys Cloud Contact Centre',     category: 'Communications' },
  // Design
  'Splash Screen':          { label: 'Splash Screen & App Icons',        category: 'Design' },
  'Icon Pack':              { label: 'Tyfone Icon Pack',                  category: 'Design' },
  // Core Infrastructure
  'Tyfone Crypto':          { label: 'Tyfone Cryptographic Device Auth', category: 'Infrastructure' },
  'Starlight':              { label: 'Starlight Integration',             category: 'Infrastructure' },
  // Other common
  'Plaid':                  { label: 'Plaid IAV',                         category: 'Account Linking' },
  'Yodlee':                 { label: 'Yodlee IAV',                        category: 'Account Linking' },
  'MX':                     { label: 'MX Financial Data',                 category: 'Account Linking' },
  'Velera':                 { label: 'Velera Card Services',              category: 'Payments' },
  'PSCU':                   { label: 'PSCU Card Services',                category: 'Payments' },
  'Clutch':                 { label: 'Clutch Loan Origination',           category: 'Lending' },
  'EquipiFI':               { label: 'EquipiFI BNPL',                     category: 'Lending' },
  'Skip-A-Pay':             { label: 'Tyfone Skip-A-Pay',                 category: 'Payments' },
  'Quick Pay':              { label: 'Tyfone Quick Pay',                  category: 'Payments' },
  'Zelle':                  { label: 'Zelle P2P Payments',                category: 'Payments' },
};

// Just the keys for backward compat
const KNOWN_INTEGRATIONS = Object.keys(INTEGRATION_CATALOGUE);

interface Setup {
  cuName: string;
  outputType: OutputType;
  goLiveDate: string;
  goLiveTime: string;
  timezone: string;
  coreSystem: string;
  outgoingVendor: string;
  integrations: string[];
  customInt: string;
  notes: string;
}

interface AdditionalDoc {
  file: File;
  name: string;
  size: number;
}


export default function GeneratePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [step, setStep] = useState<Step>('setup');
  const [setup, setSetup] = useState<Setup>({
    cuName: '', outputType: 'both', goLiveDate: '', goLiveTime: '09:00',
    timezone: 'PST – Pacific Standard Time (UTC-8)', coreSystem: '',
    outgoingVendor: '', integrations: [], customInt: '', notes: '',
  });
  const [msaFile, setMsaFile] = useState<File | null>(null);
  const [additionalDocs, setAdditionalDocs] = useState<AdditionalDoc[]>([]);
  const addDocsRef = useRef<HTMLInputElement>(null);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ playbook?: PlaybookData; checklist?: ChecklistData; driveFileCount?: number; hasMSA?: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('playbook');
  const fileRef = useRef<HTMLInputElement>(null);

  function upd<K extends keyof Setup>(k: K, v: Setup[K]) {
    setSetup(p => ({ ...p, [k]: v }));
  }

  async function runExtraction(currentMsaFile: File | null, currentAddDocs: AdditionalDoc[]) {
    if (!currentMsaFile && currentAddDocs.length === 0) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      if (currentMsaFile) fd.append('msaFile', currentMsaFile);
      currentAddDocs.forEach((d, i) => fd.append(`additionalDoc_${i}`, d.file));
      fd.append('additionalDocCount', String(currentAddDocs.length));
      const res = await fetch('/api/generate/extract', { method: 'POST', body: fd });
      if (res.ok) {
        const d = await res.json();
        setSetup(p => ({
          ...p,
          cuName: d.creditUnionName && !p.cuName ? d.creditUnionName : p.cuName,
          goLiveDate: d.goLiveDate && d.goLiveDate !== 'TBD' ? d.goLiveDate : p.goLiveDate,
          timezone: d.timezone || p.timezone,
          coreSystem: d.coreSystem || p.coreSystem,
          outgoingVendor: d.outgoingVendor || p.outgoingVendor,
          // Merge newly detected integrations with any already present (manual or prior extraction), de-duplicated
          integrations: Array.from(new Set([...(p.integrations || []), ...(d.integrations || [])])),
        }));
      }
    } catch {}
    setExtracting(false);
  }

  const MAX_TOTAL_BYTES = 3.8 * 1024 * 1024; // informational only — used for the size indicator, not enforced

  async function handleMSA(file: File) {
    setError('');
    setMsaFile(file);
    await runExtraction(file, additionalDocs);
  }

  async function handleAdditionalDocs(files: FileList | null) {
    if (!files) return;
    const newDocs: AdditionalDoc[] = Array.from(files).map(file => ({ file, name: file.name, size: file.size }));
    const merged = [...additionalDocs, ...newDocs];
    setError('');
    setAdditionalDocs(merged);
    await runExtraction(msaFile, merged);
  }

  function removeAdditionalDoc(idx: number) {
    setAdditionalDocs(p => p.filter((_, i) => i !== idx));
  }

  function toggleInt(name: string) {
    setSetup(p => ({
      ...p,
      integrations: p.integrations.includes(name)
        ? p.integrations.filter(i => i !== name)
        : [...p.integrations, name],
    }));
  }

  function addCustomInt() {
    const v = setup.customInt.trim();
    if (v && !setup.integrations.includes(v)) {
      setSetup(p => ({ ...p, integrations: [...p.integrations, v], customInt: '' }));
    }
  }

  async function generate() {
    if (!setup.cuName.trim()) { setError('Credit Union name is required'); return; }
    setLoading(true); setError(''); setResult(null); setProgress('Starting…');
    try {
      const fd = new FormData();
      fd.append('creditUnionName', setup.cuName);
      fd.append('outputType', setup.outputType);
      fd.append('goLiveDate', setup.goLiveDate || 'TBD');
      fd.append('goLiveTime', setup.goLiveTime || '09:00');
      fd.append('timezone', setup.timezone);
      fd.append('coreSystem', setup.coreSystem);
      fd.append('outgoingVendor', setup.outgoingVendor);
      fd.append('integrations', JSON.stringify(setup.integrations));
      if (setup.notes) fd.append('customPrompt', setup.notes);
      if (msaFile) fd.append('msaFile', msaFile);
      for (let i = 0; i < additionalDocs.length; i++) {
        fd.append(`additionalDoc_${i}`, additionalDocs[i].file);
      }
      fd.append('additionalDocCount', String(additionalDocs.length));

      // Kick off background generation — this returns immediately with a job
      // ID. The actual AI generation runs in a separate request with its own
      // full timeout budget, so we're never blocked by the 60s serverless
      // function limit, no matter how long full-detail generation takes.
      const startRes = await fetch('/api/generate/start', { method: 'POST', body: fd });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Failed to start generation');
      const jobId = startData.jobId as string;

      // Poll for completion
      const POLL_INTERVAL_MS = 2000;
      const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes ceiling
      const pollStart = Date.now();

      while (true) {
        if (Date.now() - pollStart > MAX_WAIT_MS) {
          throw new Error('Generation is taking unusually long (over 10 minutes). Please try again or contact support.');
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const statusRes = await fetch(`/api/generate/status?id=${jobId}`);
        if (!statusRes.ok) {
          if (statusRes.status === 404) throw new Error('Job expired or not found — please try generating again.');
          continue; // transient error, keep polling
        }
        const job = await statusRes.json();
        if (job.progress) setProgress(job.progress);

        if (job.status === 'complete') {
          setResult(job.result);
          setActiveTab(job.result?.playbook ? 'playbook' : 'checklist');
          break;
        }
        if (job.status === 'error') {
          throw new Error(job.error || 'Generation failed');
        }
        // status is 'pending' or 'running' — keep polling
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
    setProgress('');
  }

  async function exportDoc(type: 'playbook' | 'checklist') {
    if (!result) return;
    const data = type === 'playbook' ? result.playbook : result.checklist;
    if (!data) return;
    setExporting(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data, prereqs: setup }),
      });
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type === 'playbook' ? 'GoLivePlaybook' : 'PreGoLive_Questionnaire'}_${setup.cuName.replace(/\s+/g, '_')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (!mounted) return null;

  const ready = !!(setup.cuName.trim() && setup.timezone && setup.coreSystem);

  const iStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' };
  const lStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 };
  const card: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', padding: 22, marginBottom: 18 };

  return (
    <>
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .chip:hover{border-color:#4A9FD4!important}
        .pri-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 14px rgba(15,37,64,0.25)!important}
        .tab-b:hover{color:#1e293b!important}
        .tr:hover{background:#f8fafc!important}
        .exp-btn:hover{background:#15803d!important}
      `}</style>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '32px 24px', animation: 'fadeIn 0.3s ease' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2540', margin: '0 0 4px', letterSpacing: '-0.025em' }}>Generate Onboarding Documents</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Upload the MSA to auto-fill details, then generate your Go-Live Playbook and Pre Go-Live Questionnaire</p>
        </div>

        {/* Step tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #f1f5f9', marginBottom: 24 }}>
          {([['setup','⚙ Setup'],['generate','⚡ Generate']] as [Step,string][]).map(([s,label],i) => (
            <button key={s} onClick={() => { if (s==='setup' || ready) setStep(s); }} className="tab-b"
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', cursor: s==='setup'||ready?'pointer':'not-allowed', color: step===s?'#0f2540':'#94a3b8', borderBottom: `2px solid ${step===s?'#4A9FD4':'transparent'}`, marginBottom: -2, transition: 'all 0.15s', opacity: s==='generate'&&!ready?0.4:1 }}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ SETUP ══ */}
        {step === 'setup' && (
          <div style={{ animation: 'fadeIn 0.25s ease' }}>

            {/* Document Uploads — MSA + Additional */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 28, height: 28, background: 'rgba(74,159,212,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" fill="none" stroke="#4A9FD4" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f2540' }}>Documents</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>MSA auto-fills all fields · Additional docs provide extra context to the AI</div>
                </div>
                {extracting && <span style={{ fontSize: 11, color: '#4A9FD4', fontWeight: 600, animation: 'pulse 1.5s infinite' }}>⟳ Reading MSA…</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* MSA Upload */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    📋 Master Service Agreement
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>(auto-fills fields)</span>
                  </div>
                  <div onClick={() => fileRef.current?.click()}
                    style={{ border: `2px dashed ${msaFile?'#4A9FD4':'#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: msaFile?'rgba(74,159,212,0.04)':'#fafafa', transition: 'all 0.15s', minHeight: 72, display: 'flex', alignItems: 'center' }}>
                    {msaFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f2540', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msaFile.name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{(msaFile.size/1024).toFixed(0)} KB</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setMsaFile(null); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 2, flexShrink: 0 }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, width: '100%' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>↑</div>
                        PDF / DOCX / TXT
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.doc" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleMSA(e.target.files[0])} />
                </div>

                {/* Additional Documents */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    📁 Additional Reference Documents
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>(optional — also scanned for vendors)</span>
                  </div>
                  <div onClick={() => addDocsRef.current?.click()}
                    style={{ border: '2px dashed #e2e8f0', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', background: '#fafafa', transition: 'all 0.15s', minHeight: 72, display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 4 }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor='#4A9FD4'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor='#e2e8f0'}>
                    {additionalDocs.length > 0 ? (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {additionalDocs.map((d, di) => (
                          <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px' }}>
                            <span style={{ fontSize: 12 }}>📄</span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                            <button onClick={e => { e.stopPropagation(); removeAdditionalDoc(di); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: 0, flexShrink: 0 }}>✕</button>
                          </div>
                        ))}
                        <div style={{ fontSize: 10, color: '#4A9FD4', textAlign: 'center', marginTop: 2, cursor: 'pointer' }}>+ Add more</div>
                        {(() => {
                          const total = (msaFile?.size || 0) + additionalDocs.reduce((s, d) => s + d.size, 0);
                          const pct = (total / MAX_TOTAL_BYTES) * 100;
                          return (
                            <div style={{ fontSize: 10, textAlign: 'center', color: pct > 90 ? '#dc2626' : pct > 70 ? '#d97706' : '#94a3b8', marginTop: 2 }}>
                              {(total/1024/1024).toFixed(1)}MB of {(MAX_TOTAL_BYTES/1024/1024).toFixed(1)}MB limit
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, width: '100%' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>📎</div>
                        SOW, Tactiq notes, specs…
                      </div>
                    )}
                  </div>
                  <input ref={addDocsRef} type="file" multiple accept=".pdf,.docx,.txt,.doc,.xlsx,.csv" style={{ display: 'none' }} onChange={e => handleAdditionalDocs(e.target.files)} />
                </div>
              </div>
            </div>

            {/* CU + Output */}
            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                <div>
                  <label style={lStyle}>Credit Union Name <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="text" value={setup.cuName} onChange={e => upd('cuName', e.target.value)} placeholder="e.g. Metro Credit Union" style={iStyle} onFocus={e => e.target.style.borderColor='#4A9FD4'} onBlur={e => e.target.style.borderColor='#e2e8f0'}/>
                </div>
                <div>
                  <label style={lStyle}>Output Type</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    {(['both','playbook','checklist'] as OutputType[]).map(t => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: `1.5px solid ${setup.outputType===t?'#4A9FD4':'#e2e8f0'}`, background: setup.outputType===t?'rgba(74,159,212,0.08)':'#fff', color: setup.outputType===t?'#0f2540':'#64748b', transition: 'all 0.15s' }}>
                        <input type="radio" value={t} checked={setup.outputType===t} onChange={() => upd('outputType', t)} style={{ display: 'none' }}/>
                        {t==='both'?'Both':t==='playbook'?'Playbook':'Checklist'}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Date + Timezone */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2540', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><span>📅</span> Go-Live Date & Timezone</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={lStyle}>Go-Live Date</label>
                  <input type="date" value={setup.goLiveDate} onChange={e => upd('goLiveDate', e.target.value)} style={iStyle} onFocus={e => e.target.style.borderColor='#4A9FD4'} onBlur={e => e.target.style.borderColor='#e2e8f0'}/>
                </div>
                <div>
                  <label style={lStyle}>Go-Live Time</label>
                  <input type="time" value={setup.goLiveTime} onChange={e => upd('goLiveTime', e.target.value)} style={iStyle} onFocus={e => e.target.style.borderColor='#4A9FD4'} onBlur={e => e.target.style.borderColor='#e2e8f0'}/>
                </div>
                <div>
                  <label style={lStyle}>CU Timezone <span style={{ color: '#dc2626' }}>*</span></label>
                  <select value={setup.timezone} onChange={e => upd('timezone', e.target.value)} style={{ ...iStyle, cursor: 'pointer' }}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Core + Vendor — catalogue-based searchable */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2540', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><span>⚙️</span> Core Banking & Outgoing Vendor</div>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>
                Type to search or pick from catalogue — auto-detected from MSA when uploaded
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Core Banking — catalogue with vendor label */}
                <div>
                  <label style={lStyle}>Core Banking System <span style={{ color: '#dc2626' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" value={setup.coreSystem}
                      onChange={e => upd('coreSystem', e.target.value)}
                      placeholder="Type or pick — e.g. Symitar (JHA)"
                      style={{ ...iStyle }}
                      onFocus={e => e.target.style.borderColor='#4A9FD4'}
                      onBlur={e => e.target.style.borderColor='#e2e8f0'}
                    />
                    {setup.coreSystem.trim().length > 0 && (() => {
                      const filtered = Object.entries(CORE_CATALOGUE).filter(([k]) =>
                        k.toLowerCase().includes(setup.coreSystem.toLowerCase()) && k !== setup.coreSystem
                      );
                      if (!filtered.length) return null;
                      return (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                          {filtered.slice(0, 8).map(([k, v]) => (
                            <div key={k} onMouseDown={() => upd('coreSystem', k)}
                              style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8fafc' }}
                              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background='#f8fafc'}
                              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background='transparent'}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{k}</span>
                              <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '1px 7px', borderRadius: 8 }}>{v.vendor}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {setup.coreSystem && CORE_CATALOGUE[setup.coreSystem] && (
                    <div style={{ fontSize: 11, color: '#15803d', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>✓</span> {CORE_CATALOGUE[setup.coreSystem].vendor} · {CORE_CATALOGUE[setup.coreSystem].abbr}
                    </div>
                  )}
                </div>

                {/* Outgoing Vendor — catalogue */}
                <div>
                  <label style={lStyle}>Outgoing Digital Banking Vendor</label>
                  <div style={{ position: 'relative' }}>
                    <input type="text" value={setup.outgoingVendor}
                      onChange={e => upd('outgoingVendor', e.target.value)}
                      placeholder="Type or pick — e.g. Banno, Q2"
                      style={{ ...iStyle }}
                      onFocus={e => e.target.style.borderColor='#4A9FD4'}
                      onBlur={e => e.target.style.borderColor='#e2e8f0'}
                    />
                    {setup.outgoingVendor.trim().length > 0 && (() => {
                      const filtered = Object.entries(VENDOR_CATALOGUE).filter(([k]) =>
                        k.toLowerCase().includes(setup.outgoingVendor.toLowerCase()) && k !== setup.outgoingVendor
                      );
                      if (!filtered.length) return null;
                      return (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                          {filtered.slice(0, 8).map(([k, v]) => (
                            <div key={k} onMouseDown={() => upd('outgoingVendor', k)}
                              style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8fafc' }}
                              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background='#f8fafc'}
                              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background='transparent'}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{k}</span>
                              <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '1px 7px', borderRadius: 8 }}>{v.category}</span>
                            </div>
                          ))}
                          {!Object.keys(VENDOR_CATALOGUE).some(k => k.toLowerCase() === setup.outgoingVendor.toLowerCase()) && (
                            <div onMouseDown={() => {}}
                              style={{ padding: '8px 14px', fontSize: 12, color: '#4A9FD4', fontWeight: 500, borderTop: '1px solid #f1f5f9', cursor: 'default' }}>
                              Using &ldquo;{setup.outgoingVendor}&rdquo; as custom vendor
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {setup.outgoingVendor && VENDOR_CATALOGUE[setup.outgoingVendor] && (
                    <div style={{ fontSize: 11, color: '#15803d', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>✓</span> {VENDOR_CATALOGUE[setup.outgoingVendor].category}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Integrations — auto-populated from MSA, editable */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f2540', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🔗</span> Integrations
                  {setup.integrations.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4A9FD4', background: 'rgba(74,159,212,0.1)', padding: '2px 9px', borderRadius: 20 }}>
                      {setup.integrations.length} detected
                    </span>
                  )}
                </div>
                {msaFile && setup.integrations.length === 0 && (
                  <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Upload MSA or reference docs above to auto-detect</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                {msaFile
                  ? 'Auto-detected from your MSA — remove any that do not apply or add missing ones'
                  : 'These are used to build Phase 2 sign-offs and the Validation Checklist — upload MSA or reference docs to auto-detect, or add manually'}
              </p>

              {/* Auto-detected chips */}
              {setup.integrations.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {setup.integrations.map(name => {
                    const cat = INTEGRATION_CATALOGUE[name];
                    return (
                      <div key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: 'rgba(74,159,212,0.08)', border: '1.5px solid rgba(74,159,212,0.25)', color: '#0f2540' }}>
                        <span>{cat?.label || name}</span>
                        {cat?.category && <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', padding: '1px 5px', borderRadius: 8 }}>{cat.category}</span>}
                        <button onClick={() => setSetup(p => ({...p, integrations: p.integrations.filter(i => i!==name)}))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 0 0 2px', lineHeight: 1, marginLeft: 2 }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color='#dc2626'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color='#94a3b8'}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add integration — searchable */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="text" value={setup.customInt}
                    onChange={e => upd('customInt', e.target.value)}
                    onKeyDown={e => e.key==='Enter' && addCustomInt()}
                    placeholder="Search or type to add an integration…"
                    style={{ ...iStyle, width: '100%' }}
                    onFocus={e => e.target.style.borderColor='#4A9FD4'}
                    onBlur={e => e.target.style.borderColor='#e2e8f0'}
                  />
                  {/* Dropdown suggestions */}
                  {setup.customInt.trim().length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                      {Object.entries(INTEGRATION_CATALOGUE)
                        .filter(([k, v]) =>
                          !setup.integrations.includes(k) &&
                          (k.toLowerCase().includes(setup.customInt.toLowerCase()) ||
                           v.label.toLowerCase().includes(setup.customInt.toLowerCase()))
                        )
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <div key={k}
                            onMouseDown={() => { setSetup(p => ({...p, integrations: [...p.integrations, k], customInt: ''})); }}
                            style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f8fafc' }}
                            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background='#f8fafc'}
                            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background='transparent'}>
                            <span style={{ color: '#1e293b', fontWeight: 500 }}>{v.label}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '1px 6px', borderRadius: 8 }}>{v.category}</span>
                          </div>
                        ))
                      }
                      {/* Always show option to add as custom */}
                      {!Object.keys(INTEGRATION_CATALOGUE).some(k => k.toLowerCase() === setup.customInt.toLowerCase()) && (
                        <div
                          onMouseDown={() => { setSetup(p => ({...p, integrations: [...p.integrations, setup.customInt.trim()], customInt: ''})); }}
                          style={{ padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: '#4A9FD4', fontWeight: 500, borderTop: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background='#f8fafc'}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background='transparent'}>
                          + Add &ldquo;{setup.customInt.trim()}&rdquo; as custom integration
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={addCustomInt} disabled={!setup.customInt.trim()}
                  style={{ padding: '9px 14px', background: setup.customInt.trim() ? '#0f2540' : '#e2e8f0', color: setup.customInt.trim() ? '#fff' : '#94a3b8', border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: setup.customInt.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, transition: 'all 0.15s' }}>
                  + Add
                </button>
              </div>
            </div>

            {/* Notes */}
            <div style={card}>
              <label style={{ ...lStyle, fontSize: 13, fontWeight: 700 }}>📝 Additional Notes <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
              <textarea value={setup.notes} onChange={e => upd('notes', e.target.value)}
                placeholder="Any special constraints, pilot notes, member counts, outstanding items…"
                rows={3} style={{ ...iStyle, resize: 'none', lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor='#4A9FD4'} onBlur={e => e.target.style.borderColor='#e2e8f0'}/>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { if (ready) setStep('generate'); }} disabled={!ready} className="pri-btn"
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: ready?'linear-gradient(135deg,#0f2540,#1E3A5F)':'#e2e8f0', color: ready?'#fff':'#94a3b8', padding: '12px 28px', borderRadius: 11, fontSize: 14, fontWeight: 700, border: 'none', cursor: ready?'pointer':'not-allowed', boxShadow: ready?'0 2px 10px rgba(15,37,64,0.2)':'none', transition: 'all 0.2s' }}>
                Continue to Generate →
              </button>
            </div>
          </div>
        )}

        {/* ══ GENERATE ══ */}
        {step === 'generate' && (
          <div style={{ animation: 'fadeIn 0.25s ease' }}>

            {/* Summary */}
            <div style={{ ...card, background: 'linear-gradient(135deg,rgba(15,37,64,0.03),rgba(74,159,212,0.04))', border: '1px solid rgba(74,159,212,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f2540', marginBottom: 10 }}>{setup.cuName}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {[
                      { icon: '📅', v: setup.goLiveDate||'TBD' },
                      { icon: '⏰', v: setup.timezone.split('(')[0].trim().split('–')[0].trim() },
                      { icon: '⚙️', v: setup.coreSystem||'Core TBD' },
                      { icon: '🏦', v: setup.outgoingVendor||'Vendor TBD' },
                      { icon: '🔗', v: `${setup.integrations.length} integrations` },
                      ...(msaFile?[{icon:'📋',v:'MSA uploaded'}]:[]),
                    ].map((x,i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: '#1e3a5f', background: '#fff', border: '1px solid #dbeafe', borderRadius: 20, padding: '3px 10px' }}>
                        {x.icon} {x.v}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setStep('setup')} style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', flexShrink: 0 }}>← Edit</button>
              </div>
            </div>

            {!result && !loading && (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <button onClick={generate} className="pri-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'linear-gradient(135deg,#0f2540,#1E3A5F)', color: '#fff', padding: '14px 40px', borderRadius: 14, fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 18px rgba(15,37,64,0.28)', transition: 'all 0.2s' }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  Generate with AI
                </button>
              </div>
            )}

            {loading && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: 44, height: 44, border: '3px solid #e2e8f0', borderTopColor: '#4A9FD4', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }}/>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f2540', marginBottom: 6 }}>Generating…</div>
                <div style={{ fontSize: 13, color: '#94a3b8', animation: 'pulse 2s infinite' }}>{progress || 'Starting…'}</div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8 }}>This can take a minute or two for a complete, detailed playbook — feel free to wait, it's still working.</div>
              </div>
            )}

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#b91c1c', display: 'flex', gap: 8, marginBottom: 16 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {error}
              </div>
            )}

            {result && (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                  {result.driveFileCount ? <span style={{ display:'inline-flex',alignItems:'center',gap:5,background:'#dcfce7',color:'#15803d',fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20 }}>✓ {result.driveFileCount} Drive files</span> : null}
                  {result.hasMSA && msaFile && <span style={{ display:'inline-flex',alignItems:'center',gap:5,background:'#dcfce7',color:'#15803d',fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20 }}>✓ MSA analysed</span>}
                  <span style={{ display:'inline-flex',alignItems:'center',gap:5,background:'#dbeafe',color:'#1d4ed8',fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20 }}>✓ {setup.integrations.length} integrations</span>
                </div>

                {result.playbook && result.checklist && (
                  <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #f1f5f9', marginBottom: 22 }}>
                    {(['playbook','checklist'] as Tab[]).map(t => (
                      <button key={t} onClick={() => setActiveTab(t)} className="tab-b"
                        style={{ padding: '10px 22px', fontSize: 13, fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s', color: activeTab===t?'#0f2540':'#94a3b8', borderBottom: `2px solid ${activeTab===t?'#4A9FD4':'transparent'}`, marginBottom: -2 }}>
                        {t==='playbook'?'⚡ Go-Live Playbook':'✓ Pre Go-Live Questionnaire'}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <button onClick={() => exportDoc(activeTab)} disabled={exporting} className="exp-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: exporting ? '#94a3b8' : '#16a34a', color: '#fff', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: 'none', cursor: exporting ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(22,163,74,0.2)', transition: 'all 0.2s' }}>
                    {exporting ? (
                      <>
                        <div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        {activeTab === 'playbook' ? 'Building risks & formatting…' : 'Formatting…'}
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Export Excel
                      </>
                    )}
                  </button>
                </div>

                {/* Playbook */}
                {activeTab==='playbook' && result.playbook && (
                  <div>
                    <div style={{ background: 'rgba(74,159,212,0.06)', border: '1px solid rgba(74,159,212,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#1e3a5f', lineHeight: 1.6 }}>{result.playbook.summary}</div>
                    {result.playbook.sections.map((s, si) => (
                      <div key={si} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
                        <div style={{ background: 'linear-gradient(90deg,#0f2540,#1E3A5F)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: 'rgba(74,159,212,0.25)', color: '#7dc8f0', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{s.phase}</span>
                          <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{s.title}</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: '#f8fafc' }}>{['Task','Owner','Timeline','Status','Notes'].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 14px', color: '#64748b', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {s.tasks.map((task, ti) => {
                              const sc: Record<string,{bg:string;color:string}> = {'Complete':{bg:'#dcfce7',color:'#15803d'},'In Progress':{bg:'#dbeafe',color:'#1d4ed8'},'Blocked':{bg:'#fee2e2',color:'#b91c1c'}};
                              const ss = sc[task.status]||{bg:'#f1f5f9',color:'#475569'};
                              return (
                                <tr key={ti} className="tr" style={{ borderBottom: '1px solid #f8fafc' }}>
                                  <td style={{ padding: '9px 14px', color: '#1e293b', fontWeight: 500 }}>{task.task}</td>
                                  <td style={{ padding: '9px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{task.owner}</td>
                                  <td style={{ padding: '9px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{task.timeline}</td>
                                  <td style={{ padding: '9px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: ss.bg, color: ss.color }}>{task.status}</span></td>
                                  <td style={{ padding: '9px 14px', color: '#94a3b8', fontSize: 11 }}>{task.notes}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}

                {/* Checklist */}
                {activeTab==='checklist' && result.checklist && (
                  <div>
                    <div style={{ background: 'rgba(22,163,74,0.05)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#14532d', lineHeight: 1.6 }}>{result.checklist.summary}</div>
                    {[...new Set(result.checklist.items.map(i => i.category))].map(cat => {
                      const items = result.checklist!.items.filter(i => i.category===cat);
                      const pc: Record<string,{bg:string;color:string}> = {'High':{bg:'#fee2e2',color:'#b91c1c'},'Medium':{bg:'#fef9c3',color:'#a16207'},'Low':{bg:'#dcfce7',color:'#15803d'}};
                      return (
                        <div key={cat} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
                          <div style={{ background: 'linear-gradient(90deg,#374151,#4b5563)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{cat}</span>
                            <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20 }}>{items.length}</span>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead><tr style={{ background: '#f8fafc' }}>{['Item','Owner','Due','Priority'].map(h => <th key={h} style={{ textAlign: 'left', padding: '7px 14px', color: '#64748b', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {items.map((item, ii) => {
                                const ps = pc[item.priority]||{bg:'#f1f5f9',color:'#475569'};
                                return (
                                  <tr key={ii} className="tr" style={{ borderBottom: '1px solid #f8fafc' }}>
                                    <td style={{ padding: '9px 14px', color: '#1e293b', fontWeight: 500 }}>{item.item}</td>
                                    <td style={{ padding: '9px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{item.owner}</td>
                                    <td style={{ padding: '9px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{item.dueDate}</td>
                                    <td style={{ padding: '9px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: ps.bg, color: ps.color }}>{item.priority}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
