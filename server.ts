import 'dotenv/config';
import express from 'express';
import path from 'path';
import multer from 'multer';
import admin from 'firebase-admin';
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
// Render free instance warm). Declared before express.json(), auth, and any
// other middleware so it returns instantly with no I/O. Pings to this path
// are intentionally not logged.
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.json());

// --- FIREBASE ADMIN CREDENTIALS (Auth + Storage only — no Firestore) ---
// admin.initializeApp() with no `credential` falls back to Application Default
// Credentials, which only resolves automatically on Google Cloud (via the
// metadata service). Off-GCP hosts (Render, Railway, etc.) need an explicit
// service account. Provide one via FIREBASE_SERVICE_ACCOUNT (base64 JSON);
// applicationDefault() remains the fallback for GCP-hosted/local-gcloud setups.
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
const firebaseCredential = serviceAccountRaw
  ? admin.credential.cert(JSON.parse(Buffer.from(serviceAccountRaw, 'base64').toString('utf8')))
  : admin.credential.applicationDefault();

const AUTH_PROJECT_ID = process.env.FIREBASE_AUTH_PROJECT_ID;

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: firebaseCredential,
      projectId: AUTH_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    console.log('Firebase Admin initialized with project:', AUTH_PROJECT_ID);
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
  }
}

// Firebase is only used for login (email/password) and file storage now —
// all application data lives in MongoDB. See connectMongo() below.
const firebaseAuth = admin.auth();

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

// --- REQUIRE ADMIN MIDDLEWARE ---
// Account/role management is Admin-only. Resolves the caller's app-level user
// record from their verified Firebase identity and rejects non-Admins.
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const email = ((req as any).firebaseUser?.email || '').toLowerCase();
    const usersColl = await mongoColl('users');
    const appUser = await usersColl.findOne({ email });
    if (!appUser || appUser.is_deleted || appUser.role !== 'Admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    (req as any).appUser = appUser;
    next();
  } catch (error: any) {
    sendError(res, error);
  }
}

// --- MONGODB (the only database — clients, packages, activities, activity
// files, users, tasks, and invoices all live here) ---
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'agency_os';
let mongoDb: MongoDb | null = null;

async function connectMongo(): Promise<MongoDb | null> {
  if (mongoDb) return mongoDb;
  if (!MONGODB_URI) {
    console.warn('MONGODB_URI not set — the database is disabled.');
    return null;
  }
  try {
    // family: 4 forces IPv4 — on Render, IPv6/dual-stack DNS resolution to
    // Atlas's SRV-resolved hosts can break the TLS handshake with exactly the
    // "tlsv1 alert internal error" seen there. Pinning to IPv4 avoids it.
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000, family: 4 });
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
    const err: any = new Error('Database is unavailable');
    err.statusCode = 503;
    throw err;
  }
  return m.collection(name);
}

// Shared error responder for the Mongo-backed routes.
function sendError(res: express.Response, error: any) {
  if (error?.code === 11000) {
    return res.status(400).json({ error: 'A record with this value already exists' });
  }
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

// Seed the one fixed system role if the roles collection is empty. Custom
// roles are created by Admins afterward via POST /api/roles.
async function seedDefaultRoles() {
  const m = await connectMongo();
  if (!m) return;
  const count = await m.collection('roles').countDocuments();
  if (count === 0) {
    await m.collection('roles').insertOne({
      id: 'role-admin',
      name: 'Admin',
      is_admin: true,
      is_system: true,
      created_at: new Date().toISOString(),
    });
  }
}

// Seed a single bootstrap Admin account — both the Mongo record and a real
// Firebase Auth login — if the users collection is empty. Account creation
// is otherwise Admin-only (see POST /api/users), so this is the one way in
// on a fresh database. Change this password immediately after first login.
const ADMIN_STARTER_PASSWORD = process.env.ADMIN_STARTER_PASSWORD || 'ChangeMe123!';

async function seedDefaultUsers() {
  const m = await connectMongo();
  if (!m) return;
  const count = await m.collection('users').countDocuments();
  if (count === 0) {
    const email = 'admin@agency.com';
    const name = 'Sarah Jenkins';
    console.log('Seeding bootstrap Admin account...');

    let uid: string;
    try {
      const created = await firebaseAuth.createUser({ email, password: ADMIN_STARTER_PASSWORD, displayName: name });
      uid = created.uid;
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        uid = (await firebaseAuth.getUserByEmail(email)).uid;
      } else {
        throw err;
      }
    }

    await m.collection('users').insertOne({
      id: 'u1',
      name,
      email,
      role: 'Admin',
      firebase_uid: uid,
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString(),
    });
    console.log(`Bootstrap Admin seeded — log in with ${email} / ${ADMIN_STARTER_PASSWORD} and change the password immediately.`);
  }
}

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
    const coll = await mongoColl('clients');
    const clients = await coll.find({ is_deleted: { $ne: true } }).toArray();
    res.json(clients.map(({ _id, ...c }) => c));
  } catch (error) { sendError(res, error); }
});

// Read deleted as well (Admin Restore views)
app.get('/api/clients/all', async (req, res) => {
  try {
    const coll = await mongoColl('clients');
    const clients = await coll.find({}).toArray();
    res.json(clients.map(({ _id, ...c }) => c));
  } catch (error) { sendError(res, error); }
});

// Create
app.post('/api/clients', async (req, res) => {
  try {
    const coll = await mongoColl('clients');
    const { client_name, logo_url, industry, start_date, status, priority } = req.body;
    if (!client_name) {
      return res.status(400).json({ error: 'Client name is required' });
    }
    const id = `c-${Date.now()}`;
    const newClient = {
      id,
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
    await coll.insertOne({ ...newClient });
    res.status(211).json(newClient);
  } catch (error) { sendError(res, error); }
});

// Update
app.put('/api/clients/:id', async (req, res) => {
  try {
    const coll = await mongoColl('clients');
    const { id } = req.params;
    const body = req.body;
    const updateData: any = {};
    const editableFields = ['client_name', 'logo_url', 'industry', 'start_date', 'status', 'priority'];
    editableFields.forEach(field => {
      if (body[field] !== undefined) updateData[field] = body[field];
    });

    await coll.updateOne({ id }, { $set: updateData });
    res.json({ id, ...updateData });
  } catch (error) { sendError(res, error); }
});

// Soft Delete
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const coll = await mongoColl('clients');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});

// Restore Client
app.post('/api/clients/:id/restore', async (req, res) => {
  try {
    const coll = await mongoColl('clients');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: false, deleted_at: null } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});


// 2. RETAINER / MONTHLY PACKAGES CRUD
// List active packages
app.get('/api/packages', async (req, res) => {
  try {
    const coll = await mongoColl('monthly_packages');
    const pkgs = await coll.find({ is_deleted: { $ne: true } }).toArray();
    res.json(pkgs.map(({ _id, ...p }) => p));
  } catch (error) { sendError(res, error); }
});

// List all (included deleted)
app.get('/api/packages/all', async (req, res) => {
  try {
    const coll = await mongoColl('monthly_packages');
    const pkgs = await coll.find({}).toArray();
    res.json(pkgs.map(({ _id, ...p }) => p));
  } catch (error) { sendError(res, error); }
});

// Create package
app.post('/api/packages', async (req, res) => {
  try {
    const coll = await mongoColl('monthly_packages');
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
      id,
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
    await coll.insertOne({ ...newPkg });
    res.status(211).json(newPkg);
  } catch (error) { sendError(res, error); }
});

// Update package
app.put('/api/packages/:id', async (req, res) => {
  try {
    const coll = await mongoColl('monthly_packages');
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

    await coll.updateOne({ id }, { $set: updateData });
    res.json({ id, ...updateData });
  } catch (error) { sendError(res, error); }
});

// Soft Delete package
app.delete('/api/packages/:id', async (req, res) => {
  try {
    const coll = await mongoColl('monthly_packages');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});

// Restore package
app.post('/api/packages/:id/restore', async (req, res) => {
  try {
    const coll = await mongoColl('monthly_packages');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: false, deleted_at: null } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});


// 3. ACTIVITIES AND ATTACHED FILES CRUD
// List active activities along with associated files
app.get('/api/activities', async (req, res) => {
  try {
    const actColl = await mongoColl('activities');
    const fileColl = await mongoColl('activity_files');
    const activities = await actColl.find({ is_deleted: { $ne: true } }).toArray();
    const files = await fileColl.find({}).toArray();

    const filesMap: Record<string, any[]> = {};
    files.forEach(({ _id, ...f }) => {
      if (f.activity_id) {
        if (!filesMap[f.activity_id]) filesMap[f.activity_id] = [];
        filesMap[f.activity_id].push(f);
      }
    });

    res.json(activities.map(({ _id, ...a }) => ({ ...a, files: filesMap[a.id] || [] })));
  } catch (error) { sendError(res, error); }
});

// List all (incl. deleted)
app.get('/api/activities/all', async (req, res) => {
  try {
    const coll = await mongoColl('activities');
    const activities = await coll.find({}).toArray();
    res.json(activities.map(({ _id, ...a }) => a));
  } catch (error) { sendError(res, error); }
});

// Create Activity
app.post('/api/activities', async (req, res) => {
  try {
    const coll = await mongoColl('activities');
    const filesColl = await mongoColl('activity_files');
    const body = req.body;
    const {
      client_id, activity_type, sub_type, stage, title, description,
      drive_link, activity_date, created_by, remarks, blog_title, blog_url,
      client_feedback, approval_status, priority, estimated_completion, attached_files
    } = body;

    if (!client_id || !activity_type || !title || !activity_date) {
      return res.status(400).json({ error: 'client_id, activity_type, title, and activity_date are required' });
    }

    // Auto-compute unique activity code for that year. Scans every activity
    // (including soft-deleted ones) so codes are never reused.
    const actYear = activity_date.split('-')[0] || '2026';
    const sameYearCodes = await coll.find({ activity_id_code: { $regex: `^ACT-${actYear}-` } }).toArray();
    let maxNum = 0;
    sameYearCodes.forEach(doc => {
      const parts = (doc.activity_id_code || '').split('-');
      const num = parseInt(parts[2], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    });

    const paddedCounter = String(maxNum + 1).padStart(4, '0');
    const activity_id_code = `ACT-${actYear}-${paddedCounter}`;
    const id = `act-${Date.now()}`;

    const newActivity = {
      id,
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

    await coll.insertOne({ ...newActivity });

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
        await filesColl.insertOne({ ...record });
        registeredFiles.push(record);
      }
    }

    res.status(211).json({ ...newActivity, files: registeredFiles });
  } catch (error) { sendError(res, error); }
});

// Update Activity
app.put('/api/activities/:id', async (req, res) => {
  try {
    const coll = await mongoColl('activities');
    const filesColl = await mongoColl('activity_files');
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

    await coll.updateOne({ id }, { $set: updateData });

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
          await filesColl.insertOne({ ...record });
          registeredFiles.push(record);
        }
      }
    }

    res.json({ id, ...updateData, newFiles: registeredFiles });
  } catch (error) { sendError(res, error); }
});

// Soft Delete Activity
app.delete('/api/activities/:id', async (req, res) => {
  try {
    const coll = await mongoColl('activities');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});

// Restore Activity
app.post('/api/activities/:id/restore', async (req, res) => {
  try {
    const coll = await mongoColl('activities');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: false, deleted_at: null } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});


// 4. USERS CRUD (Manager and Admin users)
// --- AUTHENTICATION ---
// Resolve the signed-in Firebase user to an application account in MongoDB.
// The client sends the Firebase ID token; we verify it, then look up (or
// lazily create) the matching user record and return it with their role.
// This is the same `users` collection the CRUD routes below operate on, so
// there's a single source of truth for accounts.
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

    const usersColl = await mongoColl('users');
    const user = await usersColl.findOne({ email });

    if (!user) {
      // Accounts are provisioned exclusively by an Admin via POST /api/users.
      // A missing record means this Firebase identity was never registered.
      return res.status(404).json({ error: 'No account found for this identity. Contact an administrator.' });
    }
    if (user.is_deleted) {
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
    sendError(res, error);
  }
});

// NOTE: self-service signup has been removed. Accounts (and their Firebase
// Auth login) are created exclusively by an Admin via POST /api/users below.

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
    const coll = await mongoColl('users');
    const users = await coll.find({ is_deleted: { $ne: true } }).toArray();
    res.json(users.map(({ _id, ...u }) => u));
  } catch (error) { sendError(res, error); }
});

// List all including deleted users
app.get('/api/users/all', async (req, res) => {
  try {
    const coll = await mongoColl('users');
    const users = await coll.find({}).toArray();
    res.json(users.map(({ _id, ...u }) => u));
  } catch (error) { sendError(res, error); }
});

// A role is valid if it's the fixed Admin role or an existing custom role.
async function isValidRole(role: string): Promise<boolean> {
  if (role === 'Admin') return true;
  const rolesColl = await mongoColl('roles');
  return !!(await rolesColl.findOne({ name: role }));
}

// Create User — Admin-only. Provisions a real Firebase Auth login with the
// password the Admin sets, then records the matching app user in Mongo.
app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, and role are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!(await isValidRole(role))) {
      return res.status(400).json({ error: `Unknown role '${role}'` });
    }

    const normalizedEmail = String(email).toLowerCase();
    const coll = await mongoColl('users');

    let firebaseUid: string;
    try {
      const created = await firebaseAuth.createUser({ email: normalizedEmail, password, displayName: name });
      firebaseUid = created.uid;
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        return res.status(400).json({ error: 'A login already exists for this email' });
      }
      throw err;
    }

    const id = `u-${Date.now()}`;
    const newUser = {
      id,
      name,
      email: normalizedEmail,
      role,
      firebase_uid: firebaseUid,
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString()
    };
    try {
      await coll.insertOne({ ...newUser });
    } catch (err) {
      // Don't leave an orphaned Firebase login with no app record behind.
      await firebaseAuth.deleteUser(firebaseUid).catch(() => {});
      throw err;
    }
    res.status(201).json(newUser);
  } catch (error) { sendError(res, error); }
});

// Update User — Admin-only. Optionally resets the operator's password.
app.put('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const coll = await mongoColl('users');
    const { id } = req.params;
    const { name, email, role, password } = req.body;

    if (role !== undefined && !(await isValidRole(role))) {
      return res.status(400).json({ error: `Unknown role '${role}'` });
    }

    const target = await coll.findOne({ id });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedEmail = email !== undefined ? String(email).toLowerCase() : undefined;
    const emailChanged = normalizedEmail !== undefined && normalizedEmail !== target.email;

    if (password !== undefined && password !== '') {
      if (String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      if (!target.firebase_uid) {
        return res.status(400).json({ error: 'This account has no linked login to reset' });
      }
      await firebaseAuth.updateUser(target.firebase_uid, { password });
    }

    // Keep the Firebase Auth login in sync — the app resolves identity by
    // email (see /api/auth/me), so letting these drift apart would lock the
    // operator out under their old email while the new one has no login.
    if (emailChanged) {
      if (!target.firebase_uid) {
        return res.status(400).json({ error: 'This account has no linked login to update' });
      }
      try {
        await firebaseAuth.updateUser(target.firebase_uid, { email: normalizedEmail });
      } catch (err: any) {
        if (err.code === 'auth/email-already-exists') {
          return res.status(400).json({ error: 'A login already exists for this email' });
        }
        throw err;
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (normalizedEmail !== undefined) updateData.email = normalizedEmail;
    if (role !== undefined) updateData.role = role;

    await coll.updateOne({ id }, { $set: updateData });
    res.json({ id, ...updateData });
  } catch (error) { sendError(res, error); }
});

// Soft Delete User — Admin-only.
app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const coll = await mongoColl('users');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: true, deleted_at: new Date().toISOString() } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});

// Restore User — Admin-only.
app.post('/api/users/:id/restore', requireAdmin, async (req, res) => {
  try {
    const coll = await mongoColl('users');
    const { id } = req.params;
    await coll.updateOne({ id }, { $set: { is_deleted: false, deleted_at: null } });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});

// 4b. ROLES — the fixed "Admin" role plus Admin-created custom roles. Every
// custom role carries the same (non-Admin) access level; they only exist to
// give staff accounts a meaningful label instead of being stuck with "Manager".
app.get('/api/roles', async (req, res) => {
  try {
    const coll = await mongoColl('roles');
    const roles = await coll.find({}).sort({ is_system: -1, name: 1 }).toArray();
    res.json(roles.map(({ _id, ...r }) => r));
  } catch (error) { sendError(res, error); }
});

app.post('/api/roles', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const trimmed = String(name).trim();
    if (trimmed.toLowerCase() === 'admin') {
      return res.status(400).json({ error: "'Admin' is a reserved system role" });
    }
    const coll = await mongoColl('roles');
    const existing = await coll.findOne({ name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
    if (existing) {
      return res.status(400).json({ error: 'A role with this name already exists' });
    }
    const newRole = {
      id: `role-${Date.now()}`,
      name: trimmed,
      is_admin: false,
      is_system: false,
      created_at: new Date().toISOString(),
    };
    await coll.insertOne({ ...newRole });
    res.status(201).json(newRole);
  } catch (error) { sendError(res, error); }
});

app.delete('/api/roles/:id', requireAdmin, async (req, res) => {
  try {
    const coll = await mongoColl('roles');
    const { id } = req.params;
    const role = await coll.findOne({ id });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    if (role.is_system) {
      return res.status(400).json({ error: 'The Admin system role cannot be deleted' });
    }
    const usersColl = await mongoColl('users');
    const inUse = await usersColl.countDocuments({ role: role.name, is_deleted: { $ne: true } });
    if (inUse > 0) {
      return res.status(400).json({ error: `${inUse} user(s) still have this role assigned. Reassign them first.` });
    }
    await coll.deleteOne({ id });
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
});


// 5. ACTIVITY FILES CRUD
// Delete/Remove attachment
app.delete('/api/files/:id', async (req, res) => {
  try {
    const coll = await mongoColl('activity_files');
    const { id } = req.params;
    const fileDoc = await coll.findOne({ id });
    if (fileDoc) {
      // Remove the object from Firebase Storage
      if (fileDoc.storage_path) {
        try {
          await getStorage().bucket().file(fileDoc.storage_path).delete();
        } catch (err) {
          console.warn(`Could not delete storage object ${fileDoc.storage_path}:`, err);
        }
      }
      await coll.deleteOne({ id });
    }
    res.json({ success: true, id });
  } catch (error) { sendError(res, error); }
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
      const clientsColl = await mongoColl('clients');
      const client = await clientsColl.findOne({ id: clientId });
      if (client?.client_name) {
        clientSlugName = slugify(client.client_name);
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
    sendError(res, error);
  }
});


// 7. SYSTEM DATABASE RESET
// Wipes every collection. Too destructive to expose in production regardless
// of auth — disabled there entirely rather than just access-controlled.
app.post('/api/reset', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).end();
  try {
    console.log('Failsafe Database Reset triggered...');

    const [clientsColl, pkgColl, actColl, filesColl, usersColl] = await Promise.all([
      mongoColl('clients'),
      mongoColl('monthly_packages'),
      mongoColl('activities'),
      mongoColl('activity_files'),
      mongoColl('users'),
    ]);

    await Promise.all([
      clientsColl.deleteMany({}),
      pkgColl.deleteMany({}),
      actColl.deleteMany({}),
      filesColl.deleteMany({}),
      usersColl.deleteMany({ id: { $nin: ['u1', 'u2'] } }),
    ]);

    console.log('Failsafe Database Reset successfully processed.');
    res.json({ success: true, message: 'System database successfully cleared and reset to clean state.' });
  } catch (error: any) {
    console.error('Error processing failsafe reset:', error);
    sendError(res, error);
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

  // Start Server listening on 0.0.0.0:3000
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Agency Operations OS running at http://localhost:${PORT}`);
    await seedDefaultRoles();
    await seedDefaultUsers();
  });
}

startServer();
