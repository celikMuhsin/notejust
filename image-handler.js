import { autoSave, restoreSelection } from './editor.js';

const contentInput = document.getElementById('note-content');

// ---- RESİM YÜKLEME (IMAGE UPLOAD) ----
window.triggerImageUpload = function () {
    document.getElementById('image-upload').click();
    const insertPalette = document.getElementById('insert-palette');
    if (insertPalette) insertPalette.classList.add('hidden');
};

document.getElementById('image-upload').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
        const dataUrl = event.target.result;
        restoreSelection();

        const imgHtml = `<img src="${dataUrl}" draggable="true" class="img-free" style="left:50px; top:100px; max-width:80%; border-radius:8px;">`;
        document.execCommand('insertHTML', false, imgHtml);

        contentInput.focus();
        autoSave();

        e.target.value = '';
    };
    reader.readAsDataURL(file);
});

// -----------------------------------------------------
// RESİM BOYUTLANDIRMA VE KIRPMA (RESIZE & CROP)
// -----------------------------------------------------

function getEventX(e) {
    if (e.type.includes('touch')) {
        return e.touches.length > 0 ? e.touches[0].clientX : (e.changedTouches ? e.changedTouches[0].clientX : 0);
    }
    return e.clientX;
}

function getEventY(e) {
    if (e.type.includes('touch')) {
        return e.touches.length > 0 ? e.touches[0].clientY : (e.changedTouches ? e.changedTouches[0].clientY : 0);
    }
    return e.clientY;
}

let selectedImg = null;
let resizerHandles = {};
let cropHandles = {};
let actionToolbar = null;
let layoutMenu = null;
let isResizing = false;
let isCropping = false;
let resizeDirection = '';
let initialRect = null;
let initialMouseX, initialMouseY;
let currentCropOffsets = { top: 0, right: 0, bottom: 0, left: 0 };

function createResizerHandles() {
    if (Object.keys(resizerHandles).length > 0) return;
    ['nw', 'ne', 'sw', 'se'].forEach(dir => {
        const h = document.createElement('div');
        h.className = `image-resizer-handle ${dir}`;
        document.body.appendChild(h);
        resizerHandles[dir] = h;

        const handleResizeStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            resizeDirection = dir;
            initialRect = selectedImg.getBoundingClientRect();
            initialMouseX = getEventX(e);
            initialMouseY = getEventY(e);
            document.body.style.cursor = window.getComputedStyle(h).cursor;
        };
        h.addEventListener('mousedown', handleResizeStart);
        h.addEventListener('touchstart', handleResizeStart, { passive: false });
    });
}

function createActionToolbar() {
    if (actionToolbar) return;
    actionToolbar = document.createElement('div');
    actionToolbar.className = 'image-action-toolbar';

    // Düzen Butonu
    const layoutBtn = document.createElement('div');
    layoutBtn.className = 'image-action-btn';
    layoutBtn.title = 'Düzen Seçenekleri';
    layoutBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M7 8h10M7 12h10M7 16h6"/>
        </svg>
    `;
    layoutBtn.onclick = (e) => {
        e.stopPropagation();
        showLayoutMenu(e);
    };

    // Kırpma Butonu
    const cropBtn = document.createElement('div');
    cropBtn.className = 'image-action-btn';
    cropBtn.title = 'Kırp';
    cropBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
            <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
        </svg>
    `;
    cropBtn.onclick = (e) => {
        e.stopPropagation();
        toggleCropMode();
    };

    // YENİ: Taşıma (Sürükleme) Butonu (Özel SVG İkon)
    const moveBtn = document.createElement('div');
    moveBtn.className = 'image-action-btn';
    moveBtn.title = 'Taşı (Sürükle)';
    moveBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="5 9 2 12 5 15"></polyline>
            <polyline points="9 5 12 2 15 5"></polyline>
            <polyline points="19 9 22 12 19 15"></polyline>
            <polyline points="9 19 12 22 15 19"></polyline>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="12" y1="2" x2="12" y2="22"></line>
        </svg>
    `;
    moveBtn.onclick = (e) => {
        e.stopPropagation();
        isMoving = true;
        document.body.style.cursor = 'move';
        moveBtn.classList.add('active');

        // EKLENDİ: Butona basıldığı an mobil engeli aşılır, zıplamaması için mevcut konumu sabitlenir
        if (selectedImg) {
            if (!selectedImg.classList.contains('was-dragged') && window.innerWidth <= 768) {
                if (!selectedImg.style.getPropertyValue('--mobile-left')) {
                    const imgRect = selectedImg.getBoundingClientRect();
                    const contentRect = contentInput.getBoundingClientRect();
                    selectedImg.style.setProperty('--mobile-left', `${imgRect.left - contentRect.left + contentInput.scrollLeft}px`);
                    selectedImg.style.setProperty('--mobile-top', `${imgRect.top - contentRect.top + contentInput.scrollTop}px`);
                }
                selectedImg.classList.add('was-dragged');
            }
            selectedImg.classList.add('is-dragging');
        }
    };

    // YENİ: Silme (Çöp Tenekesi) Butonu
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'image-action-btn';
    deleteBtn.title = 'Resmi Sil';
    deleteBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
    `;
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (selectedImg) {
            selectedImg.remove();
            deselectImage();
            autoSave();
        }
    };

    actionToolbar.appendChild(layoutBtn);
    actionToolbar.appendChild(cropBtn);
    actionToolbar.appendChild(moveBtn);
    actionToolbar.appendChild(deleteBtn);
    document.body.appendChild(actionToolbar);
}


function createCropHandles() {
    if (Object.keys(cropHandles).length > 0) return;
    ['nw', 'ne', 'sw', 'se', 'top', 'bottom', 'left', 'right'].forEach(dir => {
        const h = document.createElement('div');
        h.className = `crop-handle ${dir}`;
        document.body.appendChild(h);
        cropHandles[dir] = h;

        const handleCropStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            resizeDirection = `crop-${dir}`;
            initialRect = selectedImg.getBoundingClientRect();
            initialMouseX = getEventX(e);
            initialMouseY = getEventY(e);
        };
        h.addEventListener('mousedown', handleCropStart);
        h.addEventListener('touchstart', handleCropStart, { passive: false });
    });
}

function updateHandlePosition() {
    if (!selectedImg || !actionToolbar) return;

    if (!document.body.contains(selectedImg)) {
        deselectImage();
        return;
    }

    const rect = selectedImg.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    if (!isCropping) {
        Object.values(resizerHandles).forEach(h => h.style.display = 'block');
        resizerHandles.nw.style.top = `${scrollY + rect.top - 5}px`;
        resizerHandles.nw.style.left = `${scrollX + rect.left - 5}px`;
        resizerHandles.ne.style.top = `${scrollY + rect.top - 5}px`;
        resizerHandles.ne.style.left = `${scrollX + rect.left + rect.width - 5}px`;
        resizerHandles.sw.style.top = `${scrollY + rect.top + rect.height - 5}px`;
        resizerHandles.sw.style.left = `${scrollX + rect.left - 5}px`;
        resizerHandles.se.style.top = `${scrollY + rect.top + rect.height - 5}px`;
        resizerHandles.se.style.left = `${scrollX + rect.left + rect.width - 5}px`;

        Object.values(cropHandles).forEach(h => h.style.display = 'none');
    } else {
        Object.values(resizerHandles).forEach(h => h.style.display = 'none');
        Object.values(cropHandles).forEach(h => h.style.display = 'block');

        cropHandles.nw.style.top = `${scrollY + rect.top}px`;
        cropHandles.nw.style.left = `${scrollX + rect.left}px`;
        cropHandles.ne.style.top = `${scrollY + rect.top}px`;
        cropHandles.ne.style.left = `${scrollX + rect.left + rect.width - 12}px`;
        cropHandles.sw.style.top = `${scrollY + rect.top + rect.height - 12}px`;
        cropHandles.sw.style.left = `${scrollX + rect.left}px`;
        cropHandles.se.style.top = `${scrollY + rect.top + rect.height - 12}px`;
        cropHandles.se.style.left = `${scrollX + rect.left + rect.width - 12}px`;

        cropHandles.top.style.top = `${scrollY + rect.top}px`;
        cropHandles.top.style.left = `${scrollX + rect.left + rect.width / 2 - 15}px`;
        cropHandles.bottom.style.top = `${scrollY + rect.top + rect.height - 4}px`;
        cropHandles.bottom.style.left = `${scrollX + rect.left + rect.width / 2 - 15}px`;
        cropHandles.left.style.top = `${scrollY + rect.top + rect.height / 2 - 15}px`;
        cropHandles.left.style.left = `${scrollX + rect.left}px`;
        cropHandles.right.style.top = `${scrollY + rect.top + rect.height / 2 - 15}px`;
        cropHandles.right.style.left = `${scrollX + rect.left + rect.width - 4}px`;
    }

    actionToolbar.style.display = 'flex';

    // Araç çubuğu boyutunu hesaba katarak ekranı taşıp yatay scroll oluşturmasını engelle
    const toolbarWidth = actionToolbar.offsetWidth || 40;
    
    if (window.innerWidth <= 768) {
        // Mobilde resmin dışına taşmasını engellemek için resmin sağ üst 'iç' kısmına konumlandır
        let leftPos = scrollX + rect.right - toolbarWidth - 10;
        if (leftPos < scrollX + rect.left) leftPos = scrollX + rect.left + 10; // Ekstra dar durumlarda sola al
        
        actionToolbar.style.top = `${scrollY + rect.top + 10}px`;
        actionToolbar.style.left = `${leftPos}px`;
    } else {
        // Masaüstünde resmin sağına rahatça yerleştir
        actionToolbar.style.top = `${scrollY + rect.top}px`;
        actionToolbar.style.left = `${scrollX + rect.right + 10}px`;
    }
}

function deselectImage() {
    if (selectedImg) {
        selectedImg.classList.remove('resize-active');
        selectedImg = null;
    }
    isCropping = false;
    Object.values(resizerHandles).forEach(h => h.style.display = 'none');
    Object.values(cropHandles).forEach(h => h.style.display = 'none');
    if (actionToolbar) actionToolbar.style.display = 'none';
    if (layoutMenu) {
        layoutMenu.remove();
        layoutMenu = null;
    }
}

function toggleCropMode() {
    isCropping = !isCropping;
    if (isCropping) {
        createCropHandles();
        const cropBtn = actionToolbar.querySelector('.image-action-btn:last-child');
        cropBtn.classList.add('active');
    } else {
        const cropBtn = actionToolbar.querySelector('.image-action-btn:last-child');
        cropBtn.classList.remove('active');
    }
    updateHandlePosition();
}

function showLayoutMenu(event) {
    if (layoutMenu) {
        layoutMenu.remove();
        layoutMenu = null;
        return;
    }

    layoutMenu = document.createElement('div');
    layoutMenu.className = 'layout-menu';

    const options = [
        { id: 'free', label: 'Serbest (Yapışkan)', icon: '<rect x="6" y="6" width="12" height="12" rx="2" stroke-dasharray="2 2"/><path d="M4 4l16 16M20 4l-16 16"/>' },
        { id: 'inline', label: 'Metinle Aynı Hizada', icon: '<path d="M3 6h7M14 6h7M3 12h18M3 18h18"/><rect x="8" y="4" width="8" height="8"/>' },
        { id: 'left', label: 'Metin Kaydırma (Sol)', icon: '<rect x="3" y="3" width="8" height="8"/><path d="M14 5h7M14 9h7M3 14h18M3 18h18"/>' },
        { id: 'right', label: 'Metin Kaydırma (Sağ)', icon: '<rect x="13" y="3" width="8" height="8"/><path d="M3 5h7M3 9h7M3 14h18M3 18h18"/>' },
        { id: 'center', label: 'Ortala (Tek Satır)', icon: '<path d="M3 6h18M3 12h18M3 18h18"/><rect x="8" y="5" width="8" height="14"/>' }
    ];

    const currentMode = selectedImg.classList.contains('img-wrap-left') ? 'left' :
        selectedImg.classList.contains('img-wrap-right') ? 'right' :
            selectedImg.classList.contains('img-wrap-center') ? 'center' :
                selectedImg.classList.contains('img-free') ? 'free' : 'inline';

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = `layout-option ${currentMode === opt.id ? 'active' : ''}`;
        item.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${opt.icon}
            </svg>
            <span>${opt.label}</span>
        `;
        item.onclick = () => applyImageWrap(opt.id);
        layoutMenu.appendChild(item);
    });

    document.body.appendChild(layoutMenu);

    const toolbarRect = actionToolbar.getBoundingClientRect();
    let leftPos = window.scrollX + toolbarRect.right + 8;
    const menuWidth = layoutMenu.offsetWidth || 160;

    if (leftPos + menuWidth > window.innerWidth) {
        leftPos = window.innerWidth - menuWidth - 10;
        if (leftPos < 0) leftPos = 10;
    }

    layoutMenu.style.top = `${window.scrollY + toolbarRect.top}px`;
    layoutMenu.style.left = `${leftPos}px`;
}

function applyImageWrap(mode) {
    if (!selectedImg) return;

    selectedImg.classList.remove('img-wrap-inline', 'img-wrap-left', 'img-wrap-right', 'img-wrap-center', 'img-free');

    if (mode === 'left') selectedImg.classList.add('img-wrap-left');
    else if (mode === 'right') selectedImg.classList.add('img-wrap-right');
    else if (mode === 'center') selectedImg.classList.add('img-wrap-center');
    else if (mode === 'free') {
        selectedImg.classList.add('img-free');
        if (!selectedImg.style.left) {
            selectedImg.style.left = '50px';
            selectedImg.style.top = '50px';
        }
    }
    else selectedImg.classList.add('img-wrap-inline');

    deselectImage();
    autoSave();
}

let isMoving = false;
let moveStartX, moveStartY;
let imgStartX, imgStartY;

const handleImageDown = (e) => {
    if (isResizing) return;

    if (e.target.tagName === 'IMG' && contentInput.contains(e.target)) {
        // Masaüstünde direkt isMoving tetiklenir, mobilde ise özel olarak aktif olması beklenir.
        const isDesktop = window.innerWidth > 768;

        if (e.target.classList.contains('img-free') && (isDesktop || isMoving)) {
            isMoving = true; // Masaüstünde zorla true yapar
            moveStartX = getEventX(e);
            moveStartY = getEventY(e);

            selectedImg = e.target;
            const contentRect = contentInput.getBoundingClientRect();
            const imgRect = selectedImg.getBoundingClientRect();

            if (!selectedImg.classList.contains('was-dragged') && !isDesktop) {
                if (!selectedImg.style.getPropertyValue('--mobile-left')) {
                    const imgRect = selectedImg.getBoundingClientRect();
                    const contentRect = contentInput.getBoundingClientRect();
                    selectedImg.style.setProperty('--mobile-left', `${imgRect.left - contentRect.left + contentInput.scrollLeft}px`);
                    selectedImg.style.setProperty('--mobile-top', `${imgRect.top - contentRect.top + contentInput.scrollTop}px`);
                }
                selectedImg.classList.add('was-dragged');
                imgStartX = parseInt(selectedImg.style.getPropertyValue('--mobile-left')) || 0;
                imgStartY = parseInt(selectedImg.style.getPropertyValue('--mobile-top')) || 0;
            } else {
                if (isDesktop) {
                    imgStartX = parseInt(selectedImg.style.left) || 0;
                    imgStartY = parseInt(selectedImg.style.top) || 0;
                } else {
                    imgStartX = parseInt(selectedImg.style.getPropertyValue('--mobile-left')) || 0;
                    imgStartY = parseInt(selectedImg.style.getPropertyValue('--mobile-top')) || 0;
                }
            }

            selectedImg.classList.add('is-dragging');
            // Mobilde klavyeyi açıp "touchcancel" fırlatarak sürüklemeyi bozduğu için focus() kaldırıldı.
            if (e.type !== 'touchstart' || e.cancelable) {
                e.preventDefault();
            }
        } else if (!isDesktop) {
            isMoving = false; // Mobilde sürükleme açık değilse, tamamen kapat.
        }

        deselectImage();
        selectedImg = e.target;
        selectedImg.classList.add('resize-active');

        createResizerHandles();
        createActionToolbar();

        currentCropOffsets = { top: 0, right: 0, bottom: 0, left: 0 };
        selectedImg.style.clipPath = 'none';

        updateHandlePosition();
    } else if (Object.values(resizerHandles).some(h => h.contains(e.target)) ||
        Object.values(cropHandles).some(h => h.contains(e.target)) ||
        (actionToolbar && actionToolbar.contains(e.target)) ||
        (layoutMenu && layoutMenu.contains(e.target))) {
        return;
    } else {
        deselectImage();
        isMoving = false;
        document.body.style.cursor = 'default';
    }
};

document.addEventListener('mousedown', handleImageDown);
document.addEventListener('touchstart', handleImageDown, { passive: false });

const handleImageMove = (e) => {
    if (isMoving && selectedImg) {
        if (e.type === 'touchmove' && e.cancelable) e.preventDefault();
        const dx = getEventX(e) - moveStartX;
        const dy = getEventY(e) - moveStartY;
        
        if (window.innerWidth > 768) {
            selectedImg.style.left = `${imgStartX + dx}px`;
            selectedImg.style.top = `${imgStartY + dy}px`;
        } else {
            selectedImg.style.setProperty('--mobile-left', `${imgStartX + dx}px`);
            selectedImg.style.setProperty('--mobile-top', `${imgStartY + dy}px`);
        }
        
        updateHandlePosition();
        return;
    }

    if (!isResizing || !selectedImg || !resizeDirection) return;

    if (e.type === 'touchmove' && e.cancelable) e.preventDefault();

    if (resizeDirection.startsWith('crop-')) {
        const dir = resizeDirection.replace('crop-', '');
        const dx = getEventX(e) - initialMouseX;
        const dy = getEventY(e) - initialMouseY;

        if (dir === 'top' || dir === 'nw' || dir === 'ne') currentCropOffsets.top += dy;
        if (dir === 'bottom' || dir === 'sw' || dir === 'se') currentCropOffsets.bottom -= dy;
        if (dir === 'left' || dir === 'nw' || dir === 'sw') currentCropOffsets.left += dx;
        if (dir === 'right' || dir === 'ne' || dir === 'se') currentCropOffsets.right -= dx;

        currentCropOffsets.top = Math.max(0, currentCropOffsets.top);
        currentCropOffsets.right = Math.max(0, currentCropOffsets.right);
        currentCropOffsets.bottom = Math.max(0, currentCropOffsets.bottom);
        currentCropOffsets.left = Math.max(0, currentCropOffsets.left);

        selectedImg.style.clipPath = `inset(${currentCropOffsets.top}px ${currentCropOffsets.right}px ${currentCropOffsets.bottom}px ${currentCropOffsets.left}px)`;

        initialMouseX = getEventX(e);
        initialMouseY = getEventY(e);
        return;
    }

    const dx = getEventX(e) - initialMouseX;
    const dy = getEventY(e) - initialMouseY;

    let newWidth = initialRect.width;

    if (resizeDirection === 'se') {
        newWidth = initialRect.width + dx;
    } else if (resizeDirection === 'sw') {
        newWidth = initialRect.width - dx;
    } else if (resizeDirection === 'ne') {
        newWidth = initialRect.width + dx;
    } else if (resizeDirection === 'nw') {
        newWidth = initialRect.width - dx;
    }

    if (newWidth > 30) {
        selectedImg.style.width = `${newWidth}px`;
        selectedImg.style.height = 'auto';
        updateHandlePosition();
    }
};

window.addEventListener('mousemove', handleImageMove);
window.addEventListener('touchmove', handleImageMove, { passive: false });

const handleImageUp = () => {
    if (isResizing && resizeDirection.startsWith('crop-') && selectedImg) {
        performPermanentCrop();
    }

    if (isResizing || isMoving) {
        if (selectedImg) {
            // EKLENDİ: Sürükleme bittiğinde bu zorunlu CSS atlatıcısını kesin kaldırıyoruz
            selectedImg.classList.remove('is-dragging');
            setTimeout(updateHandlePosition, 10);

            // Eğer butona basıldıysa butonu normal haline döndür
            if (isMoving && actionToolbar) {
                const moveBtns = actionToolbar.querySelectorAll('.image-action-btn');
                if (moveBtns.length > 2) moveBtns[2].classList.remove('active');
            }
        }
        isResizing = false;
        isMoving = false;
        resizeDirection = '';
        document.body.style.cursor = 'default';
        autoSave();
    }
};

window.addEventListener('mouseup', handleImageUp);
window.addEventListener('touchend', handleImageUp);
window.addEventListener('touchcancel', handleImageUp);

function performPermanentCrop() {
    if (!selectedImg || (currentCropOffsets.top === 0 && currentCropOffsets.right === 0 &&
        currentCropOffsets.bottom === 0 && currentCropOffsets.left === 0)) return;

    const img = selectedImg;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Görünen boyutları al
    const displayWidth = img.width;
    const displayHeight = img.height;

    // Kırpılmış yeni boyutlar
    const newWidth = displayWidth - currentCropOffsets.left - currentCropOffsets.right;
    const newHeight = displayHeight - currentCropOffsets.top - currentCropOffsets.bottom;

    if (newWidth <= 0 || newHeight <= 0) return;

    // Orijinal resim verisini al
    const tempImg = new Image();
    tempImg.src = img.src;
    tempImg.onload = () => {
        // Ölçek oranını hesapla (Orijinal vs Görünen)
        const scaleX = tempImg.width / displayWidth;
        const scaleY = tempImg.height / displayHeight;

        canvas.width = newWidth * scaleX;
        canvas.height = newHeight * scaleY;

        ctx.drawImage(
            tempImg,
            currentCropOffsets.left * scaleX,
            currentCropOffsets.top * scaleY,
            newWidth * scaleX,
            newHeight * scaleY,
            0, 0,
            canvas.width,
            canvas.height
        );

        // Yeni resmi ata ve kırpmayı sıfırla
        img.src = canvas.toDataURL('image/png');
        img.style.clipPath = 'none';
        img.style.width = `${newWidth}px`;
        img.style.height = 'auto'; // Oranı koru

        currentCropOffsets = { top: 0, right: 0, bottom: 0, left: 0 };

        setTimeout(() => {
            // EKLENDİ: Kırpma bitiminde tüm kırpma kutularını, hayaletleri ve menüleri yok et
            // Ve resmi seçili bırakma ki arkasındaki div vb native kopyalar kaybolsun
            deselectImage();
            
            // Native resim kopyalarını engellemek için sadece DB'ye kaydet
            autoSave();
        }, 50);
    };
}


window.addEventListener('scroll', updateHandlePosition, true);
window.addEventListener('resize', updateHandlePosition);

document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
        deselectImage();
    }
});

// --- Olay Dinleyicileri (Mouse ve Touch Eventleri) ---
document.addEventListener('mousedown', handleImageDown);
document.addEventListener('touchstart', handleImageDown, { passive: false });

window.addEventListener('mousemove', handleImageMove);
window.addEventListener('touchmove', handleImageMove, { passive: false });

window.addEventListener('mouseup', handleImageUp);
window.addEventListener('touchend', handleImageUp);
window.addEventListener('touchcancel', handleImageUp);

// Scroll ve Resize Olayları
window.addEventListener('scroll', updateHandlePosition, true);
window.addEventListener('resize', updateHandlePosition);

// Native Drag olaylarını engelleme
document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
        e.preventDefault(); // Native kopyalamayı kesin engelle
        deselectImage();
    }
});

document.addEventListener('dragend', (e) => {
    if (e.target.tagName === 'IMG') {
        setTimeout(() => {
            selectedImg = e.target;
            selectedImg.classList.add('resize-active');
            createResizerHandles();
            createActionToolbar();
            updateHandlePosition();
            autoSave();
        }, 50);
    }
});

// --- Uzun Basma (Long Press) İle Taşıma Başlatma ---
let longPressTimer = null;

const startLongPress = (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('img-free') && !isMoving) {
        // Olayın o anki "touchstart" koordinatlarını hemen kopyala ki timeout içinde Safari bugu vermesin
        const startX = getEventX(e);
        const startY = getEventY(e);
        const targetImg = e.target;

        longPressTimer = setTimeout(() => {
            isMoving = true;
            document.body.style.cursor = 'move';
            selectedImg = targetImg;
            
            // Sürükleme için gereken X ve Y başlangıç değişkenlerini "touchmove" başlamadan hemen ayarla
            moveStartX = startX;
            moveStartY = startY;

            if (window.innerWidth <= 768) {
                // Koordinat zıplamasını engellemek için mevcut CSS statik konumunu absolute yapınca kilitliyoruz.
                if (!selectedImg.classList.contains('was-dragged') && !selectedImg.style.getPropertyValue('--mobile-left')) {
                    const imgRect = selectedImg.getBoundingClientRect();
                    const contentRect = contentInput.getBoundingClientRect();
                    selectedImg.style.setProperty('--mobile-left', `${imgRect.left - contentRect.left + contentInput.scrollLeft}px`);
                    selectedImg.style.setProperty('--mobile-top', `${imgRect.top - contentRect.top + contentInput.scrollTop}px`);
                }
                selectedImg.classList.add('was-dragged');
                imgStartX = parseInt(selectedImg.style.getPropertyValue('--mobile-left')) || 0;
                imgStartY = parseInt(selectedImg.style.getPropertyValue('--mobile-top')) || 0;
            } else {
                imgStartX = parseInt(selectedImg.style.left) || 0;
                imgStartY = parseInt(selectedImg.style.top) || 0;
            }

            selectedImg.classList.add('is-dragging');

            if (actionToolbar) {
                const moveBtns = actionToolbar.querySelectorAll('.image-action-btn');
                if (moveBtns.length > 2 && moveBtns[2]) moveBtns[2].classList.add('active'); // Taşıma butonunu aktif et
            }
            
            // Titreşim algısı varsa çalıştırıp sürüklenebileceğini hissettir
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 1000); // 1 Saniye Basılı Tutma Şartı
    }
};

const cancelLongPress = () => {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
};

document.addEventListener('touchstart', startLongPress, { passive: true });
document.addEventListener('mousedown', startLongPress);

// Herhangi bir parmak hareketi (kısa dokunma, sayfayı kaydırma vb.) uzun basmayı bozar
document.addEventListener('touchmove', cancelLongPress, { passive: true });
document.addEventListener('touchend', cancelLongPress);
document.addEventListener('touchcancel', cancelLongPress);
document.addEventListener('mousemove', cancelLongPress);
document.addEventListener('mouseup', cancelLongPress);


// ---- Dışa Aktarımlar ----
export {
    deselectImage,
    updateHandlePosition
};
