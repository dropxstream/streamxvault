const fs = require('fs');
const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));
for (const file of files) {
  let content = fs.readFileSync('public/' + file, 'utf8');
  const insertion = `
      <div class="nav-social" style="display: flex; gap: 0.5rem; margin-right: 1rem;">
        <a href="https://x.com/analaddict8" target="_blank" rel="noopener" class="nav-link" aria-label="@analaddict8 on X" style="padding: 0.4rem;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
        <a href="https://x.com/butterflyadd23" target="_blank" rel="noopener" class="nav-link" aria-label="@butterflyadd23 on X" style="padding: 0.4rem;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
      </div>`;
  if (content.includes('<div class="nav-right">') && !content.includes('class="nav-social"')) {
    content = content.replace('<div class="nav-right">', '<div class="nav-right">' + insertion);
    fs.writeFileSync('public/' + file, content);
  }
}
