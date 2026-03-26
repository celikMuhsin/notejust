import { items, saveDataToDB } from './db.js';

// ---- DOM Elementleri ----
const titleInput = document.querySelector('.note-title');
const contentInput = document.getElementById('note-content');
const notesList = document.getElementById('notes-list');
const noteDateDisplay = document.getElementById('note-date-display');
const sidebar = document.querySelector('.sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarContent = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// ---- Durum (State) Değişkenleri ----
let activeNoteId = null;
let expandedFolders = new Set();
let draggedNodeId = null;

// Modül dışından (örneğin editor.js) activeNoteId'yi güncellemek için setter
function setActiveNoteId(id) {
    activeNoteId = id;
}

function adjustTitleHeight() {
    if (!titleInput) return;
    titleInput.style.height = 'auto';
    titleInput.style.height = titleInput.scrollHeight + 'px';
}

const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function formatTurkishDate(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Ortak Kaydetme ve Render Fonksiyonu
function saveData() {
    saveDataToDB();
    renderNotesList();
}

function renderNotesList() {
    notesList.innerHTML = '';
    const rootItems = items.filter(item => item.parentId === null);
    
    const sortItems = (arr) => {
        return arr.sort((a, b) => (a.order || 0) - (b.order || 0));
    };

    const renderTree = (parentEl, nodes) => {
        sortItems(nodes).forEach(node => {
            const li = document.createElement('li');
            li.className = 'tree-item';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'tree-item-content';
            contentDiv.draggable = true;
            contentDiv.dataset.id = node.id;
            
            // YENİ: Mobilde uzun basınca tarayıcının kendi sağ tık / seçme menüsünün açılmasını engeller
            contentDiv.style.userSelect = 'none';
            contentDiv.style.webkitUserSelect = 'none';
            contentDiv.style.webkitTouchCallout = 'none';
            
            if (node.id === activeNoteId && node.type === 'note') {
                contentDiv.classList.add('active');
            }
            
            const iconSpan = document.createElement('span');
            iconSpan.className = 'tree-item-icon';
            if (node.type === 'folder') {
                iconSpan.textContent = expandedFolders.has(node.id) ? '📂' : '📁';
            } else {
                iconSpan.textContent = '📄';
            }
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'tree-item-title';
            const defaultTitle = node.type === 'folder' ? 'İsimsiz Klasör' : 'İsimsiz Not';
            titleSpan.textContent = (node.title || '').trim() === '' ? defaultTitle : node.title;
            
            contentDiv.appendChild(iconSpan);
            contentDiv.appendChild(titleSpan);
            
            // YENİ: Aksiyon Menüsü (Üç Nokta) Düğmesi
            const actionBtn = document.createElement('span');
            actionBtn.innerHTML = '&#8942;'; // ⋮
            actionBtn.className = 'tree-item-action-btn';
            actionBtn.style.marginLeft = 'auto'; // Sağa dayamak için
            actionBtn.style.padding = '0 6px';
            actionBtn.style.cursor = 'pointer';
            actionBtn.style.fontWeight = 'bold';
            actionBtn.style.color = '#a1a1aa';
            
            // Sadece aktif not veya herhangi bir klasör üzerine eklenecek mantık (aktif klasör yok ama hepsi için gösterelim dedik)
            if (node.type === 'folder' || node.id === activeNoteId) {
                actionBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Öğeye yaramayıp (klasör veya note) sadece menüyü açar
                    toggleDropdownMenu(e, node, actionBtn);
                });
                contentDiv.appendChild(actionBtn);
            }

            li.appendChild(contentDiv);
            
            setupDragAndDrop(contentDiv, node);

            if (node.type === 'folder') {
                const childrenUl = document.createElement('ul');
                childrenUl.className = 'tree-children';
                
                if (expandedFolders.has(node.id)) {
                    childrenUl.classList.add('expanded');
                }
                
                const childrenNodes = items.filter(i => i.parentId === node.id);
                renderTree(childrenUl, childrenNodes);
                li.appendChild(childrenUl);
                
                contentDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (activeDropdown) {
                        activeDropdown.remove();
                        activeDropdown = null;
                    }
                    if (expandedFolders.has(node.id)) {
                        expandedFolders.delete(node.id);
                    } else {
                        expandedFolders.add(node.id);
                    }
                    renderNotesList();
                });

                contentDiv.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    const newName = prompt("Klasörün yeni adı:", node.title);
                    if (newName !== null) {
                        node.title = newName;
                        node.updatedAt = Date.now();
                        saveData();
                    }
                });
            } else {
                contentDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (activeDropdown) {
                        activeDropdown.remove();
                        activeDropdown = null;
                    }
                    
                    // Mobilde bir nota tıklandıysa menüyü otomatik kapat
                    if (window.innerWidth <= 768 && sidebarContent && sidebarOverlay) {
                        sidebarContent.classList.remove('open');
                        sidebarOverlay.classList.remove('active');
                    }
                    
                    selectNote(node.id);
                });
            }

            parentEl.appendChild(li);
        });
    };
    
    renderTree(notesList, rootItems);
}

// ---- YENİ FONKSİYONLAR: DÜZENLEME VE SİLME ----
let activeDropdown = null;

document.addEventListener('click', () => {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }
});

function toggleDropdownMenu(e, node, btnElement) {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'tree-dropdown-menu';
    dropdown.style.position = 'absolute'; // Pozisyon hala dinamik kalmalı
    
    // Yeniden Adlandır Seçeneği
    const renameOption = document.createElement('div');
    renameOption.className = 'tree-dropdown-item';
    renameOption.innerHTML = '✏️ Yeniden Adlandır';
    renameOption.onclick = (event) => {
        event.stopPropagation();
        renameItem(node.id);
        dropdown.remove();
        activeDropdown = null;
    };

    // Sil Seçeneği
    const deleteOption = document.createElement('div');
    deleteOption.className = 'tree-dropdown-item delete';
    deleteOption.innerHTML = '🗑️ Sil';
    deleteOption.onclick = (event) => {
        event.stopPropagation();
        deleteItem(node.id);
        dropdown.remove();
        activeDropdown = null;
    };

    dropdown.appendChild(renameOption);
    dropdown.appendChild(deleteOption);

    const rect = btnElement.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    
    // Sağ kenardan taşmayı önlemek için basit kontrol
    if (rect.right + 120 > window.innerWidth) {
        dropdown.style.left = `${rect.right + window.scrollX - 160}px`;
    } else {
        dropdown.style.left = `${rect.left + window.scrollX}px`;
    }

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;
}

function deleteItem(id) {
    const confirmDelete = confirm('Bu öğeyi silmek istediğinize emin misiniz?');
    if (!confirmDelete) return;

    const getChildrenIds = (parentId) => {
        let childIds = items.filter(i => i.parentId === parentId).map(i => i.id);
        let allIds = [...childIds];
        childIds.forEach(childId => {
            allIds = allIds.concat(getChildrenIds(childId));
        });
        return allIds;
    };

    const idsToDelete = [id, ...getChildrenIds(id)];

    if (idsToDelete.includes(activeNoteId)) {
        activeNoteId = null;
        document.querySelector('.note-title').value = '';
        document.getElementById('note-content').innerHTML = '';
        document.querySelector('.note-title').disabled = true;
        document.getElementById('note-date-display').textContent = '';
        adjustTitleHeight();
    }

    for (let i = items.length - 1; i >= 0; i--) {
        if (idsToDelete.includes(items[i].id)) {
            items.splice(i, 1);
        }
    }

    saveData();
}

function renameItem(id) {
    const node = items.find(i => i.id === id);
    if (!node) return;

    const newName = prompt('Yeni ad:', node.title);
    if (newName !== null && newName.trim() !== '') {
        node.title = newName.trim();
        node.updatedAt = Date.now();
        
        if (id === activeNoteId) {
            document.querySelector('.note-title').value = node.title;
            adjustTitleHeight();
        }

        saveData();
    }
}

// ---- SÜRÜKLE BIRAK (DRAG AND DROP) ----
function setupDragAndDrop(el, node) {
    el.addEventListener('dragstart', (e) => {
        draggedNodeId = node.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.id);
        setTimeout(() => el.style.opacity = '0.5', 0);
    });

    el.addEventListener('dragend', () => {
        el.style.opacity = '1';
        draggedNodeId = null;
        document.querySelectorAll('[class*="drag-over"]').forEach(n => {
            n.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
        });
    });

    el.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        e.stopPropagation();
        
        if (node.id === draggedNodeId) return; 
        if (isChildOf(draggedNodeId, node.id)) return; 

        e.dataTransfer.dropEffect = 'move';
        
        const box = el.getBoundingClientRect();
        const offset = e.clientY - box.top;
        
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');

        if (node.type === 'folder') {
            if (offset < box.height * 0.25) el.classList.add('drag-over-top');
            else if (offset > box.height * 0.75) el.classList.add('drag-over-bottom');
            else el.classList.add('drag-over-inside');
        } else {
            if (offset < box.height / 2) el.classList.add('drag-over-top');
            else el.classList.add('drag-over-bottom');
        }
    });

    el.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
    });

    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isTop = el.classList.contains('drag-over-top');
        const isBottom = el.classList.contains('drag-over-bottom');
        const isInside = el.classList.contains('drag-over-inside');
        
        el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
        
        if (node.id === draggedNodeId) return;
        if (isChildOf(draggedNodeId, node.id)) return;

        const draggedId = e.dataTransfer.getData('text/plain');
        
        if (isInside) {
            moveItemAndOrder(draggedId, node.id, 'append');
        } else if (isTop) {
            moveItemAndOrder(draggedId, node.parentId, 'before', node.id);
        } else if (isBottom) {
            moveItemAndOrder(draggedId, node.parentId, 'after', node.id);
        }
    });

    // --- MOBİL (TOUCH) SÜRÜKLE BIRAK SİMÜLASYONU ---
    let touchTimer = null;
    let isDraggingTouch = false;
    let cloneEl = null;

    el.addEventListener('touchstart', (e) => {
        if (e.target.tagName === 'SPAN' && e.target.innerHTML.includes('8942')) return;
        if (window.innerWidth > 768) return;

        touchTimer = setTimeout(() => {
            isDraggingTouch = true;
            draggedNodeId = node.id;
            
            cloneEl = el.cloneNode(true);
            cloneEl.style.position = 'fixed';
            cloneEl.style.opacity = '0.9';
            cloneEl.style.pointerEvents = 'none';
            cloneEl.style.zIndex = '10000';
            cloneEl.style.width = `${el.offsetWidth}px`;
            cloneEl.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
            cloneEl.style.background = '#27272a';
            cloneEl.style.borderRadius = '6px';
            document.body.appendChild(cloneEl);

            const t = e.touches[0];
            cloneEl.style.left = `${t.clientX - el.offsetWidth/2}px`;
            cloneEl.style.top = `${t.clientY - el.offsetHeight/2}px`;
            
            el.style.opacity = '0.4';

            if (navigator.vibrate) navigator.vibrate(50);
            document.body.style.overflow = 'hidden';
            
        }, 500); 
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!isDraggingTouch && touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
            return;
        }
        
        if (isDraggingTouch) {
            e.preventDefault(); 
            
            const t = e.touches[0];
            if (cloneEl) {
                cloneEl.style.left = `${t.clientX - el.offsetWidth/2}px`;
                cloneEl.style.top = `${t.clientY - el.offsetHeight/2}px`;
            }
            
            const target = document.elementFromPoint(t.clientX, t.clientY);
            if (!target) return;
            
            const targetContentDiv = target.closest('.tree-item-content');
            
            document.querySelectorAll('[class*="drag-over"]').forEach(n => {
                n.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
            });
            
            if (targetContentDiv && targetContentDiv !== el) {
                const targetId = targetContentDiv.dataset.id;
                if (!targetId || targetId === draggedNodeId || isChildOf(draggedNodeId, targetId)) return;
                
                const targetNode = items.find(i => i.id === targetId);
                const box = targetContentDiv.getBoundingClientRect();
                const offset = t.clientY - box.top;
                
                if (targetNode && targetNode.type === 'folder') {
                    if (offset < box.height * 0.25) targetContentDiv.classList.add('drag-over-top');
                    else if (offset > box.height * 0.75) targetContentDiv.classList.add('drag-over-bottom');
                    else targetContentDiv.classList.add('drag-over-inside');
                } else {
                    if (offset < box.height / 2) targetContentDiv.classList.add('drag-over-top');
                    else targetContentDiv.classList.add('drag-over-bottom');
                }
            }
        }
    }, { passive: false });

    const handleTouchEnd = (e) => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
        
        if (isDraggingTouch) {
            isDraggingTouch = false;
            el.style.opacity = '1';
            
            if (cloneEl) {
                cloneEl.remove();
                cloneEl = null;
            }
            
            document.body.style.overflow = '';
            
            const t = e.changedTouches[0];
            const target = document.elementFromPoint(t.clientX, t.clientY);
            const targetContentDiv = target ? target.closest('.tree-item-content') : null;
            
            if (targetContentDiv && targetContentDiv !== el) {
                const targetId = targetContentDiv.dataset.id;
                const targetNode = items.find(i => i.id === targetId);
                
                const isTop = targetContentDiv.classList.contains('drag-over-top');
                const isBottom = targetContentDiv.classList.contains('drag-over-bottom');
                const isInside = targetContentDiv.classList.contains('drag-over-inside');
                
                targetContentDiv.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
                
                if (targetId && targetId !== draggedNodeId && !isChildOf(draggedNodeId, targetId)) {
                    if (isInside && targetNode) {
                        moveItemAndOrder(draggedNodeId, targetNode.id, 'append');
                    } else if (isTop && targetNode) {
                        moveItemAndOrder(draggedNodeId, targetNode.parentId, 'before', targetNode.id);
                    } else if (isBottom && targetNode) {
                        moveItemAndOrder(draggedNodeId, targetNode.parentId, 'after', targetNode.id);
                    }
                }
            }
            
            document.querySelectorAll('[class*="drag-over"]').forEach(n => {
                n.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
            });
            
            draggedNodeId = null;
        }
    };

    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);
    
    // Uzun basıldığında tarayıcının kendi menüsünün (Geri, İleri, Kopyala vs.) açılmasını engelle
    el.addEventListener('contextmenu', (e) => {
        if (window.innerWidth <= 768) {
            e.preventDefault();
        }
    });
}

if (sidebar) {
    sidebar.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    sidebar.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) {
            moveItemAndOrder(draggedId, null, 'append');
        }
    });
}

function isChildOf(draggedId, targetId) {
    if (!draggedId || !targetId) return false;
    let curr = items.find(i => i.id === targetId);
    while (curr) {
        if (curr.id === draggedId) return true;
        curr = items.find(i => i.id === curr.parentId);
    }
    return false;
}

function moveItemAndOrder(draggedId, newParentId, action, targetId = null) {
    const draggedIndex = items.findIndex(i => i.id === draggedId);
    if (draggedIndex === -1) return;
    
    const draggedNode = items[draggedIndex];
    draggedNode.parentId = newParentId;
    draggedNode.updatedAt = Date.now();
    
    if (action === 'append') {
        const siblings = items.filter(i => i.parentId === newParentId && i.id !== draggedId);
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order || 0)) : 0;
        draggedNode.order = maxOrder + 1;
        if (newParentId) expandedFolders.add(newParentId);
    } else if (action === 'before' || action === 'after') {
        let siblings = items.filter(i => i.parentId === newParentId && i.id !== draggedId);
        siblings.sort((a,b) => (a.order || 0) - (b.order || 0));
        
        const targetIndex = siblings.findIndex(i => i.id === targetId);
        if (targetIndex > -1) {
            if (action === 'before') {
                siblings.splice(targetIndex, 0, draggedNode);
            } else {
                siblings.splice(targetIndex + 1, 0, draggedNode);
            }
        } else {
            siblings.push(draggedNode);
        }
        
        siblings.forEach((sib, idx) => {
            sib.order = idx;
        });
    }
    
    saveData();
}

function selectNote(id) {
    const note = items.find(n => n.id === id && n.type === 'note');
    if (note) {
        activeNoteId = id;
        titleInput.value = note.title;
        contentInput.innerHTML = note.content;
        titleInput.disabled = false;
        noteDateDisplay.textContent = formatTurkishDate(note.updatedAt);
        
        adjustTitleHeight();
        renderNotesList(); 
    }
}

function createNewNote() {
    activeNoteId = null;
    titleInput.value = '';
    contentInput.innerHTML = '';
    titleInput.disabled = false;
    noteDateDisplay.textContent = formatTurkishDate(Date.now());
    
    adjustTitleHeight();
    renderNotesList();
    titleInput.focus();
}

function createNewFolder() {
    const name = prompt("Klasör Adı:", "Yeni Klasör");
    if (name) {
        const siblings = items.filter(i => i.parentId === null);
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order || 0)) : 0;
            
        const newFolder = {
            id: Date.now().toString(),
            type: 'folder',
            parentId: null,
            title: name,
            content: '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            order: maxOrder + 1
        };
        items.push(newFolder);
        saveData();
    }
}

// Mobil Menü Tetikleyicileri
if (mobileMenuBtn && sidebarContent && sidebarOverlay) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebarContent.classList.add('open');
        sidebarOverlay.classList.add('active');
    });

    const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebarContent.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });
    }

    sidebarOverlay.addEventListener('click', () => {
        sidebarContent.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    });
}

// ---- Modül Dışa Aktarımları ----
export {
    activeNoteId,
    setActiveNoteId,
    formatTurkishDate,
    renderNotesList,
    selectNote,
    createNewNote,
    createNewFolder,
    saveData
};
