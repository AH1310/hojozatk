const State = {
  user: null,
  myProvider: null,
  myBookings: [],
  allProviders: [],
  allBookings: [],
  isolatedProvider: null,
  selectedSlot: null
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  const params = new URLSearchParams(window.location.search);
  const pageSlug = params.get('page');

  // إذا دخل عميل عبر QR Code أو رابط ?page=slug -> يفتح صفحة مستقلة معزولة بالكامل لهذا الشخص فقط
  if (pageSlug) {
    await enterIsolatedCustomerPage(pageSlug);
    return;
  }

  // خلاف ذلك: واجهة أصحاب الخدمات والأدمن فقط (لا يوجد دليل عام أو قائمة أشخاص)
  document.getElementById('ownerPortalShell').classList.remove('hidden');
  await refreshSessionState();
});

function initTheme() {
  const saved = localStorage.getItem('hojoozatak_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hojoozatak_theme', next);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

function isAdmin(user) {
  return Boolean(user && user.email && user.email.toLowerCase() === SUPABASE_CONFIG.adminEmail.toLowerCase());
}

function switchAuthTab(mode) {
  const isSignup = mode === 'signup';
  document.getElementById('tabLogin').classList.toggle('active', !isSignup);
  document.getElementById('tabSignup').classList.toggle('active', isSignup);
  document.getElementById('loginFormBox').classList.toggle('hidden', isSignup);
  document.getElementById('signupFormBox').classList.toggle('hidden', !isSignup);
}

// تسجيل دخول صاحب الخدمة أو الأدمن (ah10med2013@gmail.com)
async function handleOwnerLogin(e) {
  e.preventDefault();
  if (!sb) return showToast('تأكد من الاتصال بـ Supabase');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return showToast('❌ خطأ في الدخول: ' + error.message);

  State.user = data.user;
  showToast('✅ تم تسجيل الدخول');
  await refreshSessionState();
}

// إنشاء حساب جديد لصاحب خدمة + توليد صفحته المستقلة و QR Code فوراً
async function handleOwnerSignup(e) {
  e.preventDefault();
  if (!sb) return showToast('تأكد من الاتصال بـ Supabase');

  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value.trim();
  const fullName = document.getElementById('regFullName').value.trim();
  const businessName = document.getElementById('regBusinessName').value.trim();
  const slug = document.getElementById('regSlug').value.trim();
  const specialty = document.getElementById('regSpecialty').value.trim();
  const city = document.getElementById('regCity').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const bio = document.getElementById('regBio').value.trim();

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return showToast('❌ تعذر إنشاء الحساب: ' + error.message);

  // إذا كان تأكيد البريد غير مفعل في Supabase ستحصل على session مباشرة
  if (data.session) {
    State.user = data.user;
    const { data: prov, error: rpcErr } = await sb.rpc('provision_my_provider_page', {
      p_slug: slug,
      p_full_name: fullName,
      p_business_name: businessName,
      p_specialty: specialty,
      p_city: city,
      p_phone: phone,
      p_bio: bio
    });
    if (rpcErr) {
      showToast('⚠️ تم إنشاء الحساب، لكن أكمل إعداد الصفحة من لوحتك: ' + rpcErr.message);
    } else {
      State.myProvider = prov;
      showToast('🎉 تم إنشاء حسابك وصفحتك المستقلة و QR Code بنجاح!');
    }
    await refreshSessionState();
  } else {
    // حفظ المسودة محلياً لإتمام ربط الصفحة فور تأكيد البريد وتسجيل الدخول
    localStorage.setItem('pending_provider_profile', JSON.stringify({
      slug, fullName, businessName, specialty, city, phone, bio
    }));
    showToast('📩 تم إنشاء الحساب! فعّل بريدك ثم سجل دخولك لتوليد صفحة الـ QR Code.');
    switchAuthTab('login');
  }
}

async function refreshSessionState() {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  State.user = session ? session.user : null;

  const authSection = document.getElementById('authSection');
  const ownerDashSection = document.getElementById('ownerDashSection');
  const adminDashSection = document.getElementById('adminDashSection');

  if (!State.user) {
    authSection.classList.remove('hidden');
    ownerDashSection.classList.add('hidden');
    adminDashSection.classList.add('hidden');
    return;
  }

  authSection.classList.add('hidden');

  if (isAdmin(State.user)) {
    ownerDashSection.classList.add('hidden');
    adminDashSection.classList.remove('hidden');
    await loadAdminConsole();
  } else {
    adminDashSection.classList.add('hidden');
    ownerDashSection.classList.remove('hidden');

    // إتمام ربط مسودة التسجيل إن وجدت
    const pendingRaw = localStorage.getItem('pending_provider_profile');
    if (pendingRaw) {
      try {
        const p = JSON.parse(pendingRaw);
        await sb.rpc('provision_my_provider_page', {
          p_slug: p.slug || '',
          p_full_name: p.fullName || '',
          p_business_name: p.businessName || '',
          p_specialty: p.specialty || '',
          p_city: p.city || '',
          p_phone: p.phone || '',
          p_bio: p.bio || ''
        });
        localStorage.removeItem('pending_provider_profile');
      } catch (_) {}
    }

    await loadOwnerConsole();
  }
}

async function handleSignOut() {
  if (sb) await sb.auth.signOut();
  State.user = null;
  State.myProvider = null;
  await refreshSessionState();
  showToast('تم تسجيل الخروج');
}

// لوحة صاحب الخدمة: عرض QR Code الخاص بصفحته + إدارة الخدمات والمواعيد والحجوزات
async function loadOwnerConsole() {
  const { data: prov } = await sb
    .from('providers')
    .select('*')
    .eq('auth_user_id', State.user.id)
    .single();

  if (!prov) {
    document.getElementById('ownerWorkspace').innerHTML = `
      <div class="card">
        <h3>إكمال تفعيل صفحتك المستقلة</h3>
        <form onsubmit="completeProfileForm(event)" style="margin-top:12px;">
          <div class="form-group"><label>اسمك الكامل</label><input id="cFullName" class="form-control" required /></div>
          <div class="form-group"><label>اسم النشاط أو الخدمة</label><input id="cBusiness" class="form-control" required /></div>
          <div class="form-group"><label>رابط صفحتك المستقلة (بالإنجليزية مثل: ahmed-clinic)</label><input id="cSlug" class="form-control" required /></div>
          <div class="form-group"><label>التخصص</label><input id="cSpec" class="form-control" required /></div>
          <div class="form-group"><label>المدينة</label><input id="cCity" class="form-control" required /></div>
          <div class="form-group"><label>رقم الواتساب</label><input id="cPhone" class="form-control" required /></div>
          <div class="form-group"><label>نبذة</label><textarea id="cBio" class="form-control"></textarea></div>
          <button class="btn btn-primary" type="submit">توليد صفحتي و QR Code</button>
        </form>
      </div>
    `;
    return;
  }

  State.myProvider = prov;

  const { data: bookings } = await sb
    .from('bookings')
    .select('*')
    .eq('provider_id', prov.id)
    .order('created_at', { ascending: false });

  State.myBookings = bookings || [];

  document.getElementById('ownerWorkspace').innerHTML = `
    <div class="grid-2" style="margin-bottom:18px;">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <h3>${prov.business_name}</h3>
            <p style="color:var(--text-muted); font-size:0.88rem;">${prov.full_name} • ${prov.specialty} • ${prov.city}</p>
          </div>
          <span class="badge ${prov.is_active ? 'badge-success' : 'badge-danger'}">${prov.is_active ? 'صفحة مفعلة' : 'صفحة متوقفة'}</span>
        </div>

        <form onsubmit="saveProviderSettings(event)" style="margin-top:14px;">
          <div class="form-group">
            <label>الخدمات والأسعار (كل سطر: اسم الخدمة | السعر)</label>
            <textarea id="provServicesInput" class="form-control" rows="4">${(prov.services || []).map(s => `${s.name} | ${s.price}`).join('
')}</textarea>
          </div>
          <div class="form-group">
            <label>المواعيد المتاحة يومياً (افصل بينها بفاصلة)</label>
            <input id="provSlotsInput" class="form-control" value="${(prov.slots || []).join(', ')}" />
          </div>
          <div class="form-group">
            <label>أوقات العمل</label>
            <input id="provHoursInput" class="form-control" value="${prov.work_hours || ''}" />
          </div>
          <div class="form-group">
            <label>نبذة تظهر للعملاء في صفحتك المستقلة</label>
            <textarea id="provBioInput" class="form-control" rows="2">${prov.bio || ''}</textarea>
          </div>
          <button class="btn btn-accent" type="submit">💾 حفظ إعدادات صفحتي</button>
        </form>
      </div>

      <div id="ownerQrBox"></div>
    </div>

    <div class="card table-wrap">
      <h3 style="margin-bottom:12px;">حجوزات العملاء القادمة من QR Code / رابطك (${State.myBookings.length})</h3>
      <table>
        <thead>
          <tr>
            <th>الكود</th>
            <th>العميل</th>
            <th>الخدمة</th>
            <th>الموعد</th>
            <th>الحالة</th>
            <th>إجراء</th>
          </tr>
        </thead>
        <tbody>
          ${State.myBookings.map(b => {
            const wa = (b.customer_phone || '').replace(/[^0-9]/g, '');
            return `
              <tr>
                <td><strong>${b.booking_code}</strong></td>
                <td>${b.customer_name}<br><small>${b.customer_phone}</small></td>
                <td>${b.service_name}</td>
                <td>${b.booking_date} • <strong>${b.booking_slot}</strong></td>
                <td>${b.status}</td>
                <td>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn btn-primary btn-sm" onclick="setBookingState('${b.id}', 'confirmed')">تأكيد</button>
                    <button class="btn btn-danger btn-sm" onclick="setBookingState('${b.id}', 'cancelled')">إلغاء</button>
                    ${wa ? `<a class="btn btn-accent btn-sm" target="_blank" href="https://wa.me/${wa}">واتساب</a>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('') || '<tr><td colspan="6">لا توجد حجوزات حتى الآن</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  renderQrCard('ownerQrBox', prov.slug, prov.business_name);
}

async function completeProfileForm(e) {
  e.preventDefault();
  const { data, error } = await sb.rpc('provision_my_provider_page', {
    p_slug: document.getElementById('cSlug').value.trim(),
    p_full_name: document.getElementById('cFullName').value.trim(),
    p_business_name: document.getElementById('cBusiness').value.trim(),
    p_specialty: document.getElementById('cSpec').value.trim(),
    p_city: document.getElementById('cCity').value.trim(),
    p_phone: document.getElementById('cPhone').value.trim(),
    p_bio: document.getElementById('cBio').value.trim()
  });
  if (error) return showToast('❌ ' + error.message);
  State.myProvider = data;
  showToast('✅ تم توليد صفحتك المستقلة و QR Code');
  await loadOwnerConsole();
}

async function saveProviderSettings(e) {
  e.preventDefault();
  const lines = document.getElementById('provServicesInput').value.split('
').map(l => l.trim()).filter(Boolean);
  const services = lines.map(line => {
    const parts = line.split('|');
    return { name: (parts[0] || 'خدمة').trim(), price: (parts[1] || '100').trim() };
  });
  const slots = document.getElementById('provSlotsInput').value.split(',').map(s => s.trim()).filter(Boolean);
  const work_hours = document.getElementById('provHoursInput').value.trim();
  const bio = document.getElementById('provBioInput').value.trim();

  const { error } = await sb
    .from('providers')
    .update({ services, slots, work_hours, bio })
    .eq('id', State.myProvider.id);

  if (error) return showToast('❌ ' + error.message);
  showToast('✅ تم حفظ إعدادات صفحتك');
  await loadOwnerConsole();
}

async function setBookingState(bookingId, status) {
  const { error } = await sb.from('bookings').update({ status }).eq('id', bookingId);
  if (error) return showToast('❌ ' + error.message);
  showToast('تم تحديث الحالة');
  await loadOwnerConsole();
}

// لوحة الأدمن (ah10med2013@gmail.com)
async function loadAdminConsole() {
  const { data: provs } = await sb.from('providers').select('*').order('created_at', { ascending: false });
  State.allProviders = provs || [];

  const tbody = document.getElementById('adminTableBody');
  if (!tbody) return;

  tbody.innerHTML = State.allProviders.map(p => {
    const link = buildIsolatedPageUrl(p.slug);
    return `
      <tr>
        <td><strong>${p.business_name}</strong><br><small>${p.full_name} • ${p.email}</small></td>
        <td><code>?page=${p.slug}</code><br><button class="btn btn-outline btn-sm" onclick="copyLink('${link}')">نسخ الرابط</button></td>
        <td>${p.is_active ? '<span class="badge badge-success">نشط</span>' : '<span class="badge badge-danger">متوقف</span>'}</td>
        <td>
          <button class="btn btn-sm ${p.is_active ? 'btn-danger' : 'btn-accent'}" onclick="adminToggleActive('${p.id}', ${!p.is_active})">
            ${p.is_active ? 'إيقاف الصفحة' : 'تفعيل الصفحة'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function adminToggleActive(id, nextState) {
  const { error } = await sb.from('providers').update({ is_active: nextState }).eq('id', id);
  if (error) return showToast('❌ ' + error.message);
  showToast(nextState ? 'تم تفعيل الصفحة' : 'تم إيقاف الصفحة');
  await loadAdminConsole();
}

// الصفحة المستقلة المعزولة تماماً للعميل عند مسح QR Code أو فتح ?page=slug
// لا تعرض أي قائمة أو روابط لأشخاص آخرين ولا تسمح بالخروج إلى دليل عام
async function enterIsolatedCustomerPage(slug) {
  document.getElementById('ownerPortalShell').classList.add('hidden');
  document.getElementById('isolatedCustomerShell').classList.remove('hidden');

  if (!sb) return;
  const { data, error } = await sb.rpc('get_isolated_provider_page', { p_slug: slug });
  const provider = Array.isArray(data) ? data[0] : data;

  if (error || !provider) {
    document.getElementById('isolatedPageContainer').innerHTML = `
      <div class="card" style="text-align:center; padding:36px;">
        <h3>عذراً، هذه الصفحة غير متاحة أو متوقفة حالياً</h3>
        <p style="color:var(--text-muted); margin-top:8px;">تأكد من صحة رمز QR Code أو تواصل مع مقدم الخدمة.</p>
      </div>
    `;
    return;
  }

  State.isolatedProvider = provider;
  const today = new Date().toISOString().split('T')[0];
  const services = Array.isArray(provider.services) ? provider.services : [];

  document.getElementById('isolatedPageContainer').innerHTML = `
    <div class="card" style="max-width:640px; margin:0 auto;">
      <div style="border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:16px;">
        <span class="badge badge-success">صفحة حجز مخصصة</span>
        <h1 style="font-size:1.55rem; margin-top:8px;">${provider.business_name}</h1>
        <p style="color:var(--text-muted); font-size:0.92rem;">${provider.full_name} • ${provider.specialty}${provider.city ? ' • ' + provider.city : ''}</p>
        ${provider.bio ? `<p style="margin-top:8px; font-size:0.94rem;">${provider.bio}</p>` : ''}
        <p style="margin-top:8px; font-size:0.86rem; color:var(--text-muted);">🕒 أوقات العمل: ${provider.work_hours || 'متاح'}</p>
      </div>

      <form onsubmit="submitIsolatedBooking(event, '${provider.id}', '${provider.phone}', '${provider.business_name}')">
        <div class="form-group">
          <label>اختر الخدمة</label>
          <select id="isoService" class="form-control" required>
            ${services.map(s => `<option value="${s.name}">${s.name} (${s.price})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>اختر اليوم</label>
          <input type="date" id="isoDate" class="form-control" min="${today}" value="${today}" required onchange="loadIsolatedSlots('${provider.id}')" />
        </div>
        <div class="form-group">
          <label>اختر الوقت المتاح</label>
          <div id="isoSlots" class="slots-grid"></div>
        </div>
        <div class="form-group">
          <label>اسمك</label>
          <input type="text" id="isoName" class="form-control" required />
        </div>
        <div class="form-group">
          <label>رقم الجوال / واتساب</label>
          <input type="tel" id="isoPhone" class="form-control" required />
        </div>
        <div class="form-group">
          <label>ملاحظات (اختياري)</label>
          <textarea id="isoNotes" class="form-control" rows="2"></textarea>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%; padding:13px; font-size:1rem;">✅ تأكيد الحجز مع ${provider.business_name}</button>
      </form>
    </div>
  `;

  await loadIsolatedSlots(provider.id);
}

async function loadIsolatedSlots(providerId) {
  const dateVal = document.getElementById('isoDate')?.value;
  const provider = State.isolatedProvider;
  if (!provider || !dateVal) return;

  let booked = [];
  const { data } = await sb.rpc('get_booked_slots', { p_provider_id: providerId, p_date: dateVal });
  if (Array.isArray(data)) booked = data.map(x => x.booking_slot);

  const slots = Array.isArray(provider.slots) ? provider.slots : [];
  State.selectedSlot = null;

  document.getElementById('isoSlots').innerHTML = slots.map(slot => {
    const taken = booked.includes(slot);
    return `<button type="button" class="slot-btn" ${taken ? 'disabled' : `onclick="pickIsoSlot(this, '${slot}')"`}>${slot}</button>`;
  }).join('');
}

function pickIsoSlot(btn, slot) {
  document.querySelectorAll('#isoSlots .slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  State.selectedSlot = slot;
}

async function submitIsolatedBooking(e, providerId, providerPhone, businessName) {
  e.preventDefault();
  if (!State.selectedSlot) return showToast('اختر الوقت المتاح أولاً');

  const code = 'BK-' + Math.floor(100000 + Math.random() * 900000);
  const payload = {
    booking_code: code,
    provider_id: providerId,
    customer_name: document.getElementById('isoName').value.trim(),
    customer_phone: document.getElementById('isoPhone').value.trim(),
    service_name: document.getElementById('isoService').value,
    booking_date: document.getElementById('isoDate').value,
    booking_slot: State.selectedSlot,
    notes: document.getElementById('isoNotes').value.trim(),
    status: 'pending'
  };

  const { error } = await sb.from('bookings').insert(payload);
  if (error) return showToast('❌ تعذر إتمام الحجز: ' + error.message);

  showToast('✅ تم تأكيد حجزك برقم: ' + code);
  const cleanPhone = (providerPhone || '').replace(/[^0-9]/g, '');
  if (cleanPhone) {
    const msg = encodeURIComponent(
      `مرحباً ${businessName}، تم حجز موعد جديد عبر صفحة QR الخاصة بك:
• رقم الحجز: ${code}
• الخدمة: ${payload.service_name}
• الموعد: ${payload.booking_date} (${payload.booking_slot})
• العميل: ${payload.customer_name} - ${payload.customer_phone}`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  }
  await loadIsolatedSlots(providerId);
  e.target.reset();
}
