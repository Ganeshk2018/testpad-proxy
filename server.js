// server.js — Testpad Proxy Server
// Receives requests from Chrome extension and forwards to Testpad API
// This bypasses the browser CORS restriction

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// Allow requests from Chrome extensions and any origin
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ── Health check ──────────────────────────────────────────
app.get('/', function (req, res) {
  res.json({ status: 'ok', message: 'Testpad Proxy is running' });
});

// ── Push script to Testpad ────────────────────────────────
// POST /push
// Body: { subdomain, testpadKey, projectId, folderId, scriptName, tests }
app.post('/push', async function (req, res) {
  try {
    var body       = req.body;
    var subdomain  = body.subdomain;
    var testpadKey = body.testpadKey;
    var projectId  = body.projectId;
    var folderId   = body.folderId;
    var scriptName = body.scriptName;
    var tests      = body.tests;

    // Validate required fields
    if (!testpadKey) return res.status(400).json({ error: 'Missing testpadKey' });
    if (!projectId)  return res.status(400).json({ error: 'Missing projectId' });
    if (!scriptName) return res.status(400).json({ error: 'Missing scriptName' });
    if (!tests || !tests.length) return res.status(400).json({ error: 'No tests provided' });

    // Clean folderId — strip any leading/trailing slashes
    if (folderId) {
      folderId = folderId.replace(/^\/+|\/+$/g, '').trim();
    }

    // Testpad API base URL (confirmed from Testpad error response)
    var baseUrl = 'https://api.testpad.com/api/v1';
    var url = folderId
      ? baseUrl + '/projects/' + projectId + '/folders/' + folderId + '/scripts'
      : baseUrl + '/projects/' + projectId + '/scripts';

    console.log('Pushing to:', url);

    // Forward to Testpad
    var testpadRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'apikey ' + testpadKey
      },
      body: JSON.stringify({
        name:  scriptName,
        tests: tests.map(function (t) {
          return { text: t.text, indent: t.parent ? 0 : 1 };
        })
      })
    });

    var responseText = await testpadRes.text();

    // Try to parse as JSON, fall back to raw text
    var responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { raw: responseText };
    }

    if (!testpadRes.ok) {
      console.error('Testpad error:', testpadRes.status, responseText);
      return res.status(testpadRes.status).json({
        error: 'Testpad returned ' + testpadRes.status + ': ' + responseText
      });
    }

    console.log('Success! Script created.');
    res.json({ ok: true, result: responseData });

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Proxy server error: ' + err.message });
  }
});

app.listen(PORT, function () {
  console.log('Testpad Proxy running on port ' + PORT);
});
