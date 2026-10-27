// Runs in <head> before first paint, as a classic (blocking) script. It lives in its own file,
// not inline in index.html, because the Content-Security-Policy (vercel.json) runs only scripts
// from our own origin.

// Apply the saved theme before first paint (@vintage/ui-kit's src/theme.ts owns the key and values).
try {
  const saved = localStorage.getItem('vintage-theme');
  if (saved === 'vintage-dark' || saved === 'vintage-parchment') {
    document.documentElement.dataset.theme = saved;
  }
} catch {}
// Whatever happens to the app script, never leave the page hidden for long.
setTimeout(() => {
  document.documentElement.dataset.ready = '';
}, 4000);
