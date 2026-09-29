// ======================================================
// TABS / PESTAÑAS
// ======================================================

function showTab(id) {
    const targetPanel = document.getElementById('panel-' + id);
    if (!targetPanel) return;

    document.querySelectorAll('.panel').forEach(panel => {
        const isActive = panel === targetPanel;
        panel.classList.toggle('active', isActive);
        panel.setAttribute('aria-hidden', String(!isActive));
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        const isActive = button.dataset.tab === id;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

}

document.getElementById('nav-inner')?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0 || tabs.length === 0) return;

    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    tabs[nextIndex].focus();
    tabs[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tabs[nextIndex].click();
});

// ======================================================
// DESPLAZAMIENTO DEL MENÚ (NAV SCROLL)
// ======================================================

function scrollNav(direction) {
    const navInner = document.getElementById('nav-inner');
    if (navInner) {
        const scrollAmount = 200;
        navInner.scrollBy({
            left: direction * scrollAmount,
            behavior: 'smooth'
        });
    }
}

// ======================================================
// SELECTOR PQRS
// ======================================================

function selPQRS(el, tipo) {
    document.querySelectorAll('.ptype').forEach(option => {
        option.classList.remove('sel');
        option.setAttribute('aria-pressed', 'false');
    });

    if (el) {
        el.classList.add('sel');
        el.setAttribute('aria-pressed', 'true');
    }

    const inputTipo = document.getElementById('pqrs-tipo');
    if (inputTipo) {
        inputTipo.value = tipo;
        inputTipo.setCustomValidity('');
    }
}

// ======================================================
// MODAL DE SOLICITUD DE DOCUMENTOS
// ======================================================

let modalReturnFocus = null;

function openModal() {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    if (!overlay || !body) return;

    modalReturnFocus = document.activeElement;
    body.innerHTML = `<form class="form-wrap" id="document-request-form">
    <div class="fr">
      <label for="request-name">Nombre completo del solicitante</label>
      <input id="request-name" name="name" type="text" maxlength="120" placeholder="Ej.: Juan Pérez" autocomplete="name" required />
    </div>
    <div class="row2">
      <div class="fr">
        <label for="request-document-type">Tipo de documento</label>
        <select id="request-document-type" name="documentType" required>
          <option value="">Selecciona una opción</option>
          <option value="Cédula de Ciudadanía">Cédula de Ciudadanía</option>
          <option value="Tarjeta de Identidad">Tarjeta de Identidad</option>
        </select>
      </div>
      <div class="fr">
        <label for="request-document-number">Número de documento</label>
        <input id="request-document-number" name="documentNumber" type="text" inputmode="numeric" maxlength="30" autocomplete="off" placeholder="Número..." required />
      </div>
    </div>
    <div class="fr">
      <label for="request-document">Documento requerido</label>
      <select id="request-document" name="document" required>
        <option value="">Selecciona un documento</option>
        <option value="Certificado de Estudios">Certificado de Estudios</option>
        <option value="Boletín de Notas">Boletín de Notas</option>
        <option value="Paz y Salvo">Paz y Salvo</option>
        <option value="Constancia de Matrícula">Constancia de Matrícula</option>
      </select>
    </div>
    <div class="fr">
      <label for="request-email">Correo electrónico de contacto</label>
      <input id="request-email" name="email" type="email" maxlength="254" placeholder="correo@ejemplo.com" autocomplete="email" required />
    </div>
    <div class="request-privacy-note">
      Los datos se usarán para gestionar esta solicitud y responder al correo indicado. La solicitud y la autorización quedarán registradas por la institución. Para consultar o ejercer tus derechos sobre los datos, escribe a <a href="mailto:ieluiscarlosgalan@sedcasanare.gov.co">ieluiscarlosgalan@sedcasanare.gov.co</a>.
    </div>
    <div class="request-consent-row">
      <input id="request-consent" name="consent" type="checkbox" required />
      <label for="request-consent">Autorizo el tratamiento de mis datos personales para atender esta solicitud y conozco el aviso de privacidad anterior.</label>
    </div>
    <div class="request-trap" aria-hidden="true">
      <label for="request-website">Deja este campo vacío</label>
      <input id="request-website" name="website" type="text" tabindex="-1" autocomplete="off" />
    </div>
    <p id="request-status" class="request-status" role="status" aria-live="polite"></p>
    <button class="btn btn-navy" id="request-submit" type="submit">Enviar solicitud</button>
  </form>`;

    body.querySelector('#document-request-form')?.addEventListener('submit', submitDocumentRequest);

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    body.querySelector('input')?.focus();
}

async function submitDocumentRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('#request-status');
    const submitButton = form.querySelector('#request-submit');
    const formData = new FormData(form);
    const payload = {
        name: formData.get('name'),
        documentType: formData.get('documentType'),
        documentNumber: formData.get('documentNumber'),
        document: formData.get('document'),
        email: formData.get('email'),
        consent: formData.get('consent') === 'on',
        website: formData.get('website')
    };

    status.textContent = 'Enviando la solicitud…';
    status.classList.remove('is-error');
    submitButton.disabled = true;

    try {
        const response = await fetch('/api/document-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar la solicitud.');

        status.textContent = result.emailSent
            ? `Solicitud registrada con código ${result.id}. La notificación fue enviada al correo de la institución.`
            : `Solicitud registrada con código ${result.id}, pero el aviso por correo no pudo enviarse. Comunícate con secretaría para confirmar su recepción.`;
        form.reset();
    } catch (error) {
        status.textContent = error.message || 'No se pudo conectar con el servidor. Intenta de nuevo.';
        status.classList.add('is-error');
    } finally {
        submitButton.disabled = false;
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    modalReturnFocus?.focus();
}

function closeIfBack(event) {
    if (event.target === event.currentTarget) closeModal();
}

function avisarFormularioSinEnvio(event, nombre) {
    event.preventDefault();
    if (nombre === 'PQRS') {
        const tipo = document.getElementById('pqrs-tipo');
        if (tipo && !tipo.value) {
            tipo.setCustomValidity('Selecciona un tipo de solicitud antes de continuar.');
            tipo.reportValidity();
            return;
        }
    }
    mostrarToast(`El formulario de ${nombre} es una demostración; no se enviaron datos.`);
}

window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-overlay')?.classList.contains('open')) {
        closeModal();
    }
});

// ======================================================
// DESCARGA DEL MANUAL DE CONVIVENCIA
// ======================================================
// El atributo download del <a> ya dispara la descarga real del archivo;
// esta función solo agrega la retroalimentación visual del botón y un toast.
function descargarManual(el) {
    if (!el || el.classList.contains('descargando')) return; // evita doble clic mientras anima

    const textoSpan = el.querySelector('.dl-text');
    const iconoSpan = el.querySelector('.dl-icon');
    if (!textoSpan || !iconoSpan) return;
    const textoOriginal = textoSpan.textContent;
    const iconoOriginal = iconoSpan.textContent;

    el.classList.add('descargando');
    iconoSpan.textContent = '✓';
    textoSpan.textContent = 'Descargando...';

    mostrarToast('📥 Descargando Manual de Convivencia 2025...');

    setTimeout(() => {
        el.classList.remove('descargando');
        iconoSpan.textContent = iconoOriginal;
        textoSpan.textContent = textoOriginal;
    }, 2200);
}

// Toast de confirmación reutilizable
function mostrarToast(mensaje) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.setAttribute('aria-atomic', 'true');
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
}
// ======================================================
// GALERÍA DE ÁLBUMES (almacenamiento local del navegador)
// ======================================================
const GALLERY_DB_NAME = 'luca-gallery-v1';
const GALLERY_MAX_BYTES = 25 * 1024 * 1024;
const GALLERY_CATEGORIES = {
    documentos: {
        title: 'Documentos',
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv'
    },
    videos: {
        title: 'Videos',
        accept: 'video/*,.mp4,.mov,.webm,.ogg'
    },
    fotos: {
        title: 'Fotos',
        accept: 'image/*'
    }
};
let galleryDatabase = null;
let galleryActiveCategory = 'fotos';
const galleryObjectUrls = new Set();

function openGalleryDatabase() {
    if (galleryDatabase) return Promise.resolve(galleryDatabase);
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('Este navegador no permite guardar la galería localmente.'));
            return;
        }
        const request = window.indexedDB.open(GALLERY_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('albums')) {
                db.createObjectStore('albums', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('items')) {
                const items = db.createObjectStore('items', { keyPath: 'id' });
                items.createIndex('albumId', 'albumId', { unique: false });
            }
        };
        request.onsuccess = () => {
            galleryDatabase = request.result;
            galleryDatabase.onversionchange = () => galleryDatabase.close();
            resolve(galleryDatabase);
        };
        request.onerror = () => reject(request.error || new Error('No se pudo abrir la galería.'));
    });
}

function galleryReadAll(storeName) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function galleryReadItems(albumId) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const store = db.transaction('items', 'readonly').objectStore('items');
        const request = store.index('albumId').getAll(albumId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }));
}

function gallerySaveAlbum(album, files) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(['albums', 'items'], 'readwrite');
        transaction.objectStore('albums').add(album);
        files.forEach(file => {
            transaction.objectStore('items').add({
                id: galleryCreateId(),
                albumId: album.id,
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                blob: new Blob([file], { type: file.type || 'application/octet-stream' })
            });
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el álbum.'));
        transaction.onabort = () => reject(transaction.error || new Error('Se canceló el guardado del álbum.'));
    }));
}

function galleryDeleteAlbum(albumId) {
    return openGalleryDatabase().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(['albums', 'items'], 'readwrite');
        transaction.objectStore('albums').delete(albumId);
        const cursorRequest = transaction.objectStore('items').index('albumId').openCursor(albumId);
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo eliminar el álbum.'));
    }));
}

function galleryCreateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'gal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

function galleryFormatSize(size) {
    if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + ' KB';
    return (size / (1024 * 1024)).toFixed(1) + ' MB';
}

function galleryFileIsAllowed(category, file) {
    const extension = file.name.toLowerCase().split('.').pop();
    if (category === 'fotos') {
        return file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(extension);
    }
    if (category === 'videos') {
        return file.type.startsWith('video/') || ['mp4', 'mov', 'webm', 'ogg', 'm4v'].includes(extension);
    }
    return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(extension);
}

function galleryReleaseObjectUrls() {
    galleryObjectUrls.forEach(url => URL.revokeObjectURL(url));
    galleryObjectUrls.clear();
}

function galleryCreateMedia(item, albumTitle) {
    const url = URL.createObjectURL(item.blob);
    galleryObjectUrls.add(url);
    const media = document.createElement('div');
    media.className = 'gallery-media';
    if (item.type.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = albumTitle + ': ' + item.name;
        image.loading = 'lazy';
        media.appendChild(image);
    } else if (item.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        video.setAttribute('aria-label', item.name);
        media.appendChild(video);
    } else {
        const link = document.createElement('a');
        link.className = 'gallery-document-link';
        link.href = url;
        link.download = item.name;
        link.textContent = '📄 ' + item.name;
        media.appendChild(link);
    }
    const fileInfo = document.createElement('small');
    fileInfo.textContent = galleryFormatSize(item.size);
    media.appendChild(fileInfo);
    return media;
}

async function galleryRenderAlbum(album) {
    const card = document.createElement('article');
    card.className = 'gallery-album-card';
    const header = document.createElement('div');
    header.className = 'gallery-album-header';
    const titleGroup = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = album.title;
    const author = document.createElement('p');
    author.textContent = 'Por ' + album.teacher + ' · ' + new Date(album.createdAt).toLocaleDateString('es-CO');
    titleGroup.append(title, author);
    const category = document.createElement('span');
    category.className = 'gallery-album-category';
    category.textContent = (GALLERY_CATEGORIES[album.category] || GALLERY_CATEGORIES.fotos).title;
    header.append(titleGroup, category);
    card.appendChild(header);

    const mediaGrid = document.createElement('div');
    mediaGrid.className = 'gallery-media-grid';
    const items = await galleryReadItems(album.id);
    items.forEach(item => mediaGrid.appendChild(galleryCreateMedia(item, album.title)));
    if (items.length) card.appendChild(mediaGrid);

    const footer = document.createElement('div');
    footer.className = 'gallery-album-footer';
    const fileCount = document.createElement('span');
    fileCount.textContent = items.length + (items.length === 1 ? ' archivo' : ' archivos');
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'gallery-delete';
    removeButton.dataset.albumId = album.id;
    removeButton.textContent = 'Eliminar álbum';
    footer.append(fileCount, removeButton);
    card.appendChild(footer);
    return card;
}

async function refreshGallery() {
    const list = document.getElementById('gallery-albums');
    const empty = document.getElementById('gallery-empty');
    if (!list || !empty) return;
    galleryReleaseObjectUrls();
    list.replaceChildren();

    try {
        const albums = await galleryReadAll('albums');
        const counts = { documentos: 0, videos: 0, fotos: 0 };
        albums.forEach(album => { counts[album.category] = (counts[album.category] || 0) + 1; });
        Object.keys(counts).forEach(category => {
            const counter = document.getElementById('count-' + category);
            if (counter) counter.textContent = counts[category];
        });

        const visibleAlbums = albums
            .filter(album => album.category === galleryActiveCategory)
            .sort((a, b) => b.createdAt - a.createdAt);
        const categoryTitle = GALLERY_CATEGORIES[galleryActiveCategory].title;
        const resultsTitle = document.getElementById('gallery-results-title');
        const albumCount = document.getElementById('gallery-album-count');
        if (resultsTitle) resultsTitle.textContent = 'Álbumes de ' + categoryTitle.toLowerCase();
        if (albumCount) albumCount.textContent = visibleAlbums.length + (visibleAlbums.length === 1 ? ' álbum' : ' álbumes');
        empty.hidden = visibleAlbums.length > 0;
        for (const album of visibleAlbums) {
            list.appendChild(await galleryRenderAlbum(album));
        }
    } catch (error) {
        empty.hidden = false;
        empty.textContent = 'No fue posible abrir la galería en este navegador. ' + error.message;
    }
}

function gallerySelectCategory(category) {
    if (!GALLERY_CATEGORIES[category]) return;
    galleryActiveCategory = category;
    document.querySelectorAll('.gallery-category').forEach(button => {
        const selected = button.dataset.galleryCategory === category;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    const select = document.getElementById('gallery-category-select');
    if (select) select.value = category;
    galleryUpdateFileHint();
    refreshGallery();
}

function galleryUpdateFileHint() {
    const select = document.getElementById('gallery-category-select');
    const input = document.getElementById('gallery-files');
    const hint = document.getElementById('gallery-file-hint');
    if (!select || !input || !hint) return;
    const category = GALLERY_CATEGORIES[select.value] ? select.value : 'fotos';
    select.value = category;
    input.accept = GALLERY_CATEGORIES[category].accept;
    const labels = {
        fotos: 'imágenes',
        videos: 'videos',
        documentos: 'documentos'
    };
    hint.textContent = 'Puedes seleccionar varios ' + labels[category] + '. Límite: 25 MB por álbum.';
}

async function galleryHandleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const teacher = document.getElementById('gallery-teacher').value.trim();
    const title = document.getElementById('gallery-album-title').value.trim();
    const category = document.getElementById('gallery-category-select').value;
    const files = Array.from(document.getElementById('gallery-files').files || []);
    const totalBytes = files.reduce((total, file) => total + file.size, 0);

    if (!teacher || !title) {
        mostrarToast('Escribe tu nombre y el nombre del álbum.');
        return;
    }
    if (files.some(file => !galleryFileIsAllowed(category, file))) {
        mostrarToast('Hay archivos que no corresponden a la categoría elegida.');
        return;
    }
    if (totalBytes > GALLERY_MAX_BYTES) {
        mostrarToast('El tamaño máximo por álbum es 25 MB.');
        return;
    }

    const album = {
        id: galleryCreateId(),
        title,
        teacher,
        category,
        createdAt: Date.now()
    };
    try {
        await gallerySaveAlbum(album, files);
        form.reset();
        gallerySelectCategory(category);
        mostrarToast('Álbum guardado en este navegador.');
    } catch (error) {
        mostrarToast(error.message || 'No se pudo guardar el álbum.');
    }
}

function initializeGallery() {
    const form = document.getElementById('gallery-upload-form');
    if (!form) return;
    document.querySelectorAll('.gallery-category').forEach(button => {
        button.addEventListener('click', () => gallerySelectCategory(button.dataset.galleryCategory));
    });
    const categorySelect = document.getElementById('gallery-category-select');
    const albumsList = document.getElementById('gallery-albums');
    if (!categorySelect || !albumsList) return;
    categorySelect.addEventListener('change', () => {
        galleryUpdateFileHint();
        gallerySelectCategory(categorySelect.value);
    });
    form.addEventListener('submit', galleryHandleUpload);
    albumsList.addEventListener('click', async event => {
        const button = event.target.closest('.gallery-delete');
        if (!button) return;
        if (!window.confirm('¿Eliminar este álbum y sus archivos de este navegador?')) return;
        try {
            await galleryDeleteAlbum(button.dataset.albumId);
            refreshGallery();
            mostrarToast('Álbum eliminado.');
        } catch (error) {
            mostrarToast(error.message || 'No se pudo eliminar el álbum.');
        }
    });
    galleryUpdateFileHint();
    refreshGallery();
}

window.addEventListener('DOMContentLoaded', initializeGallery);
