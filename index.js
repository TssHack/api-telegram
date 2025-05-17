const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const app = express();
const port = 3000;

const WEBHOOK_ENABLED = false;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function curlJsonArgs(url, jsonData = null, returnContentType = false) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: jsonData ? 'POST' : 'GET',
            headers: {
                'User-Agent': 'Telegram Api Request',
                ...(jsonData && { 'Content-Type': 'application/json' })
            }
        };

        const req = https.request(options, (res) => {
            let data = [];

            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const result = Buffer.concat(data);
                if (returnContentType) {
                    resolve({
                        result: result,
                        contentType: res.headers['content-type']
                    });
                } else {
                    resolve(result.toString());
                }
            });
        });

        req.on('error', reject);

        if (jsonData) {
            req.write(JSON.stringify(jsonData));
        }

        req.end();
    });
}

function telegramRequest(token, method, jsonData) {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    return curlJsonArgs(url, jsonData);
}

app.all('/webhook/:encodedUrl', async (req, res) => {
    if (!WEBHOOK_ENABLED) return res.status(403).send("Webhook is disabled.");

    const decodedUrl = Buffer.from(req.params.encodedUrl, 'base64').toString('utf-8');
    try {
        new URL(decodedUrl); // validate URL
        const response = await curlJsonArgs(decodedUrl, req.body);
        res.send(response);
    } catch (error) {
        res.status(400).send("Invalid URL");
    }
});

app.all('/bot:token/:method', async (req, res) => {
    const { token, method } = req.params;

    if (method.toLowerCase() === 'setwebhook' && WEBHOOK_ENABLED) {
        const url = req.body.url;
        const encodedUrl = Buffer.from(url).toString('base64');
        const fullUrl = `${req.protocol}://${req.get('host')}/webhook/${encodedUrl}`;
        const response = await telegramRequest(token, 'setWebhook', { url: fullUrl });
        res.send(response);
    } else {
        const response = await telegramRequest(token, method, req.body);
        res.send(response);
    }
});

app.get('/file/:botToken/*', async (req, res) => {
    const { botToken } = req.params;
    const filePath = req.params[0];

    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    try {
        const response = await curlJsonArgs(url, null, true);

        if (response.contentType.toLowerCase().includes('application/json')) {
            res.setHeader('Content-Type', response.contentType);
            res.send(response.result.toString());
        } else {
            res.setHeader('Content-Type', response.contentType);
            res.setHeader('Content-Disposition', 'attachment');
            res.send(response.result);
        }
    } catch (err) {
        res.status(500).send('Error fetching file');
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
