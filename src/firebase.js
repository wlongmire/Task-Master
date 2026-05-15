import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCQFIFTh_YfRycBIhbUPcGdiDmD9JthqVc',
  authDomain: 'task-master-e56f8.firebaseapp.com',
  projectId: 'task-master-e56f8',
  storageBucket: 'task-master-e56f8.firebasestorage.app',
  messagingSenderId: '127944364569',
  appId: '1:127944364569:web:c812adb893deda678b9088',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar');
