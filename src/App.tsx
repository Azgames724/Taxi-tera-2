import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { motion, AnimatePresence } from 'framer-motion';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { 
  Bus, 
  MapPin, 
  Search, 
  ArrowRight, 
  ChevronRight, 
  Navigation, 
  Info, 
  Menu, 
  X,
  History,
  LocateFixed,
  Route as RouteIcon,
  Navigation2,
  Star,
  Users,
  Compass,
  Zap,
  Clock,
  Car
} from 'lucide-react';
import { STATIONS, COORDS, ROUTES } from './data/transport';
import { findRoute, Journey } from './utils/routeFinder';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Distance helper (Haversine)
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Map Updater Component
function MapUpdater({ center, zoom, userPos }: { center: [number, number]; zoom: number; userPos?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);

  return null;
}

// OSRM Routing Helper
async function getRoadRoute(coords: [number, number][], profile: 'walking' | 'driving' = 'walking') {
  try {
    const points = coords.map(c => `${c[1]},${c[0]}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${points}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes && data.routes[0]) {
      return {
        geometry: data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]),
        duration: Math.round(data.routes[0].duration / 60),
        distance: data.routes[0].distance
      };
    }
  } catch (e) {
    console.error("Routing error:", e);
  }
  return null;
}

// Static Markers to prevent re-renders
const userMarkerIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-8 h-8">
      <div class="absolute inset-0 bg-sky-500/30 rounded-full animate-ping"></div>
      <div class="w-4 h-4 bg-sky-600 rounded-full border-2 border-white shadow-xl"></div>
    </div>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const minibusIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-8 h-8 group">
      <div class="absolute inset-0 bg-white rounded-xl shadow-md border border-sky-400 group-hover:scale-110 transition-transform"></div>
      <div class="relative text-sm">🚌</div>
    </div>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -10]
});

const highlightedIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center w-10 h-10">
      <div class="absolute inset-0 bg-sky-500 rounded-2xl shadow-[0_0_20px_rgba(14,165,233,0.6)] animate-pulse scale-110"></div>
      <div class="absolute inset-0 bg-white rounded-2xl border-2 border-sky-400 shadow-lg"></div>
      <div class="relative text-lg">🚌</div>
    </div>`,
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -15]
});

const stationIcon = L.divIcon({
  html: `<div class="w-3 h-3 bg-white rounded-full border-2 border-sky-500 shadow-sm"></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

function MapEvents({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap();
  map.on('zoomend', () => onZoom(map.getZoom()));
  return null;
}

export default function App() {
  const [zoom, setZoom] = useState(13);
  const [lang, setLang] = useState<'en' | 'am'>('en');
  const [origin, setOrigin] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [journey, setJourney] = useState<Journey | null>(null);
  const [legGeometries, setLegGeometries] = useState<{ coordinates: [number, number][], type: 'minibus' | 'walking' }[]>([]);
  const [walkingRouteToStation, setWalkingRouteToStation] = useState<[number, number][]>([]);
  const [totalArrivalMinutes, setTotalArrivalMinutes] = useState<number | null>(null);
  const [totalWalkingDistance, setTotalWalkingDistance] = useState<number | null>(null);
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [activeTab, setActiveTab] = useState<'stations' | 'planner'>('stations');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchType, setSearchType] = useState<'origin' | 'destination'>('origin');
  const [mapCenter, setMapCenter] = useState<[number, number]>([9.0177, 38.7497]); // Mexico Square default
  const [mapZoom, setMapZoom] = useState(14);
  const [sheetState, setSheetState] = useState<'collapsed' | 'full'>('collapsed');
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  // Initialize Location
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(newPos);
          setMapCenter(newPos);
        },
        () => console.log("Location access denied. Using default center."),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const sortedStations = useMemo(() => {
    const base = STATIONS.filter(s => s.t === 'minibus');
    if (!userLocation) return base;
    return [...base].sort((a, b) => {
      const distA = getDistanceFromLatLonInKm(userLocation[0], userLocation[1], a.lat, a.lng);
      const distB = getDistanceFromLatLonInKm(userLocation[0], userLocation[1], b.lat, b.lng);
      return distA - distB;
    });
  }, [userLocation]);

  const filteredLocations = useMemo(() => {
    return Object.keys(COORDS)
      .filter(loc => loc.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort();
  }, [searchQuery]);

  useEffect(() => {
    if (origin && destination) {
      handleFindRoute();
    }
  }, [origin, destination]);

  const handleFindRoute = async () => {
    if (origin && destination) {
      const result = findRoute(origin, destination);
      setJourney(result);
      setLegGeometries([]);
      setWalkingRouteToStation([]);
      
      if (result) {
        setSheetState('full');
        
        // Fetch geometry for each leg
        const legGeosPromise = result.legs.map(async (leg) => {
          const start = COORDS[leg.from];
          const end = COORDS[leg.to];
          const road = await getRoadRoute([start, end], leg.type === 'minibus' ? 'driving' : 'walking');
          return { coordinates: road?.geometry || [start, end], type: leg.type };
        });
        
        const legGeos = await Promise.all(legGeosPromise);
        setLegGeometries(legGeos);

        // Fetch walking route from user location to first station
        if (userLocation) {
          const firstStationCoord = COORDS[result.legs[0].from];
          if (firstStationCoord) {
            const walk = await getRoadRoute([userLocation, firstStationCoord], 'walking');
            if (walk) {
              setWalkingRouteToStation(walk.geometry);
              setTotalArrivalMinutes(walk.duration + result.totalDuration);
              setTotalWalkingDistance(walk.distance);
            }
          }
        }
      }
    }
  };

  const menuVariants = {
    closed: { x: '-100%', transition: { type: 'spring', damping: 25, stiffness: 200 } },
    open: { x: 0, transition: { type: 'spring', damping: 25, stiffness: 200 } }
  };

  const selectLocation = (loc: string) => {
    if (searchType === 'origin') setOrigin(loc);
    else setDestination(loc);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSheetState('full');
  };

  const highlightedStationNames = useMemo(() => {
    if (!journey) return new Set<string>();
    const names = new Set<string>();
    journey.legs.forEach(leg => {
      names.add(leg.from);
      names.add(leg.to);
    });
    return names;
  }, [journey]);

  return (
    <div className="relative h-full w-full font-sans text-slate-800 bg-white overflow-hidden select-none">
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 z-[1000] bg-gradient-to-br from-[#12a4c9] via-[#0e8eb0] to-[#0a6d88] flex flex-col items-center justify-center p-8 overflow-hidden"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ 
                duration: 0.8,
                ease: [0.22, 1, 0.36, 1]
              }}
              className="relative w-56 h-56 mb-12"
            >
              <div className="absolute inset-0 bg-white/5 rounded-full blur-3xl scale-150"></div>
              {/* Detailed SVG Logo mimicking the provided one */}
              <svg viewBox="0 0 200 200" className="w-full h-full relative z-10 drop-shadow-2xl">
                <defs>
                  <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FFD700" />
                    <stop offset="50%" stopColor="#FDB931" />
                    <stop offset="100%" stopColor="#FFD700" />
                  </linearGradient>
                  <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0A5A7A" />
                    <stop offset="100%" stopColor="#063D52" />
                  </linearGradient>
                </defs>
                {/* Outer Ring */}
                <circle cx="100" cy="100" r="95" fill="none" stroke="url(#goldGrad)" strokeWidth="4" />
                <circle cx="100" cy="100" r="88" fill="url(#blueGrad)" />
                <circle cx="100" cy="100" r="80" fill="none" stroke="url(#goldGrad)" strokeWidth="2" strokeDasharray="4 4" />
                
                {/* Minibus Body */}
                <rect x="50" y="85" width="100" height="40" rx="10" fill="#2B6CB0" stroke="white" strokeWidth="2" />
                <path d="M50 85 Q50 75 70 75 L130 75 Q150 75 150 85" fill="white" />
                
                {/* Windows */}
                <rect x="65" y="80" width="15" height="15" rx="2" fill="#87CEEB" />
                <rect x="85" y="80" width="30" height="15" rx="2" fill="#87CEEB" />
                <rect x="120" y="80" width="15" height="15" rx="2" fill="#87CEEB" />
                
                {/* Wheels */}
                <circle cx="70" cy="125" r="8" fill="#1A202C" stroke="silver" strokeWidth="2" />
                <circle cx="130" cy="125" r="8" fill="#1A202C" stroke="silver" strokeWidth="2" />
                
                {/* Ethiopian Flag Badge on Roof */}
                <circle cx="100" cy="70" r="12" fill="none" stroke="white" strokeWidth="1" />
                <rect x="92" y="62" width="16" height="5.3" fill="#1EB53A" />
                <rect x="92" y="67.3" width="16" height="5.3" fill="#FCD116" />
                <rect x="92" y="72.6" width="16" height="5.4" fill="#EF3340" />
                
                {/* Text along paths (Simplified for SVG rendering) */}
                <text x="50%" y="45" textAnchor="middle" fill="#FDB931" className="text-[14px] font-bold" style={{ fontFamily: 'sans-serif' }}>ታክሲ ተራ</text>
                <text x="50%" y="165" textAnchor="middle" fill="white" className="text-[12px] font-black tracking-widest" style={{ fontFamily: 'sans-serif' }}>TAXI TERA</text>
              </svg>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center"
            >
              <h1 className="text-6xl font-black text-white tracking-tighter mb-3 drop-shadow-md">Taxi Tera</h1>
              <p className="text-white/90 font-medium tracking-wide text-lg opacity-80">Find rides across Ethiopia — fast</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="absolute bottom-28 flex gap-3"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    scale: [1, 1.4, 1],
                    opacity: [0.3, 0.9, 0.3]
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 1.2, 
                    delay: i * 0.3 
                  }}
                  className="w-3 h-3 bg-white rounded-full shadow-sm"
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {showAbout && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-8 bg-sky-500 text-white text-center">
                <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
                  <Bus className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black italic">Taxi Tera</h3>
                <p className="text-sky-100 text-[10px] font-bold uppercase tracking-widest mt-1">Addis Ababa Transit Guide</p>
              </div>
              <div className="p-8 space-y-6">
                <p className="text-sm text-slate-500 leading-relaxed text-center font-medium">
                  {lang === 'en' 
                    ? "Your smart companion for navigating Addis Ababa's minibus and transport network. Find the best routes and stations in seconds." 
                    : "ለአዲስ አበባ ሚኒባስ እና ትራንስፖርት አገልግሎት የተዘጋጀ ዘመናዊ መተግበሪያ። ቀላሉን መንገድ እና ጣቢያዎችን በፍጥነት ያግኙ።"}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Stations</p>
                    <p className="text-lg font-black text-slate-800">450+</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Routes</p>
                    <p className="text-lg font-black text-slate-800">1200+</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAbout(false)}
                  className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all shadow-xl shadow-slate-900/20"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div 
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              className="absolute top-0 left-0 bottom-0 w-[280px] z-[110] bg-white shadow-2xl flex flex-col pointer-events-auto"
            >
              <div className="p-8 bg-sky-500 text-white space-y-4">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-2xl">
                    <Bus className="w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black italic">Taxi Tera</h2>
                    <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Addis Ababa</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 space-y-2">
                {[
                  { icon: Navigation, label: 'Minibus Ranks', id: 'stations' },
                  { icon: RouteIcon, label: 'Route Planner', id: 'planner' },
                  { icon: Compass, label: 'About App', action: () => setShowAbout(true) },
                  { icon: Info, label: 'Support & Help' },
                ].map((item, i) => (
                  <button 
                    key={i} 
                    onClick={() => {
                        if (item.id) {
                            setActiveTab(item.id as any);
                            setSheetState('full');
                        }
                        if (item.action) item.action();
                        setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-sm transition-all text-left text-slate-500 hover:bg-slate-50"
                  >
                    <item.icon className="w-5 h-5 text-sky-500" />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="p-8 border-t border-slate-100">
                <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">v2.4.0 (Stable)</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Top Search Bar & Header - MATCHING SCREENSHOT */}
      <div className="absolute top-4 inset-x-4 z-[50] flex flex-col gap-3 pointer-events-none">
        <div className="flex items-center gap-2 max-w-xl mx-auto w-full pointer-events-auto">
          <div className="flex-1 bg-white/95 backdrop-blur-xl rounded-full shadow-lg border border-slate-100 flex items-center px-4 py-1.5 h-12">
            <button 
              onClick={() => setIsMenuOpen(true)} 
              className="p-2 hover:bg-slate-50 rounded-full transition-colors shrink-0"
              id="menu-toggle-btn"
            >
              <Menu className="w-5 h-5 text-sky-500" />
            </button>
            <div 
              className="flex-1 flex items-center gap-3 cursor-pointer h-full border-l border-slate-100 ml-2 pl-3" 
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="w-4 h-4 text-sky-500" />
              <div className="text-xs font-semibold text-slate-400 truncate">
                {lang === 'en' ? "Search stations or routes..." : "ጣቢያ ወይም መስመር ፈልግ..."}
              </div>
            </div>
          </div>

          <div className="bg-white/95 backdrop-blur-xl rounded-full shadow-lg border border-slate-100 flex p-1 shrink-0 h-10 items-center">
            <button 
              onClick={() => setLang('en')}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black transition-all",
                lang === 'en' ? "bg-sky-500 text-white shadow-md" : "text-slate-400"
              )}
            >
              EN
            </button>
            <button 
              onClick={() => setLang('am')}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black transition-all",
                lang === 'am' ? "bg-sky-500 text-white shadow-md" : "text-slate-400"
              )}
            >
              አማ
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pointer-events-auto max-w-xl mx-auto w-full px-2 pb-1">
          <button 
            onClick={() => setShowAllRoutes(!showAllRoutes)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-full border shadow-md transition-all active:scale-95 whitespace-nowrap",
              showAllRoutes 
                ? "bg-amber-500 text-white border-amber-500" 
                : "bg-sky-500 text-white border-sky-400"
            )}
          >
            <RouteIcon className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-tight">
              {showAllRoutes ? "Hide All Routes" : "Show All Routes"}
            </span>
          </button>
          {!showAllRoutes && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur text-slate-500 rounded-full shadow-md border border-slate-100">
              <Zap className="w-3 h-3 text-sky-500" />
              <span className="text-[10px] font-black uppercase tracking-tight">Minibus Only</span>
            </div>
          )}
        </div>
      </div>

      {/* Map Implementation */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={mapCenter} zoom={mapZoom} zoomControl={false} className="h-full w-full">
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; CARTO' 
          />
          <MapEvents onZoom={setZoom} />
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          
          {userLocation && (
            <Marker position={userLocation} icon={userMarkerIcon} />
          )}

          {showAllRoutes && !journey && ROUTES.map((r, idx) => (
             <Polyline 
                key={`all-${idx}`}
                positions={[COORDS[r.from], COORDS[r.to]]}
                color="#0ea5e9" weight={1} opacity={0.3}
             />
          ))}

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            showCoverageOnHover={false}
          >
            {STATIONS.map(s => {
              const isHighlighted = highlightedStationNames.has(s.name);
              return (
                <Marker 
                  key={s.id} 
                  position={[s.lat, s.lng]} 
                  icon={isHighlighted ? highlightedIcon : (s.t === 'minibus' ? minibusIcon : stationIcon)}
                  zIndexOffset={isHighlighted ? 1000 : 0}
                >
                  {(zoom > 15 || isHighlighted) && (
                    <Tooltip permanent direction="top" offset={[0, -10]} className="!bg-transparent !border-none !shadow-none !p-0">
                      <div className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-md whitespace-nowrap shadow-sm transition-all",
                        isHighlighted 
                          ? "bg-sky-500 text-white border-sky-400 scale-110 shadow-sky-200" 
                          : "bg-white/90 text-slate-800 border-slate-200"
                      )}>
                        {lang === 'en' ? s.name : s.am}
                      </div>
                    </Tooltip>
                  )}
                  <Popup className="custom-popup">
                    <div className="p-4 min-w-[200px] bg-white text-slate-800 rounded-2xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-2xl border transition-colors",
                          isHighlighted ? "bg-sky-500 text-white border-sky-400" : "bg-sky-50 text-sky-500 border-sky-100"
                        )}>
                          {s.t === 'minibus' ? '🚌' : s.t === 'bajaj' ? '🛺' : '🚗'}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm leading-tight text-slate-800">{lang === 'en' ? s.name : s.am}</h3>
                          <p className={cn(
                            "text-[9px] font-black uppercase tracking-widest",
                            isHighlighted ? "text-sky-600" : "text-sky-500"
                          )}>{s.t} Rank</p>
                        </div>
                      </div>
                      <div className="space-y-1 mb-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Connects to:</p>
                        <div className="flex flex-wrap gap-1">
                          {s.r.slice(0, 4).map((dest, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] border border-slate-100 font-medium">
                              {dest}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => { setDestination(s.name); }}
                        className="w-full py-3 bg-sky-500 text-white rounded-xl font-black text-[10px] shadow-lg shadow-sky-500/20 active:scale-95 transition-all uppercase tracking-widest"
                      >
                        Select Destination
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>

          {walkingRouteToStation.length > 0 && (
            <Polyline 
              positions={walkingRouteToStation}
              color="#f43f5e" weight={5} opacity={0.9} dashArray="1, 10" lineCap="round" lineJoin="round"
            />
          )}

          {legGeometries.map((leg, idx) => (
            <Polyline 
              key={idx} 
              positions={leg.coordinates} 
              color={leg.type === 'walking' ? "#f43f5e" : "#0ea5e9"} 
              weight={leg.type === 'walking' ? 4 : 7} 
              opacity={0.8} 
              dashArray={leg.type === 'walking' ? "1, 12" : undefined}
              lineCap="round" 
              lineJoin="round"
            />
          ))}
        </MapContainer>
      </div>

      {/* Action FABs */}
      <div className="absolute right-6 bottom-[35vh] z-10 space-y-3 pointer-events-auto">
        <button 
          onClick={() => { 
            if (userLocation) {
              setMapCenter(userLocation);
              setMapZoom(16);
            }
          }}
          className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-sky-500 border border-slate-100 active:scale-90 transition-all ring-1 ring-slate-50"
        >
          <LocateFixed className="w-6 h-6" />
        </button>
        {journey && (
          <button 
            onClick={() => {
              setJourney(null);
              setLegGeometries([]);
              setWalkingRouteToStation([]);
              setTotalArrivalMinutes(null);
              setTotalWalkingDistance(null);
            }}
            className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-red-500 border border-slate-100 active:scale-90 transition-all ring-1 ring-slate-50"
          >
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Sheet UI */}
      <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col items-center pointer-events-none h-full">
        <motion.div 
          drag="y"
          dragConstraints={{ 
            top: 130, // Limit at the "minibus only" tab position
            bottom: window.innerHeight - 100 // Leave space at bottom for dragging back up
          }}
          dragElastic={0.05}
          dragMomentum={false}
          style={{
            position: 'absolute',
            top: 0
          }}
          initial={{ y: window.innerHeight - 100 }}
          animate={sheetState === 'full' ? { y: 130 } : { y: window.innerHeight - 100 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
          className="w-full max-w-xl bg-white rounded-t-[40px] shadow-[0_-15px_60px_rgba(0,0,0,0.15)] border-t border-slate-100 flex flex-col h-[95vh] pointer-events-auto overflow-hidden"
        >
          {/* Drag Handle Area */}
          <div className="w-full h-10 flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0 transition-colors hover:bg-slate-50/50">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tabs */}
            <div className="px-6 flex items-center gap-2 py-1 shrink-0">
              <button 
                onClick={() => setActiveTab('stations')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-xs transition-all",
                  activeTab === 'stations' ? "bg-sky-500 text-white shadow-lg shadow-sky-500/25" : "bg-slate-50 text-slate-400"
                )}
              >
                <span>📍</span> {lang === 'en' ? 'Nearby Ranks' : 'የቅርብ ደረጃዎች'}
              </button>
              <button 
                onClick={() => setActiveTab('planner')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-xs transition-all border",
                  activeTab === 'planner' ? "border-sky-500 text-sky-500 bg-white" : "bg-slate-50 border-transparent text-slate-400"
                )}
              >
                <span>🗺️</span> {lang === 'en' ? 'Planner' : 'ጉዞ እቅድ'} 
              </button>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-6 pt-5 pb-20 space-y-6">
              {activeTab === 'stations' ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">
                      {lang === 'en' ? 'Nearby Hubs' : 'የቅርብ ደረጃዎች'}
                    </h3>
                    <div className="bg-sky-50 px-3 py-1 rounded-full text-sky-500 text-[10px] font-bold border border-sky-100">
                      {sortedStations.length} found
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {sortedStations.map((s) => {
                      const dist = userLocation ? getDistanceFromLatLonInKm(userLocation[0], userLocation[1], s.lat, s.lng) : null;
                      
                      return (
                        <motion.div 
                          key={s.id}
                          whileTap={{ scale: 0.98 }}
                          className="p-3 rounded-[28px] bg-white border border-slate-100 shadow-sm flex items-center gap-4 hover:border-sky-200 transition-all transition-shadow hover:shadow-md group"
                        >
                          <div className={cn(
                            "w-12 h-12 rounded-[20px] flex items-center justify-center text-2xl shrink-0 border border-white shadow-inner",
                            s.t === 'minibus' ? "bg-sky-50 text-sky-500" : s.t === 'bajaj' ? "bg-amber-50 text-amber-500" : "bg-indigo-50 text-indigo-500"
                          )}>
                            {s.t === 'minibus' ? '🚌' : s.t === 'bajaj' ? '🛺' : '🚗'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-extrabold text-slate-800 truncate mb-0.5">
                              {lang === 'en' ? s.name : s.am}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5">
                              {dist && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                  <MapPin className="w-3 h-3 text-red-500" /> {dist.toFixed(1)}km
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">
                                <Star className="w-3 h-3 fill-amber-500" /> {s.rat}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              setMapCenter([s.lat, s.lng]);
                              setMapZoom(17);
                              if (sheetState === 'full') setSheetState('collapsed');
                            }}
                            className="bg-sky-500 p-2.5 rounded-xl text-white shadow-lg shadow-sky-500/20 active:scale-90 transition-all"
                          >
                            <Navigation2 className="w-5 h-5 fill-white" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-6 pt-2">
                  <div className="space-y-4 relative">
                    <div className="absolute left-[20px] top-8 bottom-8 w-px bg-slate-100 border-l border-dashed" />
                    {[
                      { type: 'origin', val: origin, label: 'Current Location', am: 'አሁን ያለሁበት' },
                      { type: 'destination', val: destination, label: 'Where to?', am: 'ወዴት?' }
                    ].map((step, i) => (
                      <button 
                        key={i}
                        onClick={() => { setSearchType(step.type as any); setIsSearchOpen(true); }}
                        className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3 text-left transition-all hover:bg-white hover:shadow-sm"
                      >
                        <div className={cn(
                          "w-3 h-3 rounded-full border-2 bg-white shrink-0",
                          i === 0 ? "border-sky-500" : "border-red-500"
                        )} />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                            {lang === 'en' ? step.type : (step.type === 'origin' ? 'መነሻ' : 'መድረሻ')}
                          </p>
                          <p className={cn("text-xs font-bold truncate", !step.val && "text-slate-300")}>
                            {step.val || (lang === 'en' ? step.label : step.am)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button 
                    onClick={handleFindRoute}
                    className="w-full py-4 bg-sky-500 rounded-2xl shadow-xl shadow-sky-500/30 text-white font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Navigation className="w-4 h-4" /> Find Routes
                  </button>

                  <AnimatePresence>
                    {journey && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pt-4">
                        <div className="bg-sky-50 border border-sky-100 p-4 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                              <Zap className="w-5 h-5 fill-white" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-sky-600 uppercase tracking-[0.15em] leading-none mb-1">Total Journey</p>
                                <h4 className="text-sm font-black text-slate-800 tracking-tight uppercase italic">
                                  {totalArrivalMinutes || journey.totalDuration} MIN · {( (totalWalkingDistance || 0) + journey.totalDistance ).toFixed(0)}m
                                </h4>
                            </div>
                          </div>
                        </div>

                        {walkingRouteToStation.length > 0 && (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center text-white text-[9px] font-black shadow-sm">
                                  W
                                </div>
                                <div className="flex-1 w-px bg-slate-100" />
                            </div>
                            <div className="flex-1 bg-rose-50/30 border border-rose-100 p-4 rounded-xl mb-2">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[9px] font-black bg-rose-100 text-rose-600 px-2 py-0.5 rounded-md uppercase">
                                    Walking
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {Math.round((totalWalkingDistance || 0) / 80)} min
                                  </span>
                                </div>
                                <h5 className="font-bold text-[13px] text-slate-800">Walk to {journey.legs[0].from} Rank</h5>
                                <p className="text-[10px] text-slate-400 mt-1">Found optimal path to station entry.</p>
                            </div>
                          </div>
                        )}

                        {journey.legs.map((leg, i) => (
                           <div key={i} className="flex gap-3">
                              <div className="flex flex-col items-center gap-1">
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-black",
                                  leg.type === 'walking' ? "bg-rose-500" : "bg-sky-500"
                                )}>
                                  {leg.type === 'walking' ? 'W' : i + 1}
                                </div>
                                {i < journey.legs.length - 1 && <div className="flex-1 w-px bg-slate-100" />}
                              </div>
                              <div className={cn(
                                "flex-1 p-4 rounded-xl mb-2 border",
                                leg.type === 'walking' ? "bg-rose-50/20 border-rose-100" : "bg-white border-slate-100 shadow-sm"
                              )}>
                                <div className="flex justify-between items-center mb-1">
                                  <span className={cn(
                                    "text-[9px] font-black px-2 py-0.5 rounded-md uppercase",
                                    leg.type === 'walking' ? "bg-rose-100 text-rose-600" : "bg-sky-100 text-sky-600"
                                  )}>
                                    {leg.type === 'walking' ? 'Walking Connection' : leg.route?.code}
                                  </span>
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                                    <Clock className="w-3 h-3" /> {leg.duration} min
                                  </div>
                                </div>
                                <h5 className="font-bold text-[13px] text-slate-800">
                                  {leg.from} {leg.type === 'walking' ? '→' : '↔'} {leg.to}
                                </h5>
                                {leg.type === 'minibus' && (
                                  <p className="text-[10px] text-slate-400 mt-1 leading-tight italic">Take the {leg.route?.name} route</p>
                                )}
                                {leg.type === 'walking' && (
                                  <p className="text-[10px] text-rose-400 mt-1 leading-tight font-medium">Walk {Math.round(leg.distance)}m to next vehicle</p>
                                )}
                              </div>
                           </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Full Screen Search */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}
            className="absolute inset-0 z-[200] bg-white pointer-events-auto flex flex-col p-8"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-black italic tracking-tighter text-sky-500">SELECT HUB</h2>
                <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] mt-1">Taxi Tera Network</p>
              </div>
              <button 
                onClick={() => setIsSearchOpen(false)} 
                className="p-4 bg-slate-50 text-slate-400 rounded-3xl hover:text-red-500 transition-colors"
              >
                <X className="w-6 h-6 stroke-[3]" />
              </button>
            </div>

            <div className="relative mb-8 group">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-sky-500 opacity-40" />
              <input 
                autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Where are we heading?"
                className="w-full bg-slate-50 border-none rounded-[30px] py-6 pl-16 pr-8 text-lg font-bold placeholder:text-slate-200 outline-none focus:ring-4 focus:ring-sky-500/10 transition-all"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pb-10">
              {filteredLocations.map(loc => (
                <button 
                  key={loc} 
                  onClick={() => selectLocation(loc)} 
                  className="w-full p-6 flex items-center gap-5 rounded-[28px] hover:bg-sky-50 transition-all group active:scale-[0.98] border border-transparent hover:border-sky-100"
                >
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-sky-500 group-hover:text-white transition-all">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">{loc}</p>
                    <p className="text-[9px] font-bold text-slate-300 uppercase mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Select hub</p>
                  </div>
                  <ChevronRight className="ml-auto w-6 h-6 text-slate-100 group-hover:text-sky-500" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
