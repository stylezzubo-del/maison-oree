/**
 * MAISON ORÉE — 기업·단체 상담 문의 수신기 (Google Apps Script)
 *
 * 하는 일
 *  1. 홈페이지 상담 폼에서 보낸 내용을 이 스프레드시트의 '상담 문의' 시트에 한 줄씩 저장합니다.
 *  2. 새 문의가 들어오면 NOTIFY_EMAIL 로 알림 메일을 보냅니다.
 *  3. 보관 기간(RETENTION_DAYS)이 지난 문의를 매일 새벽 자동으로 지웁니다.
 *
 * 설치 방법은 README.md 의 「상담 폼 수신 연결」을 따라 주세요.
 * 아래 설정 세 줄만 바꾸면 됩니다.
 */

// ── 설정 ────────────────────────────────────────────────
const NOTIFY_EMAIL = 'your-email@example.com'; // 알림 받을 이메일 (여러 명이면 쉼표로: 'a@x.com,b@y.com')
const RETENTION_DAYS = 365;                     // 보관 기간(일). 동의서에 적은 기간과 같아야 합니다.
const SHEET_NAME = '상담 문의';
const SPREADSHEET_ID = '';                      // 스프레드시트 메뉴(확장 프로그램 → Apps Script)에서 열었다면 비워 두세요.
                                                // script.google.com에서 따로 만들었다면 시트 주소의 /d/ 와 /edit 사이 글자를 넣으세요.
// ──────────────────────────────────────────────────────

const HEADERS = ['접수 시각', '기업명', '담당자', '연락처', '이메일', '문의 유형', '예상 수량', '희망 납기일', '상담 내용', '개인정보 동의', '접수 페이지', '처리 상태', '메모'];
const LIMITS = { company: 100, name: 50, phone: 30, email: 120, type: 40, quantity: 40, dueDate: 20, message: 2000, page: 300 };

/** 홈페이지 폼이 보내는 요청을 받습니다. */
function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // 1) 스팸 거르기: 사람에게 보이지 않는 칸이 채워졌거나, 3초 안에 제출된 경우 조용히 무시
    if (data.website) return json_({ ok: true });
    if (Number(data.elapsed) > 0 && Number(data.elapsed) < 3000) return json_({ ok: true });

    // 2) 필수 항목 확인
    const v = k => String(data[k] == null ? '' : data[k]).trim().slice(0, LIMITS[k] || 200);
    const missing = ['company', 'name', 'phone', 'message'].filter(k => !v(k));
    if (missing.length) return json_({ ok: false, error: 'missing', fields: missing });
    if (!/^[0-9+\-()\s]{8,20}$/.test(v('phone'))) return json_({ ok: false, error: 'invalid', fields: ['phone'] });
    if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return json_({ ok: false, error: 'invalid', fields: ['email'] });
    if (data.consent !== true) return json_({ ok: false, error: 'consent' });

    // 3) 과도한 요청 막기: 같은 연락처는 60초에 한 번, 전체는 1분에 20건까지
    const cache = CacheService.getScriptCache();
    const phoneKey = 'p_' + v('phone').replace(/\D/g, '');
    if (cache.get(phoneKey)) return json_({ ok: false, error: 'too_many' });
    const minuteKey = 'm_' + Math.floor(Date.now() / 60000);
    const count = Number(cache.get(minuteKey) || 0);
    if (count >= 20) return json_({ ok: false, error: 'too_many' });
    cache.put(minuteKey, String(count + 1), 120);
    cache.put(phoneKey, '1', 60);

    // 4) 시트에 저장 (수식으로 해석되지 않도록 = + - @ 로 시작하는 값 앞에 ' 를 붙임)
    const safe = s => (/^[=+\-@]/.test(s) ? "'" + s : s);
    const now = new Date();
    const row = [
      now, safe(v('company')), safe(v('name')), safe(v('phone')), safe(v('email')), safe(v('type')),
      safe(v('quantity')), safe(v('dueDate')), safe(v('message')),
      '동의 (' + Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm') + ', ' + safe(String(data.consentVersion || '').slice(0, 40)) + ')',
      safe(v('page')), '접수', ''
    ];
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { getSheet_().appendRow(row); } finally { lock.releaseLock(); }

    // 5) 알림 메일
    notify_(row, v('email'));

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

/** 주소를 브라우저로 열었을 때 연결 확인용 */
function doGet() {
  return json_({ ok: true, service: 'MAISON ORÉE inquiry', time: new Date().toISOString() });
}

/** 처음 한 번 실행: 시트 머리글을 만들고, 매일 새벽 3시 보관 기간 정리를 예약합니다. */
function setup() {
  getSheet_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'purgeExpired')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('purgeExpired').timeBased().everyDays(1).atHour(3).create();
  console.log('설정 완료: 시트 "' + SHEET_NAME + '" 준비, 매일 03시 보관 기간 정리 예약');
}

/** 보관 기간이 지난 문의를 삭제합니다 (setup()이 매일 자동 실행하도록 예약). */
function purgeExpired() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const limit = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const dates = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i][0];
    if (d instanceof Date && d.getTime() < limit) sheet.deleteRow(i + 2);
  }
}

/** 알림 메일이 잘 가는지 확인하는 테스트 (편집기에서 직접 실행) */
function testNotify() {
  notify_([new Date(), '테스트 기업', '홍길동', '010-0000-0000', '', '기업 선물', '50개', '', '알림 메일 테스트입니다.', '동의', 'test', '접수', ''], '');
}

// ── 내부 도우미 ───────────────────────────────────────
function ss_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('연결된 스프레드시트가 없습니다. 시트에서 확장 프로그램 → Apps Script로 열거나, SPREADSHEET_ID에 시트 ID를 넣어 주세요.');
  return ss;
}

function getSheet_() {
  const ss = ss_();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#F6F1EA');
    sheet.setColumnWidth(9, 360);
  }
  return sheet;
}

function notify_(row, replyTo) {
  if (!NOTIFY_EMAIL || NOTIFY_EMAIL.indexOf('@') < 1 || NOTIFY_EMAIL === 'your-email@example.com') return;
  if (MailApp.getRemainingDailyQuota() < 1) return; // 하루 발송 한도를 넘으면 메일만 건너뜀 (시트 저장은 정상)
  const lines = HEADERS.slice(0, 11).map((h, i) => h + ': ' + (i === 0 ? Utilities.formatDate(row[0], 'Asia/Seoul', 'yyyy-MM-dd HH:mm') : (row[i] || '-')));
  const options = {
    to: NOTIFY_EMAIL,
    subject: '[MAISON ORÉE] 새 상담 문의: ' + String(row[1]).replace(/^'/, '') + ' / ' + String(row[2]).replace(/^'/, ''),
    body: lines.join('\n') + '\n\n전체 목록: ' + ss_().getUrl()
  };
  if (replyTo) options.replyTo = replyTo;
  MailApp.sendEmail(options);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
