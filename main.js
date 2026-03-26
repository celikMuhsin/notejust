import { items, initDB } from './db.js';
import { renderNotesList, selectNote, createNewNote, createNewFolder } from './ui.js';

// Bu importlar, dosyaların içindeki olay dinleyicilerini (event listeners) 
// ve HTML onclick kullanımı için gerekli olan global (window.*) atamalarını çalıştırır.
import './editor.js';
import './image-handler.js';
import { initIOSKeyboardFix } from './ios-keyboard-fix.js';
import { initThemeHandler } from './theme-handler.js';

function init() {
    renderNotesList();
    
    const firstNote = items.find(i => i.type === 'note');
    if (firstNote) {
        selectNote(firstNote.id);
    } else {
        createNewNote();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Önce veritabanını başlat, başarıyla yüklenince arayüzü çiz
    initDB(init);

    // 2. Statik Butonların Olaylarını (Events) Bağla
    const newNoteBtn = document.querySelector('.new-note-btn');
    const newFolderBtn = document.querySelector('.new-folder-btn');

    if (newNoteBtn) {
        newNoteBtn.addEventListener('click', createNewNote);
    }
    
    if (newFolderBtn) {
        newFolderBtn.addEventListener('click', createNewFolder);
    }
    
    // Not: formatText, toggleColorPalette, triggerImageUpload gibi fonksiyonlar
    // index.html içerisindeki "onclick" yapıları bozulmasın diye sırasıyla 
    // editor.js ve image-handler.js içerisinde doğrudan 'window' objesine 
    // eklenmiştir (Örn: window.formatText = function() {...}). 
    // Bu sayede dışarıdan herhangi bir ek atamaya gerek kalmaz.
    // 3. iOS Klavye Fixini Başlat
    initIOSKeyboardFix();

    // 4. Gece Modu Yönetimini Başlat
    initThemeHandler();
});
