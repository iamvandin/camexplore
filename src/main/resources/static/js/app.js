        // =====================================================================
// LokalKH frontend - talks to the Spring Boot REST API (/api/**)
// =====================================================================
const API_BASE = '/api';
const TOKEN_KEY = 'lokalkh_token';
const DEFAULT_HERO_TITLE = 'Find the best places across Cambodia';

// ---- Safe HTML helpers (all user-generated text goes through esc()) ----
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// encodeURIComponent leaves ' unescaped, which would break inline onerror="...'...'" handlers.
function safeUrlText(value) {
    return encodeURIComponent(String(value ?? '')).replace(/'/g, '%27');
}

// ---- Token storage ----
function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function setToken(token) {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage unavailable - session lasts until reload */ }
}

// ---- REST helper ----
async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
        res = await fetch(API_BASE + path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch (err) {
        throw new Error('Cannot reach the LokalKH server. Please check that the backend is running.');
    }

    let data = null;
    const text = await res.text();
    if (text) {
        try { data = JSON.parse(text); } catch (e) { data = null; }
    }

    if (!res.ok) {
        if (res.status === 401 && token && !path.startsWith('/auth/')) {
            handleSessionExpired();
        }
        const fallback = res.status === 403 ? 'You do not have permission to do that.' : `Request failed (${res.status})`;
        const err = new Error((data && data.message) || fallback);
        err.status = res.status;
        throw err;
    }
    return data;
}

// ---- Data caches (filled from the API) ----
let placesData = [];       // places shown on Explore (already filtered / sorted by the server)
let adminPlaces = [];      // every place, for the admin dashboard
let usersDirectory = [];   // every user, for the admin dashboard

// 2. Application State
const state = {
    currentView: 'explore',
    currentUser: null,
    searchQuery: '',
    selectedCity: 'all',
    selectedCategory: 'All',
    onlyOpenNow: false,
    onlySaved: false,
    sortBy: 'recommended',
    savedIds: new Set(),
    activePlaceId: null,
    mobileMapVisible: false
};

// ---- Session helpers ----
async function loadBookmarks() {
    if (!state.currentUser) { state.savedIds = new Set(); return; }
    try { state.savedIds = new Set(await api('/bookmarks')); } catch (e) { state.savedIds = new Set(); }
}

async function completeLogin(authResponse) {
    setToken(authResponse.token);
    state.currentUser = authResponse.user;
    await loadBookmarks();
    updateAuthUI();
    updatePricingUI();
    closeAuthModal();
    renderLocal();
    if (state.onlySaved) renderApp();
}

function clearSession() {
    setToken(null);
    state.currentUser = null;
    state.savedIds = new Set();
    state.onlySaved = false;
    syncSavedFilterButton();
    updateAuthUI();
    updatePricingUI();
    if (state.currentView === 'admin') switchView('explore');
}

function handleSessionExpired() {
    if (!state.currentUser) return;
    clearSession();
    showToast('Your session expired. Please sign in again.');
    renderApp();
}

async function restoreSession() {
    if (!getToken()) return;
    try {
        state.currentUser = await api('/auth/me');
        await loadBookmarks();
    } catch (err) {
        if (err.status === 401 || err.status === 403) setToken(null);
        state.currentUser = null;
    }
    updateAuthUI();
    updatePricingUI();
}

// ---- Editable homepage content ----
let heroDefaultHtml = null;
function applySiteContent(content) {
    if (!content) return;
    const titleEl = document.getElementById('hero-title-display');
    const subEl = document.getElementById('hero-subtitle-display');
    if (titleEl && content.heroTitle) {
        if (heroDefaultHtml === null) heroDefaultHtml = titleEl.innerHTML;
        if (content.heroTitle === DEFAULT_HERO_TITLE) titleEl.innerHTML = heroDefaultHtml;
        else titleEl.textContent = content.heroTitle;
    }
    if (subEl && content.heroSubtitle) subEl.textContent = content.heroSubtitle;

    const cmsTitle = document.getElementById('cms-hero-title');
    const cmsSub = document.getElementById('cms-hero-subtitle');
    if (cmsTitle && content.heroTitle) cmsTitle.value = content.heroTitle;
    if (cmsSub && content.heroSubtitle) cmsSub.value = content.heroSubtitle;
}

async function loadSiteContent() {
    try { applySiteContent(await api('/content')); } catch (e) { /* keep default text */ }
}

const categories = [
            { id: 'All', label: 'All Places', icon: 'sparkles' },
            { id: 'Restaurants', label: 'Restaurants', icon: 'utensils' },
            { id: 'Hotels', label: 'Hotels', icon: 'bed-double' },
            { id: 'Popular Places', label: 'Popular Places', icon: 'landmark' },
            { id: 'Cafes', label: 'Cafes', icon: 'coffee' }
        ];

        const cityCoordinates = {
            'all': { center: [12.15, 104.55], zoom: 7 },
            'Phnom Penh': { center: [11.5564, 104.9282], zoom: 14 },
            'Siem Reap': { center: [13.3820, 103.8600], zoom: 13 },
            'Kampot': { center: [10.6060, 104.1780], zoom: 13 }
        };

        // 3. Interactive Map Setup (Leaflet)
        let map = null;
        let markersLayer = null;
        const markerRefs = {};

        function initMap() {
            const mapEl = document.getElementById('map');
            if (!mapEl || typeof L === 'undefined') return;

            map = L.map('map', {
                zoomControl: false
            }).setView(cityCoordinates['all'].center, cityCoordinates['all'].zoom);

            L.control.zoom({ position: 'bottomright' }).addTo(map);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);

            markersLayer = L.layerGroup().addTo(map);
        }

        function flyToCity(city) {
            const target = cityCoordinates[city] || cityCoordinates['all'];
            if (map) {
                map.flyTo(target.center, target.zoom, { duration: 1.1 });
            }
        }

        function updateMapMarkers(filteredPlaces) {
            if (!map || !markersLayer) return;
            markersLayer.clearLayers();
            Object.keys(markerRefs).forEach(key => delete markerRefs[key]);

            filteredPlaces.forEach(place => {
                const isSaved = state.savedIds.has(place.id);
                const bgColor = isSaved ? '#ea580c' : '#18181b';

                const icon = L.divIcon({
                    className: 'custom-pin-wrapper',
                    html: `<div id="pin-${place.id}" class="custom-pin text-white px-2.5 h-8" style="background-color: ${bgColor};">★ ${place.rating.toFixed(1)}</div>`,
                    iconSize: [58, 32],
                    iconAnchor: [29, 16]
                });

                const marker = L.marker([place.lat, place.lng], { icon })
                    .addTo(markersLayer)
                    .bindTooltip(`<strong>${esc(place.name)}</strong><br><span style="font-size:11px;color:#71717a;">${esc(place.category)} • ${esc(place.city)}</span>`, {
                        direction: 'top',
                        offset: [0, -14]
                    });

                marker.on('click', () => openDetailModal(place.id));
                markerRefs[place.id] = marker;
            });
        }

        function highlightPin(placeId, isActive) {
            const pinEl = document.getElementById(`pin-${placeId}`);
            if (pinEl) {
                if (isActive) {
                    pinEl.classList.add('active');
                    pinEl.style.backgroundColor = '#ea580c';
                } else {
                    pinEl.classList.remove('active');
                    pinEl.style.backgroundColor = state.savedIds.has(placeId) ? '#ea580c' : '#18181b';
                }
            }
        }

        // 4. Filtering, Sorting & Rendering
        function getFilteredPlaces() {
            // Filtering and sorting are done by the server (GET /api/places).
            return placesData;
        }

        let placesRequestSeq = 0;
        // Returns false when a newer request has superseded this one (so the caller should not render).
        async function loadPlaces() {
            const params = new URLSearchParams();
            if (state.searchQuery.trim() !== '') params.set('q', state.searchQuery.trim());
            if (state.selectedCity !== 'all') params.set('city', state.selectedCity);
            if (state.selectedCategory !== 'All') params.set('category', state.selectedCategory);
            if (state.onlyOpenNow) params.set('openNow', 'true');
            if (state.onlySaved && state.currentUser) params.set('savedOnly', 'true');
            params.set('sort', state.sortBy);

            const seq = ++placesRequestSeq;
            try {
                const result = await api('/places?' + params.toString());
                if (seq !== placesRequestSeq) return false;
                placesData = result;
            } catch (err) {
                if (seq !== placesRequestSeq) return false;
                showToast(err.message);
            }
            return true;
        }

        function renderCategoryPills() {
            const container = document.getElementById('category-pills');
            if (!container) return;

            container.innerHTML = categories.map(cat => {
                const isSelected = state.selectedCategory === cat.id;
                const activeClasses = isSelected
                    ? 'bg-stone-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs'
                    : 'bg-stone-100 dark:bg-zinc-800/80 text-stone-700 dark:text-zinc-300 hover:bg-stone-200/80 dark:hover:bg-zinc-800';

                return `
                    <button
                        onclick="handleCategorySelect('${cat.id}')"
                        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${activeClasses}"
                    >
                        <i data-lucide="${cat.icon}" class="w-3.5 h-3.5"></i>
                        <span>${cat.label}</span>
                    </button>
                `;
            }).join('');
        }

        function renderPlacesGrid(filteredPlaces) {
            const grid = document.getElementById('places-grid');
            const emptyState = document.getElementById('empty-state');
            const countEl = document.getElementById('results-count');

            if (countEl) {
                countEl.innerHTML = `Showing <span class="font-bold text-stone-900 dark:text-white">${filteredPlaces.length}</span> ${filteredPlaces.length === 1 ? 'place' : 'places'}${state.onlySaved ? ' in Saved' : ''}`;
            }

            if (filteredPlaces.length === 0) {
                grid.innerHTML = '';
                emptyState.classList.remove('hidden');
                emptyState.classList.add('flex');
                return;
            }

            emptyState.classList.add('hidden');
            emptyState.classList.remove('flex');

            grid.innerHTML = filteredPlaces.map(place => {
                const isSaved = state.savedIds.has(place.id);
                const statusBadge = place.isOpen
                    ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Open</span>`
                    : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Closed</span>`;

                return `
                    <article
                        onclick="openDetailModal(${place.id})"
                        onmouseenter="highlightPin(${place.id}, true)"
                        onmouseleave="highlightPin(${place.id}, false)"
                        class="group cursor-pointer rounded-2xl bg-white dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 overflow-hidden shadow-xs hover:shadow-lg hover:border-brand-500/40 transition-all duration-200 flex flex-col"
                    >
                        <!-- Cover Image -->
                        <div class="relative h-48 overflow-hidden bg-stone-200 dark:bg-zinc-800">
                            <img
                                src="${place.images[0]}"
                                alt="${esc(place.name)}"
                                onerror="this.src='https://placehold.co/600x400/27272a/ffffff?text=${safeUrlText(place.name)}'"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            >
                            <div class="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent"></div>

                            <!-- Category Pill -->
                            <div class="absolute top-3 left-3 flex items-center gap-1.5">
                                <span class="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md text-stone-800 dark:text-zinc-100 shadow-xs">
                                    ${esc(place.category)}
                                </span>
                                ${place.featured ? `<span class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-brand-500 text-white shadow-xs">Featured</span>` : ''}
                            </div>

                            <!-- Bookmark Button -->
                            <button
                                onclick="event.stopPropagation(); toggleBookmark(${place.id});"
                                aria-label="Bookmark ${esc(place.name)}"
                                class="absolute top-3 right-3 p-2 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md shadow-xs hover:scale-110 transition-transform ${isSaved ? 'text-brand-500' : 'text-stone-600 dark:text-zinc-300'}"
                            >
                                <i data-lucide="bookmark" class="w-4 h-4 ${isSaved ? 'fill-current' : ''}"></i>
                            </button>

                            <!-- Bottom Image Overlay: City & Price -->
                            <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-xs font-medium">
                                <span class="inline-flex items-center gap-1 drop-shadow-xs">
                                    <i data-lucide="map-pin" class="w-3.5 h-3.5 text-brand-500"></i> ${esc(place.city)}
                                </span>
                                <span class="px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-xs font-semibold">${esc(place.price)}</span>
                            </div>
                        </div>

                        <!-- Card Content -->
                        <div class="p-4 flex-1 flex flex-col justify-between">
                            <div>
                                <div class="flex items-start justify-between gap-2">
                                    <h3 class="font-display font-bold text-base text-stone-900 dark:text-white group-hover:text-brand-500 transition-colors line-clamp-1">${esc(place.name)}</h3>
                                    <div class="flex items-center gap-1 font-bold text-xs text-amber-600 dark:text-amber-400 shrink-0 bg-amber-400/10 px-2 py-0.5 rounded-lg">
                                        ★ ${place.rating.toFixed(1)} <span class="text-stone-400 font-normal">(${place.reviewCount})</span>
                                    </div>
                                </div>
                                <p class="text-xs text-stone-500 dark:text-zinc-400 line-clamp-2 mt-1">${esc(place.description)}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-stone-100 dark:border-zinc-800 flex items-center justify-between text-xs text-stone-500 dark:text-zinc-400">
                                <span class="flex items-center gap-1">${statusBadge}</span>
                                <span class="font-medium text-stone-700 dark:text-zinc-300">~${place.distanceKm} km away</span>
                            </div>
                        </div>
                    </article>
                `;
            }).join('');
        }

        // 8. Add New Place Modal & Submission (Gated by Subscription Plan)
        function canUserAddPlaces() {
            if (!state.currentUser) return false;
            if (state.currentUser.status === 'suspended') return false;
            return state.currentUser.role === 'admin' || state.currentUser.plan === 'pro' || state.currentUser.plan === 'featured';
        }

        function openAddModal() {
            if (!canUserAddPlaces()) {
                const gate = document.getElementById('upgrade-gate-modal');
                gate.classList.remove('hidden');
                gate.classList.add('flex');
                lucide.createIcons();
                return;
            }
            const modal = document.getElementById('add-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            lucide.createIcons();
        }

        function closeUpgradeGateModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const gate = document.getElementById('upgrade-gate-modal');
            gate.classList.add('hidden');
            gate.classList.remove('flex');
        }

        // Re-render from the data already in memory (no network call)
        function renderLocal() {
            const filtered = getFilteredPlaces();
            renderCategoryPills();
            renderPlacesGrid(filtered);
            updateMapMarkers(filtered);
            updateSavedBadge();
            lucide.createIcons();
        }

        // Fetch from the API, then render
        async function renderApp() {
            const current = await loadPlaces();
            if (current) renderLocal();
        }

        // 5. Filter & Search Handlers
        let searchDebounce = null;
        function handleSearchInput(val) {
            state.searchQuery = val;
            const clearBtn = document.getElementById('clear-search-btn');
            if (clearBtn) {
                clearBtn.classList.toggle('hidden', val.trim() === '');
            }
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(renderApp, 250);
        }

        function clearSearch() {
            state.searchQuery = '';
            const input = document.getElementById('search-input');
            if (input) input.value = '';
            document.getElementById('clear-search-btn').classList.add('hidden');
            renderApp();
        }

        function handleCityChange(city) {
            state.selectedCity = city;
            flyToCity(city);
            renderApp();
        }

        function handleCategorySelect(category) {
            state.selectedCategory = category;
            renderApp();
        }

        function handleSortChange(sortVal) {
            state.sortBy = sortVal;
            renderApp();
        }

        function toggleOpenNow() {
            state.onlyOpenNow = !state.onlyOpenNow;
            const btn = document.getElementById('open-now-btn');
            const dot = document.getElementById('open-now-dot');

            if (state.onlyOpenNow) {
                btn.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/30', 'text-emerald-700', 'dark:text-emerald-300');
                dot.classList.remove('bg-stone-400');
                dot.classList.add('bg-emerald-500');
            } else {
                btn.classList.remove('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/30', 'text-emerald-700', 'dark:text-emerald-300');
                dot.classList.add('bg-stone-400');
                dot.classList.remove('bg-emerald-500');
            }
            renderApp();
        }

        function syncSavedFilterButton() {
            const btn = document.getElementById('saved-filter-btn');
            if (!btn) return;
            ['bg-brand-500/10', 'text-brand-600', 'dark:text-brand-400'].forEach(c => btn.classList.toggle(c, state.onlySaved));
        }

        function toggleSavedFilter() {
            if (!state.currentUser) {
                showToast('Sign in to see your saved places.');
                openAuthModal('login');
                return;
            }
            state.onlySaved = !state.onlySaved;
            syncSavedFilterButton();
            renderApp();
        }

        function resetAllFilters() {
            state.searchQuery = '';
            state.selectedCity = 'all';
            state.selectedCategory = 'All';
            state.onlyOpenNow = false;
            state.onlySaved = false;
            state.sortBy = 'recommended';

            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('clear-search-btn');
            if (clearBtn) clearBtn.classList.add('hidden');
            const citySelect = document.getElementById('city-select');
            if (citySelect) citySelect.value = 'all';
            const sortSelect = document.getElementById('sort-select');
            if (sortSelect) sortSelect.value = 'recommended';

            const openBtn = document.getElementById('open-now-btn');
            const openDot = document.getElementById('open-now-dot');
            if (openBtn) openBtn.classList.remove('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-950/30', 'text-emerald-700', 'dark:text-emerald-300');
            if (openDot) {
                openDot.classList.add('bg-stone-400');
                openDot.classList.remove('bg-emerald-500');
            }

            const savedBtn = document.getElementById('saved-filter-btn');
            if (savedBtn) savedBtn.classList.remove('bg-brand-500/10', 'text-brand-600', 'dark:text-brand-400');

            flyToCity('all');
            renderApp();
        }

        function toggleMobileMap() {
            state.mobileMapVisible = !state.mobileMapVisible;
            const mapPanel = document.getElementById('map-panel');
            const label = document.getElementById('mobile-map-label');

            if (state.mobileMapVisible) {
                mapPanel.classList.remove('hidden');
                label.textContent = 'Hide Map';
                if (map) setTimeout(() => map.invalidateSize(), 100);
            } else {
                mapPanel.classList.add('hidden');
                label.textContent = 'Show Map';
            }
        }

        // 6. Bookmarks Management (stored server-side per user)
        async function toggleBookmark(placeId) {
            if (!state.currentUser) {
                showToast('Please sign in to save places.');
                openAuthModal('login');
                return;
            }
            const place = placesData.find(p => p.id === placeId);
            const name = place ? place.name : 'place';
            const wasSaved = state.savedIds.has(placeId);

            try {
                const ids = await api('/bookmarks/' + placeId, { method: wasSaved ? 'DELETE' : 'PUT' });
                state.savedIds = new Set(ids);
                showToast(wasSaved ? `Removed "${name}" from Saved` : `Saved "${name}" to your list`);
                if (state.onlySaved) await renderApp(); else renderLocal();
                if (state.activePlaceId === placeId) updateModalBookmarkIcon(placeId);
            } catch (err) {
                showToast(err.message);
            }
        }

        function updateSavedBadge() {
            const badge = document.getElementById('saved-count-badge');
            if (badge) badge.textContent = state.savedIds.size;
        }

        // 7. Place Detail Modal & Live Reviews
        async function openDetailModal(placeId) {
            let place;
            try {
                place = await api('/places/' + placeId);   // full details incl. reviews
            } catch (err) {
                showToast(err.message);
                return;
            }

            state.activePlaceId = placeId;
            const modal = document.getElementById('detail-modal');
            const content = document.getElementById('detail-modal-content');

            updateModalBookmarkIcon(placeId);
            const modalBookmarkBtn = document.getElementById('modal-bookmark-btn');
            modalBookmarkBtn.onclick = () => toggleBookmark(placeId);

            content.innerHTML = `
                <!-- Photo Gallery Header -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-stone-100 dark:bg-zinc-950">
                    <img src="${place.images[0]}" alt="${esc(place.name)}" onerror="this.src='https://placehold.co/800x500/27272a/ffffff?text=${safeUrlText(place.name)}'" class="w-full h-56 sm:h-64 object-cover">
                    <img src="${place.images[1] || place.images[0]}" alt="${esc(place.name)} view" onerror="this.src='https://placehold.co/800x500/3f3f46/ffffff?text=Gallery'" class="hidden sm:block w-full h-64 object-cover">
                </div>

                <div class="p-6 sm:p-8 space-y-6">
                    <!-- Title & Rating Header -->
                    <div>
                        <div class="flex flex-wrap items-center gap-2 mb-2">
                            <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-400">${esc(place.category)}</span>
                            <span class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300">${esc(place.price)}</span>
                            <span class="px-2.5 py-1 rounded-lg text-xs font-semibold ${place.isOpen ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}">
                                ${place.isOpen ? 'Open Now' : 'Closed'}
                            </span>
                        </div>

                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <h2 class="font-display text-2xl font-extrabold text-stone-900 dark:text-white">${esc(place.name)}</h2>
                            <div class="inline-flex items-center gap-1.5 text-sm font-bold bg-amber-400/20 px-3 py-1 rounded-xl self-start">
                                <i data-lucide="star" class="w-4 h-4 text-amber-500 fill-amber-500"></i>
                                <span>${place.rating.toFixed(1)}</span>
                                <span class="text-xs font-normal text-stone-500 dark:text-zinc-400">(${place.reviewCount} reviews)</span>
                            </div>
                        </div>

                        <p class="mt-3 text-sm text-stone-600 dark:text-zinc-300 leading-relaxed">${esc(place.description)}</p>

                        <div class="mt-3 flex flex-wrap gap-1.5">
                            ${place.tags.map(tag => `<span class="px-2.5 py-1 rounded-full text-xs bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400">#${esc(tag)}</span>`).join('')}
                        </div>
                    </div>

                    <!-- Practical Info Grid -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-stone-50 dark:bg-zinc-950 border border-stone-200/80 dark:border-zinc-800 text-xs">
                        <div class="flex items-start gap-2.5">
                            <i data-lucide="map-pin" class="w-4 h-4 text-brand-500 shrink-0 mt-0.5"></i>
                            <div>
                                <p class="font-semibold text-stone-900 dark:text-white">Address</p>
                                <p class="text-stone-500 dark:text-zinc-400 mt-0.5">${esc(place.address)}</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-2.5">
                            <i data-lucide="clock" class="w-4 h-4 text-brand-500 shrink-0 mt-0.5"></i>
                            <div>
                                <p class="font-semibold text-stone-900 dark:text-white">Hours</p>
                                <p class="text-stone-500 dark:text-zinc-400 mt-0.5">${esc(place.hours)}</p>
                            </div>
                        </div>
                        <div class="flex items-start gap-2.5">
                            <i data-lucide="phone" class="w-4 h-4 text-brand-500 shrink-0 mt-0.5"></i>
                            <div>
                                <p class="font-semibold text-stone-900 dark:text-white">Contact</p>
                                <p class="text-stone-500 dark:text-zinc-400 mt-0.5">${esc(place.phone)}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Community Reviews Section -->
                    <div class="space-y-4">
                        <h3 class="font-display font-bold text-base text-stone-900 dark:text-white">Community Reviews (${place.reviews.length})</h3>

                        <div class="space-y-3">
                            ${place.reviews.map(rev => `
                                <div class="p-3.5 rounded-2xl bg-stone-50 dark:bg-zinc-950/70 border border-stone-200/70 dark:border-zinc-800">
                                    <div class="flex items-center justify-between text-xs">
                                        <span class="font-bold text-stone-900 dark:text-white">${esc(rev.author)}</span>
                                        <span class="text-stone-400">${esc(rev.date)} • ${'★'.repeat(rev.rating)}</span>
                                    </div>
                                    <p class="mt-1.5 text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">${esc(rev.text)}</p>
                                </div>
                            `).join('')}
                        </div>

                        <!-- Write a Review Form -->
                        <form onsubmit="handleReviewSubmit(event, ${place.id})" class="p-4 rounded-2xl bg-stone-100/70 dark:bg-zinc-800/40 border border-stone-200/80 dark:border-zinc-800 space-y-3">
                            <p class="text-xs font-bold text-stone-900 dark:text-white">Share your experience</p>
                            <div class="flex flex-col sm:flex-row gap-2">
                                <input type="text" id="rev-author" placeholder="Your name (optional)" class="sm:w-1/3 px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                                <select id="rev-rating" class="sm:w-1/4 px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                                    <option value="5">★★★★★ (5.0)</option>
                                    <option value="4">★★★★☆ (4.0)</option>
                                    <option value="3">★★★☆☆ (3.0)</option>
                                </select>
                                <input type="text" id="rev-text" required placeholder="Write a helpful tip or review..." class="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                            </div>
                            <button type="submit" class="px-4 py-2 rounded-xl text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white transition-colors">
                                Post Review
                            </button>
                        </form>
                    </div>
                </div>
            `;

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            lucide.createIcons();
        }

        function updateModalBookmarkIcon(placeId) {
            const btn = document.getElementById('modal-bookmark-btn');
            if (!btn) return;
            const isSaved = state.savedIds.has(placeId);
            btn.classList.toggle('text-brand-500', isSaved);
            btn.innerHTML = `<i data-lucide="bookmark" class="w-5 h-5 ${isSaved ? 'fill-current' : ''}"></i>`;
            lucide.createIcons();
        }

        function closeDetailModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('detail-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            state.activePlaceId = null;
        }

        async function handleReviewSubmit(event, placeId) {
            event.preventDefault();
            if (!state.currentUser) {
                showToast('Please sign in to post a review.');
                openAuthModal('login');
                return;
            }
            const author = document.getElementById('rev-author').value.trim();
            const rating = parseInt(document.getElementById('rev-rating').value, 10) || 5;
            const text = document.getElementById('rev-text').value.trim();
            if (!text) return;

            try {
                await api(`/places/${placeId}/reviews`, { method: 'POST', body: { author, rating, text } });
                showToast('Thank you! Your review has been posted.');
                await openDetailModal(placeId);
                renderApp();
            } catch (err) {
                showToast(err.message);
            }
        }

        function closeAddModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('add-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        async function handleAddPlaceSubmit(event) {
            event.preventDefault();
            const form = event.target;
            const payload = {
                name: document.getElementById('new-name').value.trim(),
                category: document.getElementById('new-category').value,
                city: document.getElementById('new-city').value,
                price: document.getElementById('new-price').value,
                hours: document.getElementById('new-hours').value.trim(),
                address: document.getElementById('new-address').value.trim(),
                description: document.getElementById('new-description').value.trim()
            };

            try {
                const created = await api('/places', { method: 'POST', body: payload });
                form.reset();
                closeAddModal();
                switchView('explore');
                flyToCity(payload.city);
                await renderApp();
                showToast(`"${created.name}" is now live on LokalKH!`);
            } catch (err) {
                showToast(err.message);
            }
        }

        // 9. Dark / Light Theme Toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const htmlEl = document.documentElement;
            htmlEl.classList.toggle('dark');
            const isDark = htmlEl.classList.contains('dark');
            showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled');
        });

        // 10. Toast Notification Helper (Replaces alert())
        function showToast(message) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = 'pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-stone-900 dark:bg-zinc-800 text-white text-xs font-semibold shadow-xl border border-stone-700/80 transition-all duration-300 translate-y-2 opacity-0';
            toast.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4 text-brand-500 shrink-0"></i><span></span>`;
            toast.querySelector('span').textContent = message;

            container.appendChild(toast);
            lucide.createIcons();

            requestAnimationFrame(() => {
                toast.classList.remove('translate-y-2', 'opacity-0');
            });

            setTimeout(() => {
                toast.classList.add('translate-y-2', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Keyboard Escape closes modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDetailModal();
                closeAddModal();
                closeAuthModal();
                closeUpgradeGateModal();
                closeEditPlaceModal();
            }
        });

        // 11. Multi-Page Navigation & Authentication Logic
        function switchView(viewName) {
            if (viewName === 'admin' && state.currentUser?.role !== 'admin') {
                showToast('Administrator access required.');
                openAuthModal('login');
                return;
            }
            state.currentView = viewName;

            // Hide all page views
            document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));

            // Show target view
            const target = document.getElementById(`view-${viewName}`);
            if (target) target.classList.remove('hidden');

            // Update desktop nav active styles
            document.querySelectorAll('.nav-link').forEach(btn => {
                if (btn.id === 'nav-admin-btn' && state.currentUser?.role !== 'admin') return;
                const isTarget = btn.getAttribute('data-nav') === viewName;
                if (isTarget) {
                    btn.className = 'nav-link px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all bg-white dark:bg-zinc-800 text-stone-900 dark:text-white shadow-xs';
                } else {
                    btn.className = 'nav-link px-3.5 py-1.5 rounded-lg text-sm font-medium text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white transition-all';
                }
            });

            // Update mobile drawer active styles
            document.querySelectorAll('.mobile-nav-link').forEach(btn => {
                if (btn.id === 'mobile-admin-btn' && state.currentUser?.role !== 'admin') return;
                const isTarget = btn.getAttribute('data-nav') === viewName;
                if (isTarget) {
                    btn.className = 'mobile-nav-link w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-brand-500/10 text-brand-600 dark:text-brand-400';
                } else {
                    btn.className = 'mobile-nav-link w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800';
                }
            });

            if (viewName === 'pricing') updatePricingUI();
            if (viewName === 'admin') renderAdminDashboard();

            // Recalculate Leaflet map size when returning to Explore view
            if (viewName === 'explore' && map) {
                setTimeout(() => map.invalidateSize(), 120);
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
            lucide.createIcons();
        }

        function toggleMobileDrawer(forceState) {
            const drawer = document.getElementById('mobile-nav-drawer');
            const openIcon = document.getElementById('mobile-menu-icon-open');
            const closeIcon = document.getElementById('mobile-menu-icon-close');

            const shouldOpen = typeof forceState === 'boolean' ? forceState : drawer.classList.contains('hidden');
            if (shouldOpen) {
                drawer.classList.remove('hidden');
                openIcon.classList.add('hidden');
                closeIcon.classList.remove('hidden');
            } else {
                drawer.classList.add('hidden');
                openIcon.classList.remove('hidden');
                closeIcon.classList.add('hidden');
            }
        }

        function openAuthModal(defaultTab = 'login') {
            switchAuthTab(defaultTab);
            const modal = document.getElementById('auth-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            lucide.createIcons();
        }

        function closeAuthModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('auth-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        function switchAuthTab(tab) {
            const loginTab = document.getElementById('tab-login');
            const regTab = document.getElementById('tab-register');
            const loginForm = document.getElementById('login-form');
            const regForm = document.getElementById('register-form');

            if (tab === 'login') {
                loginTab.className = 'py-2 rounded-lg text-xs font-bold bg-white dark:bg-zinc-800 text-stone-900 dark:text-white shadow-xs transition-all';
                regTab.className = 'py-2 rounded-lg text-xs font-semibold text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white transition-all';
                loginForm.classList.remove('hidden');
                regForm.classList.add('hidden');
            } else {
                regTab.className = 'py-2 rounded-lg text-xs font-bold bg-white dark:bg-zinc-800 text-stone-900 dark:text-white shadow-xs transition-all';
                loginTab.className = 'py-2 rounded-lg text-xs font-semibold text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white transition-all';
                regForm.classList.remove('hidden');
                loginForm.classList.add('hidden');
            }
        }

        async function handleAuthSubmit(event, mode) {
            event.preventDefault();
            const form = event.target;
            try {
                let result;
                if (mode === 'login') {
                    result = await api('/auth/login', {
                        method: 'POST',
                        body: {
                            email: document.getElementById('login-email').value.trim(),
                            password: document.getElementById('login-password').value
                        }
                    });
                } else {
                    result = await api('/auth/register', {
                        method: 'POST',
                        body: {
                            name: document.getElementById('reg-name').value.trim(),
                            email: document.getElementById('reg-email').value.trim(),
                            password: document.getElementById('reg-password').value,
                            plan: document.getElementById('reg-role').value
                        }
                    });
                }
                await completeLogin(result);
                form.reset();
                showToast(mode === 'login'
                    ? `Welcome back, ${result.user.name}!`
                    : `Account created! Welcome to LokalKH, ${result.user.name}.`);
            } catch (err) {
                showToast(err.message);
            }
        }

        // Demo accounts are created by the backend's DataSeeder. Remove these buttons/credentials in production.
        const DEMO_ACCOUNTS = {
            admin: { email: 'admin@lokalkh.com', password: 'Admin@123' },
            free: { email: 'sokha@lokalkh.com', password: 'Explorer@123' }
        };

        async function quickDemoLogin(type) {
            const creds = DEMO_ACCOUNTS[type] || DEMO_ACCOUNTS.free;
            try {
                const result = await api('/auth/login', { method: 'POST', body: creds });
                await completeLogin(result);
                if (type === 'admin') {
                    switchView('admin');
                    showToast('Signed in as LokalKH Administrator');
                } else {
                    showToast('Signed in as Free Explorer (View-only mode)');
                }
            } catch (err) {
                showToast(err.message);
            }
        }

        function updateAuthUI() {
            const authOpenBtn = document.getElementById('auth-open-btn');
            const mobileAuthBtn = document.getElementById('mobile-auth-btn');
            const userMenu = document.getElementById('user-profile-menu');
            const navAdminBtn = document.getElementById('nav-admin-btn');
            const mobileAdminBtn = document.getElementById('mobile-admin-btn');
            const dropdownAdminLink = document.getElementById('dropdown-admin-link');

            if (state.currentUser) {
                authOpenBtn.classList.add('hidden');
                authOpenBtn.classList.remove('sm:inline-flex');
                userMenu.classList.remove('hidden');

                const isAdmin = state.currentUser.role === 'admin';
                if (navAdminBtn) {
                    navAdminBtn.classList.toggle('hidden', !isAdmin);
                    navAdminBtn.classList.toggle('inline-flex', isAdmin);
                }
                if (mobileAdminBtn) {
                    mobileAdminBtn.classList.toggle('hidden', !isAdmin);
                    mobileAdminBtn.classList.toggle('flex', isAdmin);
                }
                if (dropdownAdminLink) {
                    dropdownAdminLink.classList.toggle('hidden', !isAdmin);
                }

                document.getElementById('user-avatar-initials').textContent = state.currentUser.initials;
                document.getElementById('user-display-name').textContent = state.currentUser.name.split(' ')[0];
                document.getElementById('dropdown-user-name').textContent = state.currentUser.name;
                document.getElementById('dropdown-user-email').textContent = state.currentUser.email;

                const planBadge = document.getElementById('dropdown-plan-badge');
                if (planBadge) {
                    const labels = { free: 'Free', pro: 'Pro', featured: 'Featured' };
                    planBadge.textContent = isAdmin ? 'Admin' : (labels[state.currentUser.plan] || 'Free');
                }

                mobileAuthBtn.innerHTML = `<i data-lucide="log-out" class="w-4 h-4"></i><span>Sign Out (${esc(state.currentUser.name.split(' ')[0])})</span>`;
                mobileAuthBtn.onclick = () => { toggleMobileDrawer(false); handleLogout(); };
            } else {
                authOpenBtn.classList.remove('hidden');
                authOpenBtn.classList.add('sm:inline-flex');
                userMenu.classList.add('hidden');
                if (navAdminBtn) {
                    navAdminBtn.classList.add('hidden');
                    navAdminBtn.classList.remove('inline-flex');
                }
                if (mobileAdminBtn) {
                    mobileAdminBtn.classList.add('hidden');
                    mobileAdminBtn.classList.remove('flex');
                }
                if (dropdownAdminLink) dropdownAdminLink.classList.add('hidden');

                mobileAuthBtn.innerHTML = `<i data-lucide="log-in" class="w-4 h-4"></i><span>Login / Register</span>`;
                mobileAuthBtn.onclick = () => { toggleMobileDrawer(false); openAuthModal('login'); };
            }
            lucide.createIcons();
        }

        function toggleUserDropdown() {
            const popover = document.getElementById('user-dropdown-popover');
            popover.classList.toggle('hidden');
        }

        function handleLogout() {
            document.getElementById('user-dropdown-popover').classList.add('hidden');
            clearSession();
            renderApp();
            showToast('You have signed out.');
        }

        async function handleContactSubmit(event) {
            event.preventDefault();
            const form = event.target;
            try {
                await api('/contact', {
                    method: 'POST',
                    body: {
                        name: document.getElementById('contact-name').value.trim(),
                        email: document.getElementById('contact-email').value.trim(),
                        message: document.getElementById('contact-message').value.trim()
                    }
                });
                form.reset();
                showToast('Message sent! Our Phnom Penh team will reply within 24 hours.');
            } catch (err) {
                showToast(err.message);
            }
        }

        // 12. Pricing & Subscription Selection Logic
        async function selectSubscriptionPlan(planKey) {
            if (!state.currentUser) {
                showToast('Please sign in or register first to choose a plan.');
                openAuthModal('register');
                return;
            }

            try {
                // NOTE: no payment provider is integrated - the plan changes immediately (same as the original UI).
                state.currentUser = await api('/subscription', { method: 'PUT', body: { plan: planKey } });
                updateAuthUI();
                updatePricingUI();
                const planNames = { free: 'Explorer Free ($0/mo)', pro: 'Business Pro ($19/mo)', featured: 'Featured Partner ($49/mo)' };
                showToast(`Subscription updated to ${planNames[planKey]}!`);
            } catch (err) {
                showToast(err.message);
            }
        }

        function updatePricingUI() {
            const activePlan = state.currentUser ? state.currentUser.plan : 'free';
            ['free', 'pro', 'featured'].forEach(key => {
                const badge = document.getElementById(`badge-plan-${key}`);
                const btn = document.getElementById(`btn-plan-${key}`);
                if (!badge || !btn) return;

                if (activePlan === key) {
                    badge.classList.remove('hidden');
                    btn.textContent = 'Current Active Plan';
                } else {
                    if (key !== 'free') badge.classList.add('hidden');
                    btn.textContent = key === 'free' ? 'Switch to Free Tier' : (key === 'pro' ? 'Subscribe to Business Pro' : 'Upgrade to Featured Partner');
                }
            });
        }

        // 13. Admin Dashboard Management Logic
        function switchAdminTab(tabName) {
            ['places', 'users', 'content', 'messages'].forEach(t => {
                const panel = document.getElementById(`admin-panel-${t}`);
                const btn = document.getElementById(`admin-tab-${t}`);
                if (!panel || !btn) return;

                if (t === tabName) {
                    panel.classList.remove('hidden');
                    btn.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-stone-900 dark:bg-white text-white dark:text-zinc-900 transition-all';
                } else {
                    panel.classList.add('hidden');
                    btn.className = 'px-4 py-2 rounded-xl text-xs sm:text-sm font-medium bg-stone-100 dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-800 transition-all';
                }
            });
        }

        async function renderAdminDashboard() {
            if (!state.currentUser || state.currentUser.role !== 'admin') return;

            try {
                const [stats, places, users, messages] = await Promise.all([
                    api('/admin/stats'),
                    api('/places?sort=recommended'),
                    api('/admin/users'),
                    api('/admin/messages')
                ]);
                adminPlaces = places;
                usersDirectory = users;

                document.getElementById('admin-stat-places').textContent = stats.places;
                document.getElementById('admin-stat-users').textContent = stats.users;
                document.getElementById('admin-stat-paid').textContent = stats.paid;
                document.getElementById('admin-stat-featured').textContent = stats.featured;
                renderAdminMessages(messages);
            } catch (err) {
                showToast(err.message);
                return;
            }

            // Render Places Table
            const placesTbody = document.getElementById('admin-places-tbody');
            if (placesTbody) {
                placesTbody.innerHTML = adminPlaces.map(p => `
                    <tr class="hover:bg-stone-50/70 dark:hover:bg-zinc-800/40">
                        <td class="py-3.5 px-4">
                            <div class="flex items-center gap-3">
                                <img src="${p.images[0]}" alt="${esc(p.name)}" onerror="this.src='https://placehold.co/80x80/27272a/ffffff?text=Place'" class="w-10 h-10 rounded-xl object-cover shrink-0">
                                <div>
                                    <p class="font-bold text-stone-900 dark:text-white">${esc(p.name)}</p>
                                    <p class="text-xs text-stone-500 dark:text-zinc-400 truncate max-w-[200px]">${esc(p.address)}</p>
                                </div>
                            </div>
                        </td>
                        <td class="py-3.5 px-4">
                            <span class="font-medium text-stone-800 dark:text-zinc-200">${esc(p.category)}</span>
                            <span class="block text-xs text-stone-500 dark:text-zinc-400">${esc(p.city)}</span>
                        </td>
                        <td class="py-3.5 px-4 font-semibold text-stone-800 dark:text-zinc-200">★ ${p.rating.toFixed(1)} (${p.reviewCount})</td>
                        <td class="py-3.5 px-4">
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${p.isOpen ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}">
                                ${p.isOpen ? 'Open' : 'Closed'}
                            </span>
                        </td>
                        <td class="py-3.5 px-4">
                            <button onclick="togglePlaceFeatured(${p.id})" class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${p.featured ? 'bg-brand-500 text-white' : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400'}">
                                ${p.featured ? '★ Featured' : 'Standard'}
                            </button>
                        </td>
                        <td class="py-3.5 px-4 text-right space-x-1.5">
                            <button onclick="openEditPlaceModal(${p.id})" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200 hover:bg-stone-200 dark:hover:bg-zinc-700">
                                Edit
                            </button>
                            <button onclick="deletePlaceAdmin(${p.id})" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20">
                                Delete
                            </button>
                        </td>
                    </tr>
                `).join('');
            }

            // Render Users Access Table
            const usersTbody = document.getElementById('admin-users-tbody');
            if (usersTbody) {
                usersTbody.innerHTML = usersDirectory.map(u => `
                    <tr class="hover:bg-stone-50/70 dark:hover:bg-zinc-800/40">
                        <td class="py-3.5 px-4">
                            <p class="font-bold text-stone-900 dark:text-white">${esc(u.name)}</p>
                            <p class="text-xs text-stone-500 dark:text-zinc-400">${esc(u.email)}</p>
                        </td>
                        <td class="py-3.5 px-4">
                            <select onchange="updateUserRole('${u.id}', this.value)" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200">
                                <option value="explorer" ${u.role === 'explorer' ? 'selected' : ''}>Explorer</option>
                                <option value="business" ${u.role === 'business' ? 'selected' : ''}>Business Owner</option>
                                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
                            </select>
                        </td>
                        <td class="py-3.5 px-4">
                            <select onchange="updateUserPlanAdmin('${u.id}', this.value)" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200">
                                <option value="free" ${u.plan === 'free' ? 'selected' : ''}>Free ($0/mo)</option>
                                <option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>Business Pro ($19/mo)</option>
                                <option value="featured" ${u.plan === 'featured' ? 'selected' : ''}>Featured Partner ($49/mo)</option>
                            </select>
                        </td>
                        <td class="py-3.5 px-4">
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${u.status === 'active' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}">
                                ${u.status === 'active' ? 'Active' : 'Suspended'}
                            </span>
                        </td>
                        <td class="py-3.5 px-4 text-right">
                            <button onclick="toggleUserStatusAdmin('${u.id}')" class="px-3 py-1.5 rounded-lg text-xs font-semibold ${u.status === 'active' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">
                                ${u.status === 'active' ? 'Suspend Access' : 'Restore Access'}
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
            lucide.createIcons();
        }

        function renderAdminMessages(messages) {
            const tbody = document.getElementById('admin-messages-tbody');
            if (!tbody) return;
            if (!messages.length) {
                tbody.innerHTML = `<tr><td colspan="3" class="py-8 px-4 text-center text-xs text-stone-500 dark:text-zinc-400">No messages yet.</td></tr>`;
                return;
            }
            tbody.innerHTML = messages.map(m => `
                <tr class="hover:bg-stone-50/70 dark:hover:bg-zinc-800/40 align-top">
                    <td class="py-3.5 px-4">
                        <p class="font-bold text-stone-900 dark:text-white">${esc(m.name)}</p>
                        <p class="text-xs text-stone-500 dark:text-zinc-400">${esc(m.email)}</p>
                    </td>
                    <td class="py-3.5 px-4 text-stone-700 dark:text-zinc-300 whitespace-pre-line max-w-xl">${esc(m.message)}</td>
                    <td class="py-3.5 px-4 text-xs text-stone-500 dark:text-zinc-400 whitespace-nowrap">${esc(new Date(m.createdAt).toLocaleString())}</td>
                </tr>
            `).join('');
        }

        async function togglePlaceFeatured(placeId) {
            try {
                const updated = await api(`/admin/places/${placeId}/featured`, { method: 'PATCH' });
                await renderAdminDashboard();
                renderApp();
                showToast(`"${updated.name}" marked as ${updated.featured ? 'Featured' : 'Standard'}.`);
            } catch (err) {
                showToast(err.message);
            }
        }

        async function deletePlaceAdmin(placeId) {
            const place = adminPlaces.find(p => p.id === placeId);
            if (!place) return;
            if (!window.confirm(`Delete "${esc(place.name)}" from the directory? This cannot be undone.`)) return;
            try {
                await api(`/places/${placeId}`, { method: 'DELETE' });
                state.savedIds.delete(placeId);
                await renderAdminDashboard();
                renderApp();
                showToast(`Deleted "${esc(place.name)}" from directory.`);
            } catch (err) {
                showToast(err.message);
            }
        }

        function openEditPlaceModal(placeId) {
            const place = adminPlaces.find(p => p.id === placeId);
            if (!place) return;
            document.getElementById('edit-place-id').value = place.id;
            document.getElementById('edit-place-name').value = place.name;
            document.getElementById('edit-place-category').value = place.category;
            document.getElementById('edit-place-city').value = place.city;
            document.getElementById('edit-place-open').value = String(place.isOpen);
            document.getElementById('edit-place-featured').value = String(Boolean(place.featured));
            document.getElementById('edit-place-address').value = place.address;
            document.getElementById('edit-place-description').value = place.description;

            const modal = document.getElementById('edit-place-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            lucide.createIcons();
        }

        function closeEditPlaceModal(event) {
            if (event && event.target !== event.currentTarget) return;
            const modal = document.getElementById('edit-place-modal');
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }

        async function handleEditPlaceSubmit(event) {
            event.preventDefault();
            const id = Number(document.getElementById('edit-place-id').value);
            const body = {
                name: document.getElementById('edit-place-name').value.trim(),
                category: document.getElementById('edit-place-category').value,
                city: document.getElementById('edit-place-city').value,
                isOpen: document.getElementById('edit-place-open').value === 'true',
                featured: document.getElementById('edit-place-featured').value === 'true',
                address: document.getElementById('edit-place-address').value.trim(),
                description: document.getElementById('edit-place-description').value.trim()
            };
            try {
                const updated = await api(`/places/${id}`, { method: 'PUT', body });
                closeEditPlaceModal();
                await renderAdminDashboard();
                renderApp();
                showToast(`Updated "${updated.name}" successfully.`);
            } catch (err) {
                showToast(err.message);
            }
        }

        async function updateUserRole(userId, newRole) {
            try {
                const updated = await api(`/admin/users/${userId}/role`, { method: 'PATCH', body: { role: newRole } });
                if (state.currentUser && state.currentUser.id === updated.id) {
                    state.currentUser = updated;
                    updateAuthUI();
                }
                await renderAdminDashboard();
                showToast(`Updated ${updated.name}'s role to ${updated.role}.`);
            } catch (err) {
                showToast(err.message);
                renderAdminDashboard();   // reset the dropdown to the real value
            }
        }

        async function updateUserPlanAdmin(userId, newPlan) {
            try {
                const updated = await api(`/admin/users/${userId}/plan`, { method: 'PATCH', body: { plan: newPlan } });
                if (state.currentUser && state.currentUser.id === updated.id) {
                    state.currentUser = updated;
                    updateAuthUI();
                    updatePricingUI();
                }
                await renderAdminDashboard();
                showToast(`Updated ${updated.name}'s subscription to ${updated.plan.toUpperCase()}.`);
            } catch (err) {
                showToast(err.message);
                renderAdminDashboard();
            }
        }

        async function toggleUserStatusAdmin(userId) {
            const user = usersDirectory.find(u => String(u.id) === String(userId));
            if (!user) return;
            const newStatus = user.status === 'active' ? 'suspended' : 'active';
            try {
                const updated = await api(`/admin/users/${userId}/status`, { method: 'PATCH', body: { status: newStatus } });
                await renderAdminDashboard();
                showToast(`${updated.name} is now ${updated.status}.`);
            } catch (err) {
                showToast(err.message);
            }
        }

        async function handleSiteContentSave(event) {
            event.preventDefault();
            try {
                const content = await api('/admin/content', {
                    method: 'PUT',
                    body: {
                        heroTitle: document.getElementById('cms-hero-title').value.trim(),
                        heroSubtitle: document.getElementById('cms-hero-subtitle').value.trim()
                    }
                });
                applySiteContent(content);
                showToast('Website homepage content updated live!');
            } catch (err) {
                showToast(err.message);
            }
        }

        // Initialize on Window Load
        window.onload = async function () {
            initMap();
            loadSiteContent();
            await restoreSession();
            await renderApp();
        };
