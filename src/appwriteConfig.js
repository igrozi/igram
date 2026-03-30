import { Client, Account, Databases, Storage as AppwriteStorage } from 'appwrite';

export const PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || '69a1531a00147736f2c1';
export const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || '69aaff07003b6b3a678c';

export const COLLECTION_ID_MESSAGES = 'messages';
export const COLLECTION_ID_PROFILES = 'profiles';
export const COLLECTION_ID_POSTS = 'posts';
export const COLLECTION_ID_COMMENTS = 'comments';
export const COLLECTION_ID_RATINGS = 'ratings';

export const BUCKET_ID_AVATARS = 'general';
export const BUCKET_ID_CHAT_IMAGES = 'general';
export const BUCKET_ID_POSTS = 'general';
    
const client = new Client();

client
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(PROJECT_ID)

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new AppwriteStorage(client);

export { client };