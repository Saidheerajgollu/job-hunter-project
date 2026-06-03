/**
 * Web Push Notifications (web-push / VAPID)
 *
 * VAPID keys are generated once on first use and stored in the settings table.
 * The client fetches the public key, subscribes via the Push API, and sends the
 * subscription object here. We fan out to all stored subscriptions when a new
 * job is detected.
 */

import webpush from 'web-push';
import { getSetting, upsertSetting, getAllPushSubscriptions, deletePushSubscription } from '../db.js';

let initialized = false;
let cachedPublicKey = null;

export async function initPush() {
    let pubKey = await getSetting('vapid_public_key');
    let privKey = await getSetting('vapid_private_key');

    if (!pubKey || !privKey) {
        const keys = webpush.generateVAPIDKeys();
        pubKey = keys.publicKey;
        privKey = keys.privateKey;
        await upsertSetting('vapid_public_key', pubKey);
        await upsertSetting('vapid_private_key', privKey);
        console.log('🔑 Generated new VAPID keys');
    }

    const contactEmail = process.env.PUSH_CONTACT_EMAIL || 'mailto:admin@example.com';
    webpush.setVapidDetails(
        contactEmail.startsWith('mailto:') ? contactEmail : `mailto:${contactEmail}`,
        pubKey,
        privKey
    );
    initialized = true;
    cachedPublicKey = pubKey;
    return pubKey;
}

export function getVapidPublicKey() {
    return cachedPublicKey;
}

export async function sendPushToAll(payload) {
    if (!initialized) await initPush();

    const subscriptions = await getAllPushSubscriptions();
    if (subscriptions.length === 0) return 0;

    const message = JSON.stringify(payload);
    let sent = 0;

    await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    message
                );
                sent++;
            } catch (err) {
                // 410 Gone = subscription expired/revoked — clean it up
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await deletePushSubscription(sub.endpoint);
                } else {
                    console.error(`Push send failed: ${err.message}`);
                }
            }
        })
    );

    return sent;
}
