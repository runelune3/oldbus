/**
 * Gwangju Bus Route OpenStreetMap Application
 * Author: Antigravity
 */

(function () {
  'use strict';

  // =========================================================================
  // State & Variables
  // =========================================================================
  let map = null;
  let currentTileLayer = null;
  let routeData = null; // Whole dataset { routes, stopIndex, ... }
  let currentRoute = null; // Currently selected route object
  let currentDirection = 'all'; // 'all' | '상행' | '하행'
  let currentCategory = 'all'; // 'all' | '급행' | '간선' | '지선' | '순환' | '맞춤'
  let searchMode = 'search'; // 'search' (1. 노선·정류소 검색) | 'path' (2. 길찾기)
  let activePathInputType = 'start'; // 'start' | 'end' for path autocomplete
  let currentPathSort = 'direct'; // 'direct' (직통 우선, 경유 정류장 적은 순) | 'stops' (최소 정류장 순)
  let currentPathResults = [];
  let selectedPathIndex = -1;

  // Platform-level Stop Catalog for accurate stop & ARS search
  let stopCatalog = []; // [ { stopName, arsId, direction, lat, lng, stopId, routes, chosung } ]
  let stopCatalogByName = new Map(); // stopName -> [ platform1, platform2, ... ]
  let stopCatalogByArs = new Map(); // arsId -> platform

  // Map Layer Groups
  let routeLayerGroup = null;
  let stopsLayerGroup = null;
  let waypointsLayerGroup = null;
  let pathLayerGroup = null;
  let highlightMarker = null;

  // Settings
  let showStops = true;
  let showWaypoints = true;
  let showLabels = false;
  const osrmCache = window.OSRM_CACHE || {};
  let currentRouteCoords = [];

  // Saved View States for Bidirectional Restoration
  let lastRouteSearchState = {
    type: 'none', // 'none' | 'route' | 'stop'
    routeName: null,
    direction: 'all',
    stopName: null,
    servingRoutes: null,
    targetArsId: null,
    platformInfo: null,
    inputVal: ''
  };

  let lastPathSearchState = {
    hasSearched: false,
    startName: '',
    endName: '',
    sort: 'direct',
    results: [],
    selectedIndex: 0
  };

  // Tile Providers (OpenStreetMap based)
  const TILE_PROVIDERS = {
    'osm': {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
      }
    },
    'carto-light': {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      options: {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    },
    'carto-dark': {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      options: {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    },
    'humanitarian': {
      url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles style by <a href="https://www.hotosm.org/" target="_blank">HOT</a>'
      }
    }
  };

  // Chosung search removed per requirement

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const dom = {
    routeSearchWrapper: document.getElementById('routeSearchWrapper'),
    searchInputWrapper: document.querySelector('.search-input-wrapper'),
    routeSearchInput: document.getElementById('routeSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    searchResultsDropdown: document.getElementById('searchResultsDropdown'),
    btnRouteSearchSubmit: document.getElementById('btnRouteSearchSubmit'),
    btnGoToPath: document.getElementById('btnGoToPath'),
    btnBackToRouteSearch: document.getElementById('btnBackToRouteSearch'),
    modeSearchBtn: document.getElementById('modeSearchBtn'),
    modeRouteBtn: document.getElementById('modeRouteBtn'),
    modeStopBtn: document.getElementById('modeStopBtn'),
    modePathBtn: document.getElementById('modePathBtn'),
    quickRoutes: document.getElementById('quickRoutes'),
    layerMenuToggleBtn: document.getElementById('layerMenuToggleBtn'),
    mapSettingsMenu: document.getElementById('mapSettingsMenu'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    sidebar: document.getElementById('sidebar'),

    // Path Search Dual Input Elements
    pathSearchWrapper: document.getElementById('pathSearchWrapper'),
    pathStartInput: document.getElementById('pathStartInput'),
    clearStartBtn: document.getElementById('clearStartBtn'),
    pathEndInput: document.getElementById('pathEndInput'),
    clearEndBtn: document.getElementById('clearEndBtn'),
    pathSwapBtn: document.getElementById('pathSwapBtn'),
    pathSearchSubmitBtn: document.getElementById('pathSearchSubmitBtn'),

    // Map Floating Controls
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    btnResetGwangju: document.getElementById('btnResetGwangju'),
    btnFitRoute: document.getElementById('btnFitRoute'),

    // Settings
    chkShowStops: document.getElementById('chkShowStops'),
    chkShowWaypoints: document.getElementById('chkShowWaypoints'),
    chkShowLabels: document.getElementById('chkShowLabels'),
    btnExportGeoJSON: document.getElementById('btnExportGeoJSON'),

    // Panels
    panelRouteList: document.getElementById('panelRouteList'),
    panelRouteDetail: document.getElementById('panelRouteDetail'),
    panelStopDetail: document.getElementById('panelStopDetail'),
    panelPathResult: document.getElementById('panelPathResult'),
    totalRoutesBadge: document.getElementById('totalRoutesBadge'),
    routeCardList: document.getElementById('routeCardList'),

    // Route Detail Elements
    btnBackToRouteList: document.getElementById('btnBackToRouteList'),
    routeHeroCard: document.getElementById('routeHeroCard'),
    detailRouteType: document.getElementById('detailRouteType'),
    detailRouteName: document.getElementById('detailRouteName'),
    detailRouteId: document.getElementById('detailRouteId'),
    detailStartStop: document.getElementById('detailStartStop'),
    detailEndStop: document.getElementById('detailEndStop'),
    detailTurnWrap: document.getElementById('detailTurnWrap'),
    detailTurnStop: document.getElementById('detailTurnStop'),
    detailStopCount: document.getElementById('detailStopCount'),
    detailLength: document.getElementById('detailLength'),
    detailPointCount: document.getElementById('detailPointCount'),
    tabDirAll: document.getElementById('tabDirAll'),
    tabDirUp: document.getElementById('tabDirUp'),
    tabDirDown: document.getElementById('tabDirDown'),
    stopFilterInput: document.getElementById('stopFilterInput'),
    stopSequenceList: document.getElementById('stopSequenceList'),

    // Trajectory Status Indicator
    osrmStatusContainer: document.getElementById('osrmStatusContainer'),
    osrmDot: document.getElementById('osrmDot'),
    osrmStatusText: document.getElementById('osrmStatusText'),
    osrmCoordsCount: document.getElementById('osrmCoordsCount'),

    // Reverse Stop Detail Elements
    btnBackFromStop: document.getElementById('btnBackFromStop'),
    stopDetailName: document.getElementById('stopDetailName'),
    stopDetailArs: document.getElementById('stopDetailArs'),
    stopDetailCount: document.getElementById('stopDetailCount'),
    stopRoutesList: document.getElementById('stopRoutesList'),

    // Path Result Panel Elements
    btnBackFromPath: document.getElementById('btnBackFromPath'),
    summaryStartName: document.getElementById('summaryStartName'),
    summaryEndName: document.getElementById('summaryEndName'),
    sortDirectBtn: document.getElementById('sortDirectBtn'),
    sortStopsBtn: document.getElementById('sortStopsBtn'),
    pathResultsCount: document.getElementById('pathResultsCount'),
    pathResultsList: document.getElementById('pathResultsList'),

    // Mobile Route Bottom Sheet Bar & Fold Buttons
    mobileRouteSheetBar: document.getElementById('mobileRouteSheetBar'),
    mrsBadge: document.getElementById('mrsBadge'),
    mrsTitle: document.getElementById('mrsTitle'),
    mrsSub: document.getElementById('mrsSub'),
    btnOpenRouteSheet: document.getElementById('btnOpenRouteSheet'),
    btnFoldRouteDetailMobile: document.getElementById('btnFoldRouteDetailMobile'),
    btnFoldStopDetailMobile: document.getElementById('btnFoldStopDetailMobile'),
    btnFoldPathDetailMobile: document.getElementById('btnFoldPathDetailMobile')
  };

  // =========================================================================
  // Initialize Application
  // =========================================================================
  async function init() {
    initMap();
    bindEvents();
    updateSearchPlaceholder();
    await loadRouteData();
    renderRouteCardList();

    // Handle initial query parameter (e.g. ?q=터미널)
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('q');
    if (initialQuery && dom.routeSearchInput) {
      dom.routeSearchInput.value = initialQuery;
      searchUnified(initialQuery);
    }
  }

  function updateSearchPlaceholder() {
    if (!dom.routeSearchInput) return;
    if (window.innerWidth <= 640) {
      dom.routeSearchInput.placeholder = '노선, 정류소, ARS (예: 급행03, 2002)';
    } else {
      dom.routeSearchInput.placeholder = '노선명, 정류소명 또는 ARS 번호 검색 (예: 급행03, 광천터미널, 2002)';
    }
    adjustMobileSidebarTop();
  }

  function adjustMobileSidebarTop() {
    if (!dom.sidebar) return;
    if (window.innerWidth <= 768) {
      const nav = document.querySelector('.top-nav');
      if (nav) {
        const bottom = nav.getBoundingClientRect().bottom;
        dom.sidebar.style.top = `${Math.round(bottom) + 12}px`;
      }
    } else {
      dom.sidebar.style.top = '';
    }
  }

  // =========================================================================
  // Map Setup
  // =========================================================================
  function initMap() {
    // Center at Gwangju City Hall coordinates
    const gwangjuCenter = [35.1595, 126.8526];
    map = L.map('map', {
      center: gwangjuCenter,
      zoom: 12,
      zoomControl: false // Using custom buttons
    });

    // Default tile: OpenStreetMap
    setTileLayer('osm');

    // Layer groups for clean management
    routeLayerGroup = L.layerGroup().addTo(map);
    stopsLayerGroup = L.layerGroup().addTo(map);
    waypointsLayerGroup = L.layerGroup().addTo(map);
    pathLayerGroup = L.layerGroup().addTo(map);
  }

  function setTileLayer(type) {
    if (currentTileLayer) {
      map.removeLayer(currentTileLayer);
    }
    const provider = TILE_PROVIDERS[type] || TILE_PROVIDERS['osm'];
    currentTileLayer = L.tileLayer(provider.url, provider.options).addTo(map);

    // Update active class on buttons
    document.querySelectorAll('.tile-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tile === type);
    });
  }

  // =========================================================================
  // Stop Catalog Builder (Platform-level accurate stop & ARS indexing)
  // =========================================================================
  function isStopIntersection(pt) {
    if (!pt) return false;
    if (pt.type === '교차로') return true;
    if (pt.name === '교차로' && !pt.arsId) return true;
    return false;
  }

  function buildStopCatalog() {
    stopCatalog = [];
    stopCatalogByName = new Map();
    stopCatalogByArs = new Map();

    if (!routeData || !routeData.routes) return;

    const platformMap = new Map(); // key: `${normName}__${normArs}` -> platform

    for (const rName in routeData.routes) {
      const route = routeData.routes[rName];
      if (!route.points || !Array.isArray(route.points)) continue;

      const seenInRoute = new Set();

      route.points.forEach((pt) => {
        // Exclude road intersection waypoints
        if (isStopIntersection(pt)) return;

        const normName = (pt.name || '').trim();
        if (!normName) return;

        const normArs = String(pt.arsId || '').trim();
        const pairKey = `${normName}__${normArs}`;

        if (!platformMap.has(pairKey)) {
          const platform = {
            stopName: normName,
            arsId: normArs,
            direction: pt.direction || '',
            lat: pt.lat,
            lng: pt.lng,
            stopId: pt.stopId,
            routes: []
          };
          platformMap.set(pairKey, platform);
          stopCatalog.push(platform);

          // Group by stopName
          if (!stopCatalogByName.has(normName)) {
            stopCatalogByName.set(normName, []);
          }
          stopCatalogByName.get(normName).push(platform);

          // Index by ARS ID
          if (normArs) {
            stopCatalogByArs.set(normArs, platform);
            const numVal = parseInt(normArs, 10);
            if (!isNaN(numVal)) {
              stopCatalogByArs.set(String(numVal), platform);
            }
          }
        }

        const platform = platformMap.get(pairKey);
        // Avoid duplicate routes on the exact same platform
        if (!seenInRoute.has(pairKey)) {
          seenInRoute.add(pairKey);
          platform.routes.push({
            routeName: route.routeName,
            routeType: route.routeType || '간선',
            routeColor: route.routeColor || '#3182CE',
            routeBadge: route.routeBadge || 'trunk',
            routeId: route.routeId,
            arsId: normArs,
            direction: pt.direction || '',
            lat: pt.lat,
            lng: pt.lng
          });
        }
      });
    }

    console.log(`[BusApp] Built Stop Catalog with ${stopCatalog.length} distinct platforms across ${stopCatalogByName.size} unique stop names.`);
  }

  // =========================================================================
  // Data Loading
  // =========================================================================
  async function loadRouteData() {
    try {
      if (window.BUS_ROUTES_DATA) {
        routeData = window.BUS_ROUTES_DATA;
      } else {
        const resp = await fetch('routes_data.json');
        routeData = await resp.json();
      }

      const total = Object.keys(routeData.routes || {}).length;
      dom.totalRoutesBadge.textContent = `${total}개 노선`;
      console.log(`Loaded ${total} bus routes successfully.`);

      // Build platform-level stop catalog (indexes all ARS IDs including 2001 & 2002)
      buildStopCatalog();

      // Initialize BusRouter engine
      if (window.BusRouter) {
        window.BusRouter.init(routeData);
      }
    } catch (err) {
      console.error('Failed to load bus routes data:', err);
      alert('노선 데이터를 불러오는데 실패했습니다. 페이지를 새로고침 해주세요.');
    }
  }

  // =========================================================================
  // Route List Rendering & Filtering
  // =========================================================================
  // Get Routes in Excel Sheet Sequential Order
  // =========================================================================
  function getOrderedRoutes() {
    if (!routeData || !routeData.routes) return [];
    if (Array.isArray(routeData.routeList) && routeData.routeList.length > 0) {
      return routeData.routeList.map(name => routeData.routes[name]).filter(Boolean);
    }
    return Object.values(routeData.routes).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // =========================================================================
  // Render Route Card List (Sidebar)
  // =========================================================================
  function renderRouteCardList() {
    if (!routeData || !routeData.routes) return;
    const container = dom.routeCardList;
    container.innerHTML = '';

    const routes = getOrderedRoutes();
    const filtered = routes.filter(r => {
      if (currentCategory === 'all') return true;
      if (currentCategory === '맞춤') {
        return r.routeType === '맞춤' || r.routeType === '기념/특화';
      }
      return r.routeType === currentCategory;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="dropdown-empty">해당 분류의 노선이 없습니다.</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach(route => {
      const card = document.createElement('div');
      card.className = `route-card ${currentRoute && currentRoute.routeName === route.routeName ? 'active' : ''}`;
      card.dataset.route = route.routeName;

      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${escapeHtml(route.routeName)}</span>
          <span class="route-badge badge-${route.routeBadge}">${route.routeType}</span>
        </div>
        <div class="card-terminals">
          <span>${escapeHtml(route.startStop)}</span>
          <span class="term-sep">⇄</span>
          <span>${escapeHtml(route.endStop)}</span>
        </div>
        <div class="card-bottom">
          <span>정류소 ${route.stopCount}개</span>
          <span>${route.lengthKm} km</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectRoute(route.routeName);
      });

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  // =========================================================================
  // Select & Display Route on Map
  // =========================================================================
  function selectRoute(routeName) {
    if (!routeData || !routeData.routes[routeName]) return;

    currentRoute = routeData.routes[routeName];
    currentDirection = 'all';

    // Show Detail Panel, Hide List and other Panels
    dom.panelRouteList.classList.add('hidden');
    dom.panelStopDetail.classList.add('hidden');
    dom.panelPathResult.classList.add('hidden');
    dom.panelRouteDetail.classList.remove('hidden');

    if (pathLayerGroup) pathLayerGroup.clearLayers();

    lastRouteSearchState = {
      type: 'route',
      routeName: routeName,
      direction: currentDirection,
      inputVal: dom.routeSearchInput.value || routeName
    };

    // Populate Detail Hero
    dom.detailRouteType.textContent = currentRoute.routeType;
    dom.detailRouteType.className = `route-type-tag badge-${currentRoute.routeBadge}`;
    dom.detailRouteName.textContent = currentRoute.routeName;
    dom.detailRouteId.textContent = `ID ${currentRoute.routeId}`;
    dom.detailStartStop.textContent = currentRoute.startStop;
    dom.detailEndStop.textContent = currentRoute.endStop;

    if (currentRoute.turnStop) {
      dom.detailTurnStop.textContent = currentRoute.turnStop;
      dom.detailTurnWrap.style.display = 'flex';
    } else {
      dom.detailTurnWrap.style.display = 'none';
    }

    dom.detailStopCount.textContent = currentRoute.stopCount;
    dom.detailLength.textContent = currentRoute.lengthKm;
    const interCount = currentRoute.intersectionCount !== undefined 
      ? currentRoute.intersectionCount 
      : (currentRoute.points ? currentRoute.points.filter(p => isStopIntersection(p)).length : 0);
    dom.detailPointCount.textContent = interCount;

    // Reset Direction Tabs
    document.querySelectorAll('.dir-tab').forEach(t => t.classList.remove('active'));
    dom.tabDirAll.classList.add('active');
    dom.stopFilterInput.value = '';

    // Render Map Polylines & Markers
    drawRouteOnMap(currentRoute, currentDirection);

    // Render Vertical Timeline
    renderStopTimeline(currentRoute, currentDirection, '');

    const isMobile = window.innerWidth <= 768;

    // Update active highlight in route cards
    document.querySelectorAll('.route-card').forEach(c => {
      c.classList.toggle('active', c.dataset.route === routeName);
    });

    // Close search dropdown
    closeSearchDropdown();
    dom.routeSearchInput.value = routeName;
    dom.clearSearchBtn.style.display = 'flex';

    // Mobile: Show Map first by closing sidebar and showing bottom summary bar
    if (isMobile) {
      dom.sidebar.classList.add('closed');
      if (dom.mobileRouteSheetBar) {
        dom.mrsBadge.textContent = currentRoute.routeType;
        dom.mrsBadge.style.backgroundColor = currentRoute.routeColor;
        dom.mrsTitle.textContent = currentRoute.routeName;
        dom.mrsSub.textContent = `${currentRoute.startStop} ⇄ ${currentRoute.endStop} (${currentRoute.stopCount}개 정류소)`;
        dom.mobileRouteSheetBar.classList.remove('hidden');
      }
    } else {
      dom.sidebar.classList.remove('closed');
      if (dom.mobileRouteSheetBar) dom.mobileRouteSheetBar.classList.add('hidden');
    }
  }

  // =========================================================================
  // Draw Route Polyline & Markers on OpenStreetMap
  // =========================================================================
  // =========================================================================
  // OSRM Routing Engine & Status
  // =========================================================================
  function updateOsrmStatus(type, text, countStr) {
    if (!dom.osrmStatusContainer) return;
    dom.osrmStatusContainer.className = `osrm-status-container ${type}`;
    if (text) dom.osrmStatusText.textContent = text;
    if (dom.osrmCoordsCount) dom.osrmCoordsCount.textContent = countStr || '';
  }

  async function getOrFetchOsrmCoords(route, direction, points) {
    // 1. Check if official BIS trajectory is available (High precision, 100% official)
    if (route) {
      if (direction === '상행' && route.upTrajectory && route.upTrajectory.length > 0) {
        return route.upTrajectory.map(c => [c[1], c[0]]); // return [lng, lat]
      }
      if (direction === '하행' && route.downTrajectory && route.downTrajectory.length > 0) {
        return route.downTrajectory.map(c => [c[1], c[0]]);
      }
      if (route.trajectory && route.trajectory.length > 0) {
        return route.trajectory.map(c => [c[1], c[0]]);
      }
    }

    const cacheKey = route.routeName + (direction !== 'all' ? `_${direction}` : '');

    // 2. Check in-memory / pre-generated OSRM cache
    if (osrmCache[cacheKey] && osrmCache[cacheKey].length > 0) {
      return osrmCache[cacheKey];
    }
    if (direction === 'all' && osrmCache[route.routeName] && osrmCache[route.routeName].length > 0) {
      return osrmCache[route.routeName];
    }

    // 3. Fallback to OSRM API if no trajectory
    const CHUNK_SIZE = 25;
    const roadCoords = [];
    const totalChunks = Math.ceil((points.length - 1) / (CHUNK_SIZE - 1));

    for (let i = 0; i < points.length; i += CHUNK_SIZE - 1) {
      const chunk = points.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 2) break;

      const currentChunkIdx = Math.floor(i / (CHUNK_SIZE - 1)) + 1;
      const pct = Math.round((currentChunkIdx / totalChunks) * 100);
      updateOsrmStatus('loading', `도로망 매칭 계산 중 (${pct}%)...`);

      const coordStr = chunk.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

      try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
          const c = data.routes[0].geometry.coordinates;
          if (roadCoords.length > 0) {
            roadCoords.push(...c.slice(1));
          } else {
            roadCoords.push(...c);
          }
        }
      } catch (err) {
        console.warn(`Chunk ${i} fetch error:`, err);
        chunk.forEach(p => roadCoords.push([p.lng, p.lat]));
      }
      await new Promise(res => setTimeout(res, 100));
    }

    if (roadCoords.length > 0) {
      osrmCache[cacheKey] = roadCoords;
    }
    return roadCoords;
  }

  // =========================================================================
  // Draw Route Polyline & Markers on OpenStreetMap
  // =========================================================================
  async function drawRouteOnMap(route, direction) {
    routeLayerGroup.clearLayers();
    stopsLayerGroup.clearLayers();
    waypointsLayerGroup.clearLayers();
    if (pathLayerGroup) pathLayerGroup.clearLayers();
    if (highlightMarker) {
      map.removeLayer(highlightMarker);
      highlightMarker = null;
    }

    if (!route || !route.points || route.points.length === 0) return;

    let points = route.points;
    if (direction === '상행') {
      points = points.filter(p => p.direction === '상행');
    } else if (direction === '하행') {
      points = points.filter(p => p.direction === '하행');
    }

    if (points.length === 0) return;

    // Direct points LatLngs
    const directLatLngs = points.map(p => [p.lat, p.lng]);

    // Check if official BIS trajectory exists
    let officialTrajectory = null;
    if (direction === '상행' && route.upTrajectory && route.upTrajectory.length > 0) {
      officialTrajectory = route.upTrajectory;
    } else if (direction === '하행' && route.downTrajectory && route.downTrajectory.length > 0) {
      officialTrajectory = route.downTrajectory;
    } else if (route.trajectory && route.trajectory.length > 0) {
      officialTrajectory = route.trajectory;
    }

    // Determine initial line coords
    const initialLatLngs = (officialTrajectory && officialTrajectory.length > 0) ? officialTrajectory : directLatLngs;

    const casingPolyline = L.polyline(initialLatLngs, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(routeLayerGroup);

    const routePolyline = L.polyline(initialLatLngs, {
      color: route.routeColor,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(routeLayerGroup);

    // Initial fit bounds
    map.fitBounds(routePolyline.getBounds(), {
      padding: [60, 60],
      maxZoom: 15,
      animate: true,
      duration: 0.8
    });

    // 2. Render Markers for Stops & Intersections
    renderRouteMarkers(points, route);

    // 3. Apply Official BIS Trajectory or Fallback to OSRM / Coordinates
    if (officialTrajectory && officialTrajectory.length > 0) {
      casingPolyline.setLatLngs(officialTrajectory);
      routePolyline.setLatLngs(officialTrajectory);
      currentRouteCoords = officialTrajectory.map(c => ({ lat: c[0], lng: c[1] }));
      updateOsrmStatus('success', '공식 도로망(BIS 궤적) 적용 완료', `${officialTrajectory.length.toLocaleString()}개 정밀 좌표`);
    } else {
      updateOsrmStatus('loading', '도로망 궤적 매칭 중...');
      try {
        const roadCoords = await getOrFetchOsrmCoords(route, direction, points);
        if (roadCoords && roadCoords.length > 0 && currentRoute && currentRoute.routeName === route.routeName) {
          const osrmLatLngs = roadCoords.map(c => [c[1], c[0]]);
          casingPolyline.setLatLngs(osrmLatLngs);
          routePolyline.setLatLngs(osrmLatLngs);
          currentRouteCoords = roadCoords.map(c => ({ lat: c[1], lng: c[0] }));
          updateOsrmStatus('success', '실제 도로망 매칭 완료', `${roadCoords.length.toLocaleString()}개 도로 좌표`);
        }
      } catch (err) {
        console.warn('Routing matching failed, fallback to stop coordinates:', err);
        casingPolyline.setLatLngs(directLatLngs);
        routePolyline.setLatLngs(directLatLngs);
        updateOsrmStatus('success', '노선 경유지 연결 완료');
        currentRouteCoords = points;
      }
    }
  }

  function renderRouteMarkers(points, route) {
    points.forEach((pt, idx) => {
      if (pt.type === '교차로') {
        if (showWaypoints) {
          const crossroadSvg = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20"></path>
              <path d="M12 2l3 3M12 2l-3 3M12 22l3-3M12 22l-3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l3 3"></path>
            </svg>
          `;
          const customIcon = L.divIcon({
            className: '',
            html: `<div class="custom-intersection-marker" data-stop-seq="${pt.seq}" title="교차로"><div class="intersection-inner">${crossroadSvg}</div></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });

          const marker = L.marker([pt.lat, pt.lng], { icon: customIcon });

          marker.bindTooltip(
            `<strong>🔀 ${escapeHtml(pt.name)}</strong> (교차로 #${pt.seq})`, 
            { direction: 'top', offset: [0, -10] }
          );

          const popupContent = `
            <div class="stop-popup-card">
              <span class="popup-tag intersection">
                🔀 교차로 (도로 경유지) ${pt.direction ? `• ${pt.direction}` : ''}
              </span>
              <h3 class="popup-title">${escapeHtml(pt.name)}</h3>
              <p class="popup-notice">⚠️ 승객 승하차가 불가능한 도로 교차점/경유지입니다.</p>
              <div class="popup-meta-row" style="margin-top: 10px;">
                <span>노선 순번: #${pt.seq}</span>
                <span>ID: ${pt.stopId}</span>
              </div>
            </div>
          `;
          marker.bindPopup(popupContent);

          marker.on('click', () => {
            highlightStopInTimeline(pt.seq);
          });

          marker.addTo(waypointsLayerGroup);
        }
      } else if (showStops) {
        // Bus Stop Marker (기점, 정류소, 회차지, 종점)
        let iconClass = 'custom-stop-marker';
        let iconInner = '🚏';

        if (pt.type === '기점') {
          iconClass += ' start';
          iconInner = '🚩';
        } else if (pt.type === '종점') {
          iconClass += ' end';
          iconInner = '🏁';
        } else if (pt.type === '회차지') {
          iconClass += ' turn';
          iconInner = '🔄';
        }

        const customIcon = L.divIcon({
          className: '',
          html: `<div class="${iconClass}" data-stop-seq="${pt.seq}">${iconInner}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const marker = L.marker([pt.lat, pt.lng], { icon: customIcon });

        // Tooltip
        marker.bindTooltip(
          `<strong>${escapeHtml(pt.name)}</strong>${pt.arsId ? ` (${pt.arsId})` : ''}`, 
          { direction: 'top', offset: [0, -10], permanent: showLabels }
        );

        // Rich Popup Card
        const popupContent = `
          <div class="stop-popup-card">
            <span class="popup-tag" style="background:${route.routeColor}20; color:${route.routeColor};">
              ${pt.type} ${pt.direction ? `• ${pt.direction}` : ''}
            </span>
            <h3 class="popup-title">${escapeHtml(pt.name)}</h3>
            <p class="popup-ars">ARS 번호: <strong>${pt.arsId ? pt.arsId : '미부여'}</strong></p>
            <div class="popup-meta-row">
              <span>정류장 번호: #${pt.seq}</span>
              <span>ID: ${pt.stopId}</span>
            </div>
            <div class="popup-path-actions">
              <button class="btn-set-path start" onclick="window.setPathEndpoint('start', '${escapeHtml(pt.name)}', '${escapeHtml(pt.arsId || '')}')">🚩 출발</button>
              <button class="btn-set-path end" onclick="window.setPathEndpoint('end', '${escapeHtml(pt.name)}', '${escapeHtml(pt.arsId || '')}')">🏁 도착</button>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);

        // Marker click event
        marker.on('click', () => {
          highlightStopInTimeline(pt.seq);
        });

        marker.addTo(stopsLayerGroup);
      }
    });
  }

  // =========================================================================
  // Transit Timeline (Vertical Stop Sequence)
  // =========================================================================
  function renderStopTimeline(route, direction, query) {
    const container = dom.stopSequenceList;
    container.innerHTML = '';

    if (!route || !route.points) return;

    // Filter out intersections (교차로 제외, 승객 이용 정류소만 표출)
    let points = route.points.filter(p => !isStopIntersection(p));

    if (direction === '상행') {
      points = points.filter(p => p.direction === '상행');
    } else if (direction === '하행') {
      points = points.filter(p => p.direction === '하행');
    }

    if (query) {
      const q = query.trim().toLowerCase();
      points = points.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.arsId && p.arsId.includes(q))
      );
    }

    if (points.length === 0) {
      container.innerHTML = `<div class="dropdown-empty">일치하는 정류소가 없습니다.</div>`;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'timeline-list';

    points.forEach(pt => {
      const li = document.createElement('li');
      let nodeClass = 'node-stop';
      let typeBadge = '';

      if (pt.type === '기점') {
        nodeClass = 'node-start';
        typeBadge = `<span class="timeline-type-badge" style="background:#dcfce7;color:#16a34a;">기점</span>`;
      } else if (pt.type === '종점') {
        nodeClass = 'node-end';
        typeBadge = `<span class="timeline-type-badge" style="background:#fee2e2;color:#dc2626;">종점</span>`;
      } else if (pt.type === '회차지') {
        nodeClass = 'node-turn';
        typeBadge = `<span class="timeline-type-badge" style="background:#fef3c7;color:#d97706;">회차</span>`;
      }

      li.className = `timeline-item ${nodeClass}`;
      li.dataset.seq = pt.seq;

      const arsSubtext = pt.arsId ? pt.arsId : '';

      li.innerHTML = `
        <div class="timeline-node"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-name">${escapeHtml(pt.name)} ${typeBadge}</span>
            <span class="timeline-ars">${arsSubtext}</span>
          </div>
        </div>
      `;

      // Click: pan map to stop & open popup
      li.addEventListener('click', () => {
        zoomToStop(pt);
        document.querySelectorAll('.timeline-item').forEach(el => el.classList.remove('active-stop'));
        li.classList.add('active-stop');
      });

      ul.appendChild(li);
    });

    container.appendChild(ul);
  }

  function zoomToStop(pt) {
    map.flyTo([pt.lat, pt.lng], 16, { animate: true, duration: 0.6 });

    // Open popup for this marker in either stopsLayerGroup or waypointsLayerGroup
    const openMatchingPopup = (group) => {
      group.eachLayer(layer => {
        if (layer.getLatLng && 
            Math.abs(layer.getLatLng().lat - pt.lat) < 0.0001 && 
            Math.abs(layer.getLatLng().lng - pt.lng) < 0.0001) {
          layer.openPopup();
        }
      });
    };
    openMatchingPopup(stopsLayerGroup);
    openMatchingPopup(waypointsLayerGroup);
  }

  function highlightStopInTimeline(seq) {
    document.querySelectorAll('.timeline-item').forEach(el => {
      if (parseInt(el.dataset.seq) === seq) {
        el.classList.add('active-stop');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.classList.remove('active-stop');
      }
    });
  }

  // =========================================================================
  // Unified Route & Stop Search (1. 노선, 정류소 통합 검색)
  // =========================================================================
  function handleSearchInput(e) {
    const rawVal = e.target.value.trim();
    if (!rawVal) {
      dom.clearSearchBtn.style.display = 'none';
      closeSearchDropdown();
      return;
    }
    dom.clearSearchBtn.style.display = 'flex';

    if (searchMode === 'path') {
      return;
    }

    // 1번 모드: 노선 및 정류소 통합 검색
    searchUnified(rawVal);
  }

  function searchUnified(query) {
    if (!routeData) return;

    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      closeSearchDropdown();
      return;
    }

    const lowerQuery = trimmedQuery.toLowerCase();
    const isNumQuery = /^\d+$/.test(trimmedQuery);
    const numVal = isNumQuery ? parseInt(trimmedQuery, 10) : null;

    // 1. 노선 매칭 (엑셀 순서, 초성 없이 순수 텍스트 매칭)
    const routes = getOrderedRoutes();
    const routeMatches = routes.filter(r => {
      const name = r.routeName.toLowerCase();
      return name.includes(lowerQuery);
    });

    // 2. 정류소 & ARS 매칭 (플랫폼별 정확한 분리 검색, 초성 없이 순수 매칭)
    const stopMatches = [];
    if (stopCatalog && stopCatalog.length > 0) {
      for (const platform of stopCatalog) {
        const lowerName = platform.stopName.toLowerCase();
        const ars = platform.arsId;

        const nameMatch = lowerName.includes(lowerQuery);

        let matchedArs = null;
        let arsExact = false;
        let arsPrefix = false;
        let arsContains = false;

        if (ars) {
          const arsNum = parseInt(ars, 10);
          if (ars === trimmedQuery || (numVal !== null && arsNum === numVal)) {
            matchedArs = ars;
            arsExact = true;
          } else if (ars.startsWith(trimmedQuery)) {
            matchedArs = ars;
            arsPrefix = true;
          } else if (ars.includes(trimmedQuery)) {
            matchedArs = ars;
            arsContains = true;
          }
        }

        if (nameMatch || matchedArs) {
          let priority = 10;
          if (arsExact) priority = 1;
          else if (lowerName === lowerQuery) priority = 2;
          else if (arsPrefix) priority = 3;
          else if (lowerName.startsWith(lowerQuery)) priority = 4;
          else if (arsContains) priority = 5;
          else if (nameMatch) priority = 6;

          stopMatches.push({
            ...platform,
            matchedArs: matchedArs,
            priority: priority
          });
        }
      }

      // 정렬: 우선순위 -> 정류소명 -> ARS 번호 오름차순 (2001, 2002 순서)
      stopMatches.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.stopName !== b.stopName) return a.stopName.localeCompare(b.stopName, 'ko');
        return (a.arsId || '').localeCompare(b.arsId || '');
      });
    }

    renderUnifiedDropdown(routeMatches, stopMatches.slice(0, 20), trimmedQuery);
  }

  function renderUnifiedDropdown(routeMatches, stopMatches, query) {
    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';

    if (routeMatches.length === 0 && stopMatches.length === 0) {
      dropdown.innerHTML = `<div class="dropdown-empty">일치하는 노선 또는 정류소가 없습니다.</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    const fragment = document.createDocumentFragment();

    // 1. 노선 매칭 결과 섹션
    if (routeMatches.length > 0) {
      const routeHeader = document.createElement('div');
      routeHeader.className = 'dropdown-section-header';
      routeHeader.innerHTML = `<span>🚌 <strong>노선</strong> (${routeMatches.length}개)</span><span style="font-size:0.72rem; color:#94a3b8;">엑셀 순서 정렬</span>`;
      fragment.appendChild(routeHeader);

      routeMatches.slice(0, 15).forEach(r => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(r.routeName, query);
        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge badge-${r.routeBadge}">${r.routeType}</span>
            <div>
              <div class="dropdown-route-name">${highlightedName}</div>
              <div class="dropdown-terminals">${escapeHtml(r.startStop)} ⇄ ${escapeHtml(r.endStop)}</div>
            </div>
          </div>
          <span class="dropdown-stops-count">${r.stopCount}개 정류소</span>
        `;
        item.addEventListener('click', () => {
          selectRoute(r.routeName);
        });
        fragment.appendChild(item);
      });
    }

    // 2. 정류소 & ARS 매칭 결과 섹션 (모든 ARS 플랫폼 각각 표출)
    if (stopMatches.length > 0) {
      const stopHeader = document.createElement('div');
      stopHeader.className = 'dropdown-section-header';
      stopHeader.innerHTML = `<span>🚏 <strong>정류소 · ARS</strong> (${stopMatches.length}개)</span><span style="font-size:0.72rem; color:#94a3b8;">경유 노선 조회</span>`;
      fragment.appendChild(stopHeader);

      stopMatches.forEach(s => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(s.stopName, query);
        const arsBadge = s.arsId
          ? `<span class="badge-ars ${s.matchedArs ? 'highlight' : ''}">ARS ${highlightMatch(s.arsId, query)}</span>`
          : `<span class="badge-ars" style="color:#94a3b8; background:#f8fafc;">ARS 미부여</span>`;
        const dirBadge = s.direction 
          ? `<span class="badge-dir">${escapeHtml(s.direction)}</span>` 
          : '';

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge" style="background:#f1f5f9; color:#475569;">정류소</span>
            <div>
              <div class="dropdown-route-name">${highlightedName} ${arsBadge} ${dirBadge}</div>
              <div class="dropdown-terminals">
                ${s.routes.length}개 노선 경유 (${escapeHtml(s.routes.slice(0, 4).map(r => r.routeName).join(', '))}${s.routes.length > 4 ? '…' : ''})
              </div>
            </div>
          </div>
          <span class="dropdown-stops-count">경유 노선 →</span>
        `;
        item.addEventListener('click', () => {
          selectStop(s.stopName, s.routes, s.arsId, s);
        });
        fragment.appendChild(item);
      });
    }

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
  }

  function searchRoutes(query) {
    if (!routeData || !routeData.routes) return;

    const lowerQuery = (query || '').toLowerCase().trim();
    if (!lowerQuery) {
      closeSearchDropdown();
      return;
    }
    const routes = getOrderedRoutes(); // 엑셀 파일 순서대로 정렬된 노선 목록

    // 검색어가 있을 때 엑셀 파일 순서대로 일치하는 노선 표출 (초성 검색 제외)
    const matches = routes.filter(r => {
      const name = r.routeName.toLowerCase();
      return name.includes(lowerQuery);
    });

    renderSearchDropdown(matches, query, 'route');
  }

  function searchStops(query) {
    if (!routeData) return;

    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      closeSearchDropdown();
      return;
    }

    const lowerQuery = trimmedQuery.toLowerCase();
    const isNumQuery = /^\d+$/.test(trimmedQuery);
    const numVal = isNumQuery ? parseInt(trimmedQuery, 10) : null;

    const matches = [];
    if (stopCatalog && stopCatalog.length > 0) {
      for (const platform of stopCatalog) {
        const lowerName = platform.stopName.toLowerCase();
        const ars = platform.arsId;

        const nameMatch = lowerName.includes(lowerQuery);

        let matchedArs = null;
        let arsExact = false;
        let arsPrefix = false;
        let arsContains = false;

        if (ars) {
          const arsNum = parseInt(ars, 10);
          if (ars === trimmedQuery || (numVal !== null && arsNum === numVal)) {
            matchedArs = ars;
            arsExact = true;
          } else if (ars.startsWith(trimmedQuery)) {
            matchedArs = ars;
            arsPrefix = true;
          } else if (ars.includes(trimmedQuery)) {
            matchedArs = ars;
            arsContains = true;
          }
        }

        if (nameMatch || matchedArs) {
          let priority = 10;
          if (arsExact) priority = 1;
          else if (lowerName === lowerQuery) priority = 2;
          else if (arsPrefix) priority = 3;
          else if (lowerName.startsWith(lowerQuery)) priority = 4;
          else if (arsContains) priority = 5;
          else if (nameMatch) priority = 6;

          matches.push({
            ...platform,
            matchedArs: matchedArs,
            priority: priority
          });
        }
      }

      matches.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        if (a.stopName !== b.stopName) return a.stopName.localeCompare(b.stopName, 'ko');
        return (a.arsId || '').localeCompare(b.arsId || '');
      });
    }

    renderSearchDropdown(matches.slice(0, 20), trimmedQuery, 'stop');
  }

  function renderSearchDropdown(items, query, mode) {
    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';

    if (items.length === 0) {
      // Check if user is in route mode but typed digits that might be an ARS number
      if (mode === 'route' && /^\d+$/.test(query.trim())) {
        const potentialArs = query.trim();
        const hasStopArs = checkAnyStopHasArs(potentialArs);
        if (hasStopArs) {
          dropdown.innerHTML = `
            <div class="dropdown-empty">일치하는 노선이 없습니다.</div>
            <div class="dropdown-switch-prompt" id="btnSwitchToStopSearch">
              <span>💡 정류소 ARS 번호 <strong>${escapeHtml(potentialArs)}</strong> 결과가 있습니다.</span>
              <button type="button">정류소 검색으로 전환 →</button>
            </div>
          `;
          dropdown.classList.remove('hidden');
          const switchBtn = document.getElementById('btnSwitchToStopSearch');
          if (switchBtn) {
            switchBtn.addEventListener('click', () => {
              dom.modeStopBtn.click();
            });
          }
          return;
        }
      }

      dropdown.innerHTML = `<div class="dropdown-empty">일치하는 결과가 없습니다.</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    const fragment = document.createDocumentFragment();

    if (mode === 'route') {
      // 상단 결과 카운트 및 엑셀 순서 안내 헤더
      const header = document.createElement('div');
      header.className = 'dropdown-header-bar';
      header.style.cssText = 'padding: 6px 16px; font-size: 0.75rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; background: #f8fafc; position: sticky; top: -8px; z-index: 10;';
      header.innerHTML = `<span>노선 검색 결과 <strong>${items.length}개</strong></span><span>엑셀 순서 정렬</span>`;
      fragment.appendChild(header);

      items.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';

        const highlightedName = highlightMatch(r.routeName, query);

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge badge-${r.routeBadge}">${r.routeType}</span>
            <div>
              <div class="dropdown-route-name">${highlightedName}</div>
              <div class="dropdown-terminals">${escapeHtml(r.startStop)} ⇄ ${escapeHtml(r.endStop)}</div>
            </div>
          </div>
          <span class="dropdown-stops-count">${r.stopCount}개 정류소</span>
        `;

        item.addEventListener('click', () => {
          selectRoute(r.routeName);
        });

        fragment.appendChild(item);
      });

      // If user typed digits in route mode, also suggest ARS if exists
      if (/^\d+$/.test(query.trim())) {
        const potentialArs = query.trim();
        const hasStopArs = checkAnyStopHasArs(potentialArs);
        if (hasStopArs) {
          const prompt = document.createElement('div');
          prompt.className = 'dropdown-switch-prompt';
          prompt.innerHTML = `
            <span>💡 정류소 ARS <strong>${escapeHtml(potentialArs)}</strong> 검색 결과도 있습니다.</span>
            <button type="button">정류소 보기 →</button>
          `;
          prompt.addEventListener('click', () => {
            dom.modeStopBtn.click();
          });
          fragment.appendChild(prompt);
        }
      }
    } else {
      // 상단 결과 카운트 헤더
      const header = document.createElement('div');
      header.className = 'dropdown-header-bar';
      header.style.cssText = 'padding: 6px 16px; font-size: 0.75rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; background: #f8fafc; position: sticky; top: -8px; z-index: 10;';
      header.innerHTML = `<span>정류소 · ARS 검색 결과 <strong>${items.length}개</strong></span><span>정류소명 / ARS 번호 매칭</span>`;
      fragment.appendChild(header);

      items.forEach(s => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const highlightedName = highlightMatch(s.stopName, query);
        const arsBadge = s.arsId
          ? `<span class="badge-ars ${s.matchedArs ? 'highlight' : ''}">ARS ${highlightMatch(s.arsId, query)}</span>`
          : `<span class="badge-ars" style="color:#94a3b8; background:#f8fafc;">ARS 미부여</span>`;
        const dirBadge = s.direction 
          ? `<span class="badge-dir">${escapeHtml(s.direction)}</span>` 
          : '';

        item.innerHTML = `
          <div class="dropdown-route-info">
            <span class="dropdown-badge" style="background:#e0f2fe;color:#0369a1;">정류소</span>
            <div>
              <div class="dropdown-route-name">${highlightedName} ${arsBadge} ${dirBadge}</div>
              <div class="dropdown-terminals" style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap;">
                ${s.routes.length}개 노선 경유 (${escapeHtml(s.routes.slice(0, 4).map(r => r.routeName).join(', '))}${s.routes.length > 4 ? '…' : ''})
              </div>
            </div>
          </div>
          <span class="dropdown-stops-count">경유 노선 →</span>
        `;

        item.addEventListener('click', () => {
          selectStop(s.stopName, s.routes, s.arsId, s);
        });

        fragment.appendChild(item);
      });
    }

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
  }

  function checkAnyStopHasArs(queryDigits) {
    if (!stopCatalog || stopCatalog.length === 0) return false;
    const numVal = parseInt(queryDigits, 10);
    return stopCatalog.some(p => p.arsId && (p.arsId.includes(queryDigits) || parseInt(p.arsId, 10) === numVal));
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  function closeSearchDropdown() {
    dom.searchResultsDropdown.classList.add('hidden');
  }

  // =========================================================================
  // Stop Reverse Search: Select Stop & List Serving Routes
  // =========================================================================
  function selectStop(stopName, servingRoutes, targetArsId, platformInfo) {
    closeSearchDropdown();
    dom.panelRouteList.classList.add('hidden');
    dom.panelRouteDetail.classList.add('hidden');
    dom.panelPathResult.classList.add('hidden');
    dom.panelStopDetail.classList.remove('hidden');

    if (pathLayerGroup) pathLayerGroup.clearLayers();

    lastRouteSearchState = {
      type: 'stop',
      stopName: stopName,
      servingRoutes: servingRoutes,
      targetArsId: targetArsId,
      platformInfo: platformInfo,
      inputVal: dom.routeSearchInput.value || stopName
    };

    dom.stopDetailName.textContent = stopName;

    // Get all platforms associated with this stopName from stopCatalogByName
    const siblingPlatforms = stopCatalogByName.get(stopName) || [];
    let currentPlatform = platformInfo || siblingPlatforms.find(p => p.arsId === targetArsId) || siblingPlatforms[0];
    const currentArs = currentPlatform ? currentPlatform.arsId : targetArsId;
    const currentRoutes = currentPlatform ? currentPlatform.routes : (servingRoutes || []);

    // Interactive ARS switcher pills
    if (siblingPlatforms.length > 0) {
      dom.stopDetailArs.innerHTML = siblingPlatforms.map(p => {
        const isActive = p.arsId === currentArs;
        const dirText = p.direction ? ` (${p.direction})` : '';
        return `<button class="ars-badge-pill ${isActive ? 'active' : ''}" data-ars="${escapeHtml(p.arsId)}" type="button" title="클릭하여 ARS ${p.arsId} 방면으로 전환">ARS ${escapeHtml(p.arsId || '미부여')}${dirText}</button>`;
      }).join(' ');

      // Add switcher listeners
      dom.stopDetailArs.querySelectorAll('.ars-badge-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const clickedArs = btn.dataset.ars;
          const targetP = siblingPlatforms.find(p => p.arsId === clickedArs);
          if (targetP) {
            selectStop(stopName, targetP.routes, clickedArs, targetP);
          }
        });
      });
    } else if (currentArs) {
      dom.stopDetailArs.innerHTML = `<span class="ars-badge-pill active">ARS ${escapeHtml(currentArs)}</span>`;
    } else {
      dom.stopDetailArs.textContent = 'ARS 미부여';
    }

    dom.stopDetailCount.textContent = `${currentRoutes.length}개 노선 경유`;

    // Render Routes serving this specific platform
    const container = dom.stopRoutesList;
    container.innerHTML = '';

    currentRoutes.forEach(r => {
      const card = document.createElement('div');
      card.className = 'route-card';
      const arsTag = r.arsId ? `<span class="card-ars-tag highlight">ARS ${escapeHtml(r.arsId)}</span>` : '';
      const dirTag = r.direction ? `<span class="badge-dir">${escapeHtml(r.direction)}</span>` : '';
      card.innerHTML = `
        <div class="card-top">
          <span class="card-name">${escapeHtml(r.routeName)}</span>
          <div style="display:flex;gap:4px;align-items:center;">
            ${arsTag}
            ${dirTag}
            <span class="route-badge badge-${r.routeBadge || 'trunk'}">${r.routeType}</span>
          </div>
        </div>
        <div class="card-bottom">
          <span>클릭하여 노선 지도 보기</span>
          <span>→</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectRoute(r.routeName);
      });

      container.appendChild(card);
    });

    // Pan map to stop position
    const targetPoint = currentPlatform || (servingRoutes && servingRoutes[0]);
    if (targetPoint?.lat && targetPoint?.lng) {
      map.flyTo([targetPoint.lat, targetPoint.lng], 16, { animate: true, duration: 0.8 });

      // Add temporary highlight marker
      if (highlightMarker) map.removeLayer(highlightMarker);
      highlightMarker = L.circleMarker([targetPoint.lat, targetPoint.lng], {
        radius: 12,
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.6,
        weight: 3
      }).addTo(map);

      const dirStr = targetPoint.direction ? ` (${targetPoint.direction} 방면)` : '';
      const popupArs = currentArs ? `ARS: ${currentArs}${dirStr}` : 'ARS 미부여';
      const popupHtml = `
        <div style="min-width: 160px; text-align:center;">
          <strong style="font-size: 0.95rem;">${escapeHtml(stopName)}</strong><br>
          <span style="font-size: 0.8rem; color: #2563eb; font-weight: 600;">${popupArs}</span><br>
          <span style="font-size: 0.75rem; color: #64748b;">${currentRoutes.length}개 노선 경유</span>
          <div class="popup-path-actions" style="margin-top:8px; display:flex; gap:6px; justify-content:center;">
            <button class="btn-set-path start" onclick="window.setPathEndpoint('start', '${escapeHtml(stopName)}', '${escapeHtml(currentArs || '')}')">🚩 출발</button>
            <button class="btn-set-path end" onclick="window.setPathEndpoint('end', '${escapeHtml(stopName)}', '${escapeHtml(currentArs || '')}')">🏁 도착</button>
          </div>
        </div>
      `;
      highlightMarker.bindPopup(popupHtml).openPopup();
    }
  }

  // =========================================================================
  // GeoJSON Export
  // =========================================================================
  function exportCurrentRouteGeoJSON() {
    if (!currentRoute) {
      alert('내보낼 노선을 먼저 선택해 주세요.');
      return;
    }

    const coordinates = (routingMode === 'osrm' && currentRouteCoords && currentRouteCoords.length > 0)
      ? currentRouteCoords.map(p => [p.lng, p.lat])
      : currentRoute.points.map(p => [p.lng, p.lat]);
    const stopFeatures = currentRoute.points.map(p => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat]
      },
      properties: {
        seq: p.seq,
        name: p.name,
        arsId: p.arsId,
        stopId: p.stopId,
        type: p.type,
        direction: p.direction
      }
    }));

    const lineFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: {
        routeName: currentRoute.routeName,
        routeId: currentRoute.routeId,
        routeType: currentRoute.routeType,
        startStop: currentRoute.startStop,
        turnStop: currentRoute.turnStop,
        endStop: currentRoute.endStop,
        stopCount: currentRoute.stopCount,
        lengthKm: currentRoute.lengthKm
      }
    };

    const geojson = {
      type: 'FeatureCollection',
      name: `광주버스_${currentRoute.routeName}`,
      features: [lineFeature, ...stopFeatures]
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `광주버스_${currentRoute.routeName}_노선.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // Path Finding (길찾기) Implementation
  // =========================================================================
  function setSearchMode(mode) {
    searchMode = mode;
    if (dom.modeSearchBtn) dom.modeSearchBtn.classList.toggle('active', mode === 'search' || mode === 'route' || mode === 'stop');
    if (dom.modePathBtn) dom.modePathBtn.classList.toggle('active', mode === 'path');

    if (mode === 'path') {
      if (dom.routeSearchWrapper) dom.routeSearchWrapper.classList.add('hidden');
      if (dom.searchInputWrapper) dom.searchInputWrapper.classList.add('hidden');
      dom.pathSearchWrapper.classList.remove('hidden');
      closeSearchDropdown();

      // 노선 및 정류소 지도 레이어 가리기 (길찾기 경로와 겹치지 않도록 정리)
      routeLayerGroup.clearLayers();
      stopsLayerGroup.clearLayers();
      waypointsLayerGroup.clearLayers();
      if (highlightMarker) {
        map.removeLayer(highlightMarker);
        highlightMarker = null;
      }

      // 이전 길찾기 검색 결과가 있다면 즉시 복원
      if (lastPathSearchState.hasSearched && lastPathSearchState.results && lastPathSearchState.results.length > 0) {
        dom.pathStartInput.value = lastPathSearchState.startName;
        dom.pathEndInput.value = lastPathSearchState.endName;
        dom.clearStartBtn.style.display = 'flex';
        dom.clearEndBtn.style.display = 'flex';

        currentPathResults = lastPathSearchState.results;
        currentPathSort = lastPathSearchState.sort || 'direct';
        selectedPathIndex = lastPathSearchState.selectedIndex >= 0 ? lastPathSearchState.selectedIndex : 0;

        dom.summaryStartName.textContent = lastPathSearchState.startName;
        dom.summaryEndName.textContent = lastPathSearchState.endName;
        dom.pathResultsCount.textContent = `${currentPathResults.length}개 경로`;

        if (dom.sortDirectBtn) dom.sortDirectBtn.classList.toggle('active', currentPathSort === 'direct');
        if (dom.sortStopsBtn) dom.sortStopsBtn.classList.toggle('active', currentPathSort === 'stops');

        // 패널 전환: 길찾기 결과 패널 표출, 노선 관련 패널 숨김
        dom.panelRouteList.classList.add('hidden');
        dom.panelRouteDetail.classList.add('hidden');
        dom.panelStopDetail.classList.add('hidden');
        dom.panelPathResult.classList.remove('hidden');

        renderPathResultsList();
        selectAndDrawPath(selectedPathIndex);
      } else if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
        executePathSearch();
      } else {
        pathLayerGroup.clearLayers();
        dom.panelRouteDetail.classList.add('hidden');
        dom.panelStopDetail.classList.add('hidden');
        dom.panelPathResult.classList.add('hidden');
        dom.panelRouteList.classList.remove('hidden');
      }
    } else {
      if (dom.routeSearchWrapper) dom.routeSearchWrapper.classList.remove('hidden');
      if (dom.searchInputWrapper) dom.searchInputWrapper.classList.remove('hidden');
      dom.pathSearchWrapper.classList.add('hidden');
      updateSearchPlaceholder();
      closeSearchDropdown();

      // 길찾기 지도 레이어 및 결과 패널 숨기기
      if (pathLayerGroup) pathLayerGroup.clearLayers();
      dom.panelPathResult.classList.add('hidden');

      // 이전 노선/정류소 검색 결과 복원
      if (lastRouteSearchState.type === 'route' && lastRouteSearchState.routeName && routeData && routeData.routes[lastRouteSearchState.routeName]) {
        dom.routeSearchInput.value = lastRouteSearchState.inputVal || lastRouteSearchState.routeName;
        dom.clearSearchBtn.style.display = 'flex';
        selectRoute(lastRouteSearchState.routeName);
        if (lastRouteSearchState.direction && lastRouteSearchState.direction !== 'all') {
          if (lastRouteSearchState.direction === '상행') dom.tabDirUp.click();
          else if (lastRouteSearchState.direction === '하행') dom.tabDirDown.click();
        }
      } else if (lastRouteSearchState.type === 'stop' && lastRouteSearchState.stopName) {
        dom.routeSearchInput.value = lastRouteSearchState.inputVal || lastRouteSearchState.stopName;
        dom.clearSearchBtn.style.display = 'flex';
        selectStop(lastRouteSearchState.stopName, lastRouteSearchState.servingRoutes, lastRouteSearchState.targetArsId, lastRouteSearchState.platformInfo);
      } else {
        // 기본 전체 노선 목록 패널 복원
        dom.panelRouteDetail.classList.add('hidden');
        dom.panelStopDetail.classList.add('hidden');
        dom.panelRouteList.classList.remove('hidden');
        routeLayerGroup.clearLayers();
        stopsLayerGroup.clearLayers();
        waypointsLayerGroup.clearLayers();
      }
    }
    adjustMobileSidebarTop();
  }

  window.setPathEndpoint = function (type, stopName, arsId) {
    setSearchMode('path');
    const val = (arsId && String(arsId).trim())
      ? `${stopName} (${String(arsId).trim()})`
      : stopName;

    if (type === 'start') {
      dom.pathStartInput.value = val;
      dom.clearStartBtn.style.display = 'flex';
    } else {
      dom.pathEndInput.value = val;
      dom.clearEndBtn.style.display = 'flex';
    }
    if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
      executePathSearch();
    } else if (type === 'start') {
      dom.pathEndInput.focus();
    } else {
      dom.pathStartInput.focus();
    }
  };

  function handlePathAutocomplete(query, inputType) {
    activePathInputType = inputType;
    if (!query || !window.BusRouter) {
      closeSearchDropdown();
      return;
    }

    const matchedStops = window.BusRouter.searchStops(query, 15);
    if (matchedStops.length === 0) {
      closeSearchDropdown();
      return;
    }

    const dropdown = dom.searchResultsDropdown;
    dropdown.innerHTML = '';
    const fragment = document.createDocumentFragment();

    matchedStops.forEach(s => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      
      const arsBadge = s.arsId
        ? `<span class="badge-ars">ARS ${highlightMatch(s.arsId, query)}</span>`
        : `<span class="badge-ars" style="color:#94a3b8; background:#f8fafc;">ARS 미부여</span>`;
      
      const dirBadge = s.direction 
        ? `<span class="badge-dir">${escapeHtml(s.direction)} 방면</span>` 
        : '';

      const displayName = s.arsId ? `${s.name} (${s.arsId})` : s.name;

      item.innerHTML = `
        <div class="item-title">
          <span class="route-icon">🚏</span>
          <span class="route-name">${highlightMatch(s.name, query)}</span>
          ${arsBadge}
          ${dirBadge}
        </div>
        <div class="item-terminals">${s.routesCount}개 노선 경유 (${escapeHtml(s.routes.slice(0, 4).join(', '))}${s.routes.length > 4 ? '…' : ''})</div>
      `;

      item.addEventListener('click', () => {
        if (activePathInputType === 'start') {
          dom.pathStartInput.value = displayName;
          dom.clearStartBtn.style.display = 'flex';
        } else {
          dom.pathEndInput.value = displayName;
          dom.clearEndBtn.style.display = 'flex';
        }
        closeSearchDropdown();

        if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
          executePathSearch();
        } else if (activePathInputType === 'start') {
          dom.pathEndInput.focus();
        } else {
          dom.pathStartInput.focus();
        }
      });

      fragment.appendChild(item);
    });

    dropdown.appendChild(fragment);
    dropdown.classList.remove('hidden');
  }

  function executePathSearch() {
    closeSearchDropdown();
    const startName = dom.pathStartInput.value.trim();
    const endName = dom.pathEndInput.value.trim();

    if (!startName) {
      alert('출발 정류소명을 입력해주세요.');
      dom.pathStartInput.focus();
      return;
    }
    if (!endName) {
      alert('도착 정류소명을 입력해주세요.');
      dom.pathEndInput.focus();
      return;
    }

    if (!window.BusRouter) {
      alert('경로 검색 엔진이 아직 준비되지 않았습니다.');
      return;
    }

    const resolvedStart = window.BusRouter.resolveStopName ? window.BusRouter.resolveStopName(startName) : startName;
    const resolvedEnd = window.BusRouter.resolveStopName ? window.BusRouter.resolveStopName(endName) : endName;

    if (startName === endName) {
      alert('출발지와 도착지가 같습니다. 서로 다른 정류소를 선택해주세요.');
      return;
    }

    currentPathResults = window.BusRouter.findPaths(startName, endName, currentPathSort, 10);
    selectedPathIndex = currentPathResults.length > 0 ? 0 : -1;

    lastPathSearchState = {
      hasSearched: currentPathResults.length > 0,
      startName: startName,
      endName: endName,
      sort: currentPathSort,
      results: currentPathResults,
      selectedIndex: selectedPathIndex >= 0 ? selectedPathIndex : 0
    };

    // Show Path Panel, Hide others
    dom.panelRouteList.classList.add('hidden');
    dom.panelRouteDetail.classList.add('hidden');
    dom.panelStopDetail.classList.add('hidden');
    dom.panelPathResult.classList.remove('hidden');

    // Update Header
    dom.summaryStartName.textContent = startName;
    dom.summaryEndName.textContent = endName;
    dom.pathResultsCount.textContent = `${currentPathResults.length}개 경로`;

    renderPathResultsList();

    if (currentPathResults.length > 0) {
      selectAndDrawPath(0);
    } else {
      pathLayerGroup.clearLayers();
    }
  }

  function renderPathResultsList() {
    const container = dom.pathResultsList;
    container.innerHTML = '';

    if (!currentPathResults || currentPathResults.length === 0) {
      container.innerHTML = `
        <div class="path-empty-msg">
          <div class="empty-icon">🔍</div>
          <p><strong>직통 또는 1회 환승 경로를 찾지 못했습니다.</strong></p>
          <p style="margin-top:6px; font-size:0.8rem; color:#94a3b8;">출발지 또는 도착지 정류소명을 확인해주세요.</p>
        </div>
      `;
      return;
    }

    // Helper to render leg block with intermediate stops
    function renderLegItem(leg, lIdx, isFirstLeg, isLastLeg, pathIdx) {
      const intermediateStops = (leg.stops || []).slice(1, -1);
      const interCount = intermediateStops.length;
      const startIcon = isFirstLeg ? '🟢' : '🟠';
      const endIcon = isLastLeg ? '🔴' : '🟠';
      const startLabel = isFirstLeg ? '승차' : '환승 승차';
      const endLabel = isLastLeg ? '하차' : '환승 하차';

      const toggleButtonHtml = interCount > 0
        ? `<button class="btn-toggle-substops" data-leg="${lIdx}" data-count="${interCount}">경유 ${interCount}개 정류장 보기 ▼</button>`
        : `<span style="font-size:0.75rem; color:#94a3b8;">(다음 정류장 하차)</span>`;

      const substopsListHtml = interCount > 0
        ? `
          <div class="leg-substops-list hidden" id="substops-list-${pathIdx}-${lIdx}">
            ${intermediateStops.map(s => `
              <div class="substop-item">• ${escapeHtml(s.name)}${s.arsId ? ` <span style="color:#94a3b8; font-size:0.72rem;">(${escapeHtml(s.arsId)})</span>` : ''}</div>
            `).join('')}
          </div>
        `
        : '';

      return `
        <div class="leg-item">
          <div class="leg-main-row">
            <span class="leg-stop-span">${startIcon} <strong>${escapeHtml(leg.startStop.name)}</strong> ${startLabel}</span>
          </div>
          <div class="leg-sub-info">
            <span>${leg.stopCount}개 정류장 이동</span>
            ${toggleButtonHtml}
          </div>
          ${substopsListHtml}
          <div class="leg-main-row" style="margin-top:4px;">
            <span class="leg-stop-span">${endIcon} <strong>${escapeHtml(leg.endStop.name)}</strong> ${endLabel}</span>
          </div>
        </div>
      `;
    }

    currentPathResults.forEach((path, idx) => {
      const card = document.createElement('div');
      card.className = `path-card ${idx === selectedPathIndex ? 'active' : ''}`;
      card.dataset.index = idx;

      // Badges
      const routeBadgesHtml = path.legs.map((leg, lIdx) => {
        const badge = `<span class="path-route-badge" style="background:${leg.route.color};">${escapeHtml(leg.route.name)}</span>`;
        if (lIdx === 0 && path.legs.length > 1) {
          return `${badge} <span class="path-transfer-arrow">➔</span>`;
        }
        return badge;
      }).join(' ');

      const transferTag = path.transfers === 0 
        ? (path.walkDistance > 0 
            ? `<span class="path-transfer-tag direct" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">직통 (도보 ${path.walkDistance}m)</span>` 
            : `<span class="path-transfer-tag direct">직통</span>`)
        : `<span class="path-transfer-tag transfer">환승 1회</span>`;

      // Legs detail without time estimation
      let legsHtml = '';
      if (path.type === 'direct') {
        const leg = path.legs[0];
        const walkFromDist = path.walkFromDistance || (path.walkFromStop && !path.walkToStop ? path.walkDistance : 0);
        const walkToDist = path.walkToDistance || (!path.walkFromStop && path.walkToStop ? path.walkDistance : 0);

        const walkFromNotice = (path.walkFromStop && walkFromDist > 0)
          ? `<div class="walk-transfer-row" style="margin-bottom:6px; background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8;">🚶 ${escapeHtml(path.walkFromStop.name)}${path.walkFromStop.arsId ? `(${escapeHtml(path.walkFromStop.arsId)})` : ''}에서 도보 약 ${walkFromDist}m 이동 ➔ ${escapeHtml(leg.startStop.name)} 승차</div>`
          : '';
        const walkToNotice = (path.walkToStop && walkToDist > 0)
          ? `<div class="walk-transfer-row" style="margin-top:6px; background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8;">🚶 ${escapeHtml(leg.endStop.name)} 하차 후 도보 약 ${walkToDist}m ➔ ${escapeHtml(path.walkToStop.name)}${path.walkToStop.arsId ? `(${escapeHtml(path.walkToStop.arsId)})` : ''} 도착</div>`
          : '';

        legsHtml = `
          <div class="path-legs-detail">
            ${walkFromNotice}
            ${renderLegItem(leg, 0, true, true, idx)}
            ${walkToNotice}
          </div>
        `;
      } else {
        const leg1 = path.legs[0];
        const leg2 = path.legs[1];
        const walkNotice = path.walkDistance > 10 
          ? `<div class="walk-transfer-row">🚶 도보 약 ${path.walkDistance}m 이동 환승</div>`
          : `<div class="walk-transfer-row" style="background:#f0fdf4; border-color:#bbf7d0; color:#166534;">🔄 동일 정류장 환승</div>`;

        legsHtml = `
          <div class="path-legs-detail">
            ${renderLegItem(leg1, 0, true, false, idx)}
            ${walkNotice}
            ${renderLegItem(leg2, 1, false, true, idx)}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="path-card-top">
          <div class="path-routes-preview">${routeBadgesHtml}</div>
          ${transferTag}
        </div>
        <div class="path-card-stats">
          <span class="path-total-stops">${path.totalStops}개 정류장</span>
          <span style="font-size:0.8rem; color:var(--text-muted);">이동</span>
        </div>
        ${legsHtml}
      `;

      // Card Click: Select and draw on map (or toggle intermediate stops)
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-toggle-substops');
        if (btn) {
          e.stopPropagation();
          const legIdx = btn.dataset.leg;
          const count = btn.dataset.count;
          const listElem = card.querySelector(`#substops-list-${idx}-${legIdx}`);
          if (listElem) {
            const isHidden = listElem.classList.toggle('hidden');
            btn.textContent = isHidden ? `경유 ${count}개 정류장 보기 ▼` : `경유 정류장 닫기 ▲`;
          }
          return;
        }
        selectAndDrawPath(idx);
      });

      container.appendChild(card);
    });
  }

  function selectAndDrawPath(index) {
    if (!currentPathResults || !currentPathResults[index]) return;
    selectedPathIndex = index;
    if (lastPathSearchState) lastPathSearchState.selectedIndex = index;

    // Update active class on cards
    document.querySelectorAll('.path-card').forEach((c, idx) => {
      c.classList.toggle('active', idx === index);
    });

    const path = currentPathResults[index];

    // Clear all other layers
    routeLayerGroup.clearLayers();
    stopsLayerGroup.clearLayers();
    waypointsLayerGroup.clearLayers();
    pathLayerGroup.clearLayers();
    if (highlightMarker) {
      map.removeLayer(highlightMarker);
      highlightMarker = null;
    }

    const allBounds = [];

    // Draw each leg
    path.legs.forEach((leg) => {
      const fullRoute = routeData.routes[leg.route.name];
      const pts = leg.points;
      let legCoords = pts.map(p => [p.lat, p.lng]);

      // Determine direction of this transit leg
      const legDirection = leg.startStop.direction || (leg.points && leg.points[0]?.direction) || '';
      let targetTrajectory = null;

      if (fullRoute) {
        if (legDirection === '상행' && fullRoute.upTrajectory && fullRoute.upTrajectory.length > 0) {
          targetTrajectory = fullRoute.upTrajectory;
        } else if (legDirection === '하행' && fullRoute.downTrajectory && fullRoute.downTrajectory.length > 0) {
          targetTrajectory = fullRoute.downTrajectory;
        } else if (fullRoute.trajectory && fullRoute.trajectory.length > 0) {
          targetTrajectory = fullRoute.trajectory;
        }
      }

      // If official trajectory exists, extract road sub-trajectory for this specific direction
      if (targetTrajectory && targetTrajectory.length > 0) {
        const traj = targetTrajectory;
        let startIdx = -1, endIdx = -1;
        let startMinD = Infinity, endMinD = Infinity;

        // 1. Find nearest coordinate for departure stop
        traj.forEach((coord, tIdx) => {
          const d1 = (coord[0] - leg.startStop.lat)**2 + (coord[1] - leg.startStop.lng)**2;
          if (d1 < startMinD) {
            startMinD = d1;
            startIdx = tIdx;
          }
        });

        // 2. Find nearest coordinate for arrival stop (prioritize indices after startIdx)
        traj.forEach((coord, tIdx) => {
          if (tIdx > startIdx) {
            const d2 = (coord[0] - leg.endStop.lat)**2 + (coord[1] - leg.endStop.lng)**2;
            if (d2 < endMinD) {
              endMinD = d2;
              endIdx = tIdx;
            }
          }
        });

        // Fallback: If not found after startIdx, search entire array
        if (endIdx <= startIdx) {
          endMinD = Infinity;
          traj.forEach((coord, tIdx) => {
            const d2 = (coord[0] - leg.endStop.lat)**2 + (coord[1] - leg.endStop.lng)**2;
            if (d2 < endMinD) {
              endMinD = d2;
              endIdx = tIdx;
            }
          });
        }

        if (startIdx >= 0 && endIdx >= 0 && startIdx < endIdx) {
          const subTraj = traj.slice(startIdx, endIdx + 1);
          legCoords = [
            [leg.startStop.lat, leg.startStop.lng],
            ...subTraj,
            [leg.endStop.lat, leg.endStop.lng]
          ];
        }
      }

      // Draw casing & route polyline
      L.polyline(legCoords, {
        color: '#ffffff',
        weight: 9,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(pathLayerGroup);

      L.polyline(legCoords, {
        color: leg.route.color,
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(pathLayerGroup);

      legCoords.forEach(c => allBounds.push(c));

      // Draw Intermediate Stops (smaller dots)
      leg.stops.forEach((s, sIdx) => {
        if (sIdx === 0 || sIdx === leg.stops.length - 1) return;

        const circle = L.circleMarker([s.lat, s.lng], {
          radius: 4.5,
          color: '#ffffff',
          weight: 1.5,
          fillColor: leg.route.color,
          fillOpacity: 0.9
        }).addTo(pathLayerGroup);

        circle.bindTooltip(`<strong>${escapeHtml(s.name)}</strong>${s.arsId ? ` (${s.arsId})` : ''}`, {
          direction: 'top',
          offset: [0, -6]
        });
      });
    });

    // Draw Walking Leg if 1-Transfer
    if (path.type === 'transfer' && path.legs.length === 2) {
      const leg1 = path.legs[0];
      const leg2 = path.legs[1];
      const walkLine = [
        [leg1.endStop.lat, leg1.endStop.lng],
        [leg2.startStop.lat, leg2.startStop.lng]
      ];

      L.polyline(walkLine, {
        color: '#f59e0b',
        weight: 4,
        dashArray: '6, 8',
        opacity: 0.95
      }).addTo(pathLayerGroup);

      // Transfer Pin Marker
      const transIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker transfer">환승</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const transMarker = L.marker([leg1.endStop.lat, leg1.endStop.lng], { icon: transIcon }).addTo(pathLayerGroup);
      transMarker.bindPopup(`
        <div style="min-width:130px; text-align:center;">
          <strong style="color:#d97706;">환승 지점</strong><br>
          <span>${escapeHtml(leg1.endStop.name)} 하차 ➔ ${escapeHtml(leg2.startStop.name)} 승차</span><br>
          <span style="font-size:0.75rem; color:#64748b;">${path.walkDistance > 10 ? `도보 약 ${path.walkDistance}m` : '동일 정류장'}</span>
        </div>
      `);
    }

    // 1. Departure / Boarding Marker
    const startLeg = path.legs[0];
    const hasDifferentStart = Boolean(
      path.walkFromStop && (
        path.walkFromStop.lat !== startLeg.startStop.lat ||
        path.walkFromStop.lng !== startLeg.startStop.lng ||
        (path.walkFromStop.arsId && startLeg.startStop.arsId && String(path.walkFromStop.arsId).trim() !== String(startLeg.startStop.arsId).trim())
      )
    );

    if (!hasDifferentStart) {
      // 출발 위치와 승차 정류소가 같은 경우: 승차로 표출
      const boardIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker board">승차</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const boardMarker = L.marker([startLeg.startStop.lat, startLeg.startStop.lng], { icon: boardIcon }).addTo(pathLayerGroup);
      boardMarker.bindPopup(`<strong>승차: ${escapeHtml(startLeg.startStop.name)}</strong><br>탑승 노선: ${escapeHtml(startLeg.route.name)}`).openPopup();
    } else {
      // 출발 위치와 승차 정류소가 다른 경우: 둘 다 표출
      const startIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker start">출발</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const startMarker = L.marker([path.walkFromStop.lat, path.walkFromStop.lng], { icon: startIcon }).addTo(pathLayerGroup);
      startMarker.bindPopup(`<strong>출발: ${escapeHtml(path.walkFromStop.name)}</strong><br>승차 정류소(${escapeHtml(startLeg.startStop.name)})로 도보 약 ${path.walkFromDistance || path.walkDistance}m 이동`);

      const startWalkLine = [
        [path.walkFromStop.lat, path.walkFromStop.lng],
        [startLeg.startStop.lat, startLeg.startStop.lng]
      ];
      L.polyline(startWalkLine, {
        color: '#f59e0b',
        weight: 4,
        dashArray: '6, 8',
        opacity: 0.95
      }).addTo(pathLayerGroup);
      startWalkLine.forEach(c => allBounds.push(c));

      const boardIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker board">승차</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const boardMarker = L.marker([startLeg.startStop.lat, startLeg.startStop.lng], { icon: boardIcon }).addTo(pathLayerGroup);
      boardMarker.bindPopup(`<strong>승차: ${escapeHtml(startLeg.startStop.name)}</strong><br>탑승 노선: ${escapeHtml(startLeg.route.name)}`).openPopup();
    }

    // 2. Alighting / Arrival Marker
    const lastLeg = path.legs[path.legs.length - 1];
    const hasDifferentEnd = Boolean(
      path.walkToStop && (
        path.walkToStop.lat !== lastLeg.endStop.lat ||
        path.walkToStop.lng !== lastLeg.endStop.lng ||
        (path.walkToStop.arsId && lastLeg.endStop.arsId && String(path.walkToStop.arsId).trim() !== String(lastLeg.endStop.arsId).trim())
      )
    );

    if (hasDifferentEnd) {
      // 도착정류소와 하차 정류소가 다른 경우: 둘 다 표출 (하차 & 도착)
      const walkLine = [
        [lastLeg.endStop.lat, lastLeg.endStop.lng],
        [path.walkToStop.lat, path.walkToStop.lng]
      ];

      L.polyline(walkLine, {
        color: '#f59e0b',
        weight: 4,
        dashArray: '6, 8',
        opacity: 0.95
      }).addTo(pathLayerGroup);

      walkLine.forEach(c => allBounds.push(c));

      // 하차 정류소 Marker
      const alightIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker alight">하차</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const walkToMeters = path.walkToDistance || path.walkDistance;
      L.marker([lastLeg.endStop.lat, lastLeg.endStop.lng], { icon: alightIcon })
        .bindPopup(`<strong>하차: ${escapeHtml(lastLeg.endStop.name)}</strong><br>하차 노선: ${escapeHtml(lastLeg.route.name)}${walkToMeters > 0 ? `<br>도보 약 ${walkToMeters}m 이동 ➔ ${escapeHtml(path.walkToStop.name)} 도착` : ''}`)
        .addTo(pathLayerGroup);

      // 도착 정류소 Marker
      const endIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker end">도착</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const endMarker = L.marker([path.walkToStop.lat, path.walkToStop.lng], { icon: endIcon }).addTo(pathLayerGroup);
      endMarker.bindPopup(`<strong>도착: ${escapeHtml(path.walkToStop.name)}</strong><br>도보 약 ${walkToMeters}m 이동 후 최종 목적지 도착`);
    } else {
      // 도착정류소와 하차 정류소가 같은 경우: 하차로만 표출
      const alightIcon = L.divIcon({
        className: '',
        html: `<div class="path-pin-marker alight">하차</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const alightMarker = L.marker([lastLeg.endStop.lat, lastLeg.endStop.lng], { icon: alightIcon }).addTo(pathLayerGroup);
      alightMarker.bindPopup(`<strong>하차: ${escapeHtml(lastLeg.endStop.name)}</strong><br>하차 노선: ${escapeHtml(lastLeg.route.name)}`);
    }

    // Fit Bounds (offset left padding so markers are not covered by sidebar)
    if (allBounds.length > 0) {
      const isMobile = window.innerWidth <= 768;
      const padLeft = isMobile ? 50 : 430;
      map.fitBounds(L.latLngBounds(allBounds), {
        paddingTopLeft: [padLeft, 70],
        paddingBottomRight: [70, 70],
        maxZoom: 15,
        animate: true,
        duration: 0.8
      });
    }
  }

  // =========================================================================
  // Bind Event Listeners
  // =========================================================================
  function bindEvents() {
    // Search input (Route / Stop mode)
    dom.routeSearchInput.addEventListener('input', handleSearchInput);
    // 검색어 입력을 위한 마우스 클릭/포커스 시 전체 노선 목록이 표출되지 않도록 focus 리스너 제거
    dom.routeSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = dom.routeSearchInput.value.trim();
        if (val) searchUnified(val);
        else closeSearchDropdown();
      }
    });

    // Clear search button
    dom.clearSearchBtn.addEventListener('click', () => {
      dom.routeSearchInput.value = '';
      dom.clearSearchBtn.style.display = 'none';
      closeSearchDropdown();
      dom.routeSearchInput.focus();
    });

    // Path dual inputs
    dom.pathStartInput.addEventListener('input', (e) => {
      dom.clearStartBtn.style.display = e.target.value ? 'flex' : 'none';
      handlePathAutocomplete(e.target.value.trim(), 'start');
    });
    dom.pathStartInput.addEventListener('focus', (e) => {
      handlePathAutocomplete(e.target.value.trim(), 'start');
    });
    dom.clearStartBtn.addEventListener('click', () => {
      dom.pathStartInput.value = '';
      dom.clearStartBtn.style.display = 'none';
      lastPathSearchState.hasSearched = false;
      closeSearchDropdown();
      dom.pathStartInput.focus();
    });
    dom.pathStartInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (dom.pathEndInput.value.trim()) executePathSearch();
        else dom.pathEndInput.focus();
      }
    });

    dom.pathEndInput.addEventListener('input', (e) => {
      dom.clearEndBtn.style.display = e.target.value ? 'flex' : 'none';
      handlePathAutocomplete(e.target.value.trim(), 'end');
    });
    dom.pathEndInput.addEventListener('focus', (e) => {
      handlePathAutocomplete(e.target.value.trim(), 'end');
    });
    dom.clearEndBtn.addEventListener('click', () => {
      dom.pathEndInput.value = '';
      dom.clearEndBtn.style.display = 'none';
      lastPathSearchState.hasSearched = false;
      closeSearchDropdown();
      dom.pathEndInput.focus();
    });
    dom.pathEndInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executePathSearch();
      }
    });

    // Swap button
    dom.pathSwapBtn.addEventListener('click', () => {
      const temp = dom.pathStartInput.value;
      dom.pathStartInput.value = dom.pathEndInput.value;
      dom.pathEndInput.value = temp;
      dom.clearStartBtn.style.display = dom.pathStartInput.value ? 'flex' : 'none';
      dom.clearEndBtn.style.display = dom.pathEndInput.value ? 'flex' : 'none';
      if (dom.pathStartInput.value.trim() && dom.pathEndInput.value.trim()) {
        executePathSearch();
      }
    });

    // Path submit button
    dom.pathSearchSubmitBtn.addEventListener('click', executePathSearch);

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      const isInside = (dom.routeSearchInput && dom.routeSearchInput.contains(e.target)) ||
                       (dom.pathStartInput && dom.pathStartInput.contains(e.target)) ||
                       (dom.pathEndInput && dom.pathEndInput.contains(e.target)) ||
                       (dom.searchResultsDropdown && dom.searchResultsDropdown.contains(e.target));
      if (!isInside) {
        closeSearchDropdown();
      }
    });

    // Search Mode switches (1. 노선 · 정류소 / 2. 길찾기)
    if (dom.btnRouteSearchSubmit) {
      dom.btnRouteSearchSubmit.addEventListener('click', () => {
        const val = dom.routeSearchInput.value.trim();
        if (val) {
          searchUnified(val);
        } else {
          closeSearchDropdown();
        }
      });
    }
    if (dom.btnGoToPath) dom.btnGoToPath.addEventListener('click', () => setSearchMode('path'));
    if (dom.btnBackToRouteSearch) dom.btnBackToRouteSearch.addEventListener('click', () => setSearchMode('search'));
    if (dom.modeSearchBtn) dom.modeSearchBtn.addEventListener('click', () => setSearchMode('search'));
    if (dom.modeRouteBtn) dom.modeRouteBtn.addEventListener('click', () => setSearchMode('search'));
    if (dom.modeStopBtn) dom.modeStopBtn.addEventListener('click', () => setSearchMode('search'));
    if (dom.modePathBtn) dom.modePathBtn.addEventListener('click', () => setSearchMode('path'));

    // Path sorting tabs (직통 우선 vs 최소 정류장)
    if (dom.sortDirectBtn) {
      dom.sortDirectBtn.addEventListener('click', () => {
        dom.sortDirectBtn.classList.add('active');
        if (dom.sortStopsBtn) dom.sortStopsBtn.classList.remove('active');
        currentPathSort = 'direct';
        executePathSearch();
      });
    }

    if (dom.sortStopsBtn) {
      dom.sortStopsBtn.addEventListener('click', () => {
        dom.sortStopsBtn.classList.add('active');
        if (dom.sortDirectBtn) dom.sortDirectBtn.classList.remove('active');
        currentPathSort = 'stops';
        executePathSearch();
      });
    }

    // Back from path panel
    dom.btnBackFromPath.addEventListener('click', () => {
      dom.panelPathResult.classList.add('hidden');
      dom.panelRouteList.classList.remove('hidden');
      pathLayerGroup.clearLayers();
      lastPathSearchState.hasSearched = false;
    });

    // Quick chips (if present)
    if (dom.quickRoutes) {
      dom.quickRoutes.addEventListener('click', (e) => {
        const chip = e.target.closest('.quick-chip');
        if (chip && chip.dataset.route) {
          selectRoute(chip.dataset.route);
        }
      });
    }

    // Category filter chips
    document.querySelectorAll('.cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        renderRouteCardList();
      });
    });

    // Back Buttons
    dom.btnBackToRouteList.addEventListener('click', () => {
      dom.panelRouteDetail.classList.add('hidden');
      dom.panelRouteList.classList.remove('hidden');
      if (dom.mobileRouteSheetBar) dom.mobileRouteSheetBar.classList.add('hidden');
      lastRouteSearchState = { type: 'none', inputVal: '' };
      routeLayerGroup.clearLayers();
      stopsLayerGroup.clearLayers();
      waypointsLayerGroup.clearLayers();
    });

    dom.btnBackFromStop.addEventListener('click', () => {
      dom.panelStopDetail.classList.add('hidden');
      dom.panelRouteList.classList.remove('hidden');
      if (highlightMarker) {
        map.removeLayer(highlightMarker);
        highlightMarker = null;
      }
      lastRouteSearchState = { type: 'none', inputVal: '' };
    });

    // Direction Tabs
    dom.tabDirAll.addEventListener('click', () => {
      setActiveDirTab(dom.tabDirAll, 'all');
    });
    dom.tabDirUp.addEventListener('click', () => {
      setActiveDirTab(dom.tabDirUp, '상행');
    });
    dom.tabDirDown.addEventListener('click', () => {
      setActiveDirTab(dom.tabDirDown, '하행');
    });

    function setActiveDirTab(tabBtn, dir) {
      document.querySelectorAll('.dir-tab').forEach(t => t.classList.remove('active'));
      tabBtn.classList.add('active');
      currentDirection = dir;
      if (lastRouteSearchState.type === 'route') {
        lastRouteSearchState.direction = dir;
      }
      if (currentRoute) {
        drawRouteOnMap(currentRoute, currentDirection);
        renderStopTimeline(currentRoute, currentDirection, dom.stopFilterInput.value);
      }
    }

    // Stop filter within route
    dom.stopFilterInput.addEventListener('input', (e) => {
      if (currentRoute) {
        renderStopTimeline(currentRoute, currentDirection, e.target.value);
      }
    });

    // Map Settings Menu Toggle
    dom.layerMenuToggleBtn.addEventListener('click', () => {
      dom.mapSettingsMenu.classList.toggle('hidden');
    });
    dom.closeSettingsBtn.addEventListener('click', () => {
      dom.mapSettingsMenu.classList.add('hidden');
    });

    // Tile options click
    document.querySelectorAll('.tile-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        setTileLayer(btn.dataset.tile);
      });
    });

    // Checkbox controls
    dom.chkShowStops.addEventListener('change', (e) => {
      showStops = e.target.checked;
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });
    dom.chkShowWaypoints.addEventListener('change', (e) => {
      showWaypoints = e.target.checked;
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });
    dom.chkShowLabels.addEventListener('change', (e) => {
      showLabels = e.target.checked;
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });

    // GeoJSON Export
    dom.btnExportGeoJSON.addEventListener('click', exportCurrentRouteGeoJSON);

    // Sidebar Mobile Toggle
    dom.sidebarToggleBtn.addEventListener('click', () => {
      const isClosed = dom.sidebar.classList.toggle('closed');
      if (isClosed && currentRoute && window.innerWidth <= 768 && dom.mobileRouteSheetBar) {
        dom.mobileRouteSheetBar.classList.remove('hidden');
      } else if (!isClosed && dom.mobileRouteSheetBar) {
        dom.mobileRouteSheetBar.classList.add('hidden');
      }
    });

    // Mobile Route Sheet Bar Click: Open Sidebar Detail
    if (dom.mobileRouteSheetBar) {
      dom.mobileRouteSheetBar.addEventListener('click', () => {
        dom.sidebar.classList.remove('closed');
        dom.mobileRouteSheetBar.classList.add('hidden');
      });
    }

    // Fold & View Map Buttons inside panels
    [dom.btnFoldRouteDetailMobile, dom.btnFoldStopDetailMobile, dom.btnFoldPathDetailMobile].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          dom.sidebar.classList.add('closed');
          if (currentRoute && dom.mobileRouteSheetBar && window.innerWidth <= 768) {
            dom.mobileRouteSheetBar.classList.remove('hidden');
          }
        });
      }
    });

    // Window resize handler for mobile responsiveness
    window.addEventListener('resize', updateSearchPlaceholder);

    // Map Floating Controls
    dom.btnZoomIn.addEventListener('click', () => map.zoomIn());
    dom.btnZoomOut.addEventListener('click', () => map.zoomOut());
    dom.btnResetGwangju.addEventListener('click', () => {
      map.flyTo([35.1595, 126.8526], 12, { animate: true, duration: 0.8 });
    });
    dom.btnFitRoute.addEventListener('click', () => {
      if (currentRoute) drawRouteOnMap(currentRoute, currentDirection);
    });
  }

  // =========================================================================
  // Utility Functions
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
