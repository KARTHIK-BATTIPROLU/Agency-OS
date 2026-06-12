import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-auth-config.json';

// Initialize the Firebase client app using the shared applet config.
// Only the public web keys are used here; the firebase-admin SDK on the
// server continues to handle privileged Firestore access.
const app = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
  measurementId: firebaseConfig.measurementId || undefined,
});

export const auth = getAuth(app);
export default app;
