import { useEffect, useState } from 'react';
import { Sun, CloudRain, Cloud, CloudSnow, CloudLightning, CloudFog, Wind, Droplets, Settings, Search, RefreshCw, MapPin, Thermometer } from 'lucide-react';

type WeatherData = {
  city: string;
  country: string;
  temp: number;
  feelsLike: number;
  condition: string;
  code: number;
  humidity: number;
  windSpeed: number;
  lastUpdated: Date;
};

const STORAGE_KEY = 'soleerp-weather-city';

function codeToInfo(code: number): { label: string; Icon: typeof Sun } {
  if (code === 0) return { label: 'Sunny', Icon: Sun };
  if (code <= 2) return { label: 'Partly Cloudy', Icon: Cloud };
  if (code <= 48) return { label: 'Foggy', Icon: CloudFog };
  if (code <= 67) return { label: 'Rainy', Icon: CloudRain };
  if (code <= 77) return { label: 'Snowy', Icon: CloudSnow };
  if (code <= 82) return { label: 'Showers', Icon: CloudRain };
  if (code <= 99) return { label: 'Thunderstorm', Icon: CloudLightning };
  return { label: 'Cloudy', Icon: Cloud };
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      loadByCity(saved);
    } else {
      autoDetect();
    }
  }, []);

  async function autoDetect() {
    setLoading(true);
    setError(null);
    if (!navigator.geolocation) {
      // Fallback to IP geolocation
      await loadByIp();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await loadByCoords(pos.coords.latitude, pos.coords.longitude);
      },
      async () => {
        await loadByIp();
      },
      { timeout: 8000 }
    );
  }

  async function loadByIp() {
    try {
      const r = await fetch('https://ipapi.co/json/');
      if (!r.ok) throw new Error('IP geolocation failed');
      const d = await r.json();
      if (d.latitude && d.longitude) {
        await loadByCoords(d.latitude, d.longitude, d.city, d.country_name);
      } else {
        throw new Error('No location');
      }
    } catch {
      setError('Weather unavailable');
      setLoading(false);
    }
  }

  async function loadByCoords(lat: number, lon: number, cityName?: string, countryName?: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`);
      if (!r.ok) throw new Error('Weather API failed');
      const d = await r.json();
      let city = cityName;
      let country = countryName;
      if (!city) {
        try {
          const gr = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`);
          if (gr.ok) {
            const gd = await gr.json();
            city = gd?.results?.[0]?.name ?? 'Unknown';
            country = gd?.results?.[0]?.country ?? '';
          }
        } catch { city = city ?? 'Unknown'; }
      }
      const code = d.current?.weather_code ?? 0;
      const info = codeToInfo(code);
      setWeather({
        city: city ?? 'Unknown',
        country: country ?? '',
        temp: Math.round(d.current?.temperature_2m ?? 0),
        feelsLike: Math.round(d.current?.apparent_temperature ?? 0),
        condition: info.label,
        code,
        humidity: d.current?.relative_humidity_2m ?? 0,
        windSpeed: Math.round(d.current?.wind_speed_10m ?? 0),
        lastUpdated: new Date(),
      });
    } catch {
      setError('Weather unavailable');
    } finally {
      setLoading(false);
    }
  }

  async function loadByCity(city: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      if (!r.ok) throw new Error('City search failed');
      const d = await r.json();
      const res = d?.results?.[0];
      if (!res) throw new Error('City not found');
      await loadByCoords(res.latitude, res.longitude, res.name, res.country);
    } catch {
      setError('Weather unavailable');
      setLoading(false);
    }
  }

  function handleSearch() {
    if (!cityInput.trim()) return;
    setSearching(true);
    loadByCity(cityInput.trim()).finally(() => {
      setSearching(false);
      setShowSettings(false);
    });
  }

  function saveCity() {
    if (weather) localStorage.setItem(STORAGE_KEY, weather.city);
  }

  function resetAuto() {
    localStorage.removeItem(STORAGE_KEY);
    setShowSettings(false);
    autoDetect();
  }

  function refresh() {
    if (weather) loadByCity(weather.city);
    else autoDetect();
  }

  if (loading && !weather) {
    return (
      <div className="p-5 bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-slate-700 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <Sun size={16} className="text-amber-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">Weather</h3>
        </div>
        <div className="h-20 flex items-center justify-center text-slate-400 text-sm animate-pulse">Loading weather…</div>
      </div>
    );
  }

  if (error && !weather) {
    return (
      <div className="p-5 bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 relative">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Sun size={16} className="text-amber-500" /> Weather</h3>
          <button onClick={() => setShowSettings(!showSettings)} className="text-slate-400 hover:text-slate-600"><Settings size={14} /></button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">{error}</p>
        {showSettings && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600 space-y-2">
            <div className="flex gap-1">
              <input value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="Search city…" className="flex-1 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
              <button onClick={handleSearch} disabled={searching} className="px-2 py-1.5 rounded-lg bg-blue-600 text-white text-sm"><Search size={14} /></button>
            </div>
            <button onClick={resetAuto} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><MapPin size={11} /> Auto detect</button>
          </div>
        )}
      </div>
    );
  }

  if (!weather) return null;
  const info = codeToInfo(weather.code);
  const Icon = info.Icon;

  return (
    <div className="p-5 bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-800 dark:to-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Sun size={16} className="text-amber-500" /> Weather</h3>
        <div className="flex items-center gap-1">
          <button onClick={refresh} className="text-slate-400 hover:text-slate-600 p-1"><RefreshCw size={13} /></button>
          <button onClick={() => setShowSettings(!showSettings)} className="text-slate-400 hover:text-slate-600 p-1"><Settings size={14} /></button>
        </div>
      </div>

      {showSettings && (
        <div className="mb-3 pb-3 border-b border-slate-200 dark:border-slate-600 space-y-2 animate-fade-in">
          <div className="flex gap-1">
            <input value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="Search city…" className="flex-1 px-2 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200" onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
            <button onClick={handleSearch} disabled={searching} className="px-2 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"><Search size={14} /></button>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={saveCity} className="text-xs text-emerald-600 hover:underline">Save as preferred</button>
            <button onClick={resetAuto} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><MapPin size={11} /> Auto detect</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white/60 dark:bg-slate-600/50 flex items-center justify-center">
          <Icon size={32} className="text-amber-500" />
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{weather.temp}°C</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{weather.city}{weather.country ? `, ${weather.country}` : ''}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{weather.condition}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Thermometer size={12} className="text-orange-500" /> {weather.feelsLike}°C</div>
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Droplets size={12} className="text-blue-500" /> {weather.humidity}%</div>
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><Wind size={12} className="text-slate-500" /> {weather.windSpeed} km/h</div>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">Updated {weather.lastUpdated.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  );
}

export default WeatherWidget;
