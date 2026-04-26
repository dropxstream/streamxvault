const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'videos.json');
const INDEXNOW_KEY = '503e50ed1a9444b9a1a3abe5f872635f';
const HOST = 'streamxvault.online';

async function bulkSubmitToIndexNow() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ videos.json not found');
    return;
  }

  const videos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (videos.length === 0) {
    console.log('⚠️ No videos to submit');
    return;
  }

  const urlList = videos.map(v => `https://${HOST}/watch?v=${v.id}`);
  // Also add the home page
  urlList.push(`https://${HOST}/`);

  console.log(`📤 Submitting ${urlList.length} URLs to IndexNow...`);

  try {
    const response = await fetch('https://www.bing.com/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urlList
      })
    });

    if (response.ok) {
      console.log('✅ Bulk submission successful!');
      console.log('List of URLs submitted:');
      urlList.forEach(url => console.log(` - ${url}`));
    } else {
      console.error(`❌ Bulk submission failed: ${response.statusText}`);
      const text = await response.text();
      console.error(text);
    }
  } catch (err) {
    console.error('❌ Network error during bulk submission:', err.message);
  }
}

bulkSubmitToIndexNow();
