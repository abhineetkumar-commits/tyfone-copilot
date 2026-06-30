import { NextRequest, NextResponse } from 'next/server';
import { extractMSAMetadata } from '@/lib/claude';

const ALIASES: Record<string, string> = {
  'twilio':'Twilio','twilio cda':'Twilio','amazon ses':'Amazon SES','ses':'Amazon SES',
  'clickatell':'Clickatell','fiserv checkfree':'Fiserv CheckFree RXP','checkfree':'Fiserv CheckFree RXP',
  'checkfree rxp':'Fiserv CheckFree RXP','bill pay':'Fiserv CheckFree RXP',
  'fiserv wire':'Fiserv Wire Exchange','wire exchange':'Fiserv Wire Exchange',
  'fiserv cardhub':'Fiserv CardHub','cardhub':'Fiserv CardHub',
  'payfinia':'Payfinia','international payments':'International Payments',
  'biocatch':'BioCatch','verafin':'Verafin','real-time fraud':'Real-Time Fraud',
  'casap':'CASAP','casap disputes':'CASAP','vertifi':'Vertifi RDC','vertifi rdc':'Vertifi RDC',
  'fis image center':'FIS Image Center','fingoal':'FinGoal','snowflake':'Snowflake',
  'statusgator':'StatusGator','akuvo':'Akuvo','loan vantage':'Loan Vantage',
  'ice encompass':'ICE Encompass','encompass':'ICE Encompass',
  'strategy corps':'Strategy Corps','salus':'Salus Micro Loans','student choice':'Student Choice',
  'prisma':'Prisma','penny finance':'Penny Finance','savvymoney':'SavvyMoney','savvy money':'SavvyMoney',
  'greenlight':'Greenlight','narmi':'Narmi','digital onboarding':'Digital Onboarding',
  'coconut':'Coconut','metro cu rewards':'Metro CU Rewards','curewards':'CURewards',
  'kasasa':'Kasasa','computershare':'Computershare','deluxe':'Deluxe Orderpoint',
  'deluxe orderpoint':'Deluxe Orderpoint','check reorder':'Deluxe Orderpoint',
  'intuit':'Intuit','quicken':'Intuit','quickbooks':'Intuit',
  'genesys messaging':'Genesys Messaging','genesys cloud':'Genesys Cloud','genesys':'Genesys Cloud',
  'tyfone crypto':'Tyfone Crypto','device auth':'Tyfone Crypto','starlight':'Starlight',
  'plaid':'Plaid','yodlee':'Yodlee','mx':'MX','velera':'Velera','pscu':'PSCU',
  'clutch':'Clutch','equipifi':'EquipiFI','bnpl':'EquipiFI',
  'skip-a-pay':'Skip-A-Pay','skip a pay':'Skip-A-Pay','quick pay':'Quick Pay',
  'zelle':'Zelle','early warning':'Zelle','splash screen':'Splash Screen','icon pack':'Icon Pack',
};

function normalise(raw: string[]): string[] {
  const out: string[] = []; const seen = new Set<string>();
  for (const n of raw) {
    const k = n.toLowerCase().trim();
    const c = ALIASES[k] || Object.entries(ALIASES).find(([a]) => k.includes(a) || a.includes(k))?.[1] || n.trim();
    if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); out.push(c); }
  }
  return out.sort();
}

async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer(); const bytes = new Uint8Array(buf);
  if (bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46) {
    const raw = new TextDecoder('latin1').decode(buf); const chunks: string[] = [];
    const btEt=/BT([\s\S]*?)ET/g, tj=/\(((?:[^()\\]|\\[\s\S])*)\)\s*T[jJ]/g;
    let m; while((m=btEt.exec(raw))!==null){let t;while((t=tj.exec(m[1]))!==null)chunks.push(t[1].replace(/\\n/g,'\n'));}
    const out=chunks.join(' ').replace(/\s+/g,' ').trim();
    return (out.length>200?out:raw.replace(/[^\x20-\x7E\n]/g,' ')).substring(0,80000);
  }
  if (file.name.endsWith('.docx')) {
    const raw=new TextDecoder('utf-8',{fatal:false}).decode(buf);
    const t=(raw.match(/<w:t[^>]*>(.*?)<\/w:t>/g)||[]).map(m=>m.replace(/<[^>]+>/g,'')).join(' ');
    if (t.length>100) return t.substring(0,80000);
  }
  return new TextDecoder('utf-8',{fatal:false}).decode(buf).substring(0,80000);
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    const msaFile = fd.get('msaFile') as File|null;

    let text = '';
    if (msaFile && msaFile.size > 0) text = await extractText(msaFile);

    // Process any additional reference documents sent alongside the MSA
    const addCount = parseInt((fd.get('additionalDocCount') as string)||'0', 10);
    const addTexts: string[] = [];
    for (let i = 0; i < addCount; i++) {
      const f = fd.get(`additionalDoc_${i}`) as File|null;
      if (f && f.size > 0) addTexts.push(`--- ${f.name} ---\n${await extractText(f)}`);
    }
    const additionalContext = addTexts.length ? addTexts.join('\n\n') : undefined;

    if (!text && !additionalContext) return NextResponse.json({error:'No documents provided'},{status:400});

    const meta = await extractMSAMetadata(text || '(No MSA uploaded — extract from additional documents only)', additionalContext);
    meta.integrations = normalise(meta.integrations || []);
    return NextResponse.json(meta);
  } catch (e: unknown) {
    return NextResponse.json({error: e instanceof Error ? e.message : String(e)},{status:500});
  }
}