const state = {
  controlPoint: { latitude: 55.760236, longitude: 37.618498, radius_m: 3000 },
  genresMap: {},
  districtsMap: {},
  page: 1,
  pageSize: 25,
  total: 0,
};

// Элементы DOM
const form = document.getElementById('search-form');
const latInput = document.getElementById('latitude');
const lonInput = document.getElementById('longitude');
const radiusInput = document.getElementById('radius_m');
const radiusSlider = document.getElementById('radius-slider');
const radiusLabel = document.getElementById('radius-label');
const genreSelect = document.getElementById('genre_code');
const districtSelect = document.getElementById('district_code');
const statusSelect = document.getElementById('status');
const ageSelect = document.getElementById('age_max');
const ticketsInput = document.getElementById('tickets_min');
const priceMinInput = document.getElementById('price_min');
const priceMaxInput = document.getElementById('price_max');
const qInput = document.getElementById('q');
const eventsList = document.getElementById('events-list');
const totalCount = document.getElementById('total-count');
const pageInfo = document.getElementById('page-info');
const prevBtn = document.getElementById('prev-page');
const nextBtn = document.getElementById('next-page');
const errorBox = document.getElementById('error-box');
const metaInfo = document.getElementById('meta-info');

// Инициализация карты Leaflet
const map = L.map('map').setView([state.controlPoint.latitude, state.controlPoint.longitude], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Маркер исходной точки и круг радиуса N метров
const originIcon = L.divIcon({
  className: 'custom-origin-icon',
  html: '<div style="width:16px;height:16px;background:#dc2626;border:3px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.5);"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

let originMarker = L.marker([state.controlPoint.latitude, state.controlPoint.longitude], {
  icon: originIcon
}).addTo(map).bindPopup('Исходная точка поиска');

let radiusCircle = L.circle([state.controlPoint.latitude, state.controlPoint.longitude], {
  radius: state.controlPoint.radius_m,
  color: '#dc2626',
  fillColor: '#ef4444',
  fillOpacity: 0.12,
  weight: 2
}).addTo(map);

const eventMarkersLayer = L.layerGroup().addTo(map);

function updateMapGeometry() {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  const rad = parseInt(radiusInput.value, 10);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(rad) && rad >= 1) {
    originMarker.setLatLng([lat, lon]);
    radiusCircle.setLatLng([lat, lon]);
    radiusCircle.setRadius(rad);
    radiusLabel.textContent = `${rad.toLocaleString('ru-RU')} м`;
  }
}

// Клик по карте меняет точку отсчёта и запускает поиск
map.on('click', (e) => {
  latInput.value = e.latlng.lat.toFixed(6);
  lonInput.value = e.latlng.lng.toFixed(6);
  state.page = 1;
  updateMapGeometry();
  fetchNearbyEvents();
});

// Синхронизация ползунка и числового поля радиуса
radiusSlider.addEventListener('input', () => {
  radiusInput.value = radiusSlider.value;
  updateMapGeometry();
});

radiusInput.addEventListener('input', () => {
  const val = parseInt(radiusInput.value, 10);
  if (val >= 100 && val <= 25000) {
    radiusSlider.value = val;
  }
  updateMapGeometry();
});

latInput.addEventListener('change', updateMapGeometry);
lonInput.addEventListener('change', updateMapGeometry);

// Загрузка метаданных и справочников
async function initCatalogs() {
  try {
    const [metaRes, genresRes, districtsRes] = await Promise.all([
      fetch('/api/v1/meta'),
      fetch('/api/v1/meta/genres'),
      fetch('/api/v1/meta/districts')
    ]);

    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta.control_point) {
        state.controlPoint = meta.control_point;
      }
      metaInfo.innerHTML = `
        API ${meta.api_version} (v${meta.backend_version}) · Набор: <b>${meta.dataset.dataset_kind}</b>
        <a href="/docs" target="_blank">Swagger UI</a>
      `;
    }

    if (genresRes.ok) {
      const genres = await genresRes.json();
      genres.data.forEach((g) => {
        state.genresMap[g.code] = g.name;
        const opt = document.createElement('option');
        opt.value = g.code;
        opt.textContent = `${g.name} (${g.code})`;
        genreSelect.appendChild(opt);
      });
    }

    if (districtsRes.ok) {
      const districts = await districtsRes.json();
      districts.data.forEach((d) => {
        state.districtsMap[d.code] = d.name;
        const opt = document.createElement('option');
        opt.value = d.code;
        opt.textContent = `${d.name} (${d.code})`;
        districtSelect.appendChild(opt);
      });
    }
  } catch (err) {
    metaInfo.textContent = 'Ошибка загрузки метаданных API';
  }
}

// Формирование параметров и вызов GET /api/v1/events/nearby
async function fetchNearbyEvents() {
  errorBox.classList.add('hidden');
  updateMapGeometry();

  const params = new URLSearchParams();
  params.set('latitude', latInput.value);
  params.set('longitude', lonInput.value);
  params.set('radius_m', radiusInput.value);
  params.set('include', 'artist');
  params.set('page', String(state.page));
  params.set('page_size', String(state.pageSize));

  if (genreSelect.value) params.set('genre_code', genreSelect.value);
  if (districtSelect.value) params.set('district_code', districtSelect.value);
  if (statusSelect.value) params.set('status', statusSelect.value);
  if (ageSelect.value !== '') params.set('age_max', ageSelect.value);
  if (ticketsInput.value !== '') params.set('tickets_min', ticketsInput.value);
  if (priceMinInput.value !== '') params.set('price_min', priceMinInput.value);
  if (priceMaxInput.value !== '') params.set('price_max', priceMaxInput.value);
  if (qInput.value.trim() !== '') params.set('q', qInput.value.trim());

  try {
    const response = await fetch(`/api/v1/events/nearby?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      const msg = payload?.error?.message || 'Ошибка выполнения запроса';
      const code = payload?.error?.code || response.status;
      throw new Error(`[${code}] ${msg}`);
    }

    renderEvents(payload.data, payload.meta);
  } catch (err) {
    errorBox.textContent = `Ошибка: ${err.message}`;
    errorBox.classList.remove('hidden');
    eventsList.innerHTML = '';
  }
}

function formatDistance(meters) {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(2)} км (${Math.round(meters)} м)`;
}

function renderEvents(events, meta) {
  state.total = meta.total;
  totalCount.textContent = meta.total;
  const maxPage = Math.max(1, Math.ceil(meta.total / meta.page_size));
  pageInfo.textContent = `Стр. ${meta.page} из ${maxPage}`;
  prevBtn.disabled = meta.page <= 1;
  nextBtn.disabled = meta.page >= maxPage;

  eventMarkersLayer.clearLayers();
  eventsList.innerHTML = '';

  if (!events.length) {
    eventsList.innerHTML = '<div class="panel">В заданном радиусе событий не найдено. Попробуйте увеличить радиус N или ослабить фильтры.</div>';
    return;
  }

  events.forEach((ev) => {
    const genreName = state.genresMap[ev.genre_code] || ev.genre_code;
    const startDate = new Date(ev.starts_at).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const venueName = ev.venue ? ev.venue.name : 'Площадка не указана';
    const venueAddr = ev.venue ? ev.venue.formatted_address : '';
    const artistName = ev.artist ? ev.artist.name : '';

    const card = document.createElement('article');
    card.className = 'event-card';
    card.innerHTML = `
      <div class="event-card__top">
        <h3 class="event-card__title">${ev.title}</h3>
        <span class="distance-badge">${formatDistance(ev.distance_m)}</span>
      </div>
      <div class="event-card__meta">
        <span>🎭 ${genreName}</span>
        <span>🔞 ${ev.age_rating}+</span>
        <span>📅 ${startDate}</span>
        ${artistName ? `<span>🎤 ${artistName}</span>` : ''}
      </div>
      <div class="event-card__venue">
        📍 <strong>${venueName}</strong> — ${venueAddr}
      </div>
      <div class="event-card__footer">
        <span>Билетов доступно: <b>${ev.available_tickets}</b> из ${ev.ticket_quota} (статус: ${ev.status})</span>
        <span class="price-tag">${ev.price_rub === 0 ? 'Бесплатно' : `${ev.price_rub} ₽`}</span>
      </div>
    `;

    // Добавление маркера площадки на карту
    if (ev.venue && ev.venue.latitude !== null && ev.venue.longitude !== null) {
      const marker = L.marker([ev.venue.latitude, ev.venue.longitude])
        .bindPopup(`
          <b>${ev.title}</b><br>
          Площадка: ${venueName}<br>
          Адрес: ${venueAddr}<br>
          Расстояние: <b>${formatDistance(ev.distance_m)}</b><br>
          Цена: ${ev.price_rub} ₽
        `);
      eventMarkersLayer.addLayer(marker);

      card.addEventListener('click', () => {
        map.panTo([ev.venue.latitude, ev.venue.longitude]);
        marker.openPopup();
      });
    }

    eventsList.appendChild(card);
  });
}

// Обработчики формы и кнопок
form.addEventListener('submit', (e) => {
  e.preventDefault();
  state.page = 1;
  fetchNearbyEvents();
});

document.getElementById('btn-control-point').addEventListener('click', () => {
  latInput.value = state.controlPoint.latitude;
  lonInput.value = state.controlPoint.longitude;
  radiusInput.value = state.controlPoint.radius_m;
  radiusSlider.value = state.controlPoint.radius_m;
  state.page = 1;
  map.setView([state.controlPoint.latitude, state.controlPoint.longitude], 13);
  fetchNearbyEvents();
});

document.querySelectorAll('.btn-chip[data-lat]').forEach((btn) => {
  btn.addEventListener('click', () => {
    latInput.value = btn.dataset.lat;
    lonInput.value = btn.dataset.lon;
    radiusInput.value = btn.dataset.rad;
    radiusSlider.value = btn.dataset.rad;
    state.page = 1;
    map.setView([parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon)], 12);
    fetchNearbyEvents();
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  form.reset();
  latInput.value = state.controlPoint.latitude;
  lonInput.value = state.controlPoint.longitude;
  radiusInput.value = state.controlPoint.radius_m;
  radiusSlider.value = state.controlPoint.radius_m;
  state.page = 1;
  map.setView([state.controlPoint.latitude, state.controlPoint.longitude], 12);
  fetchNearbyEvents();
});

prevBtn.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    fetchNearbyEvents();
  }
});

nextBtn.addEventListener('click', () => {
  state.page += 1;
  fetchNearbyEvents();
});

// Старт приложения
(async function bootstrap() {
  await initCatalogs();
  await fetchNearbyEvents();
})();
