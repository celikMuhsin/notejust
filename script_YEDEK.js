const titleInput = document.querySelector('.note-title');
const contentInput = document.getElementById('note-content');
const notesList = document.getElementById('notes-list');
const noteDateDisplay = document.getElementById('note-date-display');
const newNoteBtn = document.querySelector('.new-note-btn');
const newFolderBtn = document.querySelector('.new-folder-btn');
const toolbar = document.getElementById('floating-toolbar');

let items = [];
let db;
const DB_NAME = 'NotAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes_store';

function initDB(callback) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function(event) {
        db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        loadDataFromDB(callback);
    };

    request.onerror = function(event) {
        console.error("IndexedDB Hatası:", event.target.error);
        items = [];
        callback();
    };
}

function loadDataFromDB(callback) {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('notesData');

    request.onsuccess = function(event) {
        const result = event.target.result;
        if (result && result.data) {
            items = result.data.map(n => {
                return {
                    ...n,
                    type: n.type || 'note',
                    parentId: n.parentId || null,
                    createdAt: n.createdAt || Date.now(),
                    updatedAt: n.updatedAt || Date.now(),
                    order: n.order !== undefined ? n.order : 0
                };
            });
            
            // Geçmişten gelen order yapısını güvenli hale getir
            if (items.some(i => i.order === 0)) {
                let parentGroups = {};
                items.forEach(i => {
                    if(!parentGroups[i.parentId]) parentGroups[i.parentId] = [];
                    parentGroups[i.parentId].push(i);
                });
                
                Object.keys(parentGroups).forEach(pid => {
                    parentGroups[pid].sort((a,b) => {
                        if(a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                        return b.updatedAt - a.updatedAt;
                    });
                    parentGroups[pid].forEach((child, index) => {
                        child.order = index; 
                    });
                });
            }
        } else {
            // DB boşsa localStorage'dan geçiş (migrasyon) yapmayı dene
            try {
                const lsOld = localStorage.getItem('notes');
                if (lsOld) {
                    items = JSON.parse(lsOld);
                    saveDataToDB(); 
                }
            } catch(e) {}
        }
        callback();
    };

    request.onerror = function() {
        items = [];
        callback();
    };
}

function saveDataToDB() {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put({ id: 'notesData', data: items });
}

let activeNoteId = null;
let expandedFolders = new Set();
let draggedNodeId = null;
let currentSelectionRange = null; 
let savedRanges = []; 
let currentPaletteMode = null; 
let currentDropdownId = null;

const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
function formatTurkishDate(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function saveData() {
    saveDataToDB();
    renderNotesList();
}

function init() {
    renderNotesList();
    
    const firstNote = items.find(i => i.type === 'note');
    if (firstNote) {
        selectNote(firstNote.id);
    } else {
        createNewNote();
    }
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
                    selectNote(node.id);
                });
            }

            parentEl.appendChild(li);
        });
    };
    
    renderTree(notesList, rootItems);
}

// SÜRÜKLE BIRAK (DRAG AND DROP)
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
}

const sidebar = document.querySelector('.sidebar');
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
        
        // Zengin metindeki özel listeleri vs initialize edebiliriz gerekirse
        renderNotesList(); 
    }
}

function createNewNote() {
    activeNoteId = null;
    titleInput.value = '';
    contentInput.innerHTML = '';
    titleInput.disabled = false;
    noteDateDisplay.textContent = formatTurkishDate(Date.now());
    
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

function autoSave() {
    const title = titleInput.value;
    const content = contentInput.innerHTML;
    
    if (activeNoteId === null && title.trim() === '' && content.trim() === '') {
        return; 
    }

    const now = Date.now();
    if (activeNoteId === null) {
        const siblings = items.filter(i => i.parentId === null);
        const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order || 0)) : 0;
            
        const newNote = {
            id: now.toString(),
            type: 'note',
            parentId: null,
            title: title,
            content: content,
            createdAt: now,
            updatedAt: now,
            order: maxOrder + 1
        };
        items.push(newNote);
        activeNoteId = newNote.id;
        noteDateDisplay.textContent = formatTurkishDate(newNote.updatedAt);
        
        renderNotesList();
    } else {
        const noteIndex = items.findIndex(n => n.id === activeNoteId);
        if (noteIndex > -1) {
            items[noteIndex].title = title;
            items[noteIndex].content = content;
            items[noteIndex].updatedAt = now;
            noteDateDisplay.textContent = formatTurkishDate(now);
        }
        
        renderNotesList();
    }
    
    saveDataToDB();
}

// -----------------------------------------------------
// BİÇİM BOYACISI (Format Painter)
// -----------------------------------------------------
let isFormatPainting = false;
let storedFormat = null;

window.toggleFormatPainter = function() {
    const btn = document.getElementById('format-painter-btn');
    if (isFormatPainting) {
        isFormatPainting = false;
        contentInput.classList.remove('editor-painting');
        if(btn) btn.classList.remove('active-painter');
        updateToolbarPosition();
        return;
    }
    
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    
    let node = sel.anchorNode;
    if (node.nodeType === 3) node = node.parentNode;
    
    const computedStyle = window.getComputedStyle(node);
    
    storedFormat = {
        fontWeight: computedStyle.fontWeight,
        fontStyle: computedStyle.fontStyle,
        textDecoration: computedStyle.textDecorationLine || computedStyle.textDecoration,
        color: computedStyle.color,
        backgroundColor: computedStyle.backgroundColor,
        fontSize: computedStyle.fontSize,
        tagName: node.closest('h1, h2, h3, p, pre, blockquote')?.tagName || 'P'
    };
    
    isFormatPainting = true;
    contentInput.classList.add('editor-painting');
    if(btn) btn.classList.add('active-painter');
    
    toolbar.classList.remove('visible');
};

function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb;
    return "#" +
        ("0" + parseInt(match[1], 10).toString(16)).slice(-2) +
        ("0" + parseInt(match[2], 10).toString(16)).slice(-2) +
        ("0" + parseInt(match[3], 10).toString(16)).slice(-2);
}

function applyStoredFormat() {
    if (!storedFormat) return;
    
    document.execCommand('removeFormat', false, null);
    
    if (storedFormat.fontWeight === 'bold' || parseInt(storedFormat.fontWeight) >= 700) {
        document.execCommand('bold', false, null);
    }
    if (storedFormat.fontStyle === 'italic') {
        document.execCommand('italic', false, null);
    }
    if (storedFormat.textDecoration && storedFormat.textDecoration.includes('underline')) {
        document.execCommand('underline', false, null);
    }
    if (storedFormat.color && storedFormat.color !== 'rgba(0, 0, 0, 0)') {
        try { document.execCommand('foreColor', false, rgbToHex(storedFormat.color)); } catch(e){}
    }
    if (storedFormat.backgroundColor && storedFormat.backgroundColor !== 'rgba(0, 0, 0, 0)' && storedFormat.backgroundColor !== 'transparent') {
        try { document.execCommand('hiliteColor', false, rgbToHex(storedFormat.backgroundColor)); } catch(e){}
    }
    if (storedFormat.fontSize) {
        const sel = window.getSelection();
        try {
            const range = sel.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = storedFormat.fontSize;
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.addRange(newRange);
        } catch(e) {}
    }
    if (storedFormat.tagName) {
        document.execCommand('formatBlock', false, storedFormat.tagName);
    }
}

// -----------------------------------------------------
// ZENGİN METİN ARAÇ ÇUBUĞU (Selection API)
// -----------------------------------------------------
let isTyping = false;
let typingTimeout;

contentInput.addEventListener('keydown', (e) => {
    if (isFormatPainting && e.key === 'Escape') {
        window.toggleFormatPainter();
        return;
    }

    isTyping = true;
    toolbar.classList.remove('visible');
    document.querySelectorAll('.popup-menu').forEach(menu => menu.classList.add('hidden'));
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        updateToolbarPosition();
    }, 500); // Klavyeden el çekildikten 500ms sonra araç çubuğunu yukarı sabitle
});

let lastMouseX = null;
let lastInteractionType = 'mouse';
let isInteractingWithToolbar = false;

document.addEventListener('mousedown', (e) => {
    // Toolbar veya açılır menü içindeki tıklamalarda x eksenini GÜNCELLEME (sabit kalsın)
    if (!e.target.closest('.floating-toolbar') && !e.target.closest('.popup-menu')) {
        lastMouseX = e.clientX;
        lastInteractionType = 'mouse';
        isInteractingWithToolbar = false;
    } else {
        isInteractingWithToolbar = true;
    }
});

document.addEventListener('mouseup', (e) => {
    if (!e.target.closest('.floating-toolbar') && !e.target.closest('.popup-menu')) {
        lastMouseX = e.clientX;
        lastInteractionType = 'mouse';
    }
});

document.addEventListener('keydown', (e) => {
    lastInteractionType = 'keyboard';
    isInteractingWithToolbar = false;
});

document.addEventListener('selectionchange', () => {
    if (!isTyping) updateToolbarPosition();
});

function updateToolbarPosition() {
    if (!activeNoteId) return;
    
    if (document.activeElement && toolbar.contains(document.activeElement)) {
        return; 
    }
    
    const selection = window.getSelection();
    
    // YENİ: İmlecin bulunduğu güncel yerin font boyutunu (punto) okuyup input'a yansıt
    if (selection.rangeCount > 0) {
        let node = selection.anchorNode;
        if (node && node.nodeType === 3) node = node.parentNode;
        if (node && contentInput.contains(node)) {
            const sizePx = parseInt(window.getComputedStyle(node).fontSize);
            if (!isNaN(sizePx)) {
                document.getElementById('font-size-input').value = sizePx;
            }
        }
    }
    
    if (!selection.isCollapsed && contentInput.contains(selection.anchorNode)) {
        currentSelectionRange = selection.getRangeAt(0).cloneRange();
        
        // Eğer kullanıcı toolbar ile etkileşimdeyse (örneğin butonlara basıyorsa)
        // toolbar'ın zıplamasını engellemek için yerini tekrar hesaplamıyoruz.
        if (isInteractingWithToolbar && toolbar.classList.contains('visible') && !toolbar.classList.contains('docked')) {
            return;
        }

        let rect;
        try { rect = currentSelectionRange.getBoundingClientRect(); } catch(e) { return; }
        if (rect.width === 0 && rect.height === 0) return;
        
        // Fare ile seçim yapılmışsa tam tıklanan fare X koordinatını kullan, 
        // Klavye kullanılmışsa seçimin(caret) bittiği noktayı kullan.
        let cursorX = rect.right;
        
        if (lastInteractionType === 'mouse' && lastMouseX !== null) {
            // İmleç hizasını almak için farenin tıklama noktasını esas al.
            // Fare çok soldaysa ekran taşmasını önlemek için min(10) uygulandı.
            cursorX = lastMouseX;
        } else {
            try {
                const focusRange = document.createRange();
                focusRange.setStart(selection.focusNode, selection.focusOffset);
                focusRange.collapse(true);
                const focusRects = focusRange.getClientRects();
                if (focusRects.length > 0) {
                    cursorX = focusRects[0].left;
                } else {
                    cursorX = focusRange.getBoundingClientRect().left || rect.right;
                }
            } catch(e) {}
        }
        
        let leftPos = Math.max(10, cursorX - 10); 
        
        // Ekrandan (sağdan) taşmasını önle
        if (leftPos + toolbar.offsetWidth > window.innerWidth) {
            leftPos = window.innerWidth - toolbar.offsetWidth - 10;
        }
        
        toolbar.classList.remove('docked');
        toolbar.style.right = 'auto'; // Sabit mod kalıntısını sil
        toolbar.style.left = `${leftPos}px`;
        toolbar.style.top = `${Math.max(10, rect.top - toolbar.offsetHeight - 14)}px`;
        toolbar.classList.add('visible');
    } else if (selection.isCollapsed && contentInput.contains(selection.anchorNode)) {
        // İMLEÇ BOŞTAYKEN (Dock Mode): Tarihin üstünde, sağ üste bitişik ve tek satır olarak (docked) çıkar
        currentSelectionRange = selection.getRangeAt(0).cloneRange();
        
        if (isInteractingWithToolbar && toolbar.classList.contains('visible') && toolbar.classList.contains('docked')) {
            return;
        }

        toolbar.classList.add('docked');
        toolbar.style.left = 'auto';
        toolbar.style.right = '60px'; // Sağ kenar hizalaması 
        toolbar.style.top = '12px'; // Tarihin ÜSTÜNDE olması için yükseltildi
        toolbar.classList.add('visible');
    } else {
        toolbar.classList.remove('visible');
        document.querySelectorAll('.popup-menu').forEach(menu => menu.classList.add('hidden'));
        currentDropdownId = null;
        currentPaletteMode = null;
    }
}

window.clearFormat = function() {
    restoreSelection();
    document.execCommand('formatBlock', false, 'p');
    document.execCommand('removeFormat', false, null);
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// -----------------------------------------------------
// OTOMATİK BÜYÜK HARF (Auto-Capitalize)
// -----------------------------------------------------
contentInput.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
        autoCapitalizeSentence();
    }
});

function autoCapitalizeSentence() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        
        if (node.nodeType === Node.TEXT_NODE) {
            const textToCursor = node.textContent.substring(0, range.startOffset);
            
            const match = /(?:^|[.!?]\s+)([a-zğüşöçı][\wğüşöçığ]*)$/i.exec(textToCursor);
            if (match) {
                const word = match[1];
                const capitalized = word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
                
                if (capitalized !== word) {
                    const wordStart = range.startOffset - word.length;
                    const textBefore = node.textContent.substring(0, wordStart);
                    const textAfter = node.textContent.substring(range.startOffset);
                    
                    node.textContent = textBefore + capitalized + textAfter;
                    
                    const newRange = document.createRange();
                    newRange.setStart(node, wordStart + capitalized.length);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            }
        }
    }
}

// -----------------------------------------------------
// AKILLI ÇİFT TIKLAMA SEÇİMİ (Smart Double Click)
// -----------------------------------------------------
contentInput.addEventListener('dblclick', (e) => {
    const sel = window.getSelection();
    if (!sel.isCollapsed && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const text = range.toString();

        if (text.endsWith(' ') || text.endsWith('\u00A0')) {
            if (range.endContainer.nodeType === Node.TEXT_NODE) {
                try {
                    range.setEnd(range.endContainer, range.endOffset - 1);
                    updateToolbarPosition();
                } catch(err) {} 
            }
        }
    }
});

// -----------------------------------------------------
// ÇOKLU SEÇİM (Ctrl + Select)
// -----------------------------------------------------
contentInput.addEventListener('mousedown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        const sel = window.getSelection();
        savedRanges = [];
        for (let i = 0; i < sel.rangeCount; i++) {
            savedRanges.push(sel.getRangeAt(i).cloneRange());
        }
    } else {
        savedRanges = [];
    }
});

contentInput.addEventListener('mouseup', (e) => {
    if (isFormatPainting) {
        const sel = window.getSelection();
        if (!sel.isCollapsed && sel.rangeCount > 0) {
            applyStoredFormat();
            isFormatPainting = false;
            contentInput.classList.remove('editor-painting');
            const btn = document.getElementById('format-painter-btn');
            if(btn) btn.classList.remove('active-painter');
            updateToolbarPosition();
            autoSave();
            return;
        }
    }

    if (e.ctrlKey || e.metaKey) {
        const sel = window.getSelection();
        const currentRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        
        sel.removeAllRanges();
        
        savedRanges.forEach(r => {
            try { sel.addRange(r); } catch(e){}
        });
        if (currentRange) {
            try { sel.addRange(currentRange); } catch(err) {}
        }
        
        updateToolbarPosition();
    }
});

// -----------------------------------------------------
// ARAÇ ÇUBUĞU FORMAT KOMUTLARI
// -----------------------------------------------------

toolbar.addEventListener('mousedown', (e) => {
    // Toolbar içindeki dropdownlara, inputlara vb basıldığında, düzenleyicideki seçimin focus'unu kaybetmesini engeller
    if (e.target.tagName !== 'INPUT') {
        e.preventDefault();
    }
});

// Temel ExecCommand Metin Formati
window.formatText = function(command) {
    restoreSelection();
    
    if (command === 'indent' || command === 'outdent') {
        const isIndent = (command === 'indent');
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        const blocks = new Set();
        // Tüm olası blok elementlerini tara ve seçime dahil olanları bul
        const allBlocks = contentInput.querySelectorAll('p, div, li, h1, h2, h3, blockquote, pre');
        allBlocks.forEach(block => {
            if (sel.containsNode(block, true)) {
                blocks.add(block);
            }
        });

        // Eğer seçim tek bir blok içindeyse querySelectorall ile yakalanmayabilir (containsNode true dönmeyebilir)
        if (blocks.size === 0) {
            let node = sel.getRangeAt(0).startContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
            const block = node.closest('p, div, li, h1, h2, h3, blockquote, pre');
            if (block && contentInput.contains(block)) blocks.add(block);
        }

        blocks.forEach(block => {
            let current = parseInt(window.getComputedStyle(block).paddingLeft) || 0;
            if (isIndent) {
                current += 40;
            } else {
                current = Math.max(0, current - 40);
            }
            block.style.paddingLeft = current + 'px';
        });
    } else {
        document.execCommand(command, false, null);
    }
    
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Genel Popover Dropdown Togglayıcı (Stil, Bullet, Renk vb.)
window.toggleDropdown = function(dropdownId, event, extraMode = null) {
    if (extraMode !== null) currentPaletteMode = extraMode;
    
    // Kendisi haricindeki diğer menüleri gizle
    document.querySelectorAll('.popup-menu').forEach(menu => {
        if (menu.id !== dropdownId) menu.classList.add('hidden');
    });
    
    if (!dropdownId) {
        currentDropdownId = null;
        return; 
    }
    
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    
    if (currentDropdownId === dropdownId && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        currentDropdownId = null;
    } else {
        currentDropdownId = dropdownId;
        dropdown.classList.remove('hidden');
        
        // Butonu ortalayacak şekilde dropdown x koordinatını bul (toolbar'a göre)
        const btnRect = event.currentTarget.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        const leftOffset = btnRect.left - toolbarRect.left;
        
        dropdown.style.left = `${leftOffset + (btnRect.width / 2)}px`;
    }
    
    updateToolbarPosition();
};

window.toggleColorPalette = function(mode, event) {
    toggleDropdown('color-palette', event, mode);
}

// -----------------------------------------------------
// NESNE EKLEME (RESİM, ŞEKİL VB.)
// -----------------------------------------------------

window.triggerImageUpload = function() {
    document.getElementById('image-upload').click();
    // Menüyü kapat
    const insertPalette = document.getElementById('insert-palette');
    if (insertPalette) insertPalette.classList.add('hidden');
};

document.getElementById('image-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const dataUrl = event.target.result;
        restoreSelection();
        
        // Görseli HTML olarak ekleyelim (stil ve kontrol için)
        const imgHtml = `<img src="${dataUrl}" draggable="true" style="max-width:100%; border-radius:8px; margin:10px 0; display:block;">`;
        document.execCommand('insertHTML', false, imgHtml);
        
        contentInput.focus();
        autoSave();
        
        // Inputu temizle (aynı dosya tekrar seçilebilsin)
        e.target.value = '';
    };
    reader.readAsDataURL(file);
});

// -----------------------------------------------------
// RESİM BOYUTLANDIRMA (RESIZE / CROP)
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
        h.addEventListener('touchstart', handleResizeStart, {passive: false});
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

    actionToolbar.appendChild(layoutBtn);
    actionToolbar.appendChild(cropBtn);
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
            
            // Mevcut crop (object-position) değerlerini al
            const pos = selectedImg.style.objectPosition || '0px 0px';
            const [posX, posY] = pos.split(' ');
            
            // Not: cropData.left = -posX, cropData.top = -posY 
            // Ancak biz direkt style.width/height üzerinden gideceğiz.
        };
        h.addEventListener('mousedown', handleCropStart);
        h.addEventListener('touchstart', handleCropStart, {passive: false});
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

    // Resizerlar (Sadece aktif değilken göster)
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
    
    // İşlem Araç Çubuğu (Dışarıda, sağda)
    actionToolbar.style.top = `${scrollY + rect.top}px`;
    actionToolbar.style.left = `${scrollX + rect.left + rect.width + 10}px`;
    actionToolbar.style.display = 'flex';
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
        { id: 'inline', label: 'Metinle Aynı Hizada', icon: '<path d="M3 6h7M14 6h7M3 12h18M3 18h18"/><rect x="8" y="4" width="8" height="8"/>' },
        { id: 'left', label: 'Metin Kaydırma (Sol)', icon: '<rect x="3" y="3" width="8" height="8"/><path d="M14 5h7M14 9h7M3 14h18M3 18h18"/>' },
        { id: 'right', label: 'Metin Kaydırma (Sağ)', icon: '<rect x="13" y="3" width="8" height="8"/><path d="M3 5h7M3 9h7M3 14h18M3 18h18"/>' },
        { id: 'center', label: 'Ortala (Tek Satır)', icon: '<path d="M3 6h18M3 12h18M3 18h18"/><rect x="8" y="5" width="8" height="14"/>' },
        { id: 'free', label: 'Serbest (Yapışkan)', icon: '<rect x="6" y="6" width="12" height="12" rx="2" stroke-dasharray="2 2"/><path d="M4 4l16 16M20 4l-16 16"/>' }
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

    // Ekrandan taşıyorsa ekran içinde tut (sola kaydır)
    if (leftPos + menuWidth > window.innerWidth) {
        leftPos = window.innerWidth - menuWidth - 10;
        
        // Hala taşıyorsa en sola daya
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
        // Başlangıç konumu ata (eğer yoksa)
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
        // Eğer serbest moddaysa ve CTRL tuşuna basılıyorsa veya direkt tıklanıyorsa
        // (Serbest modda normal sürükleme yerine X,Y sürükleme istiyoruz)
        if (e.target.classList.contains('img-free')) {
            isMoving = true;
            moveStartX = getEventX(e);
            moveStartY = getEventY(e);
            
            selectedImg = e.target;
            const contentRect = contentInput.getBoundingClientRect();
            const imgRect = selectedImg.getBoundingClientRect();
            
            if (!selectedImg.classList.contains('was-dragged') && window.innerWidth <= 768) {
                // Mobilde ilk kez sürüklendiğinde, görseli statik konumdan koparırken 
                // ekranda zıplamaması için yeni (tam altındaki) koordinatlarını kilitle.
                imgStartX = imgRect.left - contentRect.left;
                imgStartY = imgRect.top - contentRect.top;
                selectedImg.style.left = `${imgStartX}px`;
                selectedImg.style.top = `${imgStartY}px`;
                selectedImg.classList.add('was-dragged');
            } else {
                imgStartX = parseInt(selectedImg.style.left) || 0;
                imgStartY = parseInt(selectedImg.style.top) || 0;
            }
            
            selectedImg.classList.add('is-dragging');
            contentInput.focus();
            // Native sürüklemeyi engelle ki bizimki çalışsın
            if (e.type !== 'touchstart' || e.cancelable) {
                e.preventDefault();
            }
        }

        deselectImage();
        selectedImg = e.target;
        selectedImg.classList.add('resize-active');
        
        createResizerHandles();
        createActionToolbar();
        
        // Kırpma değerlerini sıfırla (Çünkü bu yeni bir seçim)
        currentCropOffsets = { top: 0, right: 0, bottom: 0, left: 0 };
        selectedImg.style.clipPath = 'none';
        
        updateHandlePosition();
    } else if (Object.values(resizerHandles).some(h => h.contains(e.target)) || 
               Object.values(cropHandles).some(h => h.contains(e.target)) ||
               (actionToolbar && actionToolbar.contains(e.target)) || 
               (layoutMenu && layoutMenu.contains(e.target))) {
        // Handle/Menu tıklamalarında deselect yapma
        return;
    } else {
        deselectImage();
    }
};

document.addEventListener('mousedown', handleImageDown);
document.addEventListener('touchstart', handleImageDown, {passive: false});

const handleImageMove = (e) => {
    if (isMoving && selectedImg) {
        if (e.type === 'touchmove' && e.cancelable) e.preventDefault();
        const dx = getEventX(e) - moveStartX;
        const dy = getEventY(e) - moveStartY;
        selectedImg.style.left = `${imgStartX + dx}px`;
        selectedImg.style.top = `${imgStartY + dy}px`;
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

        // Negatif değerleri engelle
        currentCropOffsets.top = Math.max(0, currentCropOffsets.top);
        currentCropOffsets.right = Math.max(0, currentCropOffsets.right);
        currentCropOffsets.bottom = Math.max(0, currentCropOffsets.bottom);
        currentCropOffsets.left = Math.max(0, currentCropOffsets.left);

        selectedImg.style.clipPath = `inset(${currentCropOffsets.top}px ${currentCropOffsets.right}px ${currentCropOffsets.bottom}px ${currentCropOffsets.left}px)`;
        
        initialMouseX = getEventX(e);
        initialMouseY = getEventY(e);
        // Not: handle'ları hareket ettirmiyoruz çünkü clip-path geçici
        return;
    }
    
    const dx = getEventX(e) - initialMouseX;
    const dy = getEventY(e) - initialMouseY;
    const aspectRatio = initialRect.width / initialRect.height;
    
    let newWidth = initialRect.width;
    let newHeight = initialRect.height;

    // Yönlere göre yeni genişlik hesapla (Hepsi oran korur)
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
        selectedImg.style.height = 'auto'; // Otomatik oran koruma
        updateHandlePosition();
    }
};

window.addEventListener('mousemove', handleImageMove);
window.addEventListener('touchmove', handleImageMove, {passive: false});

const handleImageUp = () => {
    if (isResizing && resizeDirection.startsWith('crop-') && selectedImg) {
        // PERMANENT CANVAS CROP
        performPermanentCrop();
    }

    if (isResizing || isMoving) {
        if (selectedImg) {
            selectedImg.classList.remove('is-dragging');
            setTimeout(updateHandlePosition, 10);
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
        
        // Yeni resmi ata
        img.src = canvas.toDataURL('image/png');
        img.style.clipPath = 'none';
        img.style.width = `${newWidth}px`;
        img.style.height = 'auto'; // Oranı koru
        
        currentCropOffsets = { top: 0, right: 0, bottom: 0, left: 0 };
        
        setTimeout(() => {
            updateHandlePosition();
            autoSave();
        }, 50);
    };
}

// Editör kaydırıldığında veya pencere boyutu değiştiğinde tutamacı güncelle
window.addEventListener('scroll', updateHandlePosition, true);
window.addEventListener('resize', updateHandlePosition);

// Sürükle-Bırak Sırasında Tutamaçları Gizle
document.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'IMG') {
        deselectImage();
    }
});

document.addEventListener('dragend', (e) => {
    if (e.target.tagName === 'IMG') {
        // Drop sonrası yeni konumu yakalamak için hafif bir gecikme
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

// Harf Durumu (Change Case) Uygulayıcı
window.applyChangeCase = function(type) {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    
    // Klone olarak seçimi alıp bir div içine atarak metin düğümlerini geziyoruz (formatı bozmamak için)
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents(); 
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    
    const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_ALL, null, false);
    
    let isStartOfSentence = true;
    let isPreviousSpace = true; 
    
    let node;
    while((node = walker.nextNode())) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toUpperCase();
            if (['P', 'DIV', 'LI', 'BR', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'TR', 'TD'].includes(tag)) {
                isStartOfSentence = true;
                isPreviousSpace = true;
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
            let text = node.nodeValue;
            if (!text) continue;
            let newText = "";
            
            switch (type) {
                case 'lower':
                    newText = text.toLocaleLowerCase('tr-TR');
                    break;
                case 'upper':
                    newText = text.toLocaleUpperCase('tr-TR');
                    break;
                case 'toggle':
                    let tChars = Array.from(text.toLocaleUpperCase('tr-TR'));
                    for (let i = 0; i < tChars.length; i++) {
                        let c = tChars[i];
                        if (/[a-zA-ZçğıiöşüÇĞIİÖŞÜ]/.test(c)) {
                            if (isPreviousSpace) {
                                tChars[i] = c.toLocaleLowerCase('tr-TR');
                                isPreviousSpace = false;
                            }
                        } else if (!/[0-9]/.test(c)) {
                            // Harf veya rakam olmayanları kelime ayıracı kabul et (Boşluk, noktalama vb.)
                            isPreviousSpace = true;
                        }
                    }
                    newText = tChars.join('');
                    break;
                case 'sentence':
                    let sChars = Array.from(text.toLocaleLowerCase('tr-TR'));
                    for (let i = 0; i < sChars.length; i++) {
                        let c = sChars[i];
                        if (/[a-zçğıiöşü]/i.test(c)) {
                            if (isStartOfSentence) {
                                sChars[i] = c.toLocaleUpperCase('tr-TR');
                                isStartOfSentence = false;
                            }
                        } else if (/[.!?]/.test(c)) {
                            isStartOfSentence = true;
                        }
                    }
                    newText = sChars.join('');
                    break;
                case 'capitalize':
                    let chars = Array.from(text.toLocaleLowerCase('tr-TR'));
                    for (let i = 0; i < chars.length; i++) {
                        let c = chars[i];
                        if (/[a-zçğıiöşü]/i.test(c)) {
                            if (isPreviousSpace) {
                                chars[i] = c.toLocaleUpperCase('tr-TR');
                                isPreviousSpace = false;
                            }
                        } else if (!/[0-9]/.test(c)) {
                            // Harf veya rakam olmayanları kelime ayıracı kabul et (Boşluk, noktalama vb.)
                            isPreviousSpace = true;
                        }
                    }
                    newText = chars.join('');
                    break;
            }
            node.nodeValue = newText;
        }
    }
    
    // Değiştirilmiş HTML'i seçilen bölgeye güvenlice enjekte et (Native undo/redo desteği korunur)
    document.execCommand('insertHTML', false, tempDiv.innerHTML);
    
    document.getElementById('case-palette').classList.add('hidden');
    currentDropdownId = null;
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Paragraf Stilleri (Headings vb.) Uygulayıcı
window.applyBlockStyle = function(tag) {
    restoreSelection();
    
    let sel = window.getSelection();
    if (!sel.rangeCount) return;
    
    let node = sel.anchorNode;
    let block = node.nodeType === 3 ? node.parentNode.closest('pre, blockquote') : node?.closest('pre, blockquote');
    const isNormal = (tag === 'P' || tag === 'DIV' || tag === 'p' || tag === 'div');
    
    if (block && isNormal && sel.isCollapsed) {
        // İçinden çıkılmaz bloklardayken "Paragraph" seçilirse bloğu kırıp alt satıra güvenli atlar
        const newDiv = document.createElement('div');
        newDiv.innerHTML = '<br>';
        
        // Mevcut bloğun hemen dışına yerleştir ve imleci oraya taşı
        block.parentNode.insertBefore(newDiv, block.nextSibling);
        
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(newDiv);
        range.collapse(true);
        sel.addRange(range);
    } else {
        document.execCommand('formatBlock', false, tag);
    }
    
    document.getElementById('style-palette').classList.add('hidden');
    currentDropdownId = null;
    
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Özel Madde İşaretleri (Bullets) Uygulayıcı
window.applyBulletStyle = function(type) {
    restoreSelection();
    
    let sel = window.getSelection();
    let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    
    // Gri alandan (pre/blockquote) listelere geçişte bloğu kır
    let block = node ? node.closest('pre, blockquote') : null;
    if (block && type !== 'none') {
        document.execCommand('formatBlock', false, 'DIV');
        sel = window.getSelection();
        node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    }
    
    let ul = node ? node.closest('ul') : null;
    
    if (!ul && type !== 'none') {
        document.execCommand('insertUnorderedList', false, null);
        sel = window.getSelection();
        node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        ul = node ? node.closest('ul') : null;
    }
    
    if (ul) {
        ul.className = ''; 
        if (type === 'none') {
            document.execCommand('insertUnorderedList', false, null);
        } else if (type === 'blue-arrow') {
            ul.style.listStyleType = '"➢ "';
            ul.className = 'marker-blue';
        } else if (type === 'colorful') {
            ul.style.listStyleType = '"❖ "';
            ul.className = 'marker-color';
        } else if (type === 'diamonds') {
            ul.style.listStyleType = '"❖ "';
        } else if (type === 'arrow') {
            ul.style.listStyleType = '"➤ "';
        } else if (type === 'check') {
            ul.style.listStyleType = '"✔ "';
        } else {
            ul.style.listStyleType = type; 
        }
    }
    
    document.getElementById('bullet-palette').classList.add('hidden');
    currentDropdownId = null;
    
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Özel Sayı İşaretleri (Numbers) Uygulayıcı
window.applyNumberStyle = function(type) {
    restoreSelection();
    
    let sel = window.getSelection();
    let node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    
    // Gri alandan (pre/blockquote) listelere geçişte bloğu kır
    let block = node ? node.closest('pre, blockquote') : null;
    if (block && type !== 'none') {
        document.execCommand('formatBlock', false, 'DIV');
        sel = window.getSelection();
        node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    }

    let container = node ? node.closest('ol, ul') : null;
    
    // Eğer container yoksa veya UL ise yeni bir OL aç/çevir (type 'none' değilken)
    if ((!container || container.tagName === 'UL') && type !== 'none') {
        document.execCommand('insertOrderedList', false, null);
        sel = window.getSelection();
        node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        container = node ? node.closest('ol') : null;
    }
    
    if (container && container.tagName === 'OL') {
        container.className = ''; 
        if (type === 'none') {
            document.execCommand('insertOrderedList', false, null);
        } else {
            if (type.startsWith('custom-')) {
                container.style.listStyleType = 'none';
                container.className = type; 
            } else {
                container.style.listStyleType = type;
            }
        }
    }
    
    document.getElementById('number-palette').classList.add('hidden');
    currentDropdownId = null;
    
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Özel Renk Paleti Uygulayıcı
window.applyPaletteColor = function(color) {
    if (!currentPaletteMode) return;
    restoreSelection();
    
    if (currentPaletteMode === 'foreColor') {
        document.execCommand('foreColor', false, color);
    } else if (currentPaletteMode === 'backColor') {
        try { document.execCommand('hiliteColor', false, color); } catch(e) {}
        try { document.execCommand('backColor', false, color); } catch(e) {}
    }
    
    document.getElementById('color-palette').classList.add('hidden');
    currentPaletteMode = null;
    
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Manuel Punto Aracı
window.changeFontSize = function(delta) {
    const input = document.getElementById('font-size-input');
    let currentSize = parseInt(input.value) || 16;
    
    if (delta !== 0) {
        currentSize += delta;
    }
    
    if (currentSize < 8) currentSize = 8;
    if (currentSize > 72) currentSize = 72;
    
    input.value = currentSize;
    
    restoreSelection();
    
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
        // Native execCommand ile tarayıcının tüm karmaşık Node sınırlarını çözmesini sağlıyoruz
        // Sonra da bu geçici etiketi doğrudan piksel tabanlı style ile eziyoruz:
        document.execCommand('fontSize', false, '7');
        
        const fonts = document.querySelectorAll('font[size="7"]');
        fonts.forEach(font => {
            if (!font.style.fontSize) {
                font.removeAttribute('size');
                font.style.fontSize = currentSize + 'px';
            }
        });
    }
    
    contentInput.focus();
    autoSave();
    updateToolbarPosition();
};

// Selection Kurtarıcı
function restoreSelection() {
    if (currentSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        try {
            sel.addRange(currentSelectionRange);
        } catch(e) {}
    }
}

newNoteBtn.addEventListener('click', createNewNote);
newFolderBtn.addEventListener('click', createNewFolder);
titleInput.addEventListener('input', autoSave);
contentInput.addEventListener('input', autoSave);

// Mobil Menü Tetikleyicileri
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarContent = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

if (mobileMenuBtn && sidebarContent && sidebarOverlay) {
    mobileMenuBtn.addEventListener('click', () => {
        sidebarContent.classList.add('open');
        sidebarOverlay.classList.add('active');
    });

    sidebarOverlay.addEventListener('click', () => {
        sidebarContent.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    });
}

initDB(init);
