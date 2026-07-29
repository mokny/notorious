import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();

console.warn("Add these to your .env file:\n");
console.warn(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.warn(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
