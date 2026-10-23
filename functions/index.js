const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true }));

// Capture raw body for signature verification in Cloud Functions
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

app.use(express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

async function getAuctionRazorpayConfig(auctionId) {
    let keyId = process.env.RAZORPAY_KEY_ID || '';
    let keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    let webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

    if (auctionId) {
        try {
            const auctionDoc = await db.collection('auctions').doc(auctionId).get();
            if (auctionDoc.exists) {
                const data = auctionDoc.data() || {};
                const regConfig = data.registrationConfig || {};
                if (regConfig.razorpayKey) keyId = regConfig.razorpayKey;
                if (regConfig.razorpaySecret) keySecret = regConfig.razorpaySecret;
                if (regConfig.razorpayWebhookSecret) webhookSecret = regConfig.razorpayWebhookSecret;
            }
        } catch (err) {
            console.warn(`[Functions Razorpay] Failed to fetch auction ${auctionId} config:`, err);
        }
    }

    return { keyId, keySecret, webhookSecret };
}

async function getRazorpayClient(auctionId) {
    const config = await getAuctionRazorpayConfig(auctionId);
    if (!config.keyId || !config.keySecret) {
        throw new Error('Razorpay Key ID and Secret are not configured.');
    }
    const client = new Razorpay({
        key_id: config.keyId,
        key_secret: config.keySecret
    });
    return { client, config };
}

// 1. Create Razorpay Order
app.post('/create-razorpay-order', async (req, res) => {
    try {
        const { auctionId, registrationData } = req.body;
        if (!auctionId || !registrationData) {
            return res.status(400).json({ error: 'Missing auctionId or registrationData' });
        }

        const auctionDoc = await db.collection('auctions').doc(auctionId).get();
        if (!auctionDoc.exists) return res.status(404).json({ error: 'Auction not found' });

        const auctionData = auctionDoc.data() || {};
        const regConfig = auctionData.registrationConfig || {};
        const finalFee = Number(regConfig.fee) || 0;

        if (finalFee <= 0) {
            return res.status(400).json({ error: 'Free registration, no payment needed' });
        }

        const { client, config } = await getRazorpayClient(auctionId);
        const generatedID = registrationData.playerID || `WAR-${Math.floor(1000 + Math.random() * 9000)}`;

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
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const order = await client.orders.create({
            amount: Math.round(finalFee * 100),
            currency: 'INR',
            receipt: `reg_${regRef.id}`.slice(0, 40),
            notes: {
                auctionId: auctionId,
                registrationId: regRef.id,
                playerName: registrationData.fullName || 'Player',
                playerID: generatedID
            }
        });

        pendingSubmission.razorpayOrderId = order.id;
        await regRef.set(pendingSubmission);

        return res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: config.keyId,
            registrationId: regRef.id
        });
    } catch (err) {
        console.error('[Functions Order Error]:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 2. Razorpay Webhook
const webhookPaths = [
    '/razorpay-webhook',
    '/web-hook',
    '/webhook',
    '/api/razorpay-webhook',
    '/api/web-hook',
    '/api/webhook'
];

app.post(webhookPaths, async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const eventId = req.headers['x-razorpay-event-id'] || req.body?.id || `evt_${Date.now()}`;

        if (!signature || !req.rawBody) {
            return res.status(400).json({ error: 'Missing signature or body' });
        }

        const payload = req.body;
        const paymentEntity = payload?.payload?.payment?.entity;
        const auctionId = paymentEntity?.notes?.auctionId;
        const registrationId = paymentEntity?.notes?.registrationId;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;

        const { webhookSecret } = await getAuctionRazorpayConfig(auctionId);
        if (!webhookSecret) {
            return res.status(500).json({ error: 'Webhook secret is not configured' });
        }

        const expectedSig = crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex');
        if (expectedSig !== signature) {
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        // Idempotency
        const eventRef = db.collection('webhookEvents').doc(eventId);
        const eventDoc = await eventRef.get();
        if (eventDoc.exists && eventDoc.data()?.status === 'PROCESSED') {
            return res.status(200).json({ status: 'already_processed' });
        }

        await eventRef.set({
            eventId,
            event: payload.event,
            status: 'PROCESSING',
            receivedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (payload.event === 'payment.captured' || payload.event === 'order.paid') {
            const regRef = registrationId 
                ? db.collection('auctions').doc(auctionId).collection('registrations').doc(registrationId)
                : null;

            if (regRef) {
                const regSnap = await regRef.get();
                if (regSnap.exists && regSnap.data()?.paymentStatus !== 'PAID') {
                    const regData = regSnap.data();
                    const auctionDoc = await db.collection('auctions').doc(auctionId).get();
                    const isAutoApprove = !!auctionDoc.data()?.registrationConfig?.autoApprove;

                    await regRef.update({
                        paymentStatus: 'PAID',
                        razorpayPaymentId: paymentId,
                        razorpayOrderId: orderId,
                        amountPaid: (paymentEntity?.amount || 0) / 100,
                        status: isAutoApprove ? 'APPROVED' : 'PENDING',
                        paymentVerifiedAt: Date.now()
                    });

                    if (isAutoApprove) {
                        const playersCol = db.collection('auctions').doc(auctionId).collection('players');
                        const existing = await playersCol.where('name', '==', regData.fullName).get();
                        if (existing.empty) {
                            await playersCol.add({
                                name: regData.fullName,
                                photoUrl: regData.profilePic || '',
                                category: regData.category || 'Standard',
                                role: regData.playerType || 'All Rounder',
                                basePrice: Number(regData.basePrice) || 0,
                                nationality: 'India',
                                mobile: regData.mobile || '',
                                stats: { matches: 0, runs: 0, wickets: 0 },
                                registrationId: regRef.id
                            });
                        }
                    }
                }
            }
        }

        await eventRef.update({
            status: 'PROCESSED',
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('[Functions Webhook Error]:', err);
        return res.status(500).json({ error: err.message });
    }
});

// 3. Reconcile Payment
app.post('/reconcile-payment', async (req, res) => {
    try {
        const { auctionId, registrationId } = req.body;
        if (!auctionId || !registrationId) return res.status(400).json({ error: 'Missing parameters' });

        const regRef = db.collection('auctions').doc(auctionId).collection('registrations').doc(registrationId);
        const regSnap = await regRef.get();
        if (!regSnap.exists) return res.status(404).json({ error: 'Registration not found' });

        const regData = regSnap.data();
        const { client } = await getRazorpayClient(auctionId);

        let captured = null;
        if (regData.razorpayOrderId) {
            const list = await client.orders.fetchPayments(regData.razorpayOrderId);
            captured = (list?.items || []).find(p => p.status === 'captured');
        }

        if (captured) {
            await regRef.update({
                paymentStatus: 'PAID',
                razorpayPaymentId: captured.id,
                amountPaid: captured.amount / 100,
                paymentVerifiedAt: Date.now()
            });
            return res.json({ reconciled: true, paymentId: captured.id });
        }

        return res.json({ reconciled: false, message: 'No captured payment found in Razorpay' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

exports.api = functions.https.onRequest(app);
exports.razorpayWebhook = functions.https.onRequest(app);
