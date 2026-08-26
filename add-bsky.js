const fs = require('fs');
const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));

const bskyNav = `
        <a href="https://bsky.app/profile/streamxvault.online" target="_blank" rel="noopener" class="nav-link" aria-label="Bluesky" style="padding: 0.4rem;">
          <svg viewBox="0 0 320 286" width="18" height="18" fill="currentColor"><path d="M69.364 19.146c36.687 27.806 76.148 74.453 90.636 102.818 14.488-28.365 53.949-75.012 90.636-102.818 29.585-22.422 69.364-28.98 69.364 24.854 0 26.697-9.458 66.864-13.801 81.332-6.52 21.684-25.042 27.675-47.544 26.155-29.215-1.975-58.423-14.86-88.655-32.96 48.066 38.647 88.085 79.52 88.085 119.539 0 46.103-34.904 46.666-51.275 32.535-24.37-21.042-45.696-60.778-46.81-63.558-1.114 2.78-22.44 42.516-46.81 63.558-16.37 14.131-51.275 13.568-51.275-32.535 0-40.019 40.019-80.892 88.085-119.539-30.232 18.1-59.44 30.985-88.655 32.96-22.502 1.52-41.023-4.471-47.544-26.155C9.458 110.854 0 70.687 0 44c0-53.834 39.779-47.276 69.364-24.854z" /></svg>
        </a>`;

const bskyFooter = `
          <a href="https://bsky.app/profile/streamxvault.online" target="_blank" rel="noopener" class="social-link">
            <svg viewBox="0 0 320 286" width="16" height="16" fill="currentColor"><path d="M69.364 19.146c36.687 27.806 76.148 74.453 90.636 102.818 14.488-28.365 53.949-75.012 90.636-102.818 29.585-22.422 69.364-28.98 69.364 24.854 0 26.697-9.458 66.864-13.801 81.332-6.52 21.684-25.042 27.675-47.544 26.155-29.215-1.975-58.423-14.86-88.655-32.96 48.066 38.647 88.085 79.52 88.085 119.539 0 46.103-34.904 46.666-51.275 32.535-24.37-21.042-45.696-60.778-46.81-63.558-1.114 2.78-22.44 42.516-46.81 63.558-16.37 14.131-51.275 13.568-51.275-32.535 0-40.019 40.019-80.892 88.085-119.539-30.232 18.1-59.44 30.985-88.655 32.96-22.502 1.52-41.023-4.471-47.544-26.155C9.458 110.854 0 70.687 0 44c0-53.834 39.779-47.276 69.364-24.854z" /></svg>
            @streamxvault.online
          </a>`;

for (const file of files) {
  let content = fs.readFileSync('public/' + file, 'utf8');
  
  if (content.includes('aria-label="@butterflyadd23 on X"')) {
    content = content.replace(/(aria-label="@butterflyadd23 on X".*?<\/a>)/s, '$1' + bskyNav);
  }
  
  if (content.includes('@butterflyadd23\n          </a>')) {
    content = content.replace(/(@butterflyadd23\n          <\/a>)/s, '$1' + bskyFooter);
  } else if (content.includes('@butterflyadd23\r\n          </a>')) {
    content = content.replace(/(@butterflyadd23\r\n          <\/a>)/s, '$1' + bskyFooter);
  }
  
  fs.writeFileSync('public/' + file, content);
}
