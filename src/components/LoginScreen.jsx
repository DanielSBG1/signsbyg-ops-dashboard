import React, { useState } from 'react';

export default function LoginScreen({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem('sbg-session', JSON.stringify({
          token: data.token,
          timestamp: Date.now(),
        }));
        onSuccess();
      } else {
        setError('Incorrect password');
      }
    } catch {
      setError('Connection error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-accent tracking-tight">Signs By G</h1>
          <p className="text-gray-400 text-sm mt-1">Operations Dashboard</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all text-sm"
        />
        {error && (
          <p className="text-danger text-sm font-medium -mt-2">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Enter Dashboard'}
        </button>
      </form>
    </div>
  );
}
