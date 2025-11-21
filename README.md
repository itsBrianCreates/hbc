# hbc
Human Behind the Curtain

## Firebase configuration

The app ships with a default Firebase project for quick demos. To point the experience to a different Firebase project (for example, the one used by your Human Behind the Curtain setup), define a `window.HBC_FIREBASE_CONFIG` object before loading `app.js`:

```html
<script>
  window.HBC_FIREBASE_CONFIG = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_DOMAIN',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_BUCKET',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
  };
</script>
<script src="app.js"></script>
```

When connected, the app shows the active Firebase project ID in the status area so you can confirm that both the manager and operator views are using the same backend.
