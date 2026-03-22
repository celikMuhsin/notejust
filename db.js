let items = [];
let db;
const DB_NAME = 'NotAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes_store';

function initDB(callback) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function (event) {
        db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };

    request.onsuccess = function (event) {
        db = event.target.result;
        loadDataFromDB(callback);
    };

    request.onerror = function (event) {
        console.error("IndexedDB Hatası:", event.target.error);
        items = [];
        callback();
    };
}

function loadDataFromDB(callback) {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('notesData');

    request.onsuccess = function (event) {
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
                    if (!parentGroups[i.parentId]) parentGroups[i.parentId] = [];
                    parentGroups[i.parentId].push(i);
                });

                Object.keys(parentGroups).forEach(pid => {
                    parentGroups[pid].sort((a, b) => {
                        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
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
            } catch (e) { }
        }
        callback();
    };

    request.onerror = function () {
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

// Diğer dosyalarda kullanılacak değişken ve fonksiyonları dışa aktar
export { items, db, initDB, loadDataFromDB, saveDataToDB };
