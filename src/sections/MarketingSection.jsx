import React, { useRef, useEffect, useState } from 'react';

// Full marketing dashboard HTML — loaded as a self-contained iframe so all
// Chart.js behaviour, filters, and tab switching work exactly as built.
async function fetchHtml() {
  const res = await fetch('/marketing-dashboard.html');
  return res.text();
}

export default function MarketingSection() {
  const iframeRef = useRef(null);
  const [srcDoc, setSrcDoc] = useState('');

  useEffect(() => {
    fetchHtml()
      .then(setSrcDoc)
      .catch(() => {
        // fallback: show a friendly error inside the iframe
        setSrcDoc('<body style="font-family:sans-serif;padding:40px;color:#64748b">Marketing dashboard could not be loaded.</body>');
      });
  }, []);

  // Resize iframe to fill the available space after content loads
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !srcDoc) return;
    const onLoad = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) {
          iframe.style.height = body.scrollHeight + 'px';
        }
      } catch (_) {}
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [srcDoc]);

  return (
    <div className="w-full min-h-screen bg-[#f4f6fa]">
      {srcDoc ? (
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          title="Marketing Dashboard"
          className="w-full border-0"
          style={{ minHeight: '100vh', height: '100%' }}
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 text-sm">Loading marketing dashboard…</p>
          </div>
        </div>
      )}
    </div>
  );
}
