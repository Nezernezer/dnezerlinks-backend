// public/firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyAXWh3ls4yEANmGy4g7xZ8jlBN0KoFC5yc",
    authDomain: "dnezerlinks.firebaseapp.com",
    databaseURL: "https://dnezerlinks-default-rtdb.firebaseio.com",
    projectId: "dnezerlinks",
    storageBucket: "dnezerlinks.appspot.com",
    messagingSenderId: "1028450580168",
    appId: "1:1028450580168:web:d7a48462a128f02aa657fd"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Create global shortcuts for your other scripts to use
const auth = firebase.auth();
const database = firebase.database();
const functions = firebase.functions(); // Added this for your fund-wallet page
