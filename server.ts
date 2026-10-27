import express, { Request, Response } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Razorpay from 'razorpay';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
const adminApp = getApps().length > 0 
    ? getApp() 
    : initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'sm-sports-1d8ee' });

const db = getFirestore(adminApp);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// IMPORTANT: Capture rawBody buffer for HMAC SHA256 webhook signature verification
app.use(express.json({
    limit: '20mb',
    verify: (req: any, _res, buf) => {
        req.rawBody = buf;
    }
}));

app.use(express.urlencoded({
    extended: true,
    limit: '20mb',
    verify: (req: any, _res, buf) => {
        req.rawBody = buf;
    }
}));

// =============================================================
// FIRESTORE REST API HELPERS (Bypasses container ADC permission issues)
// =============================================================
let cachedFirebaseConfig: any = null;
function getFirebaseConfig() {
    if (!cachedFirebaseConfig) {
        try {
            const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
            if (fs.existsSync(configPath)) {
                cachedFirebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (e) {
            console.warn('[Server] Could not read firebase-applet-config.json:', e);
        }
    }
    return cachedFirebaseConfig || {
        projectId: process.env.FIREBASE_PROJECT_ID || 'sm-sports-1d8ee',
        apiKey: process.env.FIREBASE_API_KEY || ''
    };
}

function parseFirestoreValue(value: any): any {
    if (!value || typeof value !== 'object') return value;
    if ('stringValue' in value) return value.stringValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('integerValue' in value) return parseInt(value.integerValue, 10);
    if ('doubleValue' in value) return parseFloat(value.doubleValue);
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('mapValue' in value) {
        const result: Record<string, any> = {};
        const fields = value.mapValue?.fields || {};
        for (const [k, v] of Object.entries(fields)) {
            result[k] = parseFirestoreValue(v);
        }
        return result;
    }
    if ('arrayValue' in value) {
        const values = value.arrayValue?.values || [];
        return values.map(parseFirestoreValue);
    }
    return value;
}

function parseFirestoreFields(fields: Record<string, any> = {}): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
        result[k] = parseFirestoreValue(v);
    }
    return result;
}

async function fetchAuctionDocViaRest(auctionId: string): Promise<any> {
    try {
        const fbConfig = getFirebaseConfig();
        const url = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/auctions/${auctionId}?key=${fbConfig.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.fields) return null;
        return parseFirestoreFields(json.fields);
    } catch (e) {
        console.warn(`[REST Fallback] Failed to fetch auction ${auctionId}:`, e);
        return null;
    }
}

async function fetchRegistrationDocViaRest(auctionId: string, registrationId: string): Promise<any> {
    try {
        const fbConfig = getFirebaseConfig();
        const url = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/auctions/${auctionId}/registrations/${registrationId}?key=${fbConfig.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.fields) return null;
        return { id: registrationId, ...parseFirestoreFields(json.fields) };
    } catch (e) {
        console.warn(`[REST Fallback] Failed to fetch registration ${registrationId}:`, e);
        return null;
    }
}

async function fetchAllRegistrationsViaRest(auctionId: string): Promise<any[]> {
    try {
        const fbConfig = getFirebaseConfig();
        const url = `https://firestore.googleapis.com/v1/projects/${fbConfig.projectId}/databases/(default)/documents/auctions/${auctionId}/registrations?key=${fbConfig.apiKey}&pageSize=1000`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        if (!json.documents || !Array.isArray(json.documents)) return [];
        return json.documents.map((doc: any) => {
            const parts = (doc.name || '').split('/');
            const id = parts[parts.length - 1];
            return { id, ...parseFirestoreFields(doc.fields || {}) };
        });
    } catch (e) {
        console.warn(`[REST Fallback] Failed to fetch registrations for ${auctionId}:`, e);
        return [];
    }
}

/**
 * Retrieve Razorpay credentials for a specific auction, falling back to server environment variables
 */
async function getAuctionRazorpayConfig(auctionId: string) {
    let keyId = process.env.RAZORPAY_KEY_ID || '';
    let keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    let webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    if (auctionId) {
        // First try REST API (which works via Firebase public read rules without requiring ADC credentials)
        let auctionData = await fetchAuctionDocViaRest(auctionId);

        // Fallback to Admin SDK if REST returned nothing
        if (!auctionData) {
            try {
                const auctionDoc = await db.collection('auctions').doc(auctionId).get();
                if (auctionDoc.exists) {
                    auctionData = auctionDoc.data() || {};
                }
            } catch (err) {
                console.warn(`[Razorpay Server] Could not fetch auction ${auctionId} config via Admin SDK:`, err);
            }
        }

        if (auctionData) {
            const regConfig = auctionData.registrationConfig || {};
            if (regConfig.razorpayKey) keyId = regConfig.razorpayKey;
            if (regConfig.razorpaySecret) keySecret = regConfig.razorpaySecret;
            if (regConfig.razorpayWebhookSecret) webhookSecret = regConfig.razorpayWebhookSecret;
        }
    }

    return { keyId, keySecret, webhookSecret };
}

/**
 * Instantiate Razorpay instance for an auction
 */
async function getRazorpayClient(auctionId: string) {
    const config = await getAuctionRazorpayConfig(auctionId);
    if (!config.keyId || !config.keySecret) {
        throw new Error('Razorpay Key ID and Key Secret are not configured. Please add them in tournament registration settings or server environment.');
    }
    const client = new Razorpay({
        key_id: config.keyId,
        key_secret: config.keySecret
    });
    return { client, config };
}

function getRazorpayErrorMessage(err: any): string {
    if (!err) return 'Unknown error';
    if (err.error && typeof err.error === 'object') {
        return err.error.description || err.error.reason || err.error.code || 'Razorpay validation failed';
    }
    return err.message || String(err);
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'SM Sports Razorpay Backend', timestamp: Date.now() });
});

/**
 * Get Webhook Setup Info for Admin UI
 */
app.get('/api/webhook-info', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');
    const webhookUrl = `${protocol}://${host}/api/razorpay-webhook`;

    res.json({
        webhookUrl,
        recommendedEvents: ['payment.captured', 'order.paid', 'payment.failed'],
        status: 'active'
    });
});

/**
 * 1. CREATE RAZORPAY ORDER & PRE-PAYMENT REGISTRATION
 * Creates a pending player registration in Firestore and generates a Razorpay Order ID securely.
 */
app.post('/api/create-razorpay-order', async (req: Request, res: Response) => {
    try {
        const { auctionId, registrationData } = req.body;

        if (!auctionId || !registrationData) {
            return res.status(400).json({ error: 'Missing auctionId or registrationData' });
        }

        // Fetch auction doc to verify state & server-authoritative fee (using REST helper first)
        let auctionData = await fetchAuctionDocViaRest(auctionId);
        if (!auctionData) {
            try {
                const auctionDoc = await db.collection('auctions').doc(auctionId).get();
                if (auctionDoc.exists) {
                    auctionData = auctionDoc.data() || {};
                }
            } catch (err) {
                console.warn(`[Create Order] Admin SDK could not fetch auction ${auctionId}:`, err);
            }
        }

        if (!auctionData) {
            return res.status(404).json({ error: 'Auction tournament not found' });
        }

        const regConfig = auctionData.registrationConfig || {};

        if (regConfig.registrationStatus === 'CLOSED') {
            return res.status(400).json({ error: 'Registrations are currently closed for this tournament' });
        }

        // Calculate server-authoritative fee
        const baseFee = Number(regConfig.fee) || 0;
        let finalFee = baseFee;

        // Apply discount if coupon/promo is supplied
        const promoCode = (registrationData.promoCodeUsed || '').toUpperCase().trim();
        if (promoCode) {
            if (['ADMIN100', 'FREE100', 'ORGANIZER100'].includes(promoCode)) {
                finalFee = 0;
            } else if (promoCode === 'DISCOUNT50') {
                finalFee = Math.max(0, Math.round(baseFee / 2));
            } else {
                // Check database registrationCodes
                try {
                    const codeSnap = await db.collection('auctions').doc(auctionId).collection('registrationCodes')
                        .where('code', '==', promoCode)
                        .get();
                    if (!codeSnap.empty) {
                        const codeDoc = codeSnap.docs[0].data();
                        if (codeDoc.isActive && (codeDoc.currentUsage || 0) < (codeDoc.usageLimit || 9999)) {
                            finalFee = 0;
                        }
                    }
                } catch (codeErr) {
                    console.warn('[Create Order] Error checking registration code:', codeErr);
                }
            }
        }

        if (finalFee <= 0) {
            return res.status(400).json({ error: 'This registration has zero fee and does not require Razorpay payment.' });
        }

        const { client, config } = await getRazorpayClient(auctionId);

        // Generate Player ID if not provided
        const generatedID = registrationData.playerID || `WAR-${Math.floor(1000 + Math.random() * 9000)}`;

        // Pre-create pending registration in Firestore
        const regRef = db.collection('auctions').doc(auctionId).collection('registrations').doc();
        const pendingSubmission = {
            ...registrationData,
            id: regRef.id,
            playerID: generatedID,
            paymentStatus: 'PENDING_PAYMENT',
            status: 'PENDING',
            amountExpected: finalFee,
            finalFeePaid: finalFee,
            currency: 'INR',
            paymentMethod: 'RAZORPAY',
            submittedAt: Date.now(),
            createdAt: FieldValue.serverTimestamp()
        };

        // Create Razorpay Order with sanitized parameters (guarantees input validation passes)
        const amountInPaise = Math.max(100, Math.round(Number(finalFee) * 100));
        const cleanReceipt = `reg_${regRef.id}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40);

        const safeNotes: Record<string, string> = {
            auctionId: String(auctionId).slice(0, 80),
            registrationId: String(regRef.id).slice(0, 80),
            playerName: String(registrationData.fullName || 'Player').slice(0, 80),
            playerMobile: String(registrationData.mobile || '').slice(0, 30),
            playerID: String(generatedID).slice(0, 30)
        };

        const order = await client.orders.create({
            amount: amountInPaise,
            currency: 'INR',
            receipt: cleanReceipt,
            notes: safeNotes
        });

        // Save Razorpay order ID to the pending registration
        pendingSubmission.razorpayOrderId = order.id;
        try {
            await regRef.set(pendingSubmission);
        } catch (setErr) {
            console.warn('[Create Order] Admin SDK could not set pending reg (client fallback active):', setErr);
        }

        console.log(`[Razorpay Order Created] Order ${order.id} for Reg ${regRef.id} in Auction ${auctionId} (₹${finalFee})`);

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: config.keyId,
            registrationId: regRef.id,
            playerID: generatedID
        });
    } catch (error: any) {
        const errorDesc = getRazorpayErrorMessage(error);
        console.warn('[Create Razorpay Order Notice]:', errorDesc);
        return res.status(400).json({ 
            error: errorDesc || 'Failed to create payment order. Please verify Razorpay credentials.' 
        });
    }
});

/**
 * Helper: Synchronize verified payment to Firestore registration and player pool
 */
async function syncVerifiedPaymentToFirestore({
    auctionId,
    registrationId,
    orderId,
    paymentId,
    amountInPaise,
    method = 'UPI'
}: {
    auctionId: string;
    registrationId?: string;
    orderId?: string;
    paymentId: string;
    amountInPaise: number;
    method?: string;
}) {
    console.log(`[Syncing Payment] Auction: ${auctionId}, Reg: ${registrationId}, Order: ${orderId}, Payment: ${paymentId}`);

    let targetRegRef: FirebaseFirestore.DocumentReference | null = null;
    let regData: any = null;

    try {
        // 1. Locate registration document by ID or Razorpay Order ID
        if (registrationId) {
            const docRef = db.collection('auctions').doc(auctionId).collection('registrations').doc(registrationId);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                targetRegRef = docRef;
                regData = docSnap.data();
            }
        }

        if (!targetRegRef && orderId) {
            const snap = await db.collection('auctions').doc(auctionId).collection('registrations')
                .where('razorpayOrderId', '==', orderId)
                .limit(1)
                .get();
            if (!snap.empty) {
                targetRegRef = snap.docs[0].ref;
                regData = snap.docs[0].data();
            }
        }

        if (!targetRegRef || !regData) {
            console.warn(`[Syncing Payment] Registration doc not found in Admin SDK for Auction: ${auctionId}, Order: ${orderId}, Reg: ${registrationId}`);
            return { updated: false, serverSynced: false, reason: 'Registration not found via Admin SDK' };
        }

        // Check if already marked as PAID to maintain idempotency
        if (regData.paymentStatus === 'PAID') {
            console.log(`[Syncing Payment] Registration ${targetRegRef.id} is ALREADY marked as PAID.`);
            return { updated: false, alreadyPaid: true, registrationId: targetRegRef.id, serverSynced: true };
        }

        // Fetch auction config to check autoApprove
        let isAutoApprove = false;
        let auctionData: any = {};
        try {
            const auctionDoc = await db.collection('auctions').doc(auctionId).get();
            auctionData = auctionDoc.data() || {};
            isAutoApprove = !!auctionData.registrationConfig?.autoApprove;
        } catch (e) {
            // fallback
        }

        // Update registration document to PAID
        const updatePayload: any = {
            paymentStatus: 'PAID',
            razorpayPaymentId: paymentId,
            paymentMethod: method,
            amountPaid: amountInPaise / 100,
            paymentVerifiedAt: Date.now(),
            updatedAt: FieldValue.serverTimestamp()
        };

        if (orderId && !regData.razorpayOrderId) {
            updatePayload.razorpayOrderId = orderId;
        }

        if (isAutoApprove && regData.status !== 'APPROVED') {
            updatePayload.status = 'APPROVED';
        }

        await targetRegRef.update(updatePayload);
        console.log(`[Syncing Payment] Registration ${targetRegRef.id} status updated to PAID.`);

        // If autoApprove, ensure player is added to the players pool without duplicates
        if (isAutoApprove) {
            try {
                const playersCol = db.collection('auctions').doc(auctionId).collection('players');
                const existingPlayers = await playersCol
                    .where('name', '==', regData.fullName)
                    .get();

                if (existingPlayers.empty) {
                    const newPlayer = {
                        name: regData.fullName,
                        photoUrl: regData.profilePic || regData.photoUrl || '',
                        category: regData.category || 'Standard',
                        role: regData.playerType || 'All Rounder',
                        basePrice: Number(regData.basePrice) || auctionData.basePrice || 0,
                        nationality: 'India',
                        mobile: regData.mobile || '',
                        gender: regData.gender || '',
                        dob: regData.dob || '',
                        jerseyName: regData.jerseyName || '',
                        jerseyNumber: regData.jerseyNumber || '',
                        jerseySize: regData.jerseySize || '',
                        speciality: regData.playerType || 'All Rounder',
                        stats: { matches: 0, runs: 0, wickets: 0 },
                        registrationId: targetRegRef.id,
                        customFields: regData
                    };
                    await playersCol.add(newPlayer);
                    console.log(`[Syncing Payment] Auto-approved player ${regData.fullName} added to player pool.`);
                }
            } catch (poolErr) {
                console.error('[Syncing Payment] Error auto-adding player to pool:', poolErr);
            }
        }

        return { updated: true, alreadyPaid: false, registrationId: targetRegRef.id, serverSynced: true };
    } catch (err: any) {
        console.warn(`[Syncing Payment] Admin SDK sync note (client SDK will finalize):`, err.message);
        return { updated: false, serverSynced: false, registrationId: targetRegRef?.id || registrationId, error: err.message };
    }
}

/**
 * 2. RAZORPAY WEBHOOK HANDLER
 * Receives Razorpay events (payment.captured, order.paid) independently of client browser or UPI app closures.
 * Enforces strict HMAC-SHA256 signature verification and idempotency via `webhookEvents/{eventId}`.
 */
const webhookEndpoints = [
    '/api/razorpay-webhook',
    '/api/razorpay-webhook/',
    '/api/web-hook',
    '/api/web-hook/',
    '/api/webhook',
    '/api/webhook/'
];

app.post(webhookEndpoints, async (req: any, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        const eventId = req.headers['x-razorpay-event-id'] as string || req.body?.event_id || req.body?.id || `evt_${Date.now()}`;

        if (!signature) {
            console.warn('[Webhook] Rejected: Missing x-razorpay-signature header');
            return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
        }

        const rawBody = req.rawBody;
        if (!rawBody) {
            console.warn('[Webhook] Rejected: Missing raw body buffer');
            return res.status(400).json({ error: 'Could not access raw body for verification' });
        }

        const payload = req.body;
        const eventName = payload?.event;
        const paymentEntity = payload?.payload?.payment?.entity;
        const orderEntity = payload?.payload?.order?.entity;

        const auctionId = paymentEntity?.notes?.auctionId || orderEntity?.notes?.auctionId;
        const registrationId = paymentEntity?.notes?.registrationId || orderEntity?.notes?.registrationId;
        const orderId = paymentEntity?.order_id || orderEntity?.id;
        const paymentId = paymentEntity?.id;

        // Fetch webhook secret for this auction
        const { webhookSecret } = await getAuctionRazorpayConfig(auctionId);

        if (!webhookSecret) {
            console.error('[Webhook] Webhook secret not configured in auction settings or server env.');
            return res.status(500).json({ error: 'Webhook secret is not configured' });
        }

        // Verify HMAC SHA256 Signature
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (expectedSignature !== signature) {
            console.error(`[Webhook] Signature verification failed! Expected: ${expectedSignature}, Received: ${signature}`);
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        console.log(`[Webhook Verified] Event: ${eventName}, EventId: ${eventId}, Order: ${orderId}, Payment: ${paymentId}`);

        // IDEMPOTENCY CHECK: Check if this event has already been processed
        const eventRef = db.collection('webhookEvents').doc(eventId);
        try {
            const eventDoc = await eventRef.get();
            if (eventDoc.exists && eventDoc.data()?.status === 'PROCESSED') {
                console.log(`[Webhook Idempotency] Event ${eventId} was already processed. Returning 200.`);
                return res.status(200).json({ status: 'already_processed', eventId });
            }

            await eventRef.set({
                eventId,
                event: eventName,
                auctionId: auctionId || null,
                orderId: orderId || null,
                paymentId: paymentId || null,
                receivedAt: FieldValue.serverTimestamp(),
                status: 'PROCESSING'
            });
        } catch (idempErr: any) {
            console.warn('[Webhook Idempotency Warning]:', idempErr.message);
        }

        // Process payment events
        if (eventName === 'payment.captured' || eventName === 'order.paid') {
            await syncVerifiedPaymentToFirestore({
                auctionId: auctionId || '',
                registrationId,
                orderId,
                paymentId: paymentId || '',
                amountInPaise: paymentEntity?.amount || orderEntity?.amount || 0,
                method: paymentEntity?.method || 'UPI'
            });
        } else if (eventName === 'payment.failed') {
            console.warn(`[Webhook Payment Failed] Payment ${paymentId} failed for order ${orderId}:`, paymentEntity?.error_description);
            if (auctionId && registrationId) {
                try {
                    await db.collection('auctions').doc(auctionId).collection('registrations').doc(registrationId).update({
                        paymentStatus: 'FAILED',
                        lastPaymentError: paymentEntity?.error_description || 'Payment failed',
                        updatedAt: FieldValue.serverTimestamp()
                    });
                } catch (e) {
                    console.error('[Webhook] Could not mark registration as FAILED:', e);
                }
            }
        }

        // Mark webhook event as PROCESSED
        try {
            await eventRef.update({
                status: 'PROCESSED',
                processedAt: FieldValue.serverTimestamp()
            });
        } catch (procErr: any) {
            console.warn('[Webhook Update Warning]:', procErr.message);
        }

        return res.status(200).json({ status: 'ok', eventId });
    } catch (error: any) {
        console.error('[Webhook Processing Error]:', error);
        return res.status(500).json({ error: error.message || 'Internal webhook error' });
    }
});

/**
 * 3. CLIENT-SIDE PAYMENT VERIFICATION FALLBACK
 * Called by checkout handler if player stays on the page after payment.
 */
app.post('/api/verify-payment', async (req: Request, res: Response) => {
    try {
        const { auctionId, registrationId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        if (!auctionId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ error: 'Missing payment verification details' });
        }

        const { config, client } = await getRazorpayClient(auctionId);

        // Verify Razorpay Payment Signature
        const expectedSign = crypto
            .createHmac('sha256', config.keySecret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSign !== razorpaySignature) {
            return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
        }

        // Fetch payment details from Razorpay to verify captured status
        const payment = await client.payments.fetch(razorpayPaymentId);
        if (payment.status !== 'captured') {
            return res.status(400).json({ error: `Payment is not in captured state. Current state: ${payment.status}` });
        }

        const syncResult = await syncVerifiedPaymentToFirestore({
            auctionId,
            registrationId,
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
            amountInPaise: Number(payment.amount),
            method: payment.method || 'UPI'
        });

        return res.json({
            success: true,
            paymentId: razorpayPaymentId,
            orderId: razorpayOrderId,
            amount: Number(payment.amount) / 100,
            status: payment.status,
            method: payment.method || 'UPI',
            ...syncResult
        });
    } catch (error: any) {
        const errorDesc = getRazorpayErrorMessage(error);
        console.warn('[Verify Payment Warning]:', errorDesc);
        return res.status(400).json({ error: errorDesc || 'Payment verification failed' });
    }
});

/**
 * 4. RECONCILIATION API
 * Resolves Requirement 8: Inspects existing payments that succeeded on Razorpay but were not synchronized
 * to Firestore registrations due to browser/app closures.
 */
app.post(['/api/reconcile-payment', '/reconcile-payment'], async (req: Request, res: Response) => {
    try {
        const { auctionId, registrationId, razorpayOrderId, razorpayPaymentId } = req.body;

        if (!auctionId) {
            return res.status(400).json({ error: 'auctionId is required' });
        }

        const { client } = await getRazorpayClient(auctionId);

        // Case A: Specific registration reconciliation
        if (registrationId || razorpayOrderId || razorpayPaymentId) {
            let orderIdToFetch = razorpayOrderId;
            let paymentIdToFetch = razorpayPaymentId;

            if (registrationId && !orderIdToFetch && !paymentIdToFetch) {
                // Try REST helper first to avoid Admin SDK PERMISSION_DENIED
                const restReg = await fetchRegistrationDocViaRest(auctionId, registrationId);
                if (restReg) {
                    orderIdToFetch = restReg.razorpayOrderId;
                    paymentIdToFetch = restReg.razorpayPaymentId;
                } else {
                    try {
                        const regDoc = await db.collection('auctions').doc(auctionId).collection('registrations').doc(registrationId).get();
                        if (regDoc.exists) {
                            const data = regDoc.data();
                            orderIdToFetch = data?.razorpayOrderId;
                            paymentIdToFetch = data?.razorpayPaymentId;
                        }
                    } catch (e) {
                        // ignore
                    }
                }
            }

            let capturedPayment: any = null;

            if (paymentIdToFetch && typeof paymentIdToFetch === 'string' && paymentIdToFetch.trim().startsWith('pay_')) {
                try {
                    const cleanPaymentId = paymentIdToFetch.trim();
                    const p = await client.payments.fetch(cleanPaymentId);
                    if (p && p.status === 'captured') capturedPayment = p;
                } catch (e: any) {
                    const desc = getRazorpayErrorMessage(e);
                    console.warn(`[Reconcile] Notice: Payment ID ${paymentIdToFetch} not found or invalid on Razorpay (${desc})`);
                }
            }

            if (!capturedPayment && orderIdToFetch && typeof orderIdToFetch === 'string' && orderIdToFetch.trim().startsWith('order_')) {
                try {
                    const cleanOrderId = orderIdToFetch.trim();
                    const paymentsList = await client.orders.fetchPayments(cleanOrderId);
                    const items = paymentsList?.items || [];
                    capturedPayment = items.find((p: any) => p.status === 'captured');
                } catch (e: any) {
                    const desc = getRazorpayErrorMessage(e);
                    console.warn(`[Reconcile] Notice: Order ID ${orderIdToFetch} payments could not be fetched (${desc})`);
                }
            }

            if (!capturedPayment) {
                return res.json({ 
                    reconciled: false, 
                    message: 'No captured payment found in Razorpay for the given details. You can use "Mark Paid" to approve manually.' 
                });
            }

            const syncResult = await syncVerifiedPaymentToFirestore({
                auctionId,
                registrationId,
                orderId: orderIdToFetch || capturedPayment.order_id,
                paymentId: capturedPayment.id,
                amountInPaise: Number(capturedPayment.amount),
                method: capturedPayment.method || 'UPI'
            });

            return res.json({
                reconciled: true,
                paymentId: capturedPayment.id,
                orderId: orderIdToFetch || capturedPayment.order_id,
                amount: capturedPayment.amount / 100,
                status: capturedPayment.status,
                method: capturedPayment.method || 'UPI',
                registrationId: registrationId || syncResult.registrationId,
                syncResult
            });
        }

        // Case B: Bulk Reconciliation for all PENDING_PAYMENT registrations of this auction
        // Fetch registrations via REST to avoid Admin SDK permission issues
        let pendingList: any[] = [];
        const allRegistrations = await fetchAllRegistrationsViaRest(auctionId);
        if (allRegistrations.length > 0) {
            pendingList = allRegistrations.filter(r => r.paymentStatus === 'PENDING_PAYMENT');
        } else {
            try {
                const pendingSnap = await db.collection('auctions').doc(auctionId).collection('registrations')
                    .where('paymentStatus', '==', 'PENDING_PAYMENT')
                    .get();
                pendingList = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err: any) {
                console.warn('[Reconcile Bulk] Admin SDK pending query warning:', err.message);
            }
        }

        const results = [];
        const reconciledItems = [];

        for (const reg of pendingList) {
            const orderId = reg.razorpayOrderId;
            if (!orderId || typeof orderId !== 'string' || !orderId.trim().startsWith('order_')) continue;

            try {
                const paymentsList = await client.orders.fetchPayments(orderId.trim());
                const captured = (paymentsList?.items || []).find((p: any) => p.status === 'captured');

                if (captured) {
                    await syncVerifiedPaymentToFirestore({
                        auctionId,
                        registrationId: reg.id,
                        orderId,
                        paymentId: captured.id,
                        amountInPaise: Number(captured.amount),
                        method: captured.method || 'UPI'
                    });
                    const item = {
                        registrationId: reg.id,
                        playerName: reg.fullName,
                        orderId,
                        paymentId: captured.id,
                        amount: Number(captured.amount) / 100,
                        method: captured.method || 'UPI',
                        status: 'RECONCILED_TO_PAID'
                    };
                    results.push(item);
                    reconciledItems.push(item);
                } else {
                    results.push({ registrationId: reg.id, playerName: reg.fullName, status: 'NO_PAYMENT_FOUND' });
                }
            } catch (err: any) {
                const desc = getRazorpayErrorMessage(err);
                results.push({ registrationId: reg.id, playerName: reg.fullName, status: 'ERROR', error: desc });
            }
        }

        return res.json({
            reconciledCount: reconciledItems.length,
            totalChecked: pendingList.length,
            reconciledItems,
            details: results
        });
    } catch (error: any) {
        const desc = getRazorpayErrorMessage(error);
        console.warn('[Reconcile Notice]:', desc);
        return res.status(200).json({ 
            reconciled: false, 
            message: desc || 'Reconciliation check completed without matches.',
            error: desc
        });
    }
});

// -------------------------------------------------------------
// VITE DEV SERVER / STATIC ASSETS
// -------------------------------------------------------------
async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.resolve(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path.resolve(distPath, 'index.html'));
        });
    }

    app.listen(PORT, () => {
        console.log(`[SM Sports Server] Running on http://localhost:${PORT}`);
        console.log(`[Razorpay Webhook Endpoint] Ready at /api/razorpay-webhook`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
});
