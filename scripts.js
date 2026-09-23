// ======================================================
// TABS / PESTAÑAS
// ======================================================

function showTab(id, btn) {
    // Ocultar todos los paneles
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Desactivar todos los botones de navegación
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.remove('active');
    });

    // Mostrar el panel correspondiente
    const panel = document.getElementById('panel-' + id);
    if (panel) {
        panel.classList.add('active');
    }

    // Activar el botón correspondiente (si se pasa como argumento)
    if (btn) {
        btn.classList.add('active');
    } else {
        // Buscar el botón correspondiente por atributo onclick si no se pasa 'btn'
        const targetBtn = document.querySelector(`.tab-btn[onclick*="'${id}'"]`);
        if (targetBtn) {
            targetBtn.classList.add('active');
        }
    }

    // Desplazar suavemente arriba
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

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
    document.querySelectorAll('.ptype').forEach(p => {
        p.classList.remove('sel');
    });

    if (el) {
        el.classList.add('sel');
    }

    const inputTipo = document.getElementById('pqrs-tipo');
    if (inputTipo) {
        inputTipo.value = tipo;
    }
}

// ======================================================
// MODAL DE SOLICITUD DE DOCUMENTOS
// ======================================================

function openModal() {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    
    if (body) {
        body.innerHTML = `
            <div class="form-wrap">
                <div class="fr">
                    <label>Nombre Completo del Solicitante</label>
                    <input type="text" placeholder="Ej: Juan Pérez" />
                </div>
                <div class="row2">
                    <div class="fr">
                        <label>Tipo de Documento</label>
                        <select>
                            <option>Cédula de Ciudadanía</option>
                            <option>Tarjeta de Identidad</option>
                        </select>
                    </div>
                    <div class="fr">
                        <label>Número de Documento</label>
                        <input type="text" placeholder="Número..." />
                    </div>
                </div>
                <div class="fr">
                    <label>Documento Requerido</label>
                    <select>
                        <option>Certificado de Estudios</option>
                        <option>Boletín de Notas</option>
                        <option>Paz y Salvo</option>
                        <option>Constancia de Matricula</option>
                    </select>
                </div>
                <div class="fr">
                    <label>Correo Electrónico de Contacto</label>
                    <input type="email" placeholder="correo@ejemplo.com" />
                </div>
                <button class="btn btn-navy" onclick="alert('✅ Solicitud enviada con éxito. Nos pondremos en contacto pronto.'); closeModal();">
                    Enviar Solicitud
                </button>
            </div>
        `;
    }

    if (overlay) {
        overlay.classList.add('open');
    }
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.classList.remove('open');
    }
}

function closeIfBack(event) {
    if (event.target.id === 'modal-overlay') {
        closeModal();
    }
}
// ======================================================
// DESCARGA DEL MANUAL DE CONVIVENCIA (PDF real)
// ======================================================
// El atributo download del <a> ya dispara la descarga real del archivo;
// esta función solo agrega la retroalimentación visual del botón y un toast.
function descargarManual(el) {
    if (el.classList.contains('descargando')) return; // evita doble clic mientras anima

    const textoSpan = el.querySelector('.dl-text');
    const iconoSpan = el.querySelector('.dl-icon');
    const textoOriginal = textoSpan.textContent;
    const iconoOriginal = iconoSpan.textContent;

    el.classList.add('descargando');
    iconoSpan.textContent = '✓';
    textoSpan.textContent = 'Descargando...';

    mostrarToast('📥 Descargando Manual de Convivencia 2024...');

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
        document.body.appendChild(toast);
    }
    toast.textContent = mensaje;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2600);
}