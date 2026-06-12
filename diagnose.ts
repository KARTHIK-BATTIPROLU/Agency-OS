import fs from 'fs';
import path from 'path';

async function diagnose() {
  const __dirname = path.resolve();
  const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
  let firebaseConfig: any = {};
  if (fs.existsSync(firebaseConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  }
  console.log('Firebase Config loaded:', firebaseConfig);

  const { projectId, firestoreDatabaseId } = firebaseConfig;

  console.log('\n--- Fetching Google Instance Metadata Token ---');
  let token = '';
  try {
    const response = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } }
    );
    if (response.ok) {
      const data = await response.json();
      token = data.access_token;
      console.log('Successfully fetched metadata access token! Length:', token.length);
    } else {
      console.error('Metadata server returned status:', response.status);
    }
  } catch (err: any) {
    console.error('Failed to contact GCE metadata server:', err.message || err);
  }

  if (token) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${firestoreDatabaseId}/documents/users`;
    console.log('\n--- Querying with Authenticated REST API ---');
    console.log('URL:', url);
    try {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const text = await res.text();
      console.log('Response status:', res.status);
      console.log('Response body:', text);
    } catch (err: any) {
      console.error('Fetch Error:', err.message || err);
    }
  }
}

diagnose();
