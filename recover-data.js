/**
 * StreamXvault Data Recovery Script
 * Recovers video data from the live API and saves it locally.
 * Also ensures VOD data files exist.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const VOD_RULES_FILE = path.join(DATA_DIR, 'vod_rules.json');
const VOD_REQUESTS_FILE = path.join(DATA_DIR, 'vod_requests.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

async function recover() {
  console.log('🔄 StreamXvault Data Recovery Starting...\n');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('📁 Created data directory');
  }

  // Step 1: Recover videos from live API
  console.log('📡 Fetching video data from live API...');
  try {
    const response = await fetch('https://streamxvault.online/api/videos');
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    
    const videos = await response.json();
    console.log(`✅ Retrieved ${videos.length} videos from live API`);

    // Save to local file
    fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videos, null, 2));
    console.log(`💾 Saved ${videos.length} videos to ${VIDEOS_FILE}`);

    // Show video summary
    console.log('\n📋 Video Summary:');
    videos.forEach((v, i) => {
      console.log(`  ${i + 1}. [${v.genre}] ${v.title} (Views: ${v.views}, Likes: ${v.likes})`);
    });
    console.log('');
  } catch (err) {
    console.error('❌ Failed to recover videos:', err.message);
    
    // If API fails, create empty array so the app can still load
    if (!fs.existsSync(VIDEOS_FILE)) {
      fs.writeFileSync(VIDEOS_FILE, '[]');
      console.log('⚠️ Created empty videos.json as fallback');
    }
  }

  // Step 2: Ensure VOD rules file exists
  if (!fs.existsSync(VOD_RULES_FILE)) {
    fs.writeFileSync(VOD_RULES_FILE, '[]');
    console.log('📺 Created empty vod_rules.json');
  } else {
    console.log('📺 vod_rules.json already exists');
  }

  // Step 3: Ensure VOD requests file exists
  if (!fs.existsSync(VOD_REQUESTS_FILE)) {
    fs.writeFileSync(VOD_REQUESTS_FILE, '[]');
    console.log('📺 Created empty vod_requests.json');
  } else {
    console.log('📺 vod_requests.json already exists');
  }

  // Step 4: Ensure stats file exists
  if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ totalVisitors: 0, uniqueIps: [] }, null, 2));
    console.log('📈 Created stats.json');
  } else {
    console.log('📈 stats.json already exists');
  }

  console.log('\n🎉 Data recovery complete!');
  console.log('   You can now restart the server with: node server.js');
}

recover().catch(err => {
  console.error('💥 Recovery failed:', err);
  process.exit(1);
});
