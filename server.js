'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const nodemailer = require('nodemailer');

const PROJECT_ROOT = __dirname;
const MAX_BODY_BYTES = 16 * 1024;
const CONSENT_VERSION = '2026-09-29-v1';
const REQUEST_TYPES = new Set(['Cédula de Ciudadanía', 'Tarjeta de Identidad']);
const REQUESTED_DOCUMENTS = new Set([
    'Certificado de Estudios',
    'Boletín de Notas',
    'Paz y Salvo',
    'Constancia de Matrícula'
]);

function loadEnvFile(filePath = path.join(PROJECT_ROOT, '.env')) {
    if (!fs.existsSync(filePath)) return;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match || process.env[match[1]] !== undefined) continue;

        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
    }
}

function readConfig(env = process.env) {
    const port = Number(env.PORT || 3000);
    const smtpPort = Number(env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT debe ser un número entre 1 y 65535.');
    }
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        throw new Error('SMTP_PORT debe ser un número entre 1 y 65535.');
    }

    return {
        host: env.HOST || '0.0.0.0',
        port,
        databasePath: path.resolve(PROJECT_ROOT, env.DATABASE_PATH || 'data/document-requests.sqlite'),
        adminEmail: (env.ADMIN_EMAIL || '').trim(),
        smtpHost: (env.SMTP_HOST || '').trim(),
        smtpPort,
        smtpSecure: String(env.SMTP_SECURE || (smtpPort === 465 ? 'true' : 'false')).toLowerCase() === 'true',
        smtpUser: (env.SMTP_USER || '').trim(),
        smtpPassword: env.SMTP_PASS || '',
        mailFrom: (env.MAIL_FROM || env.SMTP_USER || '').trim()
    };
}

function createDatabase(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const database = new DatabaseSync(databasePath);
    database.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        CREATE TABLE IF NOT EXISTS document_requests (
            id TEXT PRIMARY KEY,
            requester_name TEXT NOT NULL,
            requester_document_type TEXT NOT NULL,
            requester_document_number TEXT NOT NULL,
            requested_document TEXT NOT NULL,
            requester_email TEXT NOT NULL,
            consent_version TEXT NOT NULL,
            consented_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            notification_status TEXT NOT NULL DEFAULT 'pending',
            notification_error_code TEXT
        ) STRICT;
        CREATE INDEX IF NOT EXISTS document_requests_created_at_idx
            ON document_requests(created_at DESC);
    `);
    return database;
}

function mailIsConfigured(config) {
    return Boolean(config.adminEmail && config.smtpHost && config.smtpUser && config.smtpPassword);
}

async function sendEmailNotification(config, request, createTransport = nodemailer.createTransport) {
    if (!mailIsConfigured(config)) return false;

    const transporter = createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        requireTLS: !config.smtpSecure,
        auth: { user: config.smtpUser, pass: config.smtpPassword },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });

    const plainText = [
        'Se recibió una solicitud de documento en el sitio institucional.',
        '',
        `Código: ${request.id}`,
        `Nombre: ${request.name}`,
        `Tipo de documento de identidad: ${request.documentType}`,
        `Número de documento: ${request.documentNumber}`,
        `Documento solicitado: ${request.document}`,
        `Correo para responder: ${request.email}`,
        `Fecha de recepción: ${request.createdAt}`,
        '',
        'Puedes responder directamente a este correo para contactar a la persona solicitante.'
    ].join('\n');

    await transporter.sendMail({
        from: config.mailFrom,
        to: config.adminEmail,
        replyTo: request.email,
        subject: `Solicitud de documento ${request.id}`,
        text: plainText,
        disableFileAccess: true,
        disableUrlAccess: true
    });
    return true;
}

function jsonResponse(response, statusCode, body) {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
}

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function readJsonBody(request) {
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (contentType.split(';', 1)[0].trim() !== 'application/json') {
        request.resume();
        return Promise.reject(httpError(415, 'El servidor esperaba datos en formato JSON.'));
    }
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_BODY_BYTES) {
        request.resume();
        return Promise.reject(httpError(413, 'La solicitud es demasiado grande.'));
    }

    return new Promise((resolve, reject) => {
        const chunks = [];
        let length = 0;
        let finished = false;
        request.on('data', chunk => {
            length += chunk.length;
            if (length > MAX_BODY_BYTES) {
                finished = true;
                request.resume();
                reject(httpError(413, 'La solicitud es demasiado grande.'));
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (finished) return;
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(httpError(400, 'El contenido enviado no es JSON válido.'));
            }
        });
        request.on('error', () => reject(httpError(400, 'No se pudo leer la solicitud.')));
    });
}

function normalizeAndValidate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw httpError(400, 'Completa todos los campos requeridos.');
    }

    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const documentType = typeof body.documentType === 'string' ? body.documentType.trim() : '';
    const documentNumber = typeof body.documentNumber === 'string' ? body.documentNumber.trim() : '';
    const document = typeof body.document === 'string' ? body.document.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const hasInvalidControls = [name, documentType, documentNumber, document, email]
        .some(value => /[\u0000-\u001f\u007f]/.test(value));

    if (!name || name.length > 120 || hasInvalidControls) {
        throw httpError(400, 'Revisa el nombre del solicitante.');
    }
    if (!REQUEST_TYPES.has(documentType)) {
        throw httpError(400, 'Selecciona un tipo de documento válido.');
    }
    if (!/^[\d. -]{4,30}$/.test(documentNumber)) {
        throw httpError(400, 'Revisa el número de documento.');
    }
    if (!REQUESTED_DOCUMENTS.has(document)) {
        throw httpError(400, 'Selecciona un documento válido.');
    }
    if (email.length > 254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i.test(email)) {
        throw httpError(400, 'Escribe un correo electrónico válido.');
    }
    if (body.consent !== true) {
        throw httpError(400, 'Debes aceptar el aviso de privacidad para enviar la solicitud.');
    }

    return { name, documentType, documentNumber, document, email };
}

function allowedStaticRelativePath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/');
    const segments = normalized.split('/');
    if (segments.some(segment => segment === '.' || segment === '..' || segment === '')) return false;
    if (['index.html', 'scripts.js', 'style.css'].includes(normalized)) return true;
    return normalized.startsWith('img/') || normalized.startsWith('manual convivencia/');
}

function allowedStaticPath(pathname) {
    if (pathname === '/') return true;
    if (!pathname.startsWith('/') || pathname.includes('\\')) return false;
    return allowedStaticRelativePath(pathname.slice(1));
}

const CONTENT_TYPES = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['.gif', 'image/gif'],
    ['.html', 'text/html; charset=utf-8'],
    ['.jpeg', 'image/jpeg'],
    ['.jpg', 'image/jpeg'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.pdf', 'application/pdf'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.webp', 'image/webp']
]);

async function serveStatic(pathname, response) {
    if (!allowedStaticPath(pathname)) {
        jsonResponse(response, 404, { error: 'No encontrado.' });
        return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const fullPath = path.resolve(PROJECT_ROOT, relativePath);
    const relativeToRoot = path.relative(PROJECT_ROOT, fullPath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || !allowedStaticRelativePath(relativeToRoot)) {
        jsonResponse(response, 404, { error: 'No encontrado.' });
        return;
    }

    try {
        const realPath = await fs.promises.realpath(fullPath);
        const realRelative = path.relative(PROJECT_ROOT, realPath);
        if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || !allowedStaticRelativePath(realRelative)) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        const fileStat = await fs.promises.stat(realPath);
        if (!fileStat.isFile()) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        const contentType = CONTENT_TYPES.get(path.extname(realPath).toLowerCase());
        if (!contentType) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        response.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': fileStat.size,
            'Cache-Control': ['.html', '.js', '.css'].includes(path.extname(realPath).toLowerCase())
                ? 'no-cache'
                : 'public, max-age=3600'
        });
        if (response.req.method === 'HEAD') response.end();
        else fs.createReadStream(realPath).pipe(response);
    } catch {
        jsonResponse(response, 404, { error: 'No encontrado.' });
    }
}

function createServer(options = {}) {
    const config = options.config || readConfig();
    const database = options.database || createDatabase(options.databasePath || config.databasePath);
    const ownsDatabase = !options.database;
    const sendNotification = options.sendNotification || (request => sendEmailNotification(config, request));
    const rateLimit = options.rateLimit || { maxRequests: 10, windowMs: 15 * 60 * 1000 };
    const requestCounts = new Map();
    let lastCleanup = Date.now();

    const server = http.createServer(async (request, response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'same-origin');
        response.setHeader('X-Frame-Options', 'DENY');

        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            jsonResponse(response, 400, { error: 'La dirección solicitada no es válida.' });
            return;
        }

        if (pathname === '/health' && request.method === 'GET') {
            jsonResponse(response, 200, { status: 'ok' });
            return;
        }

        if (pathname === '/api/document-requests') {
            if (request.method !== 'POST') {
                response.setHeader('Allow', 'POST');
                jsonResponse(response, 405, { error: 'Método no permitido.' });
                return;
            }

            const now = Date.now();
            if (now - lastCleanup > rateLimit.windowMs) {
                for (const [ip, entry] of requestCounts) {
                    if (now - entry.startedAt >= rateLimit.windowMs) requestCounts.delete(ip);
                }
                lastCleanup = now;
            }
            const ip = request.socket.remoteAddress || 'unknown';
            let rateEntry = requestCounts.get(ip);
            if (!rateEntry || now - rateEntry.startedAt >= rateLimit.windowMs) {
                rateEntry = { startedAt: now, count: 0 };
                requestCounts.set(ip, rateEntry);
            }
            rateEntry.count += 1;
            if (rateEntry.count > rateLimit.maxRequests) {
                jsonResponse(response, 429, { error: 'Se recibieron varias solicitudes seguidas. Intenta más tarde.' });
                return;
            }

            try {
                const body = await readJsonBody(request);
                if (typeof body?.website === 'string' && body.website.trim()) {
                    jsonResponse(response, 201, { id: 'recibida', emailSent: true });
                    return;
                }
                const values = normalizeAndValidate(body);
                const id = crypto.randomUUID();
                const consentedAt = new Date().toISOString();
                database.prepare(`
                    INSERT INTO document_requests (
                        id, requester_name, requester_document_type, requester_document_number,
                        requested_document, requester_email, consent_version, consented_at,
                        created_at, notification_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                `).run(
                    id, values.name, values.documentType, values.documentNumber,
                    values.document, values.email, CONSENT_VERSION, consentedAt, consentedAt
                );

                const emailRequest = { id, ...values, createdAt: consentedAt };
                let emailSent = false;
                let errorCode = null;
                try {
                    emailSent = Boolean(await sendNotification(emailRequest));
                } catch (error) {
                    errorCode = typeof error?.code === 'string' ? error.code.slice(0, 40) : 'SMTP_ERROR';
                    console.error('No se pudo enviar el aviso SMTP para la solicitud %s (%s).', id, errorCode);
                }

                database.prepare(`
                    UPDATE document_requests
                    SET notification_status = ?, notification_error_code = ?
                    WHERE id = ?
                `).run(emailSent ? 'sent' : 'failed', errorCode, id);

                jsonResponse(response, 201, { id, emailSent });
            } catch (error) {
                jsonResponse(response, error.statusCode || 500, {
                    error: error.statusCode ? error.message : 'No se pudo guardar la solicitud. Intenta de nuevo.'
                });
            }
            return;
        }

        if (pathname.startsWith('/api/')) {
            jsonResponse(response, 404, { error: 'No encontrado.' });
            return;
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
            response.setHeader('Allow', 'GET, HEAD');
            jsonResponse(response, 405, { error: 'Método no permitido.' });
            return;
        }
        await serveStatic(pathname, response);
    });

    if (ownsDatabase) server.once('close', () => database.close());
    return server;
}

if (require.main === module) {
    try {
        loadEnvFile();
        const config = readConfig();
        const server = createServer({ config });
        server.listen(config.port, config.host, () => {
            console.log(`Sitio disponible en http://localhost:${config.port}`);
            console.log(`Base de datos: ${config.databasePath}`);
            if (!mailIsConfigured(config)) {
                console.warn('Avisos por correo desactivados: completa ADMIN_EMAIL y SMTP_* en .env.');
            }
        });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    CONSENT_VERSION,
    createDatabase,
    createServer,
    mailIsConfigured,
    normalizeAndValidate,
    readConfig,
    sendEmailNotification
};
