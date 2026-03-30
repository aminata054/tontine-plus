importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBTg6UPK_YJvO-9JNITM08rOUd3P_Ob0aw",
    authDomain: "tontine-plus-dc217.firebaseapp.com",
    projectId: "tontine-plus-dc217",           
    storageBucket: "tontine-plus-dc217.firebasestorage.app",
    messagingSenderId: "352478578265",
    appId: "1:352478578265:web:31a0ba8584ad631e3ed348",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification ?? {};
    self.registration.showNotification(title ?? 'Notification', {
        body: body ?? '',
        icon: '/assets/icon/favicon.png',
    });
});