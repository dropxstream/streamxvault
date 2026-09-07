const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

if (!source.includes('function getIndexableVideoUrl')) {
  const helperMarker = '}\n\n\n\n// Robots.txt';
  const helper = `}

// Only expose real media URLs to search engines. HTML iframe snippets and missing URLs
// cannot be used as VideoObject contentUrl or video sitemap content_loc values.
function getIndexableVideoUrl(video) {
  const candidate = typeof video?.videoUrl === 'string' ? video.videoUrl.trim() : '';
  if (!(candidate.startsWith('http://') || candidate.startsWith('https://')) || candidate.toLowerCase().includes('<iframe')) return '';
  return candidate;
}

// Robots.txt`;
  if (!source.includes(helperMarker)) throw new Error('SEO helper anchor not found');
  source = source.replace(helperMarker, helper);
}

source = source.replace(
  '    "embedUrl": "${baseUrl}/api/embed/${video.id}",\n    "contentUrl": "${url}",',
  '    ${(() => { const contentUrl = getIndexableVideoUrl(video); return contentUrl ? `"contentUrl": "${escapeJsonStr(contentUrl)}",` : \'\'; })()}'
);

source = source.replace(
  '<video:player_loc>${baseUrl}/api/embed/${v.id}</video:player_loc>',
  '<video:content_loc>${escapeXml(getIndexableVideoUrl(v))}</video:content_loc>'
);

source = source.replace(
  '<loc>${baseUrl}/watch?v=${v.id}</loc>',
  '<loc>${baseUrl}/watch?v=${encodeURIComponent(v.id)}</loc>\n    <lastmod>${escapeXml(v.uploadedAt || \'\')}</lastmod>'
);

const homeVideosAnchor = '  const videos = loadVideos().filter(v => v.published !== false);\n  \n  if (videos.length > 0) {';
const homeVideosReplacement = `  const videos = loadVideos().filter(v => v.published !== false);
  const seoVideoLinks = videos.slice(0, 24).map(v => {
    const title = escapeMeta(v.title || 'Watch video');
    return \`<a href="/watch?v=\${encodeURIComponent(v.id)}" class="video-card" aria-label="\${title}"><span class="card-title">\${title}</span></a>\`;
  }).join('');
  
  if (videos.length > 0) {`;
if (source.includes(homeVideosAnchor)) {
  source = source.replace(homeVideosAnchor, homeVideosReplacement);
}

const homeResponseAnchor = '  res.send(html);\n});\n\n// Protection removed';
const homeResponseReplacement = `  if (seoVideoLinks) {
    html = html.replace('<div class="video-grid" id="videos-grid" style="display: none;"></div>', \`<div class="video-grid" id="videos-grid">\${seoVideoLinks}</div>\`);
  }

  res.send(html);
});

// Protection removed`;
if (source.includes(homeResponseAnchor)) {
  source = source.replace(homeResponseAnchor, homeResponseReplacement);
}

fs.writeFileSync(serverPath, source);