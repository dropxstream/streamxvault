const fs = require('fs');
const path = require('path');

const SITE = 'https://streamxvault.online';
const DATA_FILE = path.join(__dirname, 'data', 'videos.json');
const SITEMAP_FILE = path.join(__dirname, 'public', 'sitemap.xml');

function clip(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '') + '...';
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const videos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).filter(v => v && v.published !== false);
const now = new Date().toISOString();
const latestUpload = (videos[0] && videos[0].uploadedAt) || now;

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n';

// Static pages
xml += '  <url>\n';
xml += '    <loc>' + SITE + '/</loc>\n';
xml += '    <lastmod>' + latestUpload + '</lastmod>\n';
xml += '    <changefreq>daily</changefreq>\n';
xml += '    <priority>1.0</priority>\n';
xml += '  </url>\n';

xml += '  <url>\n';
xml += '    <loc>' + SITE + '/demand.html</loc>\n';
xml += '    <lastmod>' + latestUpload + '</lastmod>\n';
xml += '    <changefreq>weekly</changefreq>\n';
xml += '    <priority>0.6</priority>\n';
xml += '  </url>\n';

xml += '  <url>\n';
xml += '    <loc>' + SITE + '/contact</loc>\n';
xml += '    <lastmod>' + latestUpload + '</lastmod>\n';
xml += '    <changefreq>monthly</changefreq>\n';
xml += '    <priority>0.7</priority>\n';
xml += '  </url>\n';

// Video pages
videos.forEach(v => {
  xml += '  <url>\n';
  xml += '    <loc>' + SITE + '/watch?v=' + escapeXml(v.id) + '</loc>\n';
  xml += '    <lastmod>' + (v.uploadedAt || now) + '</lastmod>\n';
  xml += '    <changefreq>weekly</changefreq>\n';
  xml += '    <priority>0.8</priority>\n';
  xml += '    <video:video>\n';
  xml += '      <video:thumbnail_loc>' + escapeXml(v.thumbnailUrl || (SITE + '/og-image/' + v.id + '.jpg')) + '</video:thumbnail_loc>\n';
  xml += '      <video:title>' + escapeXml(v.title || 'Video') + '</video:title>\n';
  xml += '      <video:description>' + escapeXml(clip(v.description || v.title || '', 300)) + '</video:description>\n';
  xml += '      <video:player_loc>' + SITE + '/api/embed/' + escapeXml(v.id) + '</video:player_loc>\n';
  xml += '      <video:publication_date>' + (v.uploadedAt || now) + '</video:publication_date>\n';
  xml += '      <video:family_friendly>no</video:family_friendly>\n';
  if (v.genre) xml += '      <video:tag>' + escapeXml(v.genre) + '</video:tag>\n';
  if (Array.isArray(v.tags)) {
    v.tags.slice(0, 10).forEach(t => {
      if (t && String(t).toLowerCase() !== String(v.genre || '').toLowerCase()) {
        xml += '      <video:tag>' + escapeXml(t) + '</video:tag>\n';
      }
    });
  }
  xml += '    </video:video>\n';
  xml += '  </url>\n';
});

xml += '</urlset>\n';

fs.writeFileSync(SITEMAP_FILE, xml, 'utf8');
console.log(`Successfully generated sitemap.xml with ${videos.length} videos and 3 static pages (${videos.length + 3} total URLs).`);
