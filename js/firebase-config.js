const firebaseConfig = {
  apiKey: "AIzaSyBMuDUY8fZFogxoGv24bQt5lawxMD9eHX0",
  authDomain: "hostel-meal-manager-3a180.firebaseapp.com",
  projectId: "hostel-meal-manager-3a180",
  storageBucket: "hostel-meal-manager-3a180.firebasestorage.app",
  messagingSenderId: "914707392802",
  appId: "1:914707392802:web:93c3b8bf5db5f6be09dd7b",
  measurementId: "G-2FHPPBYLTP"
};

let db = null;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase initialized successfully");
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

// Attach DB to window to bypass module scopes
window.db = db;
