# Testpad Proxy Server

A tiny server that receives requests from the Testpad Recorder Chrome extension
and forwards them to the Testpad API — bypassing browser CORS restrictions.

## Deploy to Render.com (Free)

1. Create a free account at https://render.com
2. Click "New +" → "Web Service"
3. Choose "Deploy an existing image" → No, choose "Build and deploy from a Git repo"
4. Upload this folder to a GitHub repo (or paste the files manually)
5. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
6. Click Deploy
7. Wait ~2 minutes — Render gives you a URL like:
   `https://testpad-proxy-xxxx.onrender.com`
8. Copy that URL into the Chrome extension Settings → "Proxy Server URL"

## Test It

Visit your proxy URL in a browser — you should see:
```json
{ "status": "ok", "message": "Testpad Proxy is running" }
```

## How It Works

```
Chrome Extension
      ↓  POST /push
Proxy Server (Render)
      ↓  POST /api/v1/projects/.../scripts
Testpad API
```
