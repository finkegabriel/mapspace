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

const coords = [
  // fromLonLat([-111.85, 33.41]), // Point 1 (Mesa)
  // fromLonLat([-111.80, 33.42]), // Point 2
  // fromLonLat([-111.75, 33.44])  // Point 3
];

const lineFeature = new Feature(new LineString(coords));
lineFeature.setId('mesa-line');
lineFeature.setStyle(defaultStyle);

// Vector layer and source
const vectorSource = new VectorSource({ features: [lineFeature] });
const vectorLayer = new VectorLayer({ source: vectorSource });

map.addLayer(vectorLayer)

// Track selected feature
// Global state
let selectedFeature = null;
let vertexLayer = null;
let isCreatingTrail = false;
let originalCoords = null; // stores original geometry before editing
let rightClick = false;
const trailFeatures = []; // Global array to store trail line features

const contextMenu = document.getElementById('context-menu');
const contextMenuTrail = document.getElementById('context-menu-trail');

// CLICK TO SELECT/DESLECT
map.on('singleclick', function (evt) {
  const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, f => f);

  if (clickedFeature && clickedFeature.getGeometry().getType() === 'LineString') {
    if (selectedFeature && selectedFeature !== clickedFeature) {
      selectedFeature.setStyle(defaultStyle);
    }

    clickedFeature.setStyle(selectedStyle);
    selectedFeature = clickedFeature;
  } else {
    // Clicked empty space — only deselect if not adding trail
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

map.on('click', function (evt) {
  if (!isCreatingTrail || !selectedFeature) return;

  const featureAtPixel = map.forEachFeatureAtPixel(evt.pixel, f => f);
  if (featureAtPixel && featureAtPixel !== selectedFeature) return;

  const geometry = selectedFeature.getGeometry();
  if (geometry.getType() !== 'LineString') return;

  const coords = geometry.getCoordinates();
  coords.push(evt.coordinate); // Add the clicked point
  geometry.setCoordinates(coords); // Update the line

  // Add a red vertex dot for the new point
  const newVertex = new Feature(new Point(evt.coordinate));
  newVertex.setStyle(new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: 'red' }),
      stroke: new Stroke({ color: 'white', width: 2 }),
    }),
  }));

  if (vertexLayer && vertexLayer.getSource()) {
    vertexLayer.getSource().addFeature(newVertex);
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

// HIDE CONTEXT MENU ON CLICK OUTSIDE
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

contextMenuTrail.addEventListener('click', function (evt) {
  const action = evt.target.getAttribute('data-action');
  if (action !== 'trail-mode') return;

  isCreatingTrail = true;
  document.body.style.cursor = 'crosshair';

  // Create a new LineString feature with empty coordinates
  const newFeature = new Feature(new LineString([]));
  newFeature.setId(`trail-${Date.now()}`);
  newFeature.setStyle(selectedStyle);

  // Add it to the vector source
  vectorSource.addFeature(newFeature);

  // Save it to our array of trail features
  trailFeatures.push(newFeature);

  // Set as currently selected
  selectedFeature = newFeature;

  // Create (or reset) vertex layer
  if (vertexLayer) map.removeLayer(vertexLayer);
  vertexLayer = new VectorLayer({ source: new VectorSource() });
  map.addLayer(vertexLayer);

  // Hide the context menu
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

        originalCoords = [...selectedFeature.getGeometry().getCoordinates()]; // save a copy
        const coords = originalCoords.map(coord => [...coord]); // use a deep copy
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
      }
      break;
    }

    case 'Replace trail':
      if (isCreatingTrail) {
        originalCoords = null; // discard old version, keep new one
        isCreatingTrail = false;

        if (vertexLayer) {
          map.removeLayer(vertexLayer);
          vertexLayer = null;
        }
      }

      selectedFeature.setStyle(selectedStyle);
      document.body.style.cursor = 'auto';
      break;

    case 'Deselect':
      if (isCreatingTrail && originalCoords) {
        selectedFeature.getGeometry().setCoordinates(originalCoords); // restore original line
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
      
      originalCoords = [...selectedFeature.getGeometry().getCoordinates()]; // save a copy
      const coords = originalCoords.map(coord => [...coord]); // use a deep copy
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
