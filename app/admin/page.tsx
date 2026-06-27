'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface KeyStatus {
  id: string;
  name: string;
  service: string;
  keyPreview: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ service: string; success: boolean; message: string } | null>(null);

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/api/admin/keys');
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') fetchKeys();
  }, [status, fetchKeys]);

  async function handleTest(action: string, label: string) {
    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setTestResult({ service: label, success: data.success, message: data.message });
    } catch {
      setTestResult({ service: label, success: false, message: 'Request failed' });
    } finally {
      setLoading(false);
    }
  }

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={spin} />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={card}>
          <div style={lockIcon}>
            <svg width="28" height="28" fill="none" stroke="#4A9FD4" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f2540', margin: '0 0 6px' }}>Admin Access Required</h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Sign in with your Google account to continue.</p>
        </div>
      </div>
    );
  }

  const activeCount = keys.filter(k => k.status === 'active').length;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 40 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #0f2540, #1E3A5F)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" fill="none" stroke="#4A9FD4" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0f2540', margin: 0, letterSpacing: '-0.02em' }}>System Administration</h1>
            </div>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              Signed in as <strong style={{ color: '#1e293b' }}>{session?.user?.email}</strong>
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {[
            { label: 'Total Keys', value: keys.length, color: '#0f2540' },
            { label: 'Configured', value: activeCount, color: '#16a34a' },
            { label: 'Missing', value: keys.length - activeCount, color: keys.length - activeCount > 0 ? '#dc2626' : '#94a3b8' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: s.color, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Test result banner */}
        {testResult && (
          <div style={{
            marginBottom: 24, padding: '12px 16px', borderRadius: 10,
            background: testResult.success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`,
            color: testResult.success ? '#15803d' : '#b91c1c',
            fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>{testResult.success ? '✓' : '✗'}</span>
            <strong>{testResult.service}:</strong> {testResult.message}
          </div>
        )}

        {/* Keys table */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>Configuration Status</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Values from Vercel environment variables</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Key / Secret', 'Service', 'Preview', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 24px', color: '#64748b', fontWeight: 600, fontSize: 12, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((key, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 24px', fontWeight: 600, color: '#1e293b' }}>{key.name}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: key.service === 'anthropic' ? '#f3e8ff' : '#dbeafe',
                        color: key.service === 'anthropic' ? '#7c3aed' : '#1d4ed8',
                      }}>
                        {key.service === 'anthropic' ? 'Anthropic' : 'Google Drive'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 24px', fontFamily: 'monospace', color: '#94a3b8', fontSize: 12 }}>{key.keyPreview}</td>
                    <td style={{ padding: '14px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: key.status === 'active' ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: key.status === 'active' ? '#22c55e' : '#f87171', display: 'inline-block' }} />
                        {key.status === 'active' ? 'Configured' : 'Not Set'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Test connections */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '0 0 16px' }}>Test Connections</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { action: 'test_anthropic', label: 'Anthropic API', color: '#7c3aed', hover: '#6d28d9' },
              { action: 'test_drive', label: 'Google Drive', color: '#1d4ed8', hover: '#1e40af' },
            ].map(btn => (
              <button
                key={btn.action}
                onClick={() => handleTest(btn.action, btn.label)}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: btn.color, color: '#fff',
                  padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1, transition: 'all 0.15s',
                }}
              >
                {loading && <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                Test {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Env vars reference */}
        <div style={{ background: '#f8fafc', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: '0 0 6px' }}>Vercel Environment Variables</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>Set these in Vercel project settings → Environment Variables:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['ANTHROPIC_API_KEY', 'Your Anthropic API key (sk-ant-...)'],
              ['GOOGLE_SERVICE_ACCOUNT_EMAIL', 'Service account email from Google Cloud'],
              ['GOOGLE_PRIVATE_KEY', 'Private key from service account JSON (with \\n newlines)'],
              ['GOOGLE_DRIVE_FOLDER_ID', '15MWKZQOBy09pzDbaPCEB915eWr8Y5vdD'],
              ['ADMIN_SECRET_KEY', 'Random secret for JWT signing (can remove — no longer needed)'],
              ['GOOGLE_CLIENT_ID', 'OAuth 2.0 Client ID from Google Cloud Console'],
              ['GOOGLE_CLIENT_SECRET', 'OAuth 2.0 Client Secret from Google Cloud Console'],
              ['NEXTAUTH_URL', 'Your deployment URL (e.g. https://your-app.vercel.app)'],
              ['NEXTAUTH_SECRET', 'Run: openssl rand -base64 32'],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 14px' }}>
                <code style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 12, minWidth: 280 }}>{key}</code>
                <span style={{ color: '#64748b', fontSize: 12 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

const spin: React.CSSProperties = {
  width: 32, height: 32,
  border: '3px solid #e2e8f0',
  borderTopColor: '#4A9FD4',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
};

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0',
  padding: '40px 48px', textAlign: 'center',
  boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
};

const lockIcon: React.CSSProperties = {
  width: 64, height: 64,
  background: 'rgba(74,159,212,0.08)',
  border: '1px solid rgba(74,159,212,0.2)',
  borderRadius: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: 8,
};
