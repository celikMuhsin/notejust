/**
 * iOS Klavye Sorunu Çözümü (Visual Viewport API)
 * Klavye açıldığında .floating-toolbar elemanının klavye üzerinde kalmasını sağlar.
 */

export function initIOSKeyboardFix() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOS || !window.visualViewport) return;

    const toolbar = document.querySelector('.floating-toolbar');
    if (!toolbar) return;

    function adjustToolbar() {
        const viewport = window.visualViewport;
        
        // Klavyenin kapladığı yüksekliği hesapla
        // scrollY/offsetTop değerleri ekranın ne kadar kaydırıldığını gösterir
        const offset = window.innerHeight - viewport.height - viewport.offsetTop;

        // Klavyenin açık olup olmadığını kontrol et (küçük bir tolerans ile)
        if (offset > 50) {
            // Klavye açık: Toolbar'ı klavyenin hemen üzerine taşı
            toolbar.style.bottom = `${offset}px`;
            toolbar.style.transition = 'none'; // Kaydırmada titremeyi önlemek için animasyonu kapat
        } else {
            // Klavye kapalı: Toolbar'ı en alta çek
            toolbar.style.bottom = '0px';
            toolbar.style.transition = 'bottom 0.2s ease';
        }
    }

    // Visual Viewport olaylarını dinle
    window.visualViewport.addEventListener('resize', adjustToolbar);
    window.visualViewport.addEventListener('scroll', adjustToolbar);

    // İlk yüklemede de kontrol et
    adjustToolbar();
}
