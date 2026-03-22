import { items, saveDataToDB } from './db.js';
import { activeNoteId, setActiveNoteId, renderNotesList, formatTurkishDate } from './ui.js';

// ---- DOM Elementleri ----
const titleInput = document.querySelector('.note-title');
const contentInput = document.getElementById('note-content');
const noteDateDisplay = document.getElementById('note-date-display');
const toolbar = document.getElementById('floating-toolbar');

// ---- Durum (State) Değişkenleri ----
let currentSelectionRange = null; 
let savedRanges = []; 
let currentPaletteMode = null; 
let currentDropdownId = null;

let isFormatPainting = false;
let storedFormat = null;

let isTyping = false;
let typingTimeout;

let lastMouseX = null;
let lastInteractionType = 'mouse';
let isInteractingWithToolbar = false;

// -----------------------------------------------------
// OTOMATİK KAYDETME (Auto-Save)
// -----------------------------------------------------
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
        setActiveNoteId(newNote.id);
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

titleInput.addEventListener('input', autoSave);
contentInput.addEventListener('input', autoSave);

// -----------------------------------------------------
// BİÇİM BOYACISI (Format Painter)
// -----------------------------------------------------
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
// ZENGİN METİN ARAÇ ÇUBUĞU VE SEÇİM (Selection API)
// -----------------------------------------------------
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

document.addEventListener('mousedown', (e) => {
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

function restoreSelection() {
    if (currentSelectionRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        try {
            sel.addRange(currentSelectionRange);
        } catch(e) {}
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

// Harf Durumu (Change Case) Uygulayıcı
window.applyChangeCase = function(type) {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    
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
                            isPreviousSpace = true;
                        }
                    }
                    newText = chars.join('');
                    break;
            }
            node.nodeValue = newText;
        }
    }
    
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
        const newDiv = document.createElement('div');
        newDiv.innerHTML = '<br>';
        
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
    
    let block = node ? node.closest('pre, blockquote') : null;
    if (block && type !== 'none') {
        document.execCommand('formatBlock', false, 'DIV');
        sel = window.getSelection();
        node = sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null;
        if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    }

    let container = node ? node.closest('ol, ul') : null;
    
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

// Klavye Gizleme Fonksiyonu
window.hideKeyboard = function() {
    if (document.activeElement) {
        document.activeElement.blur();
    }
};

// Visual Viewport API ile Klavye Takibi (Toolbar'ı doğrudan klavye üzerine taşır)
if (window.visualViewport) {
    const handleViewportChange = () => {
        if (window.innerWidth <= 768 && toolbar) {
            const viewport = window.visualViewport;
            const offset = window.innerHeight - viewport.height;
            // Doğrudan inline style olarak yazıyoruz (Garanti çözüm)
            toolbar.style.bottom = (offset > 0 ? offset : 0) + 'px';
        } else if (toolbar) {
            toolbar.style.bottom = '';
        }
    };
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
}

// ---- Dışa Aktarımlar ----
export {
    autoSave,
    updateToolbarPosition,
    restoreSelection,
    currentSelectionRange,
    currentPaletteMode,
    currentDropdownId
};
