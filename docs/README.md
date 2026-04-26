# pizdep

This folder is the trimmed frontend package for GitHub Pages.

Files at the top level:
- `index.html`
- `runtime-config.js`
- `backend-env.example`
- `README.md`
- `static/`

Before publishing:
1. If you want the full live app, deploy the backend separately and set `apiBaseUrl` in `runtime-config.js` to the deployed `/api` URL.
2. If you do not set `apiBaseUrl`, GitHub Pages will run in demo mode automatically with browser-stored data, mock Razorpay, and test OTP codes.
3. Use the demo logins on the deployed site:
   User: `demo@pizzapalette.app` / `demo123`
   Admin: `admin@pizzapalette.app` / `admin123`
4. Demo codes:
   Email verification: `123456`
   Password reset OTP: `654321`
5. Add the real SMTP and Razorpay values from `backend-env.example` on the backend host only if you later switch to the live backend.

Example `runtime-config.js`:

```js
window.__PIZZA_PALETTE_CONFIG__ = {
  apiBaseUrl: 'https://your-backend-domain.com/api',
  demoMode: false,
};
```
