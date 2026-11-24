/* MAISON ORÉE — 콘텐츠는 content/*.json 에서 읽습니다.
   운영자는 Pages CMS(app.pagescms.org)에서 이 JSON 파일을 수정합니다.
   이 파일은 화면을 그리는 코드라 운영 중에는 고칠 필요가 없습니다. */
{
  /* ---------- 공통 도구 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = v => esc(v).replace(/\r?\n/g, ' <br>');   // 모바일에서 <br>을 숨겨도 띄어쓰기가 남도록
  const img = p => String(p || '').replace(/^\/+/, '');            // Pages CMS가 앞에 /를 붙여도 동작하게
  const safeUrl = u => {
    const s = String(u || '').trim();
    return /^(https?:\/\/|#|mailto:|tel:|\.?\/?[\w-])/i.test(s) && !/^javascript:/i.test(s) ? s : '#';
  };
  const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const parseDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const dot = d => { const t = parseDate(d); return t ? `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')}` : ''; };
  const sanitize = html => {
    if (window.DOMPurify) return DOMPurify.sanitize(html || '');
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');   // 예비: 위험한 태그와 속성만 제거
    doc.querySelectorAll('script,style,iframe,object,embed,form').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => { if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
    return doc.body.innerHTML;
  };

  const load = name => fetch(`content/${name}.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(name); return r.json(); });

  /* ---------- 토스트 ---------- */
  const toast = $('#toast'); let toastT;
  const showToast = m => { toast.textContent = m; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 2400); };

  /* ---------- 사이트 문구 (site.json) ---------- */
  function renderSite(s) {
    document.querySelectorAll('[data-bind]').forEach(el => { const v = get(s, el.dataset.bind); if (v != null && v !== '') el.innerHTML = nl2br(v); });
    document.querySelectorAll('[data-bind-src]').forEach(el => { const v = get(s, el.dataset.bindSrc); if (v) el.src = img(v); });
    document.querySelectorAll('[data-bind-alt]').forEach(el => { const v = get(s, el.dataset.bindAlt); if (v != null) el.alt = v; });
    document.querySelectorAll('[data-bind-href]').forEach(el => { const v = get(s, el.dataset.bindHref); if (v) el.href = safeUrl(v); });
    const ann = document.querySelector('.announce'); if (ann && !s.announcement) ann.hidden = true;

    $('#catGrid').innerHTML = (s.categories || []).map(c => `
      <a href="#best" class="cat" data-filter="${esc(c.filter)}">
        <img src="${esc(img(c.image))}" alt="${esc(c.imageAlt)}" loading="lazy">
        <p class="cat__en">${esc(c.en)}</p>
        <div class="cat__row"><span class="cat__kr">${esc(c.kr)}${c.count ? '  ·  ' + esc(c.count) : ''}</span><span class="cat__arrow" aria-hidden="true">→</span></div>
      </a>`).join('');

    $('#stats').innerHTML = (get(s, 'craft.stats') || []).map(t => `<div class="stat"><b>${esc(t.value)}</b><span>${esc(t.label)}</span></div>`).join('');
    $('#services').innerHTML = (s.services || []).map(t => `<div class="service"><b>${esc(t.en)}</b><span>${esc(t.kr)}</span></div>`).join('');

    const c = s.contact || {};
    setupInquiry(s.inquiry || {}, c);
    $('#footerContact').innerHTML = [
      c.address && `<span>${esc(c.address)}</span>`,
      c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`,
      c.phone && `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>`
    ].filter(Boolean).join('');
    $('#footerSns').innerHTML = [
      c.instagramLink && `<a href="${esc(safeUrl(c.instagramLink))}" target="_blank" rel="noopener">INSTAGRAM</a>`,
      c.kakaoLink && `<a href="${esc(safeUrl(c.kakaoLink))}" target="_blank" rel="noopener">KAKAO</a>`
    ].filter(Boolean).join('');
  }

  /* ---------- 상품 (products.json) ---------- */
  const TYPE = { candle: 'CANDLE', diffuser: 'DIFFUSER', spray: 'ROOM SPRAY', gift: 'GIFT SET' };
  const TYPE_KR = { candle: '캔들', diffuser: '디퓨저', spray: '룸 스프레이', gift: '기프트 세트' };
  const heartSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" stroke="#1F1B18" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  let PRODUCTS = [];
  const grid = $('#productGrid');
  function renderProducts(filter = 'all') {
    const best = PRODUCTS.filter(p => p.best);
    const base = filter === 'all' ? (best.length ? best : PRODUCTS) : PRODUCTS.filter(p => p.type === filter);
    grid.innerHTML = base.length ? base.map(p => `
      <article class="card">
        <div class="card__media">
          <img src="${esc(img(p.image))}" alt="${esc(p.imageAlt)}" loading="lazy">
          <button class="card__wish" aria-label="${esc(p.name)} 위시리스트에 추가" aria-pressed="false">${heartSvg}</button>
          ${p.soldOut ? '' : `<button class="card__add" data-i="${PRODUCTS.indexOf(p)}">장바구니 담기</button>`}
        </div>
        <div class="card__info">
          <p class="card__type">${esc(TYPE[p.type] || '')}${p.size ? ' · ' + esc(p.size) : ''}</p>
          <h3 class="card__name">${esc(p.name)}</h3>
          ${p.en ? `<p class="card__en">${esc(p.en)}</p>` : ''}
          <p class="card__price">${p.soldOut ? '<span class="badge badge--closed">품절</span>' : esc(won(p.price))}</p>
        </div>
      </article>`).join('') : `<p class="empty">${esc(TYPE_KR[filter] || '')} 컬렉션은 곧 공개됩니다.</p>`;
  }
  const tabs = document.querySelectorAll('.tab');
  function setTab(name) { tabs.forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); }); renderProducts(name); }
  tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('#catGrid').addEventListener('click', e => { const c = e.target.closest('.cat[data-filter]'); if (c && c.dataset.filter) setTab(c.dataset.filter); });

  let bag = 0; const bagEl = $('#bagCount');
  grid.addEventListener('click', e => {
    const add = e.target.closest('.card__add');
    if (add) { const p = PRODUCTS[+add.dataset.i]; bag++; bagEl.textContent = bag; bagEl.classList.remove('bump'); void bagEl.offsetWidth; bagEl.classList.add('bump'); showToast(`${p.name}을(를) 장바구니에 담았습니다.`); }
    const w = e.target.closest('.card__wish');
    if (w) { const on = !w.classList.contains('on'); w.classList.toggle('on', on); w.setAttribute('aria-pressed', on); showToast(on ? '위시리스트에 추가했습니다.' : '위시리스트에서 삭제했습니다.'); }
  });

  /* ---------- 교육 프로그램 (programs.json) ---------- */
  const PTYPE = { oneday: '원데이 클래스', regular: '정규 클래스', corporate: '기업·단체 클래스' };
  const STATUS = { open: '모집 중', few: '마감 임박', closed: '마감', soon: '오픈 예정' };
  function renderPrograms(list) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const up = list.filter(p => { const d = parseDate(p.date); return !d || d >= today; })
                   .sort((a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0));
    $('#progList').innerHTML = up.length ? up.map(p => {
      const d = parseDate(p.date);
      const closed = p.status === 'closed' || p.status === 'soon';
      const label = p.status === 'soon' ? '오픈 예정' : p.status === 'closed' ? '마감' : '신청하기';
      const link = safeUrl(p.applyLink || '#inquiry');
      const ext = /^https?:/i.test(link);
      return `<li class="prog">
        <div class="prog__date">${d ? `<b>${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}</b><span>${WEEK[d.getDay()]}요일${p.time ? ' ' + esc(p.time) : ''}</span>` : '<b>—</b><span>일정 협의</span>'}</div>
        ${p.image ? `<img class="prog__img" src="${esc(img(p.image))}" alt="${esc(p.imageAlt)}" loading="lazy">` : '<span></span>'}
        <div>
          <p class="prog__type">${esc(PTYPE[p.type] || '')}</p>
          <h3 class="prog__title">${esc(p.title)}</h3>
          ${p.summary ? `<p class="prog__summary">${esc(p.summary)}</p>` : ''}
          <p class="prog__meta">${[p.duration, p.capacity && '정원 ' + p.capacity, p.location].filter(Boolean).map(esc).join('  ·  ')}</p>
        </div>
        <div class="prog__side">
          ${p.status ? `<span class="badge badge--${esc(p.status)}">${esc(STATUS[p.status] || '')}</span>` : ''}
          ${p.price ? `<p class="prog__price">${esc(won(p.price))}</p>` : ''}
          <a class="btn btn--dark btn--sm" href="${esc(link)}" data-prog="${esc(p.title)}|${esc(p.date || '')}"${ext ? ' target="_blank" rel="noopener"' : ''}${closed ? ' aria-disabled="true" tabindex="-1"' : ''}>${label}</a>
        </div>
      </li>`;
    }).join('') : '<li class="empty-row">다음 클래스 일정은 곧 공지합니다. 소식을 받아 보시려면 아래에서 구독해 주세요.</li>';
  }

  /* ---------- 제작 실적 (portfolio.json) ---------- */
  const PCAT = { engraving: '각인 선물', wedding: '웨딩', corporate: '기업 선물', class: '클래스', collab: '협업·공간 연출' };
  let PF = [], pfFilter = 'all', pfShowAll = false; const PF_LIMIT = 6;
  function renderPortfolio() {
    const sorted = [...PF].sort((a, b) => (b.featured === true) - (a.featured === true) || (parseDate(b.date) || 0) - (parseDate(a.date) || 0));
    const list = pfFilter === 'all' ? sorted : sorted.filter(p => p.category === pfFilter);
    const shown = pfShowAll ? list : list.slice(0, PF_LIMIT);
    $('#pfGrid').innerHTML = shown.length ? shown.map(p => `
      <article class="pf">
        <div class="pf__media"><img src="${esc(img(p.image))}" alt="${esc(p.imageAlt)}" loading="lazy"></div>
        <p class="pf__meta">${[dot(p.date).slice(0, 7), PCAT[p.category], p.quantity].filter(Boolean).map(esc).join('  ·  ')}</p>
        <h3 class="pf__title">${esc(p.title)}</h3>
        ${p.engraving ? `<p class="pf__quote">“${esc(p.engraving)}”</p>` : ''}
        ${p.summary ? `<p class="pf__summary">${esc(p.summary)}</p>` : ''}
      </article>`).join('') : '<p class="empty" style="min-height:200px">이 분류의 실적은 곧 소개합니다.</p>';
    $('#pfMoreWrap').hidden = pfShowAll || list.length <= PF_LIMIT;
  }
  function renderChips() {
    const used = [...new Set(PF.map(p => p.category).filter(c => PCAT[c]))];
    $('#pfChips').innerHTML = ['all', ...used].map(c => `<button class="chip${c === pfFilter ? ' is-active' : ''}" aria-pressed="${c === pfFilter}" data-c="${c}">${c === 'all' ? '전체' : PCAT[c]}</button>`).join('');
  }
  $('#pfChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; pfFilter = b.dataset.c; pfShowAll = false; renderChips(); renderPortfolio(); });
  $('#pfMore').addEventListener('click', () => { pfShowAll = true; renderPortfolio(); });

  /* ---------- 저널 (journal.json) ---------- */
  const JCAT = { news: '소식', story: '이야기', guide: '사용 안내', event: '이벤트' };
  let POSTS = [];
  function renderJournal(list) {
    POSTS = list.filter(p => p.published !== false).sort((a, b) => (parseDate(b.date) || 0) - (parseDate(a.date) || 0)).slice(0, 3);
    $('#jrGrid').innerHTML = POSTS.length ? POSTS.map((p, i) => `
      <button class="jr" data-i="${i}">
        <div class="jr__media">${p.cover ? `<img src="${esc(img(p.cover))}" alt="${esc(p.coverAlt)}" loading="lazy">` : ''}</div>
        <p class="jr__meta">${[dot(p.date), JCAT[p.category]].filter(Boolean).map(esc).join('  ·  ')}</p>
        <h3 class="jr__title">${esc(p.title)}</h3>
        ${p.summary ? `<p class="jr__summary">${esc(p.summary)}</p>` : ''}
        <span class="jr__more">읽기</span>
      </button>`).join('') : '<p class="empty" style="min-height:200px">첫 번째 이야기를 준비하고 있습니다.</p>';
  }
  const dlg = $('#post');
  $('#jrGrid').addEventListener('click', e => {
    const b = e.target.closest('.jr'); if (!b) return;
    const p = POSTS[+b.dataset.i];
    const cover = $('#postCover');
    cover.hidden = !p.cover; cover.src = img(p.cover); cover.alt = p.coverAlt || '';
    $('#postMeta').textContent = [dot(p.date), JCAT[p.category]].filter(Boolean).join('  ·  ');
    $('#postTitle').textContent = p.title;
    $('#postContent').innerHTML = sanitize(p.body);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    dlg.scrollTop = 0;
  });
  $('#postClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });


  /* ---------- 기업·단체 상담 폼 (site.json > inquiry, 수신: apps-script/Code.gs) ---------- */
  const form = $('#inqForm'), statusEl = $('#inqStatus'), submitBtn = $('#inqSubmit');
  let INQ = {}, CONTACT = {}; const formStart = Date.now();
  function setupInquiry(cfg, contact) {
    INQ = cfg; CONTACT = contact;
    const sel = $('#f-type');
    sel.innerHTML = '<option value="">선택해 주세요</option>' + (cfg.types || []).filter(Boolean).map(t => `<option>${esc(t)}</option>`).join('');
    const direct = [contact.phone && `전화 <a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ''))}">${esc(contact.phone)}</a>`,
                    contact.email && `이메일 <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>`].filter(Boolean);
    $('#inqDirect').innerHTML = direct.length ? `급한 상담은 ${direct.join(', ')}으로 바로 연락해 주세요.` : '';
  }
  const fallbackContact = () => [CONTACT.phone, CONTACT.email].filter(Boolean).join(' 또는 ');
  const MSG = {
    company: '기업명을 입력해 주세요. 개인이라면 \'개인\'이라고 적어 주세요.',
    name: '담당자 이름을 입력해 주세요.',
    phone: '연락처를 입력해 주세요. 예: 010-1234-5678',
    phoneInvalid: '연락처는 숫자와 하이픈(-)으로 8~20자리 입력해 주세요. 예: 010-1234-5678',
    email: '이메일 형식을 확인해 주세요. 예: name@company.com',
    message: '상담 내용을 입력해 주세요.',
    consent: '개인정보 수집·이용에 동의해야 상담을 접수할 수 있습니다.'
  };
  const FIELD_ID = { company: 'f-company', name: 'f-name', phone: 'f-phone', email: 'f-email', message: 'f-message', consent: 'f-consent' };
  function setErr(key, msg) {
    const input = document.getElementById(FIELD_ID[key]); const err = document.getElementById('e-' + key);
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (err) err.textContent = msg || '';
  }
  function validate(d) {
    const errs = {};
    if (!d.company) errs.company = MSG.company;
    if (!d.name) errs.name = MSG.name;
    if (!d.phone) errs.phone = MSG.phone; else if (!/^[0-9+\-()\s]{8,20}$/.test(d.phone)) errs.phone = MSG.phoneInvalid;
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errs.email = MSG.email;
    if (!d.message) errs.message = MSG.message;
    if (!d.consent) errs.consent = MSG.consent;
    return errs;
  }
  function collect() {
    const f = new FormData(form), val = k => String(f.get(k) || '').trim();
    return { company: val('company'), name: val('name'), phone: val('phone'), email: val('email'), type: val('type'),
             quantity: val('quantity'), dueDate: val('dueDate'), message: val('message'), website: val('website'),
             consent: $('#f-consent').checked, consentVersion: INQ.consentVersion || '', page: location.href.split('#')[0],
             elapsed: Date.now() - formStart };
  }
  ['company', 'name', 'phone', 'email', 'message'].forEach(k => document.getElementById(FIELD_ID[k]).addEventListener('input', () => setErr(k, '')));
  $('#f-consent').addEventListener('change', () => setErr('consent', ''));
  const msgEl = $('#f-message'), countEl = $('#c-message');
  msgEl.addEventListener('input', () => { countEl.textContent = `${msgEl.value.length.toLocaleString('ko-KR')} / 2,000자`; });
  const dueEl = $('#f-due'); dueEl.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function setStatus(text, isErr) { statusEl.textContent = text; statusEl.className = 'inq-status' + (isErr ? ' err' : ''); }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = collect();
    const errs = validate(d);
    Object.keys(FIELD_ID).forEach(k => setErr(k, errs[k]));
    const keys = Object.keys(errs);
    if (keys.length) { setStatus(`입력 내용을 확인해 주세요. ${keys.length}개 항목에 안내가 있습니다.`, true); document.getElementById(FIELD_ID[keys[0]]).focus(); return; }
    const endpoint = String(INQ.endpoint || '').trim();
    if (!/^https:\/\//.test(endpoint)) {
      const fb = fallbackContact();
      setStatus(`지금은 온라인 접수를 받을 수 없습니다.${fb ? ' ' + fb + '으로 연락해 주세요.' : ''}`, true);
      console.warn('[상담 폼] 수신 주소(site.json > inquiry.endpoint)가 비어 있습니다. README의 「상담 폼 수신 연결」을 참고하세요.');
      return;
    }
    submitBtn.disabled = true; submitBtn.textContent = '보내는 중…'; setStatus('');
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify(d), signal: ctrl.signal, redirect: 'follow' });
      const out = await res.json().catch(() => ({ ok: false, error: 'server' }));
      if (out.ok) {
        $('#inqDoneText').textContent = `${d.company} ${d.name} 님, ${INQ.responseTime || '빠른 시일 안에'} ${d.phone}(으)로 연락드리겠습니다. 확인 메일은 따로 발송되지 않습니다.`;
        form.hidden = true; const done = $('#inqDone'); done.hidden = false; done.focus();
        form.reset(); countEl.textContent = '0 / 2,000자';
      } else if (out.error === 'missing' || out.error === 'invalid') {
        (out.fields || []).forEach(k => setErr(k, k === 'phone' ? MSG.phoneInvalid : MSG[k] || '입력 내용을 확인해 주세요.'));
        setStatus('입력 내용을 확인해 주세요.', true);
      } else if (out.error === 'consent') {
        setErr('consent', MSG.consent); setStatus('개인정보 수집·이용 동의가 필요합니다.', true);
      } else if (out.error === 'too_many') {
        setStatus('방금 같은 연락처로 신청하셨습니다. 1분 뒤에 다시 시도해 주세요.', true);
      } else { throw new Error(out.error || 'server'); }
    } catch (err) {
      const fb = fallbackContact();
      setStatus(`전송하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.${fb ? ' 계속 안 되면 ' + fb + '으로 연락해 주세요.' : ''}`, true);
    } finally {
      clearTimeout(timer); submitBtn.disabled = false; submitBtn.textContent = '상담 신청하기';
    }
  });
  $('#inqAgain').addEventListener('click', () => { $('#inqDone').hidden = true; form.hidden = false; setStatus(''); $('#f-company').focus(); });

  // 클래스 '신청하기'로 들어오면 문의 유형과 내용을 미리 채움
  $('#progList').addEventListener('click', e => {
    const a = e.target.closest('a[data-prog]'); if (!a || a.getAttribute('href') !== '#inquiry') return;
    const [title, date] = a.dataset.prog.split('|');
    const sel = $('#f-type'); const opt = [...sel.options].find(o => /클래스/.test(o.value)); if (opt) sel.value = opt.value;
    if (!msgEl.value) { msgEl.value = `[클래스 신청] ${title}${date ? ' (' + date + ')' : ''}\n참가 인원: \n`; msgEl.dispatchEvent(new Event('input')); }
  });

  /* ---------- 불러오기 ---------- */
  Promise.allSettled(['site', 'products', 'programs', 'portfolio', 'journal'].map(load)).then(([site, products, programs, portfolio, journal]) => {
    const failed = [];
    if (site.status === 'fulfilled') renderSite(site.value); else failed.push('사이트 문구');
    if (products.status === 'fulfilled') { PRODUCTS = products.value || []; renderProducts(); } else failed.push('상품');
    if (programs.status === 'fulfilled') renderPrograms(programs.value || []); else failed.push('교육 프로그램');
    if (portfolio.status === 'fulfilled') { PF = portfolio.value || []; renderChips(); renderPortfolio(); } else failed.push('제작 실적');
    if (journal.status === 'fulfilled') renderJournal(journal.value || []); else failed.push('저널');
    if (failed.length) {
      const el = $('#loadError');
      el.textContent = `${failed.join(', ')} 내용을 불러오지 못했습니다. 파일을 더블클릭해 열었다면 웹 서버로 열어 주세요(안내: README.md). 서버에서 이 문구가 보이면 content 폴더의 JSON 형식을 확인해 주세요.`;
      el.hidden = false;
    }
  });

  /* ---------- 헤더, 메뉴, 뉴스레터, 등장 효과 ---------- */
  const header = $('#header');
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 40), { passive: true });
  const toggle = $('#menuToggle');
  toggle.addEventListener('click', () => { const open = document.body.classList.toggle('menu-open'); toggle.setAttribute('aria-expanded', open); toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); });
  document.querySelectorAll('#mobileNav a').forEach(a => a.addEventListener('click', () => { document.body.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', false); }));

  $('#nlForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#nlEmail'), m = $('#nlMsg');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.value.trim())) { m.className = 'nl-msg err'; m.textContent = '이메일 주소 형식을 확인해 주세요. 예: name@example.com'; return; }
    m.className = 'nl-msg ok'; m.textContent = '구독해 주셔서 감사합니다. 곧 첫 소식을 보내드릴게요.'; v.value = '';
  });

  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}
