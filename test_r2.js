const { createStorage } = require('./storage');
const storage = createStorage();
if (storage.mode === 'r2') {
  storage.upload('_database/videos.json', Buffer.from('[]'), 'application/json')
    .then(() => console.log('Successfully written to R2'))
    .catch(e => console.error('Error writing:', e.message));
} else {
  console.log('Not in R2 mode');
}
