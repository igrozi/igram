import { Client, Account, Databases, Storage as AppwriteStorage } from 'appwrite';

export const PROJECT_ID = '69a1531a00147736f2c1'; // 696a59300034b9409488 (docker) | 69a1531a00147736f2c1 (server)
export const DATABASE_ID = '69aaff07003b6b3a678c'; // 696a5a810011a80a958d (docker) | 69aaff07003b6b3a678c (server)

export const COLLECTION_ID_MESSAGES = 'messages';
export const COLLECTION_ID_PROFILES = 'profiles';
export const COLLECTION_ID_POSTS = 'posts';
export const COLLECTION_ID_COMMENTS = 'comments';
export const COLLECTION_ID_RATINGS = 'ratings';

export const BUCKET_ID_AVATARS = 'general'; // 696d1fa3001a5250a11a (docker) | general (server)
export const BUCKET_ID_CHAT_IMAGES = 'general'; // 696fcdab0030481cd240 (docker) | general (server)
export const BUCKET_ID_POSTS = 'general'; // 69710a470002d70a08c3 (docker) | general (server)
    
const client = new Client();

client
    .setEndpoint('https://cloud.appwrite.io/v1') // 'http://localhost/v1' (docker) | 'https://cloud.appwrite.io/v1' (server)
    .setProject(PROJECT_ID)

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new AppwriteStorage(client);

export { client };