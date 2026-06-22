import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import multer from 'multer';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { MongoClient, Db as MongoDb } from 'mongodb';
import { getStorage } from 'firebase-admin/storage';
import { createServer as createViteServer } from 'vite';

// Suppress experimental warnings if any
process.removeAllListeners('warning');

// Initialize Express app
const app = express();
// Render (and most PaaS hosts) inject the port to bind on via process.env.PORT.
// Fall back to 3000 for local development.
const PORT = Number(process.env.PORT) || 3000;

// --- CORS ---
// Allow the frontend (local dev + Netlify deployment) to call this API directly.
// Origins can be supplied as a comma-separated FRONTEND_ORIGINS env var; the
// localhost dev origins are always permitted. Set FRONTEND_ORIGINS="*" to allow
// any origin (handy while wiring up a first deploy).
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];
const envOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowAnyOrigin = envOrigins.includes('*');
const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...envOrigins]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowAnyOrigin || allowedOrigins.has(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
  }
  // Short-circuit CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// --- HEALTH CHECK ---
// Lightweight liveness probe for uptime monitors (e.g. UptimeRobot keeping the
// Render free instance warm). Declared before express.json(), the DB proxies,
// auth, and any other middleware so it returns instantly with no I/O. Pings to
// this path are intentionally not logged.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.json());

// Setup relative path helpers
const __dirname = path.resolve();

// Read firebase config securely
const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  } catch (err) {
    console.error('Error reading firebase-applet-config.json:', err);
  }
}

// --- FIREBASE ADMIN CREDENTIALS ---
// admin.initializeApp() with no `credential` falls back to Application Default
// Credentials, which only resolves automatically on Google Cloud (via the
// metadata service). Off-GCP hosts (Render, Railway, etc.) need an explicit
// service account. Provide one via FIREBASE_SERVICE_ACCOUNT (base64 JSON);
// applicationDefault() remains the fallback for GCP-hosted/local-gcloud setups.
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const firebaseCredential = serviceAccountRaw
  ? admin.credential.cert(JSON.parse(Buffer.from(serviceAccountRaw, 'base64').toString('utf8')))
  : admin.credential.applicationDefault();

// Everything (Auth, Firestore, Storage) lives in this single Firebase project.
// firebase-applet-config.json points at a separate AI-Studio-provisioned
// project (gen-lang-client-...) that isn't reachable with this credential —
// ignored here in favor of one project end to end.
const AUTH_PROJECT_ID = process.env.FIREBASE_AUTH_PROJECT_ID || firebaseConfig.projectId;

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: firebaseCredential,
      projectId: AUTH_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
    });
    console.log('Firebase Admin initialized with project:', AUTH_PROJECT_ID);
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
  }
}

// Use this project's default Firestore database — the named database id in
// firebase-applet-config.json belongs to the other (unreachable) project.
const rawDb = getFirestore();

// --- FIREBASE AUTH TOKEN VERIFICATION ---
// The main app above already targets the auth project, so this second named
// app is only kept in case FIREBASE_AUTH_PROJECT_ID is ever pointed at a
// different project again — today it's the same project as the main app.
let authApp: admin.app.App;
try {
  authApp = admin.app('authApp');
} catch {
  authApp = admin.initializeApp({ credential: firebaseCredential, projectId: AUTH_PROJECT_ID }, 'authApp');
}
const firebaseAuth = admin.auth(authApp);

// --- REQUIRE AUTH MIDDLEWARE ---
// Every /api/* route (other than the health check registered above) needs a
// valid Firebase ID token. Without this, all CRUD endpoints — including the
// destructive ones — were reachable by anyone with the URL.
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    (req as any).firebaseUser = await firebaseAuth.verifyIdToken(token);
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired token', details: err.message });
  }
}

// --- MONGODB (USER / DATA STORE) ---
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'agency_os';
let mongoDb: MongoDb | null = null;

async function connectMongo(): Promise<MongoDb | null> {
  if (mongoDb) return mongoDb;
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not set — MongoDB user store is disabled.');
    return null;
  }
  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    mongoDb = client.db(MONGODB_DB);
    await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
    console.log(`MongoDB connected — database "${MONGODB_DB}".`);
    return mongoDb;
  } catch (err) {
    console.error('MongoDB connection failed:', (err as Error).message);
    return null;
  }
}

// Returns a MongoDB collection or throws a 503-style error if unavailable.
async function mongoColl(name: string) {
  const m = await connectMongo();
  if (!m) {
    const err: any = new Error('MongoDB user/data store is unavailable');
    err.statusCode = 503;
    throw err;
  }
  return m.collection(name);
}

// Shared error responder for the Mongo-backed routes.
function sendError(res: express.Response, error: any) {
  res.status(error?.statusCode || 500).json({ error: error?.message || 'Server error' });
}

// Recompute an invoice's status from its line items and payments. Mirrors the
// client-side deriveInvoiceStatus() in src/types.ts.
function recomputeInvoiceStatus(inv: any): string {
  if (inv.status === 'Draft') return 'Draft';
  const subtotal = (inv.line_items || []).reduce(
    (s: number, li: any) => s + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);
  const total = subtotal + subtotal * ((Number(inv.tax_percent) || 0) / 100);
  const paid = (inv.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  const balance = total - paid;
  if (total > 0 && balance <= 0) return 'Paid';
  if (paid > 0) return 'Partially Paid';
  if (inv.due_date && new Date(inv.due_date) < new Date()) return 'Overdue';
  return 'Sent';
}

// Seed the baseline operator accounts in MongoDB if the collection is empty.
async function seedMongoUsers() {
  const m = await connectMongo();
  if (!m) return;
  const count = await m.collection('users').countDocuments();
  if (count === 0) {
    console.log('Seeding default MongoDB users (Admin & Manager)...');
    await m.collection('users').insertMany([
      {
        id: 'u1',
        name: 'Sarah Jenkins',
        email: 'admin@agency.com',
        role: 'Admin',
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'u2',
        name: 'Alex Rivera',
        email: 'manager@agency.com',
        role: 'Manager',
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      },
    ]);
    console.log('Default MongoDB users seeded.');
  }
}

// --- RESILIENT DUAL-WRITE DATABASE PROXY ---
// In production, a Firestore failure must surface as a real error instead of
// silently switching to a local JSON file — Render/Railway's filesystem is
// wiped on every redeploy, so the fallback would both lose data and mask the
// real problem. The fallback only activates outside production.
const FALLBACK_ENABLED = process.env.NODE_ENV !== 'production';
let useLocalFallback = false;

class LocalDatabaseFallback {
  private filePath: string;
  private data: {
    clients: Record<string, any>;
    monthly_packages: Record<string, any>;
    activities: Record<string, any>;
    activity_files: Record<string, any>;
    users: Record<string, any>;
  };

  constructor() {
    this.filePath = path.join(__dirname, 'uploads', 'local_fallback_db.json');
    this.data = {
      clients: {},
      monthly_packages: {},
      activities: {},
      activity_files: {},
      users: {}
    };
    // Ensure parent uploads folder exists before loading/saving
    const parentDir = path.dirname(this.filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    this.load();
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.error('Error loading fallback JSON DB:', err);
      }
    } else {
      this.save();
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving fallback JSON DB:', err);
    }
  }

  getCollection(name: string) {
    const coll = this.data[name as keyof typeof this.data] || {};
    return Object.keys(coll).map(id => ({ id, ...coll[id] }));
  }

  setDocument(collectionName: string, docId: string, docData: any) {
    if (!this.data[collectionName as keyof typeof this.data]) {
      this.data[collectionName as keyof typeof this.data] = {};
    }
    this.data[collectionName as keyof typeof this.data][docId] = { ...docData };
    this.save();
  }

  updateDocument(collectionName: string, docId: string, updateData: any) {
    const coll = this.data[collectionName as keyof typeof this.data];
    if (coll && coll[docId]) {
      coll[docId] = { ...coll[docId], ...updateData };
      this.save();
    }
  }

  deleteDocument(collectionName: string, docId: string) {
    const coll = this.data[collectionName as keyof typeof this.data];
    if (coll && coll[docId]) {
      delete coll[docId];
      this.save();
    }
  }

  getDocument(collectionName: string, docId: string) {
    const coll = this.data[collectionName as keyof typeof this.data];
    if (coll && coll[docId]) {
      return { id: docId, exists: true, data: () => coll[docId] };
    }
    return { id: docId, exists: false, data: () => null };
  }
}

const localDb = new LocalDatabaseFallback();

// Check if rawDb has permissions, fallback otherwise
async function testDbAccess() {
  try {
    await rawDb.collection('users').limit(1).get();
    console.log('Successfully connected to remote Firestore. Using remote DB.');
    useLocalFallback = false;
  } catch (err: any) {
    if (!FALLBACK_ENABLED) {
      // This is a fire-and-forget boot-time probe, not an awaited request —
      // throwing here would be an unhandled rejection that crashes the whole
      // process. Log loudly instead; every route already has its own
      // try/catch around Firestore calls and will surface this same error
      // as a normal 500 per request until it's fixed.
      console.error('Firestore connectivity check failed. API requests will fail until this is resolved:', err.message || err);
      return;
    }
    console.warn('Remote Firestore is not ready yet (IAM Sync delay). Using local JSON fallback DB:', err.message || err);
    useLocalFallback = true;
  }
}
testDbAccess();

const db = {
  collection(collectionName: string) {
    return {
      where(field: string, op: any, val: any) {
        return {
          get: async () => {
            if (!useLocalFallback) {
              try {
                return await rawDb.collection(collectionName).where(field, op, val).get();
              } catch (err) {
                if (!FALLBACK_ENABLED) throw err;
                console.warn(`Firestore where().get() failed, falling back:`, err);
                useLocalFallback = true;
              }
            }
            const items = localDb.getCollection(collectionName);
            const filtered = items.filter(item => {
              if (op === '!=') {
                return item[field] !== val;
              }
              if (op === '==') {
                return item[field] === val;
              }
              return true;
            });
            return {
              empty: filtered.length === 0,
              docs: filtered.map(item => ({
                id: item.id,
                ref: {
                  delete: async () => {
                    localDb.deleteDocument(collectionName, item.id);
                    if (!useLocalFallback) {
                      try {
                        await rawDb.collection(collectionName).doc(item.id).delete();
                      } catch (err) {
                        console.warn(`Firestore delete failed:`, err);
                      }
                    }
                    return { success: true };
                  }
                },
                data: () => {
                  const { id, ...rest } = item;
                  return rest;
                }
              }))
            };
          }
        };
      },
      limit(val: number) {
        return {
          get: async () => {
            if (!useLocalFallback) {
              try {
                return await rawDb.collection(collectionName).limit(val).get();
              } catch (err) {
                if (!FALLBACK_ENABLED) throw err;
                console.warn(`Firestore limit().get() failed, falling back:`, err);
                useLocalFallback = true;
              }
            }
            const items = localDb.getCollection(collectionName).slice(0, val);
            return {
              empty: items.length === 0,
              docs: items.map(item => ({
                id: item.id,
                ref: {
                  delete: async () => {
                    localDb.deleteDocument(collectionName, item.id);
                    if (!useLocalFallback) {
                      try {
                        await rawDb.collection(collectionName).doc(item.id).delete();
                      } catch (err) {
                        console.warn(`Firestore delete failed:`, err);
                      }
                    }
                    return { success: true };
                  }
                },
                data: () => {
                  const { id, ...rest } = item;
                  return rest;
                }
              }))
            };
          }
        };
      },
      get: async () => {
        if (!useLocalFallback) {
          try {
            return await rawDb.collection(collectionName).get();
          } catch (err) {
            if (!FALLBACK_ENABLED) throw err;
            console.warn(`Firestore get() failed, falling back:`, err);
            useLocalFallback = true;
          }
        }
        const items = localDb.getCollection(collectionName);
        return {
          empty: items.length === 0,
          docs: items.map(item => ({
            id: item.id,
            ref: {
              delete: async () => {
                localDb.deleteDocument(collectionName, item.id);
                if (!useLocalFallback) {
                  try {
                    await rawDb.collection(collectionName).doc(item.id).delete();
                  } catch (err) {
                    console.warn(`Firestore delete failed:`, err);
                  }
                }
                return { success: true };
              }
            },
            data: () => {
              const { id, ...rest } = item;
              return rest;
            }
          }))
        };
      },
      doc(docId: string) {
        return {
          get: async () => {
            if (!useLocalFallback) {
              try {
                return await rawDb.collection(collectionName).doc(docId).get();
              } catch (err) {
                if (!FALLBACK_ENABLED) throw err;
                console.warn(`Firestore doc().get() failed, falling back:`, err);
                useLocalFallback = true;
              }
            }
            const doc = localDb.getDocument(collectionName, docId);
            return {
              exists: doc.exists,
              ref: {
                delete: async () => {
                  localDb.deleteDocument(collectionName, docId);
                  if (!useLocalFallback) {
                    try {
                      await rawDb.collection(collectionName).doc(docId).delete();
                    } catch (err) {
                      console.warn(`Firestore delete failed:`, err);
                    }
                  }
                  return { success: true };
                }
              },
              data: () => doc.data()
            };
          },
          set: async (data: any) => {
            if (FALLBACK_ENABLED) localDb.setDocument(collectionName, docId, data);
            if (!useLocalFallback) {
              try {
                await rawDb.collection(collectionName).doc(docId).set(data);
              } catch (err) {
                if (!FALLBACK_ENABLED) throw err;
                console.warn(`Firestore doc().set() failed, using fallback:`, err);
                useLocalFallback = true;
              }
            }
            return { success: true };
          },
          update: async (data: any) => {
            if (FALLBACK_ENABLED) localDb.updateDocument(collectionName, docId, data);
            if (!useLocalFallback) {
              try {
                await rawDb.collection(collectionName).doc(docId).update(data);
              } catch (err) {
                if (!FALLBACK_ENABLED) throw err;
                console.warn(`Firestore doc().update() failed, using fallback:`, err);
                useLocalFallback = true;
              }
            }
            return { success: true };
          },
          delete: async () => {
            if (FALLBACK_ENABLED) localDb.deleteDocument(collectionName, docId);
            if (!useLocalFallback) {
              try {
                await rawDb.collection(collectionName).doc(docId).delete();
              } catch (err) {
                if (!FALLBACK_ENABLED) throw err;
                console.warn(`Firestore doc().delete() failed, using fallback:`, err);
                useLocalFallback = true;
              }
            }
            return { success: true };
          }
        };
      }
    };
  }
};

// Configure multer storage and validation
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedExtensions = [
    '.jpg', '.jpeg', '.png', '.webp', // Images
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', // Documents
    '.mp4', '.mov' // Videos
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  
  const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'video/mp4', 'video/quicktime'
  ];

  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file extension or type. Allowed types: Images (JPG, JPEG, PNG, WEBP), Documents (PDF, DOC, DOCX, XLS, XLSX), Videos (MP4, MOV).'), false);
  }
};

// Custom slugify utility
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
}

// Map Activity Categories to exact folder name requirements:
// /uploads/clients/{client-name}/{activity-type}/
// Example: posters, blogs, reels
const typeMapping: Record<string, string> = {
  'Poster': 'posters',
  'Reel': 'reels',
  'Video Editing': 'video-editing',
  'Ad Campaign': 'ad-campaigns',
  'Blog': 'blogs',
  'Content Writing': 'content-writing',
  'Script Writing': 'script-writing',
  'Website Update': 'website-updates'
};

// Files are buffered in memory then streamed straight to Firebase Storage —
// Render/Railway's local disk is wiped on every redeploy, so writing to disk
// here would lose every uploaded file on the next deploy/restart.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // Maximum 100MB per file
});

// --- API ROUTES ---
app.use('/api', requireAuth);

// 1. CLIENTS CRUD
// Read all non-deleted
app.get('/api/clients', async (req, res) => {
  try {
    const snapshot = await db.collection('clients').where('is_deleted', '!=', true).get();
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(clients);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Read deleted as well (Admin Restore views)
app.get('/api/clients/all', async (req, res) => {
  try {
    const snapshot = await db.collection('clients').get();
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(clients);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create
app.post('/api/clients', async (req, res) => {
  try {
    const { client_name, logo_url, industry, start_date, status, priority } = req.body;
    if (!client_name) {
      return res.status(400).json({ error: 'Client name is required' });
    }
    const id = `c-${Date.now()}`;
    const newClient = {
      client_name,
      logo_url: logo_url || client_name.substring(0, 2).toUpperCase(),
      industry: industry || 'Other',
      start_date: start_date || new Date().toISOString().split('T')[0],
      status: status || 'Active',
      priority: priority || 'Medium',
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString()
    };
    await db.collection('clients').doc(id).set(newClient);
    res.status(211).json({ id, ...newClient });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updateData: any = {};
    const editableFields = ['client_name', 'logo_url', 'industry', 'start_date', 'status', 'priority'];
    editableFields.forEach(field => {
      if (body[field] !== undefined) updateData[field] = body[field];
    });

    await db.collection('clients').doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Soft Delete
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('clients').doc(id).update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore Client
app.post('/api/clients/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('clients').doc(id).update({
      is_deleted: false,
      deleted_at: null
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 2. RETAINER / MONTHLY PACKAGES CRUD
// List active packages
app.get('/api/packages', async (req, res) => {
  try {
    const snapshot = await db.collection('monthly_packages').where('is_deleted', '!=', true).get();
    const pkgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(pkgs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all (included deleted)
app.get('/api/packages/all', async (req, res) => {
  try {
    const snapshot = await db.collection('monthly_packages').get();
    const pkgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(pkgs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create package
app.post('/api/packages', async (req, res) => {
  try {
    const { 
      client_id, month, year, 
      posters_target, reels_target, video_target, ads_target, 
      blogs_target, content_target, scripts_target, website_updates_target 
    } = req.body;
    
    if (!client_id || !month || !year) {
      return res.status(400).json({ error: 'client_id, month, and year are required.' });
    }

    const id = `pkg-${Date.now()}`;
    const newPkg = {
      client_id,
      month: Number(month),
      year: Number(year),
      posters_target: Number(posters_target || 0),
      reels_target: Number(reels_target || 0),
      video_target: Number(video_target || 0),
      ads_target: Number(ads_target || 0),
      blogs_target: Number(blogs_target || 0),
      content_target: Number(content_target || 0),
      scripts_target: Number(scripts_target || 0),
      website_updates_target: Number(website_updates_target || 0),
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString()
    };
    await db.collection('monthly_packages').doc(id).set(newPkg);
    res.status(211).json({ id, ...newPkg });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update package
app.put('/api/packages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updateData: any = {};
    const editableFields = [
      'month', 'year', 'posters_target', 'reels_target', 'video_target', 'ads_target',
      'blogs_target', 'content_target', 'scripts_target', 'website_updates_target'
    ];
    editableFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = Number(body[field]);
      }
    });

    await db.collection('monthly_packages').doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Soft Delete package
app.delete('/api/packages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('monthly_packages').doc(id).update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore package
app.post('/api/packages/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('monthly_packages').doc(id).update({
      is_deleted: false,
      deleted_at: null
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 3. ACTIVITIES AND ATTACHED FILES CRUD
// List active activities along with associated files
app.get('/api/activities', async (req, res) => {
  try {
    const actSnap = await db.collection('activities').where('is_deleted', '!=', true).get();
    const fileSnap = await db.collection('activity_files').get();

    const filesMap: Record<string, any[]> = {};
    fileSnap.docs.forEach(doc => {
      const f = doc.data();
      const activityId = f.activity_id;
      if (activityId) {
        if (!filesMap[activityId]) filesMap[activityId] = [];
        filesMap[activityId].push({ id: doc.id, ...f });
      }
    });

    const activities = actSnap.docs.map(doc => {
      const act = doc.data();
      return {
        id: doc.id,
        ...act,
        files: filesMap[doc.id] || []
      };
    });

    res.json(activities);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all (incl. deleted)
app.get('/api/activities/all', async (req, res) => {
  try {
    const snapshot = await db.collection('activities').get();
    const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(activities);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Activity
app.post('/api/activities', async (req, res) => {
  try {
    const body = req.body;
    const { 
      client_id, activity_type, sub_type, stage, title, description, 
      drive_link, activity_date, created_by, remarks, blog_title, blog_url,
      client_feedback, approval_status, priority, estimated_completion, attached_files
    } = body;

    if (!client_id || !activity_type || !title || !activity_date) {
      return res.status(400).json({ error: 'client_id, activity_type, title, and activity_date are required' });
    }

    // Auto-compute unique activity code for that year
    const actYear = activity_date.split('-')[0] || '2026';
    
    // Read existing codes for this year to safe-increment
    const snapshot = await db.collection('activities').get();
    let maxNum = 0;
    snapshot.docs.forEach(doc => {
      const code = doc.data().activity_id_code;
      if (code && code.startsWith(`ACT-${actYear}-`)) {
        const parts = code.split('-');
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });

    const nextCounter = maxNum + 1;
    const paddedCounter = String(nextCounter).padStart(4, '0');
    const activity_id_code = `ACT-${actYear}-${paddedCounter}`;
    const id = `act-${Date.now()}`;

    const newActivity = {
      activity_id_code,
      client_id,
      activity_type,
      sub_type: sub_type || null,
      stage,
      title,
      description: description || '',
      drive_link: drive_link || '',
      activity_date,
      created_by: created_by || 'Unknown Operator',
      remarks: remarks || '',
      blog_title: blog_title || '',
      blog_url: blog_url || '',
      client_feedback: client_feedback || '',
      approval_status: approval_status || 'Pending',
      priority: priority || 'Medium',
      estimated_completion: estimated_completion || '',
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString()
    };

    await db.collection('activities').doc(id).set(newActivity);

    // If there are files attached, register them in activity_files table
    const registeredFiles = [];
    if (attached_files && Array.isArray(attached_files)) {
      for (const file of attached_files) {
        const fileId = `file-${Date.now()}-${Math.round(Math.random() * 1e5)}`;
        const record = {
          id: fileId,
          activity_id: id,
          file_name: file.file_name,
          file_path: file.file_path,
          storage_path: file.storage_path || null,
          file_type: file.file_type,
          uploaded_at: new Date().toISOString()
        };
        await db.collection('activity_files').doc(fileId).set(record);
        registeredFiles.push(record);
      }
    }

    res.status(211).json({ id, ...newActivity, files: registeredFiles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Activity
app.put('/api/activities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const updateData: any = {};
    const editableFields = [
      'client_id', 'activity_type', 'sub_type', 'stage', 'title', 'description', 
      'drive_link', 'activity_date', 'remarks', 'blog_title', 'blog_url',
      'client_feedback', 'approval_status', 'priority', 'estimated_completion'
    ];
    editableFields.forEach(field => {
      if (body[field] !== undefined) updateData[field] = body[field];
    });

    await db.collection('activities').doc(id).update(updateData);

    // Save newly attached files if any are sent
    const registeredFiles = [];
    if (body.attached_files && Array.isArray(body.attached_files)) {
      for (const file of body.attached_files) {
        if (file.is_new) {
          const fileId = `file-${Date.now()}-${Math.round(Math.random() * 1e5)}`;
          const record = {
            id: fileId,
            activity_id: id,
            file_name: file.file_name,
            file_path: file.file_path,
            storage_path: file.storage_path || null,
            file_type: file.file_type,
            uploaded_at: new Date().toISOString()
          };
          await db.collection('activity_files').doc(fileId).set(record);
          registeredFiles.push(record);
        }
      }
    }

    res.json({ id, ...updateData, newFiles: registeredFiles });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Soft Delete Activity
app.delete('/api/activities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('activities').doc(id).update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore Activity
app.post('/api/activities/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('activities').doc(id).update({
      is_deleted: false,
      deleted_at: null
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 4. USERS CRUD (Manager and Admin users)
// List users
// --- AUTHENTICATION ---
// Resolve the signed-in Firebase user to an application account in MongoDB.
// The client sends the Firebase ID token; we verify it, then look up (or
// lazily create) the matching user record and return it with their role.
app.post('/api/auth/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(token);
    } catch (err: any) {
      return res.status(401).json({ error: 'Invalid or expired token', details: err.message });
    }

    const email = (decoded.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Token has no email claim' });
    }

    const m = await connectMongo();
    if (!m) {
      return res.status(503).json({ error: 'User store unavailable' });
    }

    const usersColl = m.collection('users');
    let user = await usersColl.findOne({ email });

    if (!user) {
      // First-time login for this Firebase account — provision a basic record.
      // The very first account ever becomes Admin; subsequent ones are Managers.
      const total = await usersColl.countDocuments();
      const newUser = {
        id: `u-${Date.now()}`,
        name: decoded.name || email.split('@')[0],
        email,
        role: total === 0 ? 'Admin' : 'Manager',
        firebase_uid: decoded.uid,
        is_deleted: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      };
      await usersColl.insertOne(newUser as any);
      user = newUser as any;
    } else if (user.is_deleted) {
      return res.status(403).json({ error: 'This account has been deactivated' });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      is_deleted: false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =====================================================================
// TASKS (MongoDB) — assignment, ownership & approval workflow
// =====================================================================

app.get('/api/tasks', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    const tasks = await coll.find({ is_deleted: { $ne: true } }).toArray();
    res.json(tasks.map(({ _id, ...t }) => t));
  } catch (error) { sendError(res, error); }
});

app.get('/api/tasks/all', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    const tasks = await coll.find({}).toArray();
    res.json(tasks.map(({ _id, ...t }) => t));
  } catch (error) { sendError(res, error); }
});

// Create or update a task (update when an id is supplied).
app.post('/api/tasks', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    const body = req.body || {};
    if (!body.title) return res.status(400).json({ error: 'title is required' });

    if (body.id) {
      const { id, _id, ...updates } = body;
      await coll.updateOne({ id }, { $set: updates });
      const updated = await coll.findOne({ id });
      if (!updated) return res.status(404).json({ error: 'Task not found' });
      const { _id: _omit, ...clean } = updated;
      return res.json(clean);
    }

    const id = `t-${Date.now()}`;
    const newTask = {
      id,
      title: body.title,
      description: body.description || '',
      client_id: body.client_id || null,
      assignee_id: body.assignee_id || null,
      due_date: body.due_date || null,
      priority: body.priority || 'Medium',
      status: body.status || 'To Do',
      dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
      approval_stage: body.approval_stage || 'Draft',
      approval_history: [],
      created_by: body.created_by || 'system',
      created_at: new Date().toISOString(),
      is_deleted: false,
      deleted_at: null,
    };
    await coll.insertOne({ ...newTask });
    res.status(201).json(newTask);
  } catch (error) { sendError(res, error); }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    const { id } = req.params;
    const { _id, id: _ignore, ...updates } = req.body || {};
    await coll.updateOne({ id }, { $set: updates });
    res.json({ id, ...updates });
  } catch (error) { sendError(res, error); }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    await coll.updateOne({ id: req.params.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
    res.json({ success: true });
  } catch (error) { sendError(res, error); }
});

app.post('/api/tasks/:id/restore', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    await coll.updateOne({ id: req.params.id }, { $set: { is_deleted: false, deleted_at: null } });
    res.json({ success: true });
  } catch (error) { sendError(res, error); }
});

// Advance/set the approval stage and append to the history timeline.
app.post('/api/tasks/:id/approval', async (req, res) => {
  try {
    const coll = await mongoColl('tasks');
    const { id } = req.params;
    const { stage, note, by } = req.body || {};
    if (!stage) return res.status(400).json({ error: 'stage is required' });
    const event = { stage, by: by || 'system', at: new Date().toISOString(), note: note || '' };
    await coll.updateOne(
      { id },
      { $set: { approval_stage: stage }, $push: { approval_history: event } } as any
    );
    const updated = await coll.findOne({ id });
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    const { _id, ...clean } = updated;
    res.json(clean);
  } catch (error) { sendError(res, error); }
});

// =====================================================================
// INVOICES (MongoDB) — invoicing & payment tracking
// =====================================================================

app.get('/api/invoices', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    const invoices = await coll.find({ is_deleted: { $ne: true } }).toArray();
    res.json(invoices.map(({ _id, ...i }) => i));
  } catch (error) { sendError(res, error); }
});

app.get('/api/invoices/all', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    const invoices = await coll.find({}).toArray();
    res.json(invoices.map(({ _id, ...i }) => i));
  } catch (error) { sendError(res, error); }
});

// Create or update an invoice. New invoices get an auto sequence number.
app.post('/api/invoices', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    const body = req.body || {};
    if (!body.client_id) return res.status(400).json({ error: 'client_id is required' });

    if (body.id) {
      const { id, _id, invoice_number, ...updates } = body;
      updates.status = recomputeInvoiceStatus({ ...body });
      await coll.updateOne({ id }, { $set: updates });
      const updated = await coll.findOne({ id });
      if (!updated) return res.status(404).json({ error: 'Invoice not found' });
      const { _id: _omit, ...clean } = updated;
      return res.json(clean);
    }

    const year = new Date().getFullYear();
    const countThisYear = await coll.countDocuments({ invoice_number: { $regex: `^INV-${year}-` } });
    const seq = String(countThisYear + 1).padStart(4, '0');
    const base = {
      id: `inv-${Date.now()}`,
      invoice_number: `INV-${year}-${seq}`,
      client_id: body.client_id,
      issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
      due_date: body.due_date || null,
      line_items: Array.isArray(body.line_items) ? body.line_items : [],
      tax_percent: Number(body.tax_percent) || 0,
      status: body.status || 'Draft',
      payments: [],
      notes: body.notes || '',
      created_by: body.created_by || 'system',
      created_at: new Date().toISOString(),
      is_deleted: false,
      deleted_at: null,
    };
    const newInvoice = { ...base, status: recomputeInvoiceStatus(base) };
    await coll.insertOne({ ...newInvoice });
    res.status(201).json(newInvoice);
  } catch (error) { sendError(res, error); }
});

app.put('/api/invoices/:id', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    const { id } = req.params;
    const { _id, id: _ignore, ...updates } = req.body || {};
    const existing = await coll.findOne({ id });
    updates.status = recomputeInvoiceStatus({ ...(existing || {}), ...updates });
    await coll.updateOne({ id }, { $set: updates });
    res.json({ id, ...updates });
  } catch (error) { sendError(res, error); }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    await coll.updateOne({ id: req.params.id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
    res.json({ success: true });
  } catch (error) { sendError(res, error); }
});

app.post('/api/invoices/:id/restore', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    await coll.updateOne({ id: req.params.id }, { $set: { is_deleted: false, deleted_at: null } });
    res.json({ success: true });
  } catch (error) { sendError(res, error); }
});

// Record a payment and recompute the invoice status.
app.post('/api/invoices/:id/payments', async (req, res) => {
  try {
    const coll = await mongoColl('invoices');
    const { id } = req.params;
    const { amount, date, method, note } = req.body || {};
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required' });
    const payment = {
      id: `pay-${Date.now()}`,
      amount: Number(amount),
      date: date || new Date().toISOString().slice(0, 10),
      method: method || '',
      note: note || '',
    };
    const existing = await coll.findOne({ id });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const payments = [...(existing.payments || []), payment];
    const status = recomputeInvoiceStatus({ ...existing, payments });
    await coll.updateOne({ id }, { $set: { payments, status } });
    const updated = await coll.findOne({ id });
    const { _id, ...clean } = updated as any;
    res.json(clean);
  } catch (error) { sendError(res, error); }
});

app.get('/api/users', async (req, res) => {
  try {
    const snapshot = await db.collection('users').where('is_deleted', '!=', true).get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all including deleted users
app.get('/api/users/all', async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create User
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email, and role are required' });
    }
    const id = `u-${Date.now()}`;
    const newUser = {
      name,
      email,
      role,
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString()
    };
    await db.collection('users').doc(id).set(newUser);
    res.status(211).json({ id, ...newUser });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update User
app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;

    await db.collection('users').doc(id).update(updateData);
    res.json({ id, ...updateData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Soft Delete User
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).update({
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore User
app.post('/api/users/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).update({
      is_deleted: false,
      deleted_at: null
    });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 5. ACTIVITY FILES CRUD
// Delete/Remove attachment
app.delete('/api/files/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fileDoc = await db.collection('activity_files').doc(id).get();
    if (fileDoc.exists) {
      const docData = fileDoc.data();
      // Remove the object from Firebase Storage
      if (docData?.storage_path) {
        try {
          await getStorage().bucket().file(docData.storage_path).delete();
        } catch (err) {
          console.warn(`Could not delete storage object ${docData.storage_path}:`, err);
        }
      }
      await db.collection('activity_files').doc(id).delete();
    }
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 6. GENERAL FILE UPLOAD API
// Files are buffered in memory by multer (see `upload` above) and streamed
// straight to Firebase Storage — local disk does not survive a Render/Railway
// redeploy, so files are never written to this server's filesystem.
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const clientId = req.query.clientId as string;
    const activityType = (req.query.activityType as string) || 'general';

    let clientSlugName = 'unnamed-client';
    if (clientId) {
      const clientDoc = await db.collection('clients').doc(clientId).get();
      if (clientDoc.exists) {
        const clientData = clientDoc.data();
        if (clientData?.client_name) {
          clientSlugName = slugify(clientData.client_name);
        }
      }
    }

    const folderName = typeMapping[activityType] || slugify(activityType);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(req.file.originalname);
    const cleanBaseName = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_');
    const storagePath = `clients/${clientSlugName}/${folderName}/${cleanBaseName}-${uniqueSuffix}${ext}`;

    const bucketFile = getStorage().bucket().file(storagePath);
    await bucketFile.save(req.file.buffer, { contentType: req.file.mimetype });
    const [url] = await bucketFile.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10 });

    res.json({
      file_name: req.file.originalname,
      file_path: url,
      storage_path: storagePath,
      file_type: req.file.mimetype
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// 7. SYSTEM DATABASE RESET
// Wipes every collection. Too destructive to expose in production regardless
// of auth — disabled there entirely rather than just access-controlled.
app.post('/api/reset', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  try {
    console.log('Failsafe Database Reset triggered...');

    // Delete clients
    const clientsRef = await db.collection('clients').get();
    const clientPromises = clientsRef.docs.map(doc => doc.ref.delete());
    
    // Delete monthly_packages
    const packagesRef = await db.collection('monthly_packages').get();
    const pkgPromises = packagesRef.docs.map(doc => doc.ref.delete());

    // Delete activities
    const activitiesRef = await db.collection('activities').get();
    const actPromises = activitiesRef.docs.map(doc => doc.ref.delete());

    // Delete users except u1 and u2
    const usersRef = await db.collection('users').get();
    const userPromises = usersRef.docs.map(doc => {
      if (doc.id !== 'u1' && doc.id !== 'u2') {
        return doc.ref.delete();
      }
      return Promise.resolve();
    });

    // Delete upload references from activity_files
    const filesRef = await db.collection('activity_files').get();
    const filePromises = filesRef.docs.map(doc => doc.ref.delete());

    await Promise.all([
      ...clientPromises,
      ...pkgPromises,
      ...actPromises,
      ...userPromises,
      ...filePromises
    ]);

    console.log('Failsafe Database Reset successfully processed.');
    res.json({ success: true, message: 'System database successfully cleared and reset to clean state.' });
  } catch (error: any) {
    console.error('Error processing failsafe reset:', error);
    res.status(500).json({ error: error.message });
  }
});


// --- INTEGRATING DEV AND PRODUCTION MODES FOR VITE ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // Allow tunneling services (e.g. ngrok) to reach the dev server so the
        // app can be shared externally without Vite's host check blocking it.
        allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'],
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // This backend runs standalone in production (the frontend deploys
    // separately to Netlify and is never built into dist/ on this host), so
    // there's no SPA build to serve here — anything outside /api/* just 404s.
    app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  // Bootstrap default users if none exist, ensuring no clients, activities, or SLA data are pre-seeded.
  async function bootstrapDefaultUsers() {
    try {
      const snapshot = await db.collection('users').limit(1).get();
      if (snapshot.empty) {
        console.log('Bootstrapping default users (Sarah Jenkins & Alex Rivera)...');
        await db.collection('users').doc('u1').set({
          name: 'Sarah Jenkins',
          email: 'admin@agency.com',
          role: 'Admin',
          is_deleted: false,
          deleted_at: null,
          created_at: new Date().toISOString()
        });
        await db.collection('users').doc('u2').set({
          name: 'Alex Rivera',
          email: 'manager@agency.com',
          role: 'Manager',
          is_deleted: false,
          deleted_at: null,
          created_at: new Date().toISOString()
        });
        console.log('Default users successfully bootstrapped.');
      }
    } catch (err) {
      console.error('Error bootstrapping default users:', err);
    }
  }

  // Start Server listening on 0.0.0.0:3000
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Agency Operations OS running at http://localhost:${PORT}`);
    await bootstrapDefaultUsers();
    await seedMongoUsers();
  });
}

startServer();
