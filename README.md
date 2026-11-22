# Trip Adventure

PWA para seguir un viaje como un mapa de niveles: roadmap, mapa real con GPS, calendario, presupuesto, editor e importación/exportación. **No incluye ningún itinerario**: cada usuario importa su propio JSON y los datos se guardan solo en su dispositivo (IndexedDB).

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # dist/
```

- Esquema de datos: `src/types.ts`. Viaje de muestra: `public/data/trip.json`.
- Importar/exportar desde el menú de la app (JSON, JSON con progreso, CSV de presupuesto, imprimible).
- Servicios gratuitos sin clave: OpenFreeMap/OSM (mapa), OSRM (rutas), Nominatim (geocodificación), Open‑Meteo (clima). Se pueden cambiar con `VITE_MAP_STYLE_URL`, `VITE_ROUTING_URL`, `VITE_GEOCODER_URL`.
- La ubicación solo se usa con permiso y no se guarda historial.
