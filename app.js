/**
 * 광주광역시 시내버스 노선·정류장 검색 웹 애플리케이션 (신규 113개 노선 & BIS 공식 궤적)
 * - bus.gwangju.go.kr 실제 도로 궤적(Vertex) 100% 매칭
 * - 길찾기 기능 제외 경량화 고속 버전
 */

(function() {
  'use strict';

  // State Management
  const state = {
    map: null,
    tileLayers: {},
    currentTile: 'osm',
    data: null,            // window.BUS_ROUTES_DATA
    activeRouteName: null,
    activeDirection: 'all', // 'all', '상행', '하행'
    activeCategory: 'all',
    
    // Layers
    routeLineLayer: null,
    stopsLayer: null,
    waypointsLayer: null,
    highlightMarker: null,

    // Settings
    showStops: true,
    showWaypoints: true,
    showLabels: false,

    // UI elements
    sidebarOpen: true
  };

  // Colors for route types
  const ROUTE_COLORS = {
    '급행': '#DC2626',
    '간선': '#2563EB',
    '지선': '#16A34A',
    '순환': '#9333EA',
    '맞춤': '#EA580C',
    '기념/특화': '#2563EB'
  };

  // 1. Initialize Map
  function initMap() {
    // Center at Gwangju City Hall
    const gwangjuCenter = [35.1595, 126.8526];
    state.map = L.map('map', {
      center: gwangjuCenter,
      zoom: 12,
      zoomControl: false
    });

    // Tile Layers
    state.tileLayers.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    });

    state.tileLayers['carto-light'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '© CartoDB, © OpenStreetMap'
    });

    state.tileLayers['carto-dark'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '© CartoDB, © OpenStreetMap'
    });

    state.tileLayers.humanitarian = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors, HOT'
    });

    state.tileLayers['osm'].addTo(state.map);

    // Layer Groups
    state.routeLineLayer = L.featureGroup().addTo(state.map);
    state.stopsLayer = L.featureGroup().addTo(state.map);
    state.waypointsLayer = L.featureGroup().addTo(state.map);
  }

  // 2. Load Data
  function loadData() {
    if (window.BUS_ROUTES_DATA) {
      state.data = window.BUS_ROUTES_DATA;
      console.log(`[Data Loaded] ${state.data.totalRoutes} routes, ${state.data.totalStops} stops.`);
      renderRouteList();
      initEvents();
    } else {
      console.error('BUS_ROUTES_DATA not found. Retrying in 200ms...');
      setTimeout(loadData, 200);
    }
  }

  // 3. Render Route Cards in Sidebar
  function renderRouteList() {
    const container = document.getElementById('routeCardList');
    if (!container || !state.data) return;

    container.innerHTML = '';
    let count = 0;
    // Iterate in exact routeList order (from 광주시내버스_노선리스트.xlsx)
    const listToIterate = state.data.routeList || Object.keys(state.data.routes);
    for (const name of listToIterate) {
      const r = state.data.routes[name];
      if (!r) continue;

      count++;
      const card = document.createElement('div');
      card.className = 'route-card';

      card.innerHTML = `
        <div class="route-card-header">
          <span class="route-card-name">${r.routeName}</span>
        </div>
        <div class="route-card-endpoints">
          <span class="endpoint-tag">${r.startStop}</span>
          <span>⇄</span>
          <span class="endpoint-tag">${r.endStop || r.turnStop}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        selectRoute(r.routeName);
      });

      container.appendChild(card);
    }

    const badge = document.getElementById('totalRoutesBadge');
    if (badge) badge.textContent = `${count}개 노선`;
  }

  // 4. Select and Display a Route
  function selectRoute(routeName, autoFit = true) {
    if (!state.data || !state.data.routes[routeName]) return;

    state.activeRouteName = routeName;
    const route = state.data.routes[routeName];
    const color = ROUTE_COLORS[route.routeType] || '#2563EB';

    // Switch sidebar panels
    document.getElementById('panelRouteList').classList.add('hidden');
    const detailPanel = document.getElementById('panelRouteDetail');
    detailPanel.classList.remove('hidden');

    // Make sure sidebar is open when selecting a route so user sees stops list
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('closed');
      state.sidebarOpen = true;
    }

    // Populate detail header & stats
    const badgeEl = document.getElementById('routeDetailBadge');
    if (badgeEl) badgeEl.remove();
    document.getElementById('routeDetailName').textContent = route.routeName;

    document.getElementById('statStartName').textContent = route.startStop;
    document.getElementById('statTurnName').textContent = route.turnStop || '-';
    document.getElementById('statEndName').textContent = route.endStop || '-';
    
    document.getElementById('statStopsCount').textContent = `${route.stopCount}개`;
    document.getElementById('statWaypointsCount').textContent = `${route.intersectionCount}개`;
    document.getElementById('statLength').textContent = `${route.lengthKm} km`;
    document.getElementById('statVertexCount').textContent = `${route.vertexCount.toLocaleString()} pt`;

    // Reset Direction to 'all'
    state.activeDirection = 'all';
    updateDirectionTabs();

    // Render Map Polyline & Markers
    renderRouteOnMap(route, autoFit);

    // Render Timeline
    renderTimeline(route);

    // Hide floating bottom bar while sidebar sheet is open
    const sheet = document.getElementById('mobileRouteSheetBar');
    if (sheet) sheet.classList.add('hidden');
  }

  // 5. Render Route Trajectory on Leaflet
  function renderRouteOnMap(route, autoFit = true) {
    state.routeLineLayer.clearLayers();
    state.stopsLayer.clearLayers();
    state.waypointsLayer.clearLayers();
    if (state.highlightMarker) {
      state.map.removeLayer(state.highlightMarker);
      state.highlightMarker = null;
    }

    const color = ROUTE_COLORS[route.routeType] || '#2563EB';

    // 1) Actual Road Trajectory Polyline
    let coords = [];
    if (state.activeDirection === '상행') {
      coords = route.upTrajectory && route.upTrajectory.length > 0 ? route.upTrajectory : route.trajectory;
    } else if (state.activeDirection === '하행') {
      coords = route.downTrajectory && route.downTrajectory.length > 0 ? route.downTrajectory : route.trajectory;
    } else {
      coords = route.trajectory;
    }

    if (coords && coords.length > 0) {
      // Glow border for premium aesthetic
      L.polyline(coords, {
        color: '#FFFFFF',
        weight: 8,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.routeLineLayer);

      // Main line
      const mainPolyline = L.polyline(coords, {
        color: color,
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.routeLineLayer);

      if (autoFit && coords.length > 1) {
        state.map.fitBounds(mainPolyline.getBounds(), { padding: [50, 50], maxZoom: 15 });
      }
    }

    // 2) Stop Markers
    if (state.showStops && route.points) {
      route.points.forEach((pt, index) => {
        if (!['정류소', '기점', '회차지', '종점'].includes(pt.type)) return;
        if (state.activeDirection !== 'all' && pt.direction !== state.activeDirection) return;

        let markerColor = '#2563EB';
        if (pt.type === '기점') markerColor = '#10B981';
        else if (pt.type === '회차지' || pt.type === '회차') markerColor = '#F59E0B';
        else if (pt.type === '종점') markerColor = '#EF4444';

        const isTerminal = ['기점', '회차지', '종점', '회차'].includes(pt.type);
        const iconSize = isTerminal ? [18, 18] : [14, 14];
        const iconAnchor = isTerminal ? [9, 9] : [7, 7];
        const innerSize = isTerminal ? '18px' : '14px';
        const borderWidth = isTerminal ? '3.5px' : '3px';

        // 정류소 마커: 기점/종점/회차지는 강조형 원형 마커, 일반 정류소는 심플 도트 마커
        const customIcon = L.divIcon({
          className: 'custom-bus-stop-icon',
          html: `<div style="
            background: #FFFFFF;
            border: ${borderWidth} solid ${markerColor};
            width: ${innerSize};
            height: ${innerSize};
            border-radius: 50%;
            box-shadow: 0 2px 6px rgba(0,0,0,0.35);
            box-sizing: border-box;
            display: flex;
            align-items: center;
            justify-content: center;
          ">${isTerminal ? `<div style="width: 5px; height: 5px; border-radius: 50%; background: ${markerColor};"></div>` : ''}</div>`,
          iconSize: iconSize,
          iconAnchor: iconAnchor
        });

        const marker = L.marker([pt.lat, pt.lng], { icon: customIcon });

        // 정류소 번호 (ARS 번호 우선, 없을 경우 stopId)
        const stopNum = pt.arsId || (pt.stopId ? pt.stopId : '');
        const numText = stopNum ? ` (${stopNum})` : '';

        // 툴팁 내용 및 방향 결정
        let tooltipHtml = '';
        let badgeClass = '';
        let tooltipDirection = 'top';
        let tooltipOffset = [0, -10];

        if (pt.type === '기점') {
          tooltipHtml = `<span class="term-tag tag-start">기점</span> <b>${pt.name}</b><span class="term-num">${numText}</span>`;
          badgeClass = 'term-tooltip-start';
          tooltipDirection = 'top';
          tooltipOffset = [0, -10];
        } else if (pt.type === '회차지' || pt.type === '회차') {
          tooltipHtml = `<span class="term-tag tag-turn">회차</span> <b>${pt.name}</b><span class="term-num">${numText}</span>`;
          badgeClass = 'term-tooltip-turn';
          tooltipDirection = 'top';
          tooltipOffset = [0, -10];
        } else if (pt.type === '종점') {
          tooltipHtml = `<span class="term-tag tag-end">종점</span> <b>${pt.name}</b><span class="term-num">${numText}</span>`;
          badgeClass = 'term-tooltip-end';
          tooltipDirection = 'bottom';
          tooltipOffset = [0, 10];
        } else {
          tooltipHtml = `<b>${pt.name}</b>${numText}`;
          tooltipDirection = 'top';
          tooltipOffset = [0, -8];
        }

        // 주요 정류소 판별
        const isMajorStop = Boolean(
          isTerminal || 
          (state.data && state.data.stopIndex && state.data.stopIndex[pt.name] && state.data.stopIndex[pt.name].length >= 3) ||
          (route.points.length <= 25) ||
          (index % 4 === 0) ||
          (state.map && state.map.getZoom() >= 14)
        );

        // [요구사항] 기점, 종점, 회차 정류소는 노선 클릭 시 명칭과 번호를 기본 표출 (항상 표시)
        // 그 외 주요 정류소는 '주요 정류소명 항상 표시' 설정 켰을 때 영구 표시
        const isPermanent = Boolean(isTerminal || (state.showLabels && isMajorStop));

        marker.bindTooltip(tooltipHtml, {
          direction: tooltipDirection,
          offset: tooltipOffset,
          className: isTerminal 
            ? `stop-hover-tooltip stop-label-permanent stop-label-terminal ${badgeClass}` 
            : (isPermanent ? 'stop-hover-tooltip stop-label-permanent' : 'stop-hover-tooltip'),
          permanent: isPermanent
        });

        // Popup with station info and passing routes
        const popupContent = createStopPopupContent(pt);
        marker.bindPopup(popupContent, { maxWidth: 300 });

        marker.on('click', () => {
          highlightTimelineItem(pt.seq);
        });

        marker.addTo(state.stopsLayer);
      });
    }

    // 3) Intersection/Waypoint Markers
    if (state.showWaypoints && route.points) {
      route.points.forEach((pt) => {
        if (pt.type !== '교차로') return;
        if (state.activeDirection !== 'all' && pt.direction !== state.activeDirection) return;

        const wpIcon = L.divIcon({
          className: 'custom-wp-icon',
          html: `<div style="
            width: 8px;
            height: 8px;
            background: #94A3B8;
            border: 1.5px solid #fff;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          "></div>`,
          iconSize: [8, 8],
          iconAnchor: [4, 4]
        });

        const wpMarker = L.marker([pt.lat, pt.lng], { icon: wpIcon });
        wpMarker.bindTooltip(`교차로 경유점: ${pt.name}`, { direction: 'top' });
        wpMarker.addTo(state.waypointsLayer);
      });
    }
  }

  // Helper to create Stop Popup Content
  function createStopPopupContent(pt) {
    let routesHtml = '';
    if (state.data && state.data.stopIndex && state.data.stopIndex[pt.name]) {
      const list = state.data.stopIndex[pt.name];
      routesHtml = list.map(item => {
        const c = ROUTE_COLORS[item.routeType] || '#2563EB';
        return `<span style="
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          background: ${c};
          padding: 2px 6px;
          border-radius: 4px;
          margin: 2px 4px 2px 0;
          cursor: pointer;
        " onclick="window.selectBusRoute('${item.routeName}')">${item.routeName}</span>`;
      }).join('');
    }

    return `
      <div style="font-family: 'Pretendard', sans-serif; padding: 4px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
          <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: #0F172A;">${pt.name}</h4>
          ${pt.arsId ? `<span style="font-size: 11px; font-weight: 700; font-family: monospace; background: #F1F5F9; padding: 2px 6px; border-radius: 4px; border: 1px solid #E2E8F0;">ARS: ${pt.arsId}</span>` : ''}
        </div>
        <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">
          <span>구분: ${pt.type}</span> | <span>방향: ${pt.direction}</span>
        </div>
        <div style="border-top: 1px solid #E2E8F0; padding-top: 8px;">
          <div style="font-size: 11px; font-weight: 700; color: #94A3B8; margin-bottom: 4px;">경유 시내버스 (${state.data.stopIndex[pt.name] ? state.data.stopIndex[pt.name].length : 1}개)</div>
          <div style="display: flex; flex-wrap: wrap; max-height: 100px; overflow-y: auto;">
            ${routesHtml || `<span style="font-size: 12px; color: #2563EB; font-weight: 600;">${state.activeRouteName}</span>`}
          </div>
        </div>
      </div>
    `;
  }

  // 6. Render Metro Timeline
  function renderTimeline(route) {
    const list = document.getElementById('timelineList');
    if (!list) return;

    list.innerHTML = '';
    const points = route.points.filter(p => ['정류소', '기점', '회차지', '종점'].includes(p.type));
    let displayCount = 0;

    points.forEach((p, idx) => {
      if (state.activeDirection !== 'all' && p.direction !== state.activeDirection) return;

      displayCount++;
      const item = document.createElement('li');
      item.className = 'timeline-item';
      item.id = `timeline-item-${p.seq}`;

      let nodeClass = '';
      if (p.type === '기점') nodeClass = 'start';
      else if (p.type === '회차지') nodeClass = 'turn';
      else if (p.type === '종점') nodeClass = 'end';

      item.innerHTML = `
        <div class="timeline-node ${nodeClass}">${displayCount}</div>
        <div class="timeline-content">
          <div class="timeline-title-row">
            <span class="stop-name">${p.name}</span>
            ${p.arsId ? `<span class="stop-ars-badge">${p.arsId}</span>` : ''}
          </div>
          <div class="stop-sub-info">
            <span>${p.direction}</span>
            ${p.type !== '정류소' ? `<span>· ${p.type}</span>` : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', () => {
        highlightTimelineItem(p.seq);
        state.map.flyTo([p.lat, p.lng], 16, { duration: 0.8 });
        
        // Show temporary highlight circle marker
        if (state.highlightMarker) state.map.removeLayer(state.highlightMarker);
        state.highlightMarker = L.circleMarker([p.lat, p.lng], {
          radius: 14,
          color: '#2563EB',
          fillColor: '#60A5FA',
          fillOpacity: 0.6,
          weight: 3
        }).addTo(state.map);

        // Bind & open popup on map so station details are visible
        const popupContent = createStopPopupContent(p);
        state.highlightMarker.bindPopup(popupContent, { maxWidth: 300 }).openPopup();

        // [요구사항 3] 정류소 목록에서 정류소 클릭 시 정류소 목록은 안보이고 지도가 보이도록 변경
        hideStopListToShowMap(p);
      });

      list.appendChild(item);
    });

    const summaryText = document.getElementById('timelineCountText');
    if (summaryText) summaryText.textContent = `총 ${displayCount}개 정류소 (${state.activeDirection === 'all' ? '전체' : state.activeDirection})`;
  }

  function highlightTimelineItem(seq) {
    document.querySelectorAll('.timeline-item').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`timeline-item-${seq}`);
    if (target) {
      target.classList.add('active');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateDirectionTabs() {
    document.querySelectorAll('.dir-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.dir === state.activeDirection);
    });
  }

  // [요구사항] 정류소 목록 숨기고 지도 화면으로 전환 + 하단에 노선명 및 정류소 목록 보기 기능 표출
  function hideStopListToShowMap(stop) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.add('closed');
      state.sidebarOpen = false;
    }

    // 모바일 접속 시 지도 보기를 눌렀을 때 화면 하단에 노선명과 정류소 목록 보기 기능 표출
    const sheet = document.getElementById('mobileRouteSheetBar');
    if (sheet) {
      sheet.classList.remove('hidden');
      if (state.activeRouteName && state.data && state.data.routes[state.activeRouteName]) {
        const route = state.data.routes[state.activeRouteName];
        const title = document.getElementById('mrsTitle');
        if (title) title.textContent = route.routeName;
        const sub = document.getElementById('mrsSub');
        if (sub) {
          sub.textContent = stop 
            ? `📍 ${stop.name}${stop.arsId ? ` (${stop.arsId})` : ''} · ${stop.direction}`
            : `${route.startStop} ⇄ ${route.endStop || route.turnStop}`;
        }
        const btnText = document.getElementById('mrsOpenBtnText');
        if (btnText) btnText.textContent = '정류소 목록 보기 ▲';
      }
    }

    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 300);
  }

  function updateMobileSheet(route) {
    const sheet = document.getElementById('mobileRouteSheetBar');
    if (!sheet) return;
    const title = document.getElementById('mrsTitle');
    if (title) title.textContent = route.routeName;
    const sub = document.getElementById('mrsSub');
    if (sub) sub.textContent = `${route.startStop} ⇄ ${route.endStop || route.turnStop}`;
    const btnText = document.getElementById('mrsOpenBtnText');
    if (btnText) btnText.textContent = '정류소 목록 보기 ▲';
  }

  // 7. Autocomplete & Search Logic
  function handleSearchInput(query) {
    const dropdown = document.getElementById('searchDropdown');
    const clearBtn = document.getElementById('clearSearchBtn');
    query = (query || '').trim();

    if (query.length > 0) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
      dropdown.classList.add('hidden');
      return;
    }

    if (!state.data) return;

    const lower = query.toLowerCase();
    const matchedRoutes = [];
    const matchedStops = [];
    const matchedArs = [];

    // 1) Match Routes
    for (const name in state.data.routes) {
      if (name.toLowerCase().includes(lower)) {
        matchedRoutes.push(state.data.routes[name]);
        if (matchedRoutes.length >= 5) break;
      }
    }

    // 2) Match ARS ID
    if (/^\d{1,4}$/.test(query) && state.data.arsIndex) {
      for (const ars in state.data.arsIndex) {
        if (ars.startsWith(query)) {
          matchedArs.push(state.data.arsIndex[ars]);
          if (matchedArs.length >= 5) break;
        }
      }
    }

    // 3) Match Stop Name
    if (state.data.stopIndex) {
      for (const stopName in state.data.stopIndex) {
        if (stopName.toLowerCase().includes(lower)) {
          matchedStops.push({
            name: stopName,
            routes: state.data.stopIndex[stopName]
          });
          if (matchedStops.length >= 6) break;
        }
      }
    }

    renderSearchDropdown(matchedRoutes, matchedArs, matchedStops, query);
  }

  function renderSearchDropdown(routes, arsList, stops, query) {
    const dropdown = document.getElementById('searchDropdown');
    dropdown.innerHTML = '';

    if (routes.length === 0 && arsList.length === 0 && stops.length === 0) {
      dropdown.innerHTML = '<div style="padding: 16px; text-align: center; color: #94A3B8; font-size: 13px;">일치하는 노선이나 정류소가 없습니다.</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    // 1) Routes Section
    if (routes.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'dropdown-section-title';
      sec.textContent = '시내버스 노선';
      dropdown.appendChild(sec);

      routes.forEach(r => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const color = ROUTE_COLORS[r.routeType] || '#2563EB';
        item.innerHTML = `
          <div class="dropdown-item-left">
            <span class="route-badge" style="background: ${color}">${r.routeType}</span>
            <span style="font-weight: 700;">${highlightText(r.routeName, query)}</span>
          </div>
          <div class="dropdown-item-meta">${r.startStop} ⇄ ${r.endStop || r.turnStop}</div>
        `;
        item.addEventListener('click', () => {
          selectRoute(r.routeName);
          dropdown.classList.add('hidden');
          document.getElementById('routeSearchInput').value = r.routeName;
        });
        dropdown.appendChild(item);
      });
    }

    // 2) ARS Section
    if (arsList.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'dropdown-section-title';
      sec.textContent = 'ARS 번호 정류소';
      dropdown.appendChild(sec);

      arsList.forEach(ars => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `
          <div class="dropdown-item-left">
            <span class="ars-pill">ARS ${highlightText(ars.arsId, query)}</span>
            <span style="font-weight: 600;">${ars.name}</span>
          </div>
          <div class="dropdown-item-meta">${ars.routes.length}개 노선 경유</div>
        `;
        item.addEventListener('click', () => {
          focusStopOnMap(ars.lat, ars.lng, ars.name, ars.arsId);
          dropdown.classList.add('hidden');
          document.getElementById('routeSearchInput').value = `${ars.name} (${ars.arsId})`;
        });
        dropdown.appendChild(item);
      });
    }

    // 3) Stops Section
    if (stops.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'dropdown-section-title';
      sec.textContent = '정류소명 검색';
      dropdown.appendChild(sec);

      stops.forEach(s => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const sample = s.routes[0];
        item.innerHTML = `
          <div class="dropdown-item-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
            <span style="font-weight: 600;">${highlightText(s.name, query)}</span>
          </div>
          <div class="dropdown-item-meta">${s.routes.length}개 노선 경유</div>
        `;
        item.addEventListener('click', () => {
          if (sample) {
            focusStopOnMap(sample.lat, sample.lng, s.name, sample.arsId);
          }
          dropdown.classList.add('hidden');
          document.getElementById('routeSearchInput').value = s.name;
        });
        dropdown.appendChild(item);
      });
    }

    dropdown.classList.remove('hidden');
  }

  function highlightText(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return text.substring(0, idx) +
      `<span class="highlight-match">${text.substring(idx, idx + query.length)}</span>` +
      text.substring(idx + query.length);
  }

  function focusStopOnMap(lat, lng, name, arsId) {
    state.map.flyTo([lat, lng], 16, { duration: 0.8 });
    if (state.highlightMarker) state.map.removeLayer(state.highlightMarker);
    state.highlightMarker = L.circleMarker([lat, lng], {
      radius: 12,
      color: '#DC2626',
      fillColor: '#F87171',
      fillOpacity: 0.7,
      weight: 3
    }).addTo(state.map);

    const popupContent = createStopPopupContent({ name, arsId, type: '정류소', direction: '전체', lat, lng });
    state.highlightMarker.bindPopup(popupContent, { maxWidth: 300 }).openPopup();
  }

  // 8. Event Listeners Setup
  function initEvents() {
    // Logo Click -> Home view
    document.getElementById('btnLogoHome').addEventListener('click', () => {
      document.getElementById('panelRouteDetail').classList.add('hidden');
      document.getElementById('panelRouteList').classList.remove('hidden');
      state.map.flyTo([35.1595, 126.8526], 12);
      state.routeLineLayer.clearLayers();
      state.stopsLayer.clearLayers();
      state.waypointsLayer.clearLayers();
      if (state.highlightMarker) {
        state.map.removeLayer(state.highlightMarker);
        state.highlightMarker = null;
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.classList.remove('closed');
        state.sidebarOpen = true;
      }
      const sheet = document.getElementById('mobileRouteSheetBar');
      if (sheet) sheet.classList.add('hidden');
    });

    // Back to Route List Button
    document.getElementById('btnBackToList').addEventListener('click', () => {
      document.getElementById('panelRouteDetail').classList.add('hidden');
      document.getElementById('panelRouteList').classList.remove('hidden');
      const sheet = document.getElementById('mobileRouteSheetBar');
      if (sheet) sheet.classList.add('hidden');
    });

    // Category Filter Chips
    document.querySelectorAll('.cat-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        state.activeCategory = btn.dataset.cat;
        renderRouteList();
      });
    });

    // Direction Tabs
    document.querySelectorAll('.dir-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state.activeDirection = tab.dataset.dir;
        updateDirectionTabs();
        if (state.activeRouteName && state.data.routes[state.activeRouteName]) {
          const r = state.data.routes[state.activeRouteName];
          renderRouteOnMap(r, false);
          renderTimeline(r);
        }
      });
    });

    // Search Input & Clear
    const searchInput = document.getElementById('routeSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');

    searchInput.addEventListener('input', (e) => {
      handleSearchInput(e.target.value);
    });

    searchInput.addEventListener('focus', (e) => {
      if (e.target.value.trim().length > 0) {
        handleSearchInput(e.target.value);
      }
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.classList.remove('visible');
      document.getElementById('searchDropdown').classList.add('hidden');
    });

    // Close Dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        document.getElementById('searchDropdown').classList.add('hidden');
      }
    });

    // Search Submit Button
    document.getElementById('btnRouteSearchSubmit').addEventListener('click', () => {
      const q = searchInput.value.trim();
      if (!q || !state.data) return;

      // Exact route match
      if (state.data.routes[q]) {
        selectRoute(q);
        document.getElementById('searchDropdown').classList.add('hidden');
        return;
      }
      handleSearchInput(q);
    });

    // Sidebar Toggle Button
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('btnToggleSidebar');
    toggleBtn.addEventListener('click', () => {
      state.sidebarOpen = !state.sidebarOpen;
      sidebar.classList.toggle('closed', !state.sidebarOpen);
      setTimeout(() => state.map.invalidateSize(), 300);
    });

    // Settings Modal Toggle
    const settingsModal = document.getElementById('settingsMenu');
    document.getElementById('btnSettings').addEventListener('click', () => {
      settingsModal.classList.toggle('hidden');
    });
    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
      settingsModal.classList.add('hidden');
    });

    // Checkboxes for Stops / Waypoints / Labels
    document.getElementById('chkShowStops').addEventListener('change', (e) => {
      state.showStops = e.target.checked;
      if (state.activeRouteName && state.data.routes[state.activeRouteName]) {
        renderRouteOnMap(state.data.routes[state.activeRouteName], false);
      }
    });

    document.getElementById('chkShowWaypoints').addEventListener('change', (e) => {
      state.showWaypoints = e.target.checked;
      if (state.activeRouteName && state.data.routes[state.activeRouteName]) {
        renderRouteOnMap(state.data.routes[state.activeRouteName], false);
      }
    });

    const chkLabels = document.getElementById('chkShowLabels');
    if (chkLabels) {
      chkLabels.addEventListener('change', (e) => {
        state.showLabels = e.target.checked;
        if (state.activeRouteName && state.data.routes[state.activeRouteName]) {
          renderRouteOnMap(state.data.routes[state.activeRouteName], false);
        }
      });
    }

    // Dynamic label zoom adjustment
    state.map.on('zoomend', () => {
      if (state.showLabels && state.activeRouteName && state.data && state.data.routes[state.activeRouteName]) {
        renderRouteOnMap(state.data.routes[state.activeRouteName], false);
      }
    });

    // Map Floating Zoom Controls
    document.getElementById('btnZoomIn').addEventListener('click', () => state.map.zoomIn());
    document.getElementById('btnZoomOut').addEventListener('click', () => state.map.zoomOut());
    document.getElementById('btnResetGwangju').addEventListener('click', () => {
      state.map.flyTo([35.1595, 126.8526], 12);
    });
    document.getElementById('btnFitRoute').addEventListener('click', () => {
      if (state.activeRouteName && state.data.routes[state.activeRouteName]) {
        renderRouteOnMap(state.data.routes[state.activeRouteName], true);
      }
    });

    // Mobile Sheet Open Button
    document.getElementById('btnOpenRouteSheet').addEventListener('click', () => {
      sidebar.classList.remove('closed');
      state.sidebarOpen = true;
      const sheet = document.getElementById('mobileRouteSheetBar');
      if (sheet) sheet.classList.add('hidden');
      setTimeout(() => state.map.invalidateSize(), 300);
    });

    // Mobile Sheet Close/Minimize Buttons
    const btnCloseDetail = document.getElementById('btnCloseDetailMobile');
    if (btnCloseDetail) {
      btnCloseDetail.addEventListener('click', () => {
        hideStopListToShowMap();
      });
    }

    const btnCloseRouteList = document.getElementById('btnCloseRouteListMobile');
    if (btnCloseRouteList) {
      btnCloseRouteList.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
          sidebar.classList.add('closed');
          state.sidebarOpen = false;
        }
        const sheet = document.getElementById('mobileRouteSheetBar');
        if (sheet) {
          sheet.classList.remove('hidden');
          const title = document.getElementById('mrsTitle');
          if (title) title.textContent = '노선 목록';
          const sub = document.getElementById('mrsSub');
          if (sub) sub.textContent = '광주 시내버스 113개 노선';
          const btnText = document.getElementById('mrsOpenBtnText');
          if (btnText) btnText.textContent = '노선 목록 보기 ▲';
        }
        setTimeout(() => state.map.invalidateSize(), 300);
      });
    }

    // GeoJSON Export
    document.getElementById('btnExportGeoJSON').addEventListener('click', exportCurrentRouteGeoJSON);

    // Global helper for popup route click
    window.selectBusRoute = (name) => {
      selectRoute(name);
      state.map.closePopup();
    };
  }

  // 9. Export GeoJSON
  function exportCurrentRouteGeoJSON() {
    if (!state.activeRouteName || !state.data.routes[state.activeRouteName]) {
      alert('먼저 노선을 선택해 주세요.');
      return;
    }
    const route = state.data.routes[state.activeRouteName];
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            routeName: route.routeName,
            routeType: route.routeType,
            lengthKm: route.lengthKm,
            source: 'bus.gwangju.go.kr BIS'
          },
          geometry: {
            type: 'LineString',
            coordinates: route.trajectory.map(pt => [pt[1], pt[0]])
          }
        }
      ]
    };

    route.points.forEach(p => {
      geojson.features.push({
        type: 'Feature',
        properties: {
          name: p.name,
          arsId: p.arsId,
          type: p.type,
          seq: p.seq,
          direction: p.direction
        },
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat]
        }
      });
    });

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `광주버스_${route.routeName}_BIS궤적.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Start Application
  window.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadData();
  });

})();
