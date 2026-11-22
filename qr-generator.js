function buildIsolatedPageUrl(slug) {
  const originAndPath = window.location.origin + window.location.pathname;
  return `${originAndPath}?page=${encodeURIComponent(slug)}`;
}

function buildQrUrl(targetUrl, size = 260) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(targetUrl)}`;
}

function renderQrCard(containerId, slug, title) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const pageUrl = buildIsolatedPageUrl(slug);
  const qrSrc = buildQrUrl(pageUrl, 260);

  box.innerHTML = `
    <div style="text-align:center; padding:18px; border-radius:16px; background:var(--surface-alt); border:1px solid var(--border);">
      <h4 style="margin-bottom:6px;">QR Code لصفحة حجزك المستقلة</h4>
      <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:12px;">
        عند مسح العميل لهذا الكود يُفتح له صفحة مستقلة خاصة بـ <strong>${title}</strong> فقط دون عرض أي صفحات أو أشخاص آخرين.
      </p>
      <img src="${qrSrc}" alt="QR Code" style="width:210px; height:210px; background:#fff; padding:10px; border-radius:14px; margin:0 auto 12px; display:block;" />
      <div style="direction:ltr; font-size:0.78rem; background:var(--surface); padding:8px 10px; border-radius:8px; border:1px solid var(--border); word-break:break-all; margin-bottom:12px;">
        ${pageUrl}
      </div>
      <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
        <button type="button" class="btn btn-primary btn-sm" onclick="copyLink('${pageUrl}')">📋 نسخ الرابط المستقل</button>
        <a href="${qrSrc}" download="qr-${slug}.png" class="btn btn-accent btn-sm">⬇️ تحميل QR Code</a>
      </div>
    </div>
  `;
}

function copyLink(text) {
  navigator.clipboard.writeText(text).then(() => showToast('✅ تم نسخ الرابط المستقل'));
}
