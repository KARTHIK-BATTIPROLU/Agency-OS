import fs from 'fs';
import path from 'path';
import { Firestore } from '@google-cloud/firestore';

async function testDirect() {
  const __dirname = path.resolve();
  const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
  let firebaseConfig: any = {};
  if (fs.existsSync(firebaseConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  }
  console.log('Firebase Config loaded:', firebaseConfig);

  const { projectId, firestoreDatabaseId } = firebaseConfig;

  try {
    const firestore = new Firestore({
      projectId: projectId,
      databaseId: firestoreDatabaseId
    });
    console.log('Initialized `@google-cloud/firestore` with databaseId:', firestoreDatabaseId);
    
    const snap = await firestore.collection('users').limit(1).get();
    console.log('SUCCESS! Snapshot empty:', snap.empty);
  } catch (err: any) {
    console.error('FAILED direct Google Cloud Firestore:', err.message || err);
  }
}

testDirect();
