import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
const initFirebase = () => {
    try {
        // Option 1: Using service account JSON file (recommended for production)
        // Uncomment and use this if you have a service account file
        /*
        const serviceAccount = require('../firebase-service-account.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
        */

        // Option 2: Using environment variables (for development)
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });

        console.log('✅ Firebase Admin initialized');
    } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
        throw error;
    }
};

// Get Firebase Storage bucket
export const getBucket = () => {
    return admin.storage().bucket();
};

// Upload file to Firebase Storage
export const uploadFile = async (filePath, destination) => {
    try {
        const bucket = getBucket();
        const [file] = await bucket.upload(filePath, {
            destination,
            metadata: {
                contentType: 'application/octet-stream',
            },
        });

        // Make file publicly accessible (optional)
        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
        return publicUrl;
    } catch (error) {
        console.error('❌ File upload error:', error.message);
        throw error;
    }
};

// Delete file from Firebase Storage
export const deleteFile = async (filePath) => {
    try {
        const bucket = getBucket();
        await bucket.file(filePath).delete();
        console.log(`✅ File deleted: ${filePath}`);
    } catch (error) {
        console.error('❌ File deletion error:', error.message);
        throw error;
    }
};

export default initFirebase;
