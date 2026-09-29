# Solicitudes de documentos

El formulario guarda cada solicitud en SQLite y envía un aviso por SMTP al buzón configurado. El aviso incluye el correo de la persona solicitante en el campo «Responder a», para que secretaría pueda contestar y adjuntar el documento desde su correo habitual. La base se conserva aunque el servicio de correo falle.

## Requisitos

- Node.js 22.13 o posterior.
- Un servidor con Node.js y almacenamiento local persistente para la carpeta `data`.
- Los datos SMTP del proveedor del correo institucional.

Node 22 puede mostrar un aviso sobre el módulo SQLite experimental incluido en Node; no impide ejecutar el sitio ni guardar solicitudes.

## Ejecutar localmente

1. Abre una terminal en esta carpeta.
2. Instala la dependencia: `npm install`.
3. Copia `.env.example` como `.env` y completa `ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_USER` y `SMTP_PASS`. El proveedor del correo debe indicar el puerto y si requiere TLS.
4. Inicia el sitio con `npm start`.
5. Visita `http://localhost:3000` y envía una solicitud de prueba.

El archivo de base de datos se crea en `data/document-requests.sqlite`. No se sirve desde la página. Haz copias de seguridad de esa carpeta desde el servidor.

## Pruebas automáticas

Ejecuta `npm test`. Las pruebas usan una base temporal y no transmiten correos.

## Publicación

Este sitio debe ejecutarse como aplicación Node.js detrás de HTTPS. Configura las variables SMTP en el panel de secretos del proveedor de hosting o en el `.env` protegido del servidor. Confirma que el hosting conserve `data/document-requests.sqlite` tras reinicios y despliegues; el disco efímero no sirve como almacenamiento permanente.

El formulario requiere aceptación explícita y guarda la versión y fecha de esa autorización. Antes de recibir datos reales, la institución debe revisar el aviso mostrado y completar la información de su política oficial de tratamiento de datos personales.

## Datos guardados

Se guardan nombre, tipo y número de documento, documento solicitado, correo, fecha de consentimiento, fecha de recepción y estado del aviso SMTP. El número de documento también aparece en el correo de notificación para que secretaría pueda identificar la solicitud. Limita el acceso al buzón y al servidor, define el periodo de conservación con la institución y protege las copias de seguridad.
