// 모든 데이터는 plan.json에서 읽는다. 일정/장소 변경은 plan.json만 수정하면 된다.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let plan, places = {}, usage = {}, map, layer, markers = {}, here = null, hereMarker = null;

function mapsUrl(p) {
  if (p.url) return p.url;
  if (p.cid) return `https://maps.google.com/?cid=${p.cid}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.q || p.name)}`;
}
const dirUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=transit`;

function distance(p) {
  if (!here) return null;
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(p.lat - here.lat), dLng = rad(p.lng - here.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(here.lat)) * Math.cos(rad(p.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function fmtDist(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
const cat = (p) => plan.categories[p.category] || plan.categories.unknown || { label: p.category, color: '#999' };

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const weekday = (date) => WEEK[new Date(`${date}T12:00:00+09:00`).getDay()];
const isClosed = (h) => /휴무/.test(h || '');

// wd가 있으면 그 요일 영업시간만, 없으면 휴무일 요약 + 주간 영업시간 펼치기
function hoursHtml(p, wd) {
  const h = p.hours;
  if (!h) return '';
  if (wd) {
    const t = h[wd];
    if (!t) return '';
    return `<div class="hours${isClosed(t) ? ' closed' : ''}">🕒 ${wd}요일 ${isClosed(t) ? '휴무 — 방문일 휴무!' : esc(t)}</div>`;
  }
  const off = Object.keys(h).filter((k) => isClosed(h[k]));
  return `<details class="hours"><summary>🕒 ${off.length ? `휴무 ${off.join('·')}` : '연중무휴'} · 영업시간</summary>
    ${Object.entries(h).map(([k, v]) => `<div${isClosed(v) ? ' class="closed"' : ''}>${k} ${esc(v)}</div>`).join('')}</details>`;
}

function placeRow(p, extra = '', wd = null) {
  const c = cat(p);
  return `
    <div class="place" data-place="${esc(p.id)}">
      <div class="place-main">
        <span class="dot" style="background:${c.color}"></span>
        <div class="place-text">
          <div class="place-name">${esc(p.name)}</div>
          <div class="place-sub">
            <span class="badge" style="color:${c.color};border-color:${c.color}">${esc(c.label)}</span>
            ${p.source === 'list' ? '<span class="tag saved">★ 저장됨</span>' : ''}
            <span class="dist" data-dist="${esc(p.id)}">${fmtDist(distance(p))}</span>
            ${extra}
          </div>
          ${p.gtype || p.note ? `<div class="place-note">${[p.gtype, p.note].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
          ${hoursHtml(p, wd)}
        </div>
      </div>
      <div class="btns">
        <a class="btn" href="${mapsUrl(p)}" target="_blank" rel="noopener">지도</a>
        <a class="btn primary" href="${dirUrl(p)}" target="_blank" rel="noopener">길찾기</a>
      </div>
    </div>`;
}

function popupHtml(p) {
  return `<b>${esc(p.name)}</b><br>${esc(cat(p).label)} ${fmtDist(distance(p))}<br>
    <a href="${mapsUrl(p)}" target="_blank" rel="noopener">지도</a> · <a href="${dirUrl(p)}" target="_blank" rel="noopener">길찾기</a>`;
}

function addMarker(p, opts = {}) {
  let m;
  if (opts.num != null) {
    m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: 'num-icon', html: `<span style="background:${cat(p).color}">${opts.num}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      zIndexOffset: 1000,
    });
  } else {
    m = L.circleMarker([p.lat, p.lng], { radius: opts.small ? 6 : 8, color: '#fff', weight: 2, fillColor: cat(p).color, fillOpacity: opts.small ? 0.6 : 0.95 });
  }
  m.bindPopup(() => popupHtml(p));
  m.on('click', () => highlight(p.id, false));
  m.addTo(layer);
  if (!markers[p.id] || opts.num != null) markers[p.id] = m;
  return m;
}

function focusPlace(id) {
  const p = places[id];
  if (!p) return;
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  markers[id]?.openPopup();
  highlight(id, false);
}
function highlight(id, scroll = true) {
  document.querySelectorAll('.place.active').forEach((el) => el.classList.remove('active'));
  const el = document.querySelector(`.place[data-place="${CSS.escape(id)}"]`);
  if (el) { el.classList.add('active'); if (scroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function fit(latlngs) {
  if (!latlngs.length) return;
  map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 16 });
}

function renderPlaces() {
  const list = Object.values(places);
  if (here) list.sort((a, b) => distance(a) - distance(b));
  const t = plan.trip;
  const html = list.map((p) => {
    const u = usage[p.id] || [];
    const tags = u.length
      ? u.map((x) => `<span class="tag">${esc(x.label)} ${esc(x.time)}</span>`).join('')
      : '<span class="tag none">미배치</span>';
    return placeRow(p, tags);
  }).join('');
  $('#content').innerHTML = `
    <details class="info"><summary>${esc(t.dates)} · 여행 정보</summary>
      <ul>${(t.info || []).map((s) => `<li>${esc(s)}</li>`).join('')}
        ${t.hoursAsOf ? `<li>🕒 영업시간은 구글 지도 ${esc(t.hoursAsOf)} 기준 — 연말에는 바뀔 수 있음</li>` : ''}</ul>
      ${t.listUrl ? `<a href="${t.listUrl}" target="_blank" rel="noopener">구글 지도 저장 목록 열기</a>` : ''}
    </details>
    <div class="section-title">전체 장소 ${list.length}곳${here ? ' · 가까운 순' : ''}</div>
    ${html}`;
  list.forEach((p) => addMarker(p));
  fit(list.map((p) => [p.lat, p.lng]));
}

function renderDay(day) {
  const items = [...day.items].sort((a, b) => a.time.localeCompare(b.time));
  const route = [];
  const wd = weekday(day.date);
  let n = 0;
  const html = items.map((it) => {
    const ps = (it.places || []).map((id) => places[id]).filter(Boolean);
    let num = '';
    if (ps.length) {
      const main = ps[0];
      const last = route[route.length - 1];
      if (!last || last.id !== main.id) route.push(main);
      num = ++n;
      addMarker(main, { num });
      ps.slice(1).forEach((p) => addMarker(p, { small: true }));
    }
    const rows = ps.map((p, i) => placeRow(p, i ? '<span class="tag alt">대안</span>' : '', wd)).join('');
    return `
      <div class="item${it.fixed ? ' fixed' : ''}">
        <div class="item-head">
          <span class="time">${esc(it.time)}</span>
          ${num ? `<span class="num">${num}</span>` : ''}
          <span class="item-title">${esc(it.title)}</span>
        </div>
        ${it.note ? `<div class="item-note">${esc(it.note)}</div>` : ''}
        ${it.move ? `<div class="move">🚇 ${esc(it.move)}</div>` : ''}
        ${(it.tips || []).length ? `<ul class="tips">${it.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${rows}
      </div>`;
  }).join('');
  $('#content').innerHTML = `<div class="section-title">${esc(day.label)} · ${esc(day.title)}</div>${html}`;
  if (route.length > 1) {
    L.polyline(route.map((p) => [p.lat, p.lng]), { color: '#2e86ab', weight: 4, opacity: 0.8, dashArray: '8 6' }).addTo(layer);
  }
  fit(items.flatMap((it) => (it.places || []).map((id) => places[id]).filter(Boolean).map((p) => [p.lat, p.lng])));
}

const currentTab = () => decodeURIComponent(location.hash.slice(1)) || defaultTab();

function render() {
  const key = currentTab();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === key));
  layer.clearLayers();
  markers = {};
  const day = plan.days.find((d) => d.date === key);
  day ? renderDay(day) : renderPlaces();
  window.scrollTo(0, 0);
}

function defaultTab() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  return plan.days.some((d) => d.date === today) ? today : 'places';
}

function onPosition(pos) {
  const first = !here;
  here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  $('#loc-status').textContent = `📍 현위치 ±${Math.round(pos.coords.accuracy)}m`;
  if (!hereMarker) {
    hereMarker = L.circleMarker([here.lat, here.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map).bindPopup('현위치');
  } else hereMarker.setLatLng([here.lat, here.lng]);
  document.querySelectorAll('[data-dist]').forEach((el) => { el.textContent = fmtDist(distance(places[el.dataset.dist])); });
  if (first && !plan.days.some((d) => d.date === currentTab())) render(); // 장소 탭은 가까운 순으로 다시 정렬
}

async function init() {
  plan = await (await fetch('plan.json', { cache: 'no-cache' })).json();
  plan.places.forEach((p) => { places[p.id] = p; });
  plan.days.forEach((d) => d.items.forEach((it) => (it.places || []).forEach((id) => {
    (usage[id] ||= []).push({ label: d.label, time: it.time });
  })));
  document.title = plan.trip.title;
  $('#title').textContent = plan.trip.title;
  $('#tabs').innerHTML = [['places', '장소'], ...plan.days.map((d) => [d.date, d.label])]
    .map(([k, l]) => `<button data-tab="${esc(k)}">${esc(l)}</button>`).join('');
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) location.hash = encodeURIComponent(b.dataset.tab);
  });
  $('#content').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const el = e.target.closest('.place');
    if (el) focusPlace(el.dataset.place);
  });

  map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);

  window.addEventListener('hashchange', render);
  render();

  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(onPosition, () => { $('#loc-status').textContent = '📍 위치 꺼짐'; },
      { enableHighAccuracy: true, maximumAge: 30000 });
  } else $('#loc-status').textContent = '📍 위치 미지원';
}

init().catch((e) => { $('#content').textContent = `plan.json을 불러오지 못했습니다: ${e.message}`; });
