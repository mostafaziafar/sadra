#!/usr/bin/env node
/**
 * سرمایه‌یار — سرور پیش‌نمایش محلی (فقط برای توسعه / سندباکس)
 * ---------------------------------------------------------------------------
 * این اسکریپت کل برنامهٔ PHP را با یک شبیه‌ساز PHP (php-wasm) اجرا می‌کند،
 * بدون نیاز به نصب PHP روی سیستم. رفتارش مثل Apache + .htaccess خود پروژه است:
 *   • فایل واقعی (php یا استاتیک)  → همان سرو/اجرا می‌شود
 *   • هر مسیر دیگری                → index.php (روتر برنامه)
 *
 * راه‌اندازی (یک‌بار):
 *   cd dev && npm install
 *
 * اجرا:
 *   node dev/preview-server.mjs            # پورت پیش‌فرض 9000
 *   PORT=9000 DOCROOT=./sarmayeyar node dev/preview-server.mjs
 *
 * توجه: هدر X-Frame-Options حذف می‌شود تا صفحه داخل iframe پیش‌نمایش باز شود.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNodeRuntime, createNodeFsMountHandler } from '@php-wasm/node';
import { PHP, PHPRequestHandler } from '@php-wasm/universal';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 9000);
const HOST = process.env.HOST || '0.0.0.0';
const DOCROOT = path.resolve(REPO_ROOT, process.env.DOCROOT || 'sarmayeyar');
const PHP_VERSION = process.env.PHP_VERSION || '8.4';
const PHP_ROOT = '/www';

function log(...args) {
	console.log(`[preview]`, ...args);
}

log(`document root: ${DOCROOT}`);
log(`booting PHP ${PHP_VERSION} (wasm)…`);

const runtimeId = await loadNodeRuntime(PHP_VERSION, {
	// php-wasm 3.x needs an explicit process id for file-locking/user-space setup
	emscriptenOptions: { processId: 1 },
});
const php = new PHP(runtimeId);

php.mkdirTree(PHP_ROOT);
php.mount(PHP_ROOT, createNodeFsMountHandler(DOCROOT));

const handler = new PHPRequestHandler({
	php,
	documentRoot: PHP_ROOT,
	absoluteUrl: `http://127.0.0.1:${PORT}`,
	// مثل RewriteRule انتهای .htaccess: هر چیزی که فایل واقعی نیست → index.php
	getFileNotFoundAction: (relativePath) => {
		if (relativePath === '/index.php') {
			return { type: '404' };
		}
		return { type: 'internal-redirect', uri: '/index.php' };
	},
});

// warm-up so the first real request is fast
await handler.getPrimaryPhp();

const HOP_BY_HOP = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'content-length',
	'content-encoding',
]);

async function readBody(req) {
	if (req.method === 'GET' || req.method === 'HEAD') return undefined;
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	const body = Buffer.concat(chunks);
	return body.length ? new Uint8Array(body) : undefined;
}

const server = http.createServer(async (req, res) => {
	const started = Date.now();
	try {
		const host = req.headers.host || `127.0.0.1:${PORT}`;
		const headers = {};
		for (const [key, value] of Object.entries(req.headers)) {
			if (value === undefined) continue;
			headers[key] = Array.isArray(value) ? value.join(', ') : value;
		}
		delete headers.host;
		delete headers['content-length'];

		const response = await handler.request({
			url: `http://${host}${req.url}`,
			method: req.method,
			headers,
			body: await readBody(req),
		});

		res.statusCode = response.httpStatusCode || 200;
		for (const [key, values] of Object.entries(response.headers || {})) {
			const name = key.toLowerCase();
			if (HOP_BY_HOP.has(name)) continue;
			// پیش‌نمایش داخل iframe نمایش داده می‌شود
			if (name === 'x-frame-options') continue;
			try {
				res.setHeader(key, name === 'set-cookie' ? values : values.join(', '));
			} catch {
				/* header نامعتبر — رد شود */
			}
		}

		if (req.method === 'HEAD') {
			res.end();
		} else {
			res.end(Buffer.from(response.bytes ?? new Uint8Array()));
		}

		const err = (response.errors || '').trim();
		log(
			`${req.method} ${req.url} → ${response.httpStatusCode} (${Date.now() - started}ms)` +
				(err ? `\n         stderr: ${err.slice(0, 400)}` : '')
		);
	} catch (error) {
		log(`ERROR ${req.method} ${req.url}: ${error?.stack || error}`);
		if (!res.headersSent) res.statusCode = 500;
		res.end(`preview server error:\n${error?.stack || error}`);
	}
});

server.on('clientError', (err, socket) => {
	if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, HOST, () => {
	log(`ready → http://${HOST}:${PORT}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		log(`${signal} — shutting down`);
		server.close(() => process.exit(0));
		setTimeout(() => process.exit(0), 2000).unref();
	});
}
