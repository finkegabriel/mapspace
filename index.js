import Point from 'ol/geom/Point';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Map from './node_modules/ol/Map';
import View from './node_modules/ol/View';
import TileLayer from './node_modules/ol/layer/Tile';
import XYZ from './node_modules/ol/source/XYZ';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import { fromLonLat } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON.js';

// Default and selected styles
const defaultStyle = new Style({
  stroke: new Stroke({
    color: 'blue',
    width: 2,
  }),
});

const selectedStyle = new Style({
  stroke: new Stroke({
    color: 'yellow',
    width: 2,
  }),
});

const map = new Map({
  target: 'app',
  layers: [
    new TileLayer({
      source: new XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      })
    })
  ],
  view: new View({
    center: fromLonLat([-111.8315, 33.4152]), // [lon, lat]
    zoom: 12
  })
});

const current_view = map.getView();

current_view.on('change:resolution', function () {
  const zooms = current_view.getZoom();
  // console.log('Zoom level changed to:', zooms);
  // handleZoomChange(currentZoom); 
});


const coords = [];
const lineFeature = new Feature(new LineString(coords));
lineFeature.setId('line');
lineFeature.setStyle(defaultStyle);

// Vector layer and source
const vectorSource = new VectorSource({ features: [lineFeature] });
const vectorLayer = new VectorLayer({ source: vectorSource });

map.addLayer(vectorLayer);

// Global state
let selectedFeature = null;
let vertexLayer = null;
let isCreatingTrail = false;
let originalCoords = null;
const trailFeatures = [];

const contextMenu = document.getElementById('context-menu');
const contextMenuTrail = document.getElementById('context-menu-trail');

const textarea = document.getElementById('geojson');
const format = new GeoJSON();

function updateTextarea() {
  // Get all features, convert to GeoJSON
  const features = vectorSource.getFeatures();
  const geojson = format.writeFeatures(features, {
    featureProjection: map.getView().getProjection()
  });

  // Update textarea
  textarea.value = geojson;
}

// CLICK TO SELECT/DESELECT
map.on('singleclick', function (evt) {
  const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, f => f);

  if (clickedFeature && clickedFeature.getGeometry().getType() === 'LineString') {
    if (selectedFeature && selectedFeature !== clickedFeature) {
      selectedFeature.setStyle(defaultStyle);
    }
    clickedFeature.setStyle(selectedStyle);
    selectedFeature = clickedFeature;
  } else {
    if (!isCreatingTrail && selectedFeature) {
      selectedFeature.setStyle(defaultStyle);
      selectedFeature = null;

      contextMenu.style.display = 'none';
      if (vertexLayer) {
        map.removeLayer(vertexLayer);
        vertexLayer = null;
      }
    }
  }
});

// ADD TRAIL POINTS (always create new vertex feature, even if overlap)
map.on('click', function (evt) {
  if (!isCreatingTrail || !selectedFeature) return;

  const featureAtPixel = map.forEachFeatureAtPixel(evt.pixel, f => f);
  if (featureAtPixel && featureAtPixel !== selectedFeature) return;

  const geometry = selectedFeature.getGeometry();
  if (geometry.getType() !== 'LineString') return;

  const coords = geometry.getCoordinates();
  coords.push(evt.coordinate);
  geometry.setCoordinates(coords);

  // Always add a new red vertex dot, even if it overlaps
  const newVertex = new Feature(new Point(evt.coordinate));
  newVertex.setStyle(new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: 'red' }),
      stroke: new Stroke({ color: 'white', width: 2 }),
    }),
  }));

  if (vertexLayer && vertexLayer.getSource()) {
    vertexLayer.getSource().addFeature(newVertex); // no checks
  }
});

// CONTEXT MENU (right click)
map.getTargetElement().addEventListener('contextmenu', function (evt) {
  evt.preventDefault();

  if (selectedFeature) {
    contextMenu.style.left = `${evt.clientX}px`;
    contextMenu.style.top = `${evt.clientY}px`;
    contextMenu.style.display = 'block';
  } else {
    contextMenu.style.display = 'none';
    contextMenuTrail.style.left = `${evt.clientX}px`;
    contextMenuTrail.style.top = `${evt.clientY}px`;
    contextMenuTrail.style.display = 'block';
  }
});

// HIDE CONTEXT MENU
document.addEventListener('click', function (evt) {
  if (!contextMenu.contains(evt.target)) {
    contextMenu.style.display = 'none';
  }
});
document.addEventListener('click', function (evt) {
  if (!contextMenuTrail.contains(evt.target)) {
    contextMenuTrail.style.display = 'none';
  }
});

// CONTEXT MENU: TRAIL MODE (empty trail)
contextMenuTrail.addEventListener('click', function (evt) {
  const action = evt.target.getAttribute('data-action');
  if (action !== 'trail-mode') return;

  isCreatingTrail = true;
  document.body.style.cursor = 'crosshair';

  const newFeature = new Feature(new LineString([]));
  newFeature.setId(`trail-${Date.now()}`);
  newFeature.setStyle(selectedStyle);

  vectorSource.addFeature(newFeature);
  trailFeatures.push(newFeature);

  map.on('singleclick', (evt) => {
    console.log("points ", newFeature);
  });

  selectedFeature = newFeature;

  if (vertexLayer) map.removeLayer(vertexLayer);
  vertexLayer = new VectorLayer({ source: new VectorSource() });
  map.addLayer(vertexLayer);

  contextMenuTrail.style.display = 'none';
});

// CONTEXT MENU ACTIONS
contextMenu.addEventListener('click', function (evt) {
  const action = evt.target.getAttribute('data-action');
  if (!action || !selectedFeature) return;

  switch (action) {
    case 'Create trail': {
      if (selectedFeature.getGeometry().getType() === 'LineString') {
        isCreatingTrail = true;

        originalCoords = [...selectedFeature.getGeometry().getCoordinates()];
        const coords = originalCoords.map(coord => [...coord]);
        const points = coords.map(coord => new Feature(new Point(coord)));

        const pointStyle = new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: 'red' }),
            stroke: new Stroke({ color: 'white', width: 2 }),
          }),
        });

        points.forEach(pt => pt.setStyle(pointStyle));
        if (vertexLayer) map.removeLayer(vertexLayer);
        vertexLayer = new VectorLayer({
          source: new VectorSource({ features: points }),
        });
        map.addLayer(vertexLayer);
        // --- Update whenever features change ---
        // vectorSource.on('removefeature', updateTextarea);
      }
      break;
    }
    case 'Replace trail':
      if (isCreatingTrail) {
        // finalize trail editing
        originalCoords = null;
        isCreatingTrail = false;

        if (vertexLayer) {
          map.removeLayer(vertexLayer);
          vertexLayer = null;
        }

        // update textarea with all current features
        updateTextarea();
      }

      selectedFeature.setStyle(selectedStyle);
      document.body.style.cursor = 'auto';
      break;

    case 'Deselect':
      if (isCreatingTrail && originalCoords) {
        selectedFeature.getGeometry().setCoordinates(originalCoords);
        originalCoords = null;
      }
      selectedFeature.setStyle(defaultStyle);
      selectedFeature = null;
      if (vertexLayer) {
        map.removeLayer(vertexLayer);
        vertexLayer = null;
      }
      isCreatingTrail = false;
      document.body.style.cursor = 'auto';
      break;

    case 'trail-mode': {
      isCreatingTrail = true;
      originalCoords = [...selectedFeature.getGeometry().getCoordinates()];
      const coords = originalCoords.map(coord => [...coord]);
      const points = coords.map(coord => new Feature(new Point(coord)));

      const pointStyle = new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: 'red' }),
          stroke: new Stroke({ color: 'white', width: 2 }),
        }),
      });

      points.forEach(pt => pt.setStyle(pointStyle));

      if (vertexLayer) map.removeLayer(vertexLayer);
      vertexLayer = new VectorLayer({
        source: new VectorSource({ features: points }),
      });
      map.addLayer(vertexLayer);
      break;
    }
  }
  contextMenuTrail.style.display = "none";
  contextMenu.style.display = 'none';
});
