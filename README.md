# Pizza Delivery

This is a clean GitHub-ready deployment bundle for the app renamed to `Pizza Delivery`.

## Folder layout

- `client/` - static frontend files (`index.html`, `app.js`, `styles.css`)
- `server/` - Express server and API
- `config/` - environment variable template
- `docs/` - structure and deployment notes
- `logs/` - local runtime logs placeholder

## Run locally

```sh
npm install
npm start
```

Then open `http://localhost:3000`.

## Notes

- If `MONGO_URI` is not set, the app falls back to in-memory data.
- Default demo accounts are documented in `config/.env.example`.
- Upload only this `pizzadelivery/` folder to GitHub.
- `node_modules/` is excluded, so the folder stays small and deployment-friendly.
