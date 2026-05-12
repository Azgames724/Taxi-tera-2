import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Menu, 
  Search as SearchIcon, 
  Navigation, 
  MapPin, 
  X, 
  Star, 
  Bus, 
  Clock, 
  Share2, 
  ChevronLeft,
  Info,
  Map as MapIcon,
  Route as RouteIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Map from './components/Map';
import TripPlanner from './components/TripPlanner';
import { 
  STATIONS,
  ROUTES, 
  TRANSLATIONS, 
  Station,
  Route as TransitRoute,
  COORDS
} from './data/transitData';
import { TripPath } from './lib/routing';

import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [lang, setLang] = useState<'en' | 'am'>(() => {
    return (localStorage.getItem('ttLang') as 'en' | 'am') || 'en';
  });
  const [isSplash, setIsSplash] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'stations' | 'trips'>('stations');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activePath, setActivePath] = useState<TripPath | null>(null);
  const [plannerInitialState, setPlannerInitialState] = useState<{ origin?: string, dest?: string }>({});
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([9.0222, 38.7469]);
  const [mapZoom, setMapZoom] = useState(14);
  const [panelOpen, setPanelOpen] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => {
    return JSON.parse(localStorage.getItem('ttFavs') || '[]');
  });

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const timer = setTimeout(() => setIsSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('ttLang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('ttFavs', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(loc);
          setMapCenter(loc);
        },
        () => console.warn('Location access denied')
      );
    }
  }, []);

  const filteredStations = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return STATIONS.filter(s => 
      s.name.toLowerCase().includes(query) || 
      s.am.includes(query) ||
      s.t.includes(query)
    );
  }, [searchQuery]);

  const filteredRoutes = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return ROUTES.filter(r => 
      r.name.toLowerCase().includes(query) || 
      r.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleStationClick = useCallback((s: Station | string) => {
    let station: Station;
    if (typeof s === 'string') {
      const existing = STATIONS.find(st => st.name === s || st.am === s);
      if (existing) {
        station = existing;
      } else {
        const pos = COORDS[s];
        const destinations = ROUTES.filter(r => r.from.includes(s) || s.includes(r.from)).map(r => r.to);
        station = {
          id: -1,
          name: s,
          am: s,
          t: 'minibus',
          lat: pos ? pos[0] : mapCenter[0],
          lng: pos ? pos[1] : mapCenter[1],
          addr: 'Mobile Transport Hub',
          addrAm: 'ተንቀሳቃሽ የመጓጓዣ መገናኛ',
          r: destinations.length > 0 ? Array.from(new Set(destinations)) : ['Check Local Board'],
          rat: 4.2,
          h: ['5:30–20:30', '5:30–20:30', '5:30–20:30', '5:30–20:30', '5:30–21:00', '6:00–20:00', '7:00–17:00']
        };
      }
    } else {
      station = s;
    }

    setSelectedStation(station);
    setMapCenter([station.lat, station.lng]);
    setMapZoom(16);
    setPanelOpen(false); // Hide the bottom panel when a station is selected
  }, [mapCenter]);

  const handleLocateMe = useCallback(() => {
    if (userLocation) {
      setMapCenter(userLocation);
      setMapZoom(15);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(loc);
        setMapCenter(loc);
        setMapZoom(15);
      });
    }
  }, [userLocation]);

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  }, []);

  const handlePathSelect = useCallback((path: TripPath | null) => {
    setActivePath(path);
    if (path && path.legs.length > 0) {
      const start = COORDS[path.legs[0].from];
      if (start) {
        setMapCenter(start);
        setMapZoom(15);
      }
    }
  }, []);

  if (isSplash) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-primary-dark via-primary to-primary-light flex flex-col items-center justify-center gap-6">
        <motion.div 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="w-40 h-40 bg-white/20 rounded-3xl p-4 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl"
        >
          <Bus className="w-24 h-24 text-white" />
        </motion.div>
        <div className="flex flex-col items-center">
          <h1 className="text-4xl font-black text-white tracking-tighter">Taxi Tera</h1>
          <p className="text-white/80 font-medium mt-1">{t.spSub}</p>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <motion.div 
              key={i}
              animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
              className="w-2 h-2 bg-white rounded-full"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans">
      {/* Search Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 pointer-events-none">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          <div className="flex gap-2 pointer-events-auto">
            <div className="flex-1 bg-white rounded-2xl shadow-strong border border-slate-200 p-1 flex items-center">
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="p-3 text-slate-400 hover:text-primary transition-colors cursor-pointer"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex-1 flex items-center px-1">
                <SearchIcon className="w-5 h-5 text-slate-300 mr-2" />
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.ph}
                  className="bg-transparent border-none outline-none w-full text-sm font-medium"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="p-2 text-slate-300">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <button 
              onClick={() => setLang(l => l === 'en' ? 'am' : 'en')}
              className="bg-white px-3 rounded-2xl shadow-strong border border-slate-200 font-bold text-xs text-primary h-14"
            >
              {lang === 'en' ? 'AM' : 'EN'}
            </button>
          </div>
          
          {/* Quick Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide pointer-events-auto">
            <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-full text-xs font-bold shadow-md shrink-0">
              <MapIcon className="w-3.5 h-3.5" />
              {t.all}
            </button>
            <button 
              onClick={() => { setActiveTab('stations'); setPanelOpen(true); }}
              className="flex items-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-full text-xs font-bold shadow-sm shrink-0"
            >
              <Bus className="w-3.5 h-3.5" />
              {t.minibus}
            </button>
            <button 
              onClick={() => { setActiveTab('trips'); setPanelOpen(true); }}
              className="flex items-center gap-2 bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-full text-xs font-bold shadow-sm shrink-0"
            >
              <Navigation className="w-3.5 h-3.5 text-primary" />
              {t.planner}
            </button>
          </div>
        </div>
      </div>

      {/* Map View */}
      <div className="flex-1 relative overflow-hidden bg-slate-100">
        <Map 
          center={mapCenter}
          zoom={mapZoom}
          userLocation={userLocation}
          selectedStation={selectedStation}
          activePath={activePath}
          lang={lang}
          onStationClick={handleStationClick}
          panelOpen={panelOpen}
        />

        {/* Floating Actions */}
        <div className="absolute bottom-32 right-4 z-40 flex flex-col gap-3">
          <button 
            onClick={handleLocateMe}
            className="w-14 h-14 bg-white rounded-2xl shadow-strong border border-slate-200 flex items-center justify-center text-primary group active:scale-90 transition-all"
          >
            <Navigation className="w-7 h-7 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* Bottom Panel */}
      <motion.div 
        initial={false}
        animate={{ height: panelOpen ? '65vh' : '110px' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-white rounded-t-[32px] shadow-[0_-8px_32px_rgba(0,0,0,0.1)] z-[60] flex flex-col border-t border-slate-100 overflow-hidden shrink-0"
      >
        <div 
          className="p-3 shrink-0 cursor-pointer flex flex-col items-center"
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {/* Tabs */}
        <div className="px-4 flex gap-2 shrink-0">
          {[
            { id: 'stations', label: t.stations, icon: Bus },
            { id: 'trips', label: t.planner, icon: Navigation }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setPanelOpen(true); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all",
                activeTab === tab.id 
                  ? "bg-primary text-white shadow-md shadow-primary/20" 
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
          <AnimatePresence mode="wait">
            {activeTab === 'stations' ? (
              <motion.div 
                key="stations"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-col gap-6"
              >
                {/* Major Stations */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <h3 className="text-lg font-black text-slate-800">{t.nearTitle}</h3>
                    <span className="text-xs font-bold text-primary bg-primary-pale px-2 py-1 rounded-lg">
                      {filteredStations.length} {t.found}
                    </span>
                  </div>
                  {filteredStations.map((s, idx) => (
                    <motion.div 
                      key={`station-${s.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => handleStationClick(s)}
                      className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-primary/30 transition-all cursor-pointer group"
                    >
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm border border-slate-100">
                        {s.t === 'minibus' ? '🚌' : s.t === 'bajaj' ? '🛺' : '🚗'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{lang === 'am' ? s.am : s.name}</div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                          {s.addr}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-xs font-black text-primary">★ {s.rat}</div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                          className={cn(
                            "transition-colors",
                            favorites.includes(s.id) ? "text-amber-400" : "text-slate-200"
                          )}
                        >
                          <Star className={cn("w-5 h-5", favorites.includes(s.id) && "fill-current")} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* All Routes */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <h3 className="text-lg font-black text-slate-800">{t.routes}</h3>
                    <span className="text-xs font-bold text-slate-400">
                      {filteredRoutes.length} Total
                    </span>
                  </div>
                  {filteredRoutes.slice(0, 30).map((r, idx) => (
                    <div 
                      key={`route-${idx}`}
                      onClick={() => handleStationClick(r.from)}
                      className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-primary/30 transition-all cursor-pointer"
                    >
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 border border-amber-100">
                        <Bus className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800 truncate">{r.name}</div>
                        <div className="text-xs text-slate-400 truncate">{r.from} → {r.to}</div>
                      </div>
                      <div className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded-lg border border-amber-200">
                        {r.code}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="trips"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <TripPlanner 
                  lang={lang} 
                  userLocation={userLocation}
                  initialOrigin={plannerInitialState.origin}
                  initialDestination={plannerInitialState.dest}
                  onPathSelect={handlePathSelect} 
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Station Detail Modal */}
      <AnimatePresence>
        {selectedStation && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-slate-50 flex flex-col"
          >
            <div className="h-48 bg-gradient-to-br from-primary-dark to-primary-light flex items-center justify-center relative shadow-lg">
              <button 
                onClick={() => setSelectedStation(null)}
                className="absolute top-6 left-6 p-2 bg-white/20 backdrop-blur-md rounded-xl text-white border border-white/20"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button 
                onClick={() => toggleFavorite(selectedStation.id)}
                className="absolute top-6 right-6 p-2 bg-white/20 backdrop-blur-md rounded-xl text-white border border-white/20"
              >
                <Star className={cn("w-6 h-6", favorites.includes(selectedStation.id) && "fill-amber-400 text-amber-400")} />
              </button>
              
              <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl border border-white/30 flex items-center justify-center text-5xl shadow-2xl">
                {selectedStation.t === 'minibus' ? '🚌' : selectedStation.t === 'bajaj' ? '🛺' : '🚗'}
              </div>
            </div>

            <div className="flex-1 -mt-8 bg-slate-50 rounded-t-[32px] p-6 shadow-2xl overflow-y-auto">
              <div>
                <h2 className="text-2xl font-black text-slate-800">{lang === 'am' ? selectedStation.am : selectedStation.name}</h2>
                <p className="text-slate-500 font-medium mt-1">{lang === 'am' ? selectedStation.addrAm : selectedStation.addr}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-8">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <div className="text-primary font-black text-lg">★ {selectedStation.rat}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Rating</div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <div className="text-primary font-black text-lg">{selectedStation.r.length}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Services</div>
                </div>
                <div className="bg-white p-3 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <div className="text-primary font-black text-lg">24/7</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Availability</div>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-4">Routes from here</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedStation.r.map(r => (
                    <span key={r} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm">
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-4">Operating Hours</h3>
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                    <div key={day} className="flex justify-between p-4 text-sm">
                      <span className="font-bold text-slate-500">{day}</span>
                      <span className="font-black text-slate-800">{selectedStation.h[idx]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 mt-8 mb-8">
                <button 
                  onClick={() => {
                    setPlannerInitialState({ origin: selectedStation.name });
                    setActiveTab('trips');
                    setPanelOpen(true);
                    setSelectedStation(null);
                  }}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-xl shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Navigation className="w-5 h-5" />
                  Routes from Here
                </button>
                <button 
                  onClick={() => {
                    setPlannerInitialState({ dest: selectedStation.name });
                    setActiveTab('trips');
                    setPanelOpen(true);
                    setSelectedStation(null);
                  }}
                  className="flex-1 py-4 bg-white border-2 border-primary text-primary rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <MapPin className="w-5 h-5" />
                  Directions To
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Menu Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9998]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-80 bg-white z-[9999] shadow-2xl flex flex-col p-6"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
                    <Bus className="w-6 h-6" />
                  </div>
                  <span className="font-black text-xl tracking-tighter">Taxi Tera</span>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {[
                  { icon: Bus, label: 'Nearby Stations', id: 'stations' },
                  { icon: Navigation, label: 'Trip Planner', id: 'trips' },
                  { icon: Star, label: 'Favorites', id: 'favs' },
                  { icon: Info, label: 'About App', id: 'about' }
                ].map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'stations' || item.id === 'trips') {
                        setActiveTab(item.id as any);
                        setPanelOpen(true);
                        setIsMenuOpen(false);
                      } else if (item.id === 'about') {
                        setIsAboutOpen(true);
                        setIsMenuOpen(false);
                      } else {
                        setIsMenuOpen(false);
                      }
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <item.icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                    <span className="font-bold text-slate-700">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    AM
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">Taxi Tera</div>
                    <div className="text-[10px] text-primary font-black uppercase tracking-wider mb-0.5">Developed by Tejo Interactives</div>
                    <div className="text-[10px] text-slate-400">v1.0.2 Beta Build</div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setLang(l => l === 'en' ? 'am' : 'en');
                    setIsMenuOpen(false);
                  }}
                  className="w-full py-3 bg-slate-100 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200 transition-all"
                >
                  Change to {lang === 'en' ? 'Amharic' : 'English'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {isAboutOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[10000] p-6 flex items-center justify-center bg-slate-900/40 backdrop-blur-md"
          >
            <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-8 pb-4 text-center">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Bus className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Taxi Tera</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Developed by Tejo Interactives</p>
                <p className="text-slate-400 text-sm mt-2">Addis Ababa Smart Transit</p>
              </div>
              
              <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6 text-slate-600">
                <section>
                  <h3 className="font-bold text-slate-800 mb-2">Our Mission</h3>
                  <p className="text-sm leading-relaxed">
                    Taxi Tera is designed to help commuters in Addis Ababa navigate the city's complex minibus and light rail network with ease using precise location-based routing.
                  </p>
                </section>
                
                <section>
                  <h3 className="font-bold text-slate-800 mb-2">Real Road Data</h3>
                  <p className="text-sm leading-relaxed">
                    Unlike other apps, we calculate actual walking and driving paths using OSRM geometry, ensuring you see the exact road path, not just a straight line.
                  </p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-800 mb-2">Open Transit</h3>
                  <p className="text-sm leading-relaxed">
                    Built for the community, by the community. We aim to map every "Taxi Tera" (Taxi Hub) in the city to reduce wait times and transfer confusion.
                  </p>
                </section>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
                <button 
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
                >
                  Got it!
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

