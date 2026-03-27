// Firebase client for mobile app
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, updateDoc, query, where, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDYUdZC13fXfuqzGZ1ZJAwnXdg3uI3Q-0E",
  authDomain: "agent-tracker-d07ed.firebaseapp.com",
  projectId: "agent-tracker-d07ed",
  storageBucket: "agent-tracker-d07ed.firebasestorage.app",
  messagingSenderId: "72283536064",
  appId: "1:72283536064:web:dc7c72c3af7f8a55b1cb25",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const agentsCol = collection(db, 'agents');
export const tripsCol = collection(db, 'trips');
export const pingsCol = collection(db, 'location_pings');
export const eventsCol = collection(db, 'agent_events');
export const alertsCol = collection(db, 'alerts');

export { doc, setDoc, getDocs, updateDoc, query, where, orderBy, limit, collection };
