// server.js — Testpad Proxy Server
// Receives requests from Chrome extension and forwards to Testpad API
// This bypasses the browser CORS restriction

const express  = require('express');
const cors     = require('cors');
const fetch    = require('node-fetch');

const app  = express();

// Sanitize API key — remove any whitespace, newlines, quotes
function cleanKey(key) {
  if (!key) return '';
  return String(key).replace(/[\s"']/g, '').trim();
}
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
  res.json({ status: 'ok', message: 'Testpad Proxy is running', version: 'v6' });
});

// ── Debug endpoint — check key format ────────────────────
// GET /debug?testpadKey=YOUR_KEY
app.get('/debug', function (req, res) {
  var raw = req.query.testpadKey || '';
  var cleaned = cleanKey(raw);
  res.json({
    rawLength:     raw.length,
    cleanedLength: cleaned.length,
    startsWithApikey: cleaned.startsWith('apikey '),
    preview:       cleaned.slice(0, 12) + '...',
    authHeader:    'apikey ' + cleaned.slice(0, 8) + '...'
  });
});

// ── List projects (to find correct project ID) ────────────
// GET /projects?testpadKey=YOUR_KEY
app.get('/projects', async function (req, res) {
  var testpadKey = req.query.testpadKey;
  if (!testpadKey) return res.status(400).json({ error: 'Missing testpadKey query param' });
  try {
    var r = await fetch('https://api.testpad.com/api/v1/projects', {
      headers: { 'Authorization': 'apikey ' + cleanKey(testpadKey) }
    });
    var data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── List folders in a project ─────────────────────────────
// GET /folders?testpadKey=YOUR_KEY&projectId=5
app.get('/folders', async function (req, res) {
  var testpadKey = req.query.testpadKey;
  var projectId  = req.query.projectId;
  if (!testpadKey || !projectId) return res.status(400).json({ error: 'Missing testpadKey or projectId' });
  try {
    var r = await fetch('https://api.testpad.com/api/v1/projects/' + projectId + '/folders', {
      headers: { 'Authorization': 'apikey ' + cleanKey(testpadKey) }
    });
    var data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
        'Authorization': 'apikey ' + cleanKey(testpadKey)
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

// ── Push script + screenshots to Testpad ────────────────────
// POST /push-with-screenshots
// Body: { testpadKey, projectId, folderId, scriptName, tests }
// Each test in tests can have: { text, indent, screenshotBefore, screenshotAfter }
app.post('/push-with-screenshots', async function (req, res) {
  try {
    var body       = req.body;
    var testpadKey = cleanKey(body.testpadKey);
    var projectId  = body.projectId;
    var folderId   = body.folderId;
    var scriptName = body.scriptName;
    var tests      = body.tests || [];

    if (!testpadKey) return res.status(400).json({ error: 'Missing testpadKey' });
    if (!projectId)  return res.status(400).json({ error: 'Missing projectId' });
    if (!scriptName) return res.status(400).json({ error: 'Missing scriptName' });

    var baseUrl = 'https://api.testpad.com/api/v1';
    var scriptsUrl = folderId
      ? baseUrl + '/projects/' + projectId + '/folders/' + folderId + '/scripts'
      : baseUrl + '/projects/' + projectId + '/scripts';

    // Step 1: Create the script with test text only
    var scriptRes = await fetch(scriptsUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'apikey ' + testpadKey
      },
      body: JSON.stringify({
        name:  scriptName,
        tests: tests.map(function(t) {
          return { text: t.text, indent: t.parent ? 0 : 1 };
        })
      })
    });

    if (!scriptRes.ok) {
      var errText = await scriptRes.text();
      return res.status(scriptRes.status).json({ error: 'Testpad script error: ' + errText });
    }

    var scriptData = await scriptRes.json();
    var scriptId   = scriptData.id || scriptData.scriptId;
    console.log('Script created:', scriptId);

    // Step 2: Attach screenshots to each test that has them
    // First fetch the created script to get test IDs
    var attachResults = [];
    if (scriptId) {
      try {
        var scriptDetail = await fetch(baseUrl + '/projects/' + projectId + '/scripts/' + scriptId, {
          headers: { 'Authorization': 'apikey ' + testpadKey }
        });
        var scriptDetailData = await scriptDetail.json();
        var createdTests = scriptDetailData.tests || [];

        // Match tests with screenshots by index
        for (var i = 0; i < createdTests.length && i < tests.length; i++) {
          var testId     = createdTests[i].id;
          var testData   = tests[i];
          var screenshots = [];
          if (testData.screenshotBefore) screenshots.push({ data: testData.screenshotBefore, name: 'before.jpg' });
          if (testData.screenshotAfter)  screenshots.push({ data: testData.screenshotAfter,  name: 'after.jpg'  });

          for (var j = 0; j < screenshots.length; j++) {
            try {
              var shot     = screenshots[j];
              var base64   = shot.data.replace(/^data:image\/\w+;base64,/, '');
              var buffer   = Buffer.from(base64, 'base64');
              var attachUrl = baseUrl + '/projects/' + projectId + '/scripts/' + scriptId + '/tests/' + testId + '/attachments';
              var attachRes = await fetch(attachUrl, {
                method: 'POST',
                headers: {
                  'Authorization': 'apikey ' + testpadKey,
                  'Content-Type':  'image/jpeg',
                  'Content-Disposition': 'attachment; filename="' + shot.name + '"'
                },
                body: buffer
              });
              attachResults.push({ testId: testId, file: shot.name, status: attachRes.status });
            } catch(attachErr) {
              attachResults.push({ testId: testId, error: attachErr.message });
            }
          }
        }
      } catch(detailErr) {
        console.log('Could not attach screenshots:', detailErr.message);
      }
    }

    res.json({ ok: true, scriptId: scriptId, attachments: attachResults });

  } catch (err) {
    console.error('Push-with-screenshots error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── List all scripts in a project (for duplicate detection) ──
// GET /scripts?testpadKey=KEY&projectId=5
app.get('/scripts', async function (req, res) {
  var testpadKey = req.query.testpadKey;
  var projectId  = req.query.projectId;
  if (!testpadKey || !projectId) return res.status(400).json({ error: 'Missing params' });
  try {
    var r = await fetch('https://api.testpad.com/api/v1/projects/' + projectId + '/scripts', {
      headers: { 'Authorization': 'apikey ' + cleanKey(testpadKey) }
    });
    var data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get last test case ID in a script (for ID continuity) ────
// GET /lastid?testpadKey=KEY&projectId=5&scriptId=12
app.get('/lastid', async function (req, res) {
  var testpadKey = req.query.testpadKey;
  var projectId  = req.query.projectId;
  var scriptId   = req.query.scriptId;
  if (!testpadKey || !projectId) return res.status(400).json({ error: 'Missing params' });
  try {
    var url = scriptId
      ? 'https://api.testpad.com/api/v1/projects/' + projectId + '/scripts/' + scriptId
      : 'https://api.testpad.com/api/v1/projects/' + projectId + '/scripts';
    var r = await fetch(url, {
      headers: { 'Authorization': 'apikey ' + cleanKey(testpadKey) }
    });
    var data = await r.json();
    // Find highest numeric ID across all tests
    var maxId = 0;
    var scripts = data.scripts || (data.id ? [data] : []);
    scripts.forEach(function(s) {
      if (s.tests) s.tests.forEach(function(t) {
        var num = parseInt(t.id || '0', 10);
        if (num > maxId) maxId = num;
      });
    });
    res.json({ lastId: maxId });
  } catch (e) {
    res.json({ lastId: 0 });
  }
});
