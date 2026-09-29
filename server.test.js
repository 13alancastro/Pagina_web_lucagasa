'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createDatabase, createServer, sendEmailNotification } = require('../server');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'solicitudes-ie-'));
const databasePath = path.join(tempDirectory, 'requests.sqlite');
const database = createDatabase(databasePath);
const server = createServer({
    database,
    config: {},
    sendNotification: async () => false
});
let baseUrl;

before(async () => {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise(resolve => server.close(resolve));
    database.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
});

const validRequest = {
    name: '  Ana   Pérez ',
    documentType: 'Cédula de Ciudadanía',
    documentNumber: '12345678',
    document: 'Certificado de Estudios',
    email: 'ANA@example.com',
    consent: true,
    website: ''
};

test('sirve la página y evita exponer archivos del servidor', async () => {
    const home = await fetch(baseUrl);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Solicitud de Documentos/);

    for (const privatePath of ['/server.js', '/.env.example', '/data/requests.sqlite', '/img/%2e%2e%5cserver.js']) {
        const secret = await fetch(`${baseUrl}${privatePath}`);
        assert.equal(secret.status, 404, `${privatePath} debe permanecer privado`);
    }
});

test('guarda una solicitud válida y registra el consentimiento aunque SMTP no esté configurado', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequest)
    });
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.emailSent, false);
    assert.match(result.id, /^[0-9a-f-]{36}$/i);

    const row = database.prepare('SELECT * FROM document_requests WHERE id = ?').get(result.id);
    assert.equal(row.requester_name, 'Ana Pérez');
    assert.equal(row.requester_email, 'ana@example.com');
    assert.equal(row.requester_document_number, '12345678');
    assert.equal(row.consent_version, '2026-09-29-v1');
    assert.equal(row.notification_status, 'failed');
});

test('rechaza la solicitud si falta el consentimiento y no guarda datos', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, consent: false })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /privacidad/i);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM document_requests').get().count, 1);
});

test('valida los valores permitidos y el formato del correo', async () => {
    for (const change of [
        { document: 'Documento no permitido' },
        { documentNumber: '123' },
        { email: 'correo-inválido' }
    ]) {
        const response = await fetch(`${baseUrl}/api/document-requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...validRequest, ...change })
        });
        assert.equal(response.status, 400);
    }
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM document_requests').get().count, 1);
});

test('ignora el señuelo automático sin guardar la solicitud', async () => {
    const response = await fetch(`${baseUrl}/api/document-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validRequest, website: 'bot' })
    });
    assert.equal(response.status, 201);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM document_requests').get().count, 1);
});

test('prepara el aviso SMTP para responder directamente a quien hizo la solicitud', async () => {
    let transportOptions;
    let outgoingMessage;
    const sent = await sendEmailNotification({
        adminEmail: 'secretaria@example.edu.co',
        smtpHost: 'smtp.example.edu.co',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'sitio@example.edu.co',
        smtpPassword: 'test-only',
        mailFrom: 'sitio@example.edu.co'
    }, {
        id: 'request-123',
        name: 'Ana Pérez',
        documentType: 'Cédula de Ciudadanía',
        documentNumber: '12345678',
        document: 'Certificado de Estudios',
        email: 'ana@example.com',
        createdAt: '2026-09-29T12:00:00.000Z'
    }, options => {
        transportOptions = options;
        return { sendMail: async message => { outgoingMessage = message; } };
    });

    assert.equal(sent, true);
    assert.equal(transportOptions.host, 'smtp.example.edu.co');
    assert.equal(transportOptions.requireTLS, true);
    assert.equal(outgoingMessage.to, 'secretaria@example.edu.co');
    assert.equal(outgoingMessage.replyTo, 'ana@example.com');
    assert.match(outgoingMessage.text, /12345678/);
});
