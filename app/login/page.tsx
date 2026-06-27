'use client';
import { signIn, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.push(callbackUrl);
  }, [status, router, callbackUrl]);

  async function handleGoogleSignIn() {
    setLoading(true);
    await signIn('google', { callbackUrl });
  }

  const errorMessage =
    error === 'OAuthSignin' ? 'Could not connect to Google. Please try again.' :
    error === 'OAuthCallback' ? 'Authentication failed. Please try again.' :
    error === 'AccessDenied' ? 'Access denied. Contact your administrator.' :
    error ? 'An error occurred. Please try again.' : null;

  if (status === 'loading' || (status === 'authenticated' && session)) {
    return (
      <div style={S.page}>
        <div style={S.gridOverlay} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={S.spinner} />
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Redirecting…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } @keyframes shimmer { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } } .google-btn:hover:not(:disabled) { background: #f8f9fa !important; border-color: #cbd5e1 !important; box-shadow: 0 3px 12px rgba(0,0,0,0.1) !important; transform: translateY(-1px); } .google-btn { transition: all 0.2s !important; }`}</style>
      <div style={S.page}>
        <div style={S.gridOverlay} />

        {/* Ambient orbs */}
        <div style={{ position: 'absolute', width: 500, height: 500, top: '-160px', right: '-100px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(74,159,212,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, bottom: '-80px', left: '-80px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,58,95,0.5) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ ...S.wrapper, animation: 'fadeUp 0.5s ease' }}>

          {/* Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 28, padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #1E3A5F, #2d5a8e)', border: '1px solid rgba(74,159,212,0.4)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 14px rgba(74,159,212,0.2)' }}>
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M8 4v8" stroke="#4A9FD4" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="8" cy="12" r="1.8" fill="#4A9FD4" />
                </svg>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Tyfone</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(74,159,212,0.1)', border: '1px solid rgba(74,159,212,0.2)', borderRadius: 20, padding: '4px 12px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A9FD4', display: 'inline-block', animation: 'shimmer 2s infinite' }} />
              <span style={{ color: '#7dc8f0', fontSize: 11, fontWeight: 600, letterSpacing: '0.03em' }}>DELIVERY TEAM</span>
            </div>
          </div>

          {/* Card */}
          <div style={S.card}>
            {/* Card header */}
            <div style={S.cardHeader}>
              <div style={S.logoMark}>
                <svg width="28" height="28" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: 8 }}>
                  <span style={{ color: '#4A9FD4' }}>Tyfone</span>
                  <span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 7px' }}>·</span>
                  <span style={{ color: 'rgba(255,255,255,0.92)' }}>Copilot</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['AI Playbooks', 'Go-Live Checklists', 'MSA Chat'].map(label => (
                    <span key={label} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 20 }}>{label}</span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.08) 70%, transparent)' }} />

            {/* Card body */}
            <div style={S.cardBody}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2540', margin: '0 0 6px', letterSpacing: '-0.025em' }}>Welcome back</h1>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 28px', lineHeight: 1.5 }}>
                Sign in to access your AI-powered go-live workspace
              </p>

              {errorMessage && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 20 }}>
                  <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {errorMessage}
                </div>
              )}

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="google-btn"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11,
                  background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: 12,
                  padding: '14px 20px', fontSize: 15, fontWeight: 700, color: '#1e293b',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.65 : 1,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  marginBottom: 24,
                }}
              >
                {loading ? (
                  <div style={{ width: 20, height: 20, border: '2px solid #cbd5e1', borderTopColor: '#475569', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
              </button>

              <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.5, borderTop: '1px solid #f1f5f9', paddingTop: 18 }}>
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secured with Google OAuth 2.0 — we only access your name, email, and profile photo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #080f1c 0%, #0f2540 40%, #1a3a62 70%, #0a1628 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative', overflow: 'hidden' },
  gridOverlay: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(74,159,212,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(74,159,212,0.05) 1px, transparent 1px)', backgroundSize: '44px 44px', pointerEvents: 'none' },
  wrapper: { position: 'relative', width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  card: { width: '100%', background: 'rgba(255,255,255,0.98)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 28px 72px rgba(0,0,0,0.38), 0 0 0 0.5px rgba(255,255,255,0.12)' },
  cardHeader: { background: 'linear-gradient(135deg, #0a1628 0%, #1E3A5F 100%)', padding: '28px 32px 24px', display: 'flex', alignItems: 'center', gap: 18 },
  logoMark: { width: 56, height: 56, background: 'rgba(74,159,212,0.18)', border: '1px solid rgba(74,159,212,0.3)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 20px rgba(74,159,212,0.15)' },
  cardBody: { padding: '32px 32px 28px' },
  spinner: { width: 38, height: 38, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.6)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
};

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #080f1c, #1E3A5F)' }}>
        <div style={{ width: 38, height: 38, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.6)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
