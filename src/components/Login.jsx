import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError('Sign-in failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
      }}>
        {/* Wordmark */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--text-dimmer)', marginBottom: 10,
          }}>
            Task Master
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 28, fontWeight: 700,
            color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1,
          }}>
            Your system.
          </div>
          <div style={{
            fontFamily: 'var(--font-ui)', fontSize: 28, fontWeight: 700,
            color: 'var(--text-dim)', letterSpacing: '-0.03em', lineHeight: 1.3,
          }}>
            Your data.
          </div>
        </div>

        {/* Sign-in card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 10, padding: '28px 36px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          minWidth: 280,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--text-dimmer)',
          }}>
            Sign in to continue
          </div>

          <button
            onClick={handleSignIn}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: loading ? 'var(--surface2)' : 'var(--surface2)',
              border: '1px solid var(--border2)', borderRadius: 6,
              padding: '10px 20px', cursor: loading ? 'default' : 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
              color: loading ? 'var(--text-dim)' : 'var(--text)',
              transition: 'all 0.15s', width: '100%', justifyContent: 'center',
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = 'var(--text-dim)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; }}
          >
            {/* Google G */}
            {!loading && (
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>

          {error && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, color: '#e05050',
              textAlign: 'center', lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dimmer)',
          letterSpacing: '0.06em', textAlign: 'center', lineHeight: 1.8,
        }}>
          Private · Your data only · Synced across devices
        </div>
      </div>
    </div>
  );
}
