import React, { useState, useEffect, useRef } from 'react';
import api, { SOCKET_URL } from '../../utils/api';
import { io } from 'socket.io-client';

/* global L */

// Inject marker animation styles once
const TRACKING_STYLES = `
  .driver-marker-wrap {
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .driver-pulse {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.3);
    animation: driver-glow 2s ease-in-out infinite;
    z-index: 0;
  }
  .driver-icon-inner {
    position: relative;
    z-index: 1;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #2563eb;
    border: 3px solid #ffffff;
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.6), 0 2px 8px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s ease-in-out;
  }
  .driver-icon-inner svg {
    fill: white;
    width: 18px;
    height: 18px;
  }
  @keyframes driver-glow {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.35); opacity: 0; }
  }
  .vendor-marker {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f59e0b;
    border: 3px solid #ffffff;
    box-shadow: 0 3px 12px rgba(245,158,11,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .customer-marker {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #10b981;
    border: 3px solid #ffffff;
    box-shadow: 0 3px 12px rgba(16,185,129,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .leaflet-container {
    font-family: inherit;
  }
  .leaflet-popup-content-wrapper {
    background: #ffffff !important;
    color: #0f172a !important;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(15, 23, 42, 0.14);
    padding: 2px;
    border: 1px solid rgba(148, 163, 184, 0.2);
  }
  .leaflet-popup-content {
    margin: 12px 16px;
    font-size: 13px;
    line-height: 1.6;
    color: #0f172a;
  }
  .leaflet-popup-tip {
    background: #ffffff !important;
  }
`;

if (!document.getElementById('delivery-tracking-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'delivery-tracking-styles';
  styleEl.textContent = TRACKING_STYLES;
  document.head.appendChild(styleEl);
}

const DeliveryTracking = () => {
  const user = JSON.parse(localStorage.getItem('vendor_user') || 'null');
  const token = localStorage.getItem('vendor_token');
  const [deliveries, setDeliveries] = useState([]);
  const [activeTracking, setActiveTracking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socketStatus, setSocketStatus] = useState('Disconnected');
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  const mapRef = useRef(null);
  const markersRef = useRef({});
  const polylinesRef = useRef({});
  const lastFetchedOSRMRef = useRef({}); // delivery_id -> timestamp

  const formatDateTime = (value) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
  };

  const getDriverName = (delivery) => {
    const name = `${delivery.driver_first_name || ''} ${delivery.driver_last_name || ''}`.trim();
    return name || delivery.driver_name || 'Not assigned';
  };

  const DetailRow = ({ label, value, strong = false }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-outline-variant/10 last:border-b-0">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <span className={`text-sm text-right ${strong ? 'font-extrabold text-on-surface' : 'font-semibold text-on-surface-variant'}`}>
        {value || 'Not available'}
      </span>
    </div>
  );

  const fetchDeliveries = async () => {
    if (!user || !user.id) return;
    try {
      setLoading(true);
      setError(null);
      const urlAll = `/vendor/deliveries?vendorId=${user.id}`;
      const urlTracking = `/vendor/deliveries/tracking?vendorId=${user.id}`;

      const [resAll, resTracking] = await Promise.all([
        api.get(urlAll),
        api.get(urlTracking)
      ]);


      // Only show active tracking statuses in the tracking state
      const allowedStatuses = ['assigned', 'accepted', 'picked_up', 'on_the_way', 'arrived', 'heading_to_vendor'];
      const filteredTracking = (resTracking.data || []).filter(d => allowedStatuses.includes(d.status));

      setDeliveries(resAll.data || []);
      setActiveTracking(filteredTracking);
    } catch (err) {
      console.error('Failed to fetch deliveries or tracking', err);
      setError(err.response?.data?.message || 'Failed to load deliveries or logistics tracking');
    } finally {
      setLoading(false);
    }
  };

  // Socket.io Real-time connection setup
  useEffect(() => {
    if (!user || !user.id) {
      setLoading(false);
      return;
    }
    fetchDeliveries();

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      setSocketStatus('Live tracking restored');
      socket.emit('join-vendor-room', user.id);
    });

    socket.on('disconnect', () => {
      setSocketStatus('Reconnecting...');
      console.warn('[SOCKET] Disconnected from tracking network.');
    });

    socket.on('connect_error', (err) => {
      setSocketStatus('Connection Error');
      console.error('[SOCKET] Connection error:', err.message);
    });

    // Listeners for live tracking metrics
    socket.on('driver-location-updated', (data) => {
      setActiveTracking(prev => {
        // Find existing delivery
        return prev.map(d => {
          if (d.driver_id === data.driver_id || d.delivery_id === data.delivery_id) {
            return {
              ...d,
              driver_latitude: parseFloat(data.latitude),
              driver_longitude: parseFloat(data.longitude),
              heading: parseFloat(data.heading),
              speed: parseFloat(data.speed),
              status: data.status || d.status
            };
          }
          return d;
        });
      });
    });

    socket.on('delivery-status-updated', (data) => {
      fetchDeliveries(); // Recover full state on delivery status transition
    });

    socket.on('driver-online-status', (data) => {
      fetchDeliveries();
    });

    // Cleanup connection
    return () => {
      socket.disconnect();
    };
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    const mapInstance = L.map('delivery-map', {
      zoomControl: true,
    }).setView([2.0469, 45.3182], 13);

    // Premium light tile layer loaded dynamically from Vite environment variables (no hardcoding)
    const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    let tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    let tileOptions = {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    };

    if (mapboxToken) {
      tileUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${mapboxToken}`;
      tileOptions.attribution = '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>';
    } else if (googleMapsKey) {
      tileUrl = `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${googleMapsKey}`;
      tileOptions.attribution = '&copy; Google Maps';
    }

    L.tileLayer(tileUrl, tileOptions).addTo(mapInstance);

    mapRef.current = mapInstance;

    return () => {
      mapInstance.remove();
    };
  }, []);

  // Render Markers and Road Routing on Map Updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = L.latLngBounds();
    const currentMarkers = markersRef.current;
    const currentPolylines = polylinesRef.current;

    // Track active keys to prune deleted ones
    const activeKeys = new Set();
    const activePolylineKeys = new Set();

    if (activeTracking.length > 0) {
      activeTracking.forEach(async (delivery) => {
        const dLat = delivery.driver_latitude;
        const dLng = delivery.driver_longitude;
        const cLat = delivery.customer_latitude;
        const cLng = delivery.customer_longitude;
        const vLat = delivery.vendor_latitude;
        const vLng = delivery.vendor_longitude;

        const dKey = `driver_${delivery.delivery_id}`;
        const vKey = `vendor_${delivery.delivery_id}`;
        const cKey = `cust_${delivery.delivery_id}`;
        const pKey = `poly_${delivery.delivery_id}`;

        activeKeys.add(dKey);
        activeKeys.add(vKey);
        activeKeys.add(cKey);
        activePolylineKeys.add(pKey);

        // 1. Vendor Station Marker (Static / Cached) - Amber/Orange
        if (vLat && vLng) {
          if (!currentMarkers[vKey]) {
            const vMarker = L.marker([vLat, vLng], {
              icon: L.divIcon({
                className: '',
                html: `
                  <div class="vendor-marker">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M20 4H4v2l8 5 8-5V4zM4 13h16v7H4z"/>
                    </svg>
                  </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
              })
            }).addTo(map);
            vMarker.bindPopup(`<b>⛽ Vendor Station</b><br/>Order #ORD-${String(delivery.order_id).padStart(4,'0')}`);
            currentMarkers[vKey] = vMarker;
          }
          bounds.extend([vLat, vLng]);
        }

        // 2. Driver Marker (Live Update, Heading Rotation & Blue Glow Animation)
        if (dLat && dLng) {
          const rotationAngle = delivery.heading || 0;
          const markerHtml = `
            <div class="driver-marker-wrap">
              <div class="driver-pulse"></div>
              <div class="driver-icon-inner" style="transform: rotate(${rotationAngle}deg);">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                  <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                </svg>
              </div>
            </div>
          `;

          if (!currentMarkers[dKey]) {
            const dMarker = L.marker([dLat, dLng], {
              icon: L.divIcon({
                className: '',
                html: markerHtml,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              })
            }).addTo(map);
            dMarker.bindPopup(`<b>🚚 ${delivery.driver_name}</b><br/>📞 ${delivery.driver_phone}<br/>Status: <b>${delivery.status}</b>`);
            currentMarkers[dKey] = dMarker;
          } else {
            // Smoothly animate existing marker to new position & update rotation
            currentMarkers[dKey].setLatLng([dLat, dLng]);
            currentMarkers[dKey].setIcon(L.divIcon({
              className: '',
              html: markerHtml,
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            }));
            if (currentMarkers[dKey].getPopup()) {
              currentMarkers[dKey].getPopup().setContent(`<b>🚚 ${delivery.driver_name}</b><br/>📞 ${delivery.driver_phone}<br/>Status: <b>${delivery.status}</b>`);
            }
          }
          bounds.extend([dLat, dLng]);
        }

        // 3. Customer Marker (Cached) - Green
        if (cLat && cLng) {
          if (!currentMarkers[cKey]) {
            const cMarker = L.marker([cLat, cLng], {
              icon: L.divIcon({
                className: '',
                html: `
                  <div class="customer-marker">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 36]
              })
            }).addTo(map);
            cMarker.bindPopup(`<b>📍 ${delivery.customer_name}</b><br/>📞 ${delivery.customer_phone}<br/>🏠 ${delivery.customer_address}`);
            currentMarkers[cKey] = cMarker;
          }
          bounds.extend([cLat, cLng]);
        }

        // 4. Performant Road-Based OSRM Routing
        let routePoints = [];
        const now = Date.now();
        const lastFetch = lastFetchedOSRMRef.current[delivery.delivery_id] || 0;

        // Debounce OSRM fetch to at most once per 8 seconds to prevent spam
        if (dLat && dLng && cLat && cLng) {
          if (!currentPolylines[pKey] || (now - lastFetch > 8000)) {
            lastFetchedOSRMRef.current[delivery.delivery_id] = now;

            try {
              const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${dLng},${dLat};${cLng},${cLat}?overview=full&geometries=geojson`;
              const response = await fetch(osrmUrl);
              const data = await response.json();

              if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
                routePoints = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                const duration = data.routes[0].duration; // seconds
                const minutesLeft = Math.round(duration / 60);

                
                // Update driver popup with dynamic ETA
                if (currentMarkers[dKey]) {
                  currentMarkers[dKey].getPopup().setContent(`
                    <b>Driver: ${delivery.driver_name}</b><br/>
                    Phone: ${delivery.driver_phone}<br/>
                    Status: ${delivery.status}<br/>
                    <b>ETA: ~${minutesLeft} mins</b>
                  `);
                }
              } else {
                throw new Error('OSRM API returned non-OK status');
              }
            } catch (err) {
              console.warn(`[OSRM] Failed fetching road route. Falling back to straight polyline. Error: ${err.message}`);
              routePoints = [[dLat, dLng], [cLat, cLng]]; // Fallback
            }

            if (routePoints.length > 0) {
              // Color coding: blue=active, green=arrived, orange=assigned/pending
              const routeColor =
                delivery.status === 'arrived' ? '#10b981' :
                delivery.status === 'on_the_way' || delivery.status === 'picked_up' ? '#2563eb' :
                '#f59e0b'; // orange for assigned/heading

              if (currentPolylines[pKey]) {
                currentPolylines[pKey].setLatLngs(routePoints);
                currentPolylines[pKey].setStyle({ color: routeColor });
              } else {
                const polyline = L.polyline(routePoints, {
                  color: routeColor,
                  weight: 5,
                  opacity: 0.85,
                  lineJoin: 'round',
                  lineCap: 'round',
                }).addTo(map);
                currentPolylines[pKey] = polyline;
              }
            }
          }
        }
      });

      // Auto Bounding box fit
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
      }
    } else {
      // Centering map fallback
      const vLat = user?.latitude || 2.0469;
      const vLng = user?.longitude || 45.3182;
      map.setView([vLat, vLng], 13);
    }

    // Prune stale markers
    Object.keys(currentMarkers).forEach(key => {
      if (!activeKeys.has(key)) {
        currentMarkers[key].remove();
        delete currentMarkers[key];
      }
    });

    // Prune stale polylines
    Object.keys(currentPolylines).forEach(key => {
      const deliveryId = key.replace('poly_', '');
      if (!activePolylineKeys.has(key)) {
        currentPolylines[key].remove();
        delete currentPolylines[key];
        delete lastFetchedOSRMRef.current[deliveryId];
      }
    });

  }, [activeTracking]);

  if (!user || !user.id) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Authentication Required</h2>
        <p className="text-on-surface-variant font-medium mb-6">
          No authenticated vendor session was found. Please sign in to access this page.
        </p>
        <button
          onClick={() => window.location.href = '/login'}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Go to Login
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-red-50 border border-red-200 rounded-3xl text-center shadow-lg animate-fade-in">
        <h2 className="text-2xl font-bold text-red-700 font-headline mb-4">Error Loading Deliveries</h2>
        <p className="text-on-surface-variant font-medium mb-6">{error}</p>
        <button
          onClick={() => fetchDeliveries()}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-4 space-y-10">
      <section className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold font-headline text-on-surface">Live Dispatch</h2>
          <p className="text-on-surface-variant font-medium">Real-time logistics monitoring and dispatch control.</p>
        </div>
      </section>

      {selectedDelivery && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden">
            <div className="px-8 py-6 bg-surface-container-low border-b border-outline-variant/10 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-2">Delivery Details</p>
                <h3 className="text-2xl font-extrabold font-headline text-on-surface">
                  #ORD-{String(selectedDelivery.order_id || selectedDelivery.id).padStart(4, '0')}
                </h3>
                <p className="text-sm font-semibold text-on-surface-variant mt-1">
                  Status: <span className="uppercase text-primary">{selectedDelivery.status}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="w-10 h-10 rounded-full bg-white hover:bg-surface-container-high font-black text-on-surface-variant"
              >
                x
              </button>
            </div>

            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10">
                  <h4 className="text-sm font-extrabold text-on-surface mb-3">Customer</h4>
                  <DetailRow label="Name" value={selectedDelivery.customer_name || 'Guest'} strong />
                  <DetailRow label="Phone" value={selectedDelivery.customer_phone} />
                  <DetailRow label="Address" value={selectedDelivery.customer_address || selectedDelivery.delivery_address} />
                  <DetailRow label="Payment" value={selectedDelivery.payment_method} />
                </div>

                <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10">
                  <h4 className="text-sm font-extrabold text-on-surface mb-3">Driver</h4>
                  <DetailRow label="Name" value={getDriverName(selectedDelivery)} strong />
                  <DetailRow label="Phone" value={selectedDelivery.driver_phone} />
                  <DetailRow label="Vehicle" value={selectedDelivery.vehicle_type} />
                  <DetailRow label="Plate" value={selectedDelivery.license_plate} />
                  <DetailRow label="Online" value={selectedDelivery.is_online ? 'Online' : 'Offline / unknown'} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10">
                  <h4 className="text-sm font-extrabold text-on-surface mb-3">Order & Route</h4>
                  <DetailRow label="Order Total" value={`$${Number(selectedDelivery.total_amount || 0).toFixed(2)}`} strong />
                  <DetailRow label="Delivery Fee" value={`$${Number(selectedDelivery.delivery_fee || 0).toFixed(2)}`} />
                  <DetailRow label="Distance" value={selectedDelivery.distance_km != null ? `${Number(selectedDelivery.distance_km).toFixed(2)} km` : 'Calculating'} />
                  <DetailRow label="Order Status" value={selectedDelivery.order_status} />
                  <DetailRow label="Created" value={formatDateTime(selectedDelivery.order_created_at || selectedDelivery.created_at)} />
                </div>

                <div className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/10">
                  <h4 className="text-sm font-extrabold text-on-surface mb-3">Timeline</h4>
                  <DetailRow label="Assigned At" value={formatDateTime(selectedDelivery.assigned_at)} />
                  <DetailRow label="Response At" value={formatDateTime(selectedDelivery.responded_at)} />
                  <DetailRow label="Picked Up" value={formatDateTime(selectedDelivery.picked_up_at)} />
                  <DetailRow label="Arrived" value={formatDateTime(selectedDelivery.arrived_at)} />
                  <DetailRow label="Delivered" value={formatDateTime(selectedDelivery.delivered_at)} />
                  <DetailRow label="Last Update" value={formatDateTime(selectedDelivery.updated_at)} />
                </div>

                {selectedDelivery.rejection_reason && (
                  <div className="p-5 rounded-2xl bg-red-50 border border-red-200">
                    <h4 className="text-sm font-extrabold text-red-700 mb-2">Rejection Reason</h4>
                    <p className="text-sm font-semibold text-red-700">{selectedDelivery.rejection_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bento Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Tracking Map (Large) */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-2xl p-2 border border-outline-variant/10 shadow-sm h-[420px] xl:h-[500px] relative overflow-hidden">
          <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-white/20">
            <div className="flex items-center gap-3 mb-2">
              <span className={`w-3 h-3 rounded-full animate-pulse ${socketStatus.includes('restored') ? 'bg-green-500' : 'bg-amber-500'}`}></span>
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface">{socketStatus}</span>
            </div>
            <p className="text-2xl font-bold font-headline">{activeTracking.length} Active Routes</p>
          </div>
          <div id="delivery-map" className="w-full h-full rounded-xl overflow-hidden z-0" style={{boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)'}}></div>
          {!loading && activeTracking.length === 0 && (
            <div className="absolute inset-2 z-10 rounded-xl bg-white/35 backdrop-blur-[1px] flex items-center justify-center text-center p-6 pointer-events-none">
              <div className="max-w-sm rounded-2xl bg-white/95 border border-white/70 shadow-xl p-6 pointer-events-auto">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-primary-container text-primary flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined">local_shipping</span>
                </div>
                <h3 className="text-lg font-extrabold text-on-surface">No active routes right now</h3>
                <p className="text-sm text-on-surface-variant mt-2">
                  Assigned or in-transit orders will appear here automatically with live driver locations.
                </p>
                <button
                  type="button"
                  onClick={fetchDeliveries}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary-dim transition-colors"
                >
                  Refresh deliveries
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats Column */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-primary text-on-primary p-8 rounded-2xl flex-1 flex flex-col justify-between relative overflow-hidden shadow-md">
            <div className="relative z-10">
              <h3 className="text-lg font-semibold opacity-80 mb-1">Fleet Utilization</h3>
              <p className="text-5xl font-extrabold font-headline">{activeTracking.length > 0 ? 'Optimal' : 'Low'}</p>
            </div>
            <div className="relative z-10 flex items-center gap-2 text-sm bg-white/10 w-fit px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
              <span className="material-symbols-outlined text-sm">local_shipping</span>
              <span className="font-medium">{deliveries.length} total deliveries</span>
            </div>
          </div>
          <div className="bg-tertiary-container shadow-sm p-8 rounded-2xl flex-1 border border-tertiary/10">
            <h3 className="text-lg font-bold font-headline mb-4 text-on-tertiary-container">Dispatch Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-on-tertiary-container/70">Assigned</span>
                <span className="font-bold">
                  {activeTracking.filter(d => d.status === 'assigned' || d.status === 'accepted' || d.status === 'heading_to_vendor').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-tertiary-container/70">In Transit</span>
                <span className="font-bold">
                  {activeTracking.filter(d => d.status === 'on_the_way' || d.status === 'picked_up' || d.status === 'arrived').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-tertiary-container/70">Delivered</span>
                <span className="font-bold">{deliveries.filter(d => d.status === 'delivered').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery Table */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low/50">
          <h3 className="text-xl font-bold font-headline">Live Delivery Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-on-surface-variant text-[10px] font-bold uppercase tracking-[0.1em] bg-surface-container-low/50 border-b border-outline-variant/10">
                <th className="px-8 py-4">Customer</th>
                <th className="px-8 py-4">Order ID</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Assigned At</th>
                <th className="px-8 py-4">Response At</th>
                <th className="px-8 py-4">Distance / Charge</th>
                <th className="px-8 py-4">Updates</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-sm">
              {deliveries.length > 0 ? deliveries.map((delivery) => (
                <tr key={delivery.id} className="hover:bg-surface-container-low/20 transition-colors">
                  <td className="px-8 py-5">
                    <div className="font-bold text-on-surface">{delivery.customer_name || 'Guest'}</div>
                  </td>
                  <td className="px-8 py-5 font-bold text-primary font-headline">#ORD-{delivery.id.toString().padStart(4, '0')}</td>
                  <td className="px-8 py-5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      delivery.status === 'delivered' ? 'bg-green-100 text-green-700 border-green-200' :
                      (delivery.status === 'on the way' || delivery.status === 'on_the_way') ? 'bg-sky-100 text-sky-700 border-sky-200' :
                      'bg-purple-100 text-purple-700 border-purple-200'
                    }`}>
                      {delivery.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant text-xs">
                    {delivery.assigned_at ? new Date(delivery.assigned_at).toLocaleString() : 'Not assigned'}
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant text-xs">
                    {delivery.responded_at ? new Date(delivery.responded_at).toLocaleString() : 'Waiting'}
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant text-xs">
                    {delivery.distance_km != null ? `${Number(delivery.distance_km).toFixed(2)} km` : 'Calculating'}
                    <div className="font-bold text-on-surface">${Number(delivery.delivery_fee || 0).toFixed(2)}</div>
                  </td>
                  <td className="px-8 py-5 text-on-surface-variant text-xs">
                    Last updated: {new Date(delivery.updated_at).toLocaleTimeString()}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button
                      onClick={() => setSelectedDelivery(delivery)}
                      className="text-primary hover:underline font-bold text-xs"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-on-surface-variant font-bold tracking-widest uppercase opacity-50">
                    {loading ? 'Scanning Network...' : 'No Active Deliveries'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default DeliveryTracking;
