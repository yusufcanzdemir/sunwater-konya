// Geoman is a classic Leaflet plugin and expects `window.L`. Import this before Geoman.
import L from 'leaflet';

(window as unknown as { L: typeof L }).L = L;
