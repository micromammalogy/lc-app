const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}
if (!fs.existsSync('responses')) {
  fs.mkdirSync('responses');
}

app.post('/api/zonos', async (req, res) => {
  try {
    const { credentialToken, mutation } = req.body;
    console.log('===DEBUG: Request received ===');
    console.log('Mutation:', JSON.stringify(mutation, null, 2));
    
    const response = await fetch('https://api.zonos.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'credentialToken': credentialToken
      },
      body: JSON.stringify(mutation)
    });
    
    const result = await response.json();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `zonos-response-${timestamp}.json`;
    fs.writeFileSync(`responses/${filename}`, JSON.stringify(result, null, 2));
    
    res.json({ success: true, data: result, savedTo: filename });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Full Zonos app running on http://localhost:3000');
});
