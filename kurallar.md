# Antigravity Ajanı Çalışma Kuralları (NotApp - PWA / Web Projesi)

## 1. Temel İletişim
- Benimle **SADECE TÜRKÇE** iletişim kur.
- Cevaplarını kısa, net ve doğrudan ver. Gereksiz övgülerden ve uzun açıklamalardan kaçın.

## 2. Token ve Bağlam Tasarrufu (Kritik!)
- Tüm projeyi taramak yerine, sadece üzerinde çalıştığımız aktif dosyalara (`index.html`, `style.css`, `script.js` vb.) odaklan.
- Bir modülü veya arayüz parçasını bitirmeden başka bir işe geçme.
- Benden talep gelmedikçe projenin tamamını yeniden yazma veya refactor etme.
- Sadece benden istediğin değişiklikleri veya eklediğin yeni kod bloklarını göster, tüm dosya içeriğini tekrar tekrar yazdırma.

## 3. Geliştirme Standartları (PWA & Mobil Uyumlu Web)
- **Mobile-First (Mobil Öncelikli) Tasarım:** Yazdığın CSS kodları, `flexbox` veya `grid` yapıları kullanarak hem dar telefon ekranlarında hem de geniş tarayıcılarda kusursuz görünmeli. `Responsive` (Duyarlı) tasarım için `@media` sorgularını kullan.
- **Vanilla JS & Performans:** Dış kütüphane (React, Vue vb.) kullanmadan saf (Vanilla) JavaScript, HTML ve CSS ile ilerle.
- **PWA Standartları:** Uygulamanın telefonlarda "Ana Ekrana Ekle" özelliğiyle yerel bir uygulama gibi çalışabilmesi için Service Worker ve `manifest.json` mimarisine uygun kodlar yaz.
- **Dokunmatik Dostu (Touch-Friendly):** Mobil cihazlarda kullanılacağı için butonların, yüzen araç çubuğunun (floating toolbar) ve menülerin parmakla basmaya uygun (yeterince büyük) olmasını sağla.

## 4. Görev Takibi
- Yeni bir işleme başlamadan önce, ne yapacağını adım adım (1, 2, 3 şeklinde) kısa bir plan olarak bana sun. Ben onay verdikten sonra koda dök.