import admin from 'firebase-admin';
import { env } from './env.js';

let app;

export function getFirebaseAuth() {
  if (!app) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.firebase.projectId,
        clientEmail: env.firebase.clientEmail,
        privateKey: env.firebase.privateKey
      })
    });
  }

  return admin.auth(app);
}

