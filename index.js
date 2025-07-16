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
  fromLonLat([-111.85, 33.41]), // Point 1 (Mesa)
  fromLonLat([-111.80, 33.42]), // Point 2
  fromLonLat([-111.75, 33.44])  // Point 3
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

const contextMenu = document.getElementById('context-menu');

// CLICK TO SELECT/DESLECT
map.on('singleclick', function (evt) {
  const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, f => f);

  if (clickedFeature && clickedFeature.getId() === 'mesa-line') {
    if (selectedFeature && selectedFeature !== clickedFeature) {
      selectedFeature.setStyle(defaultStyle);
    }

    clickedFeature.setStyle(selectedStyle);
    selectedFeature = clickedFeature;
  } else {
    // Clicked empty space — deselect
    if (selectedFeature) {
      selectedFeature.setStyle(defaultStyle);
      selectedFeature = null;
    }

    // Also hide context menu and trail points
    contextMenu.style.display = 'none';
    if (vertexLayer) {
      map.removeLayer(vertexLayer);
      vertexLayer = null;
    }
    isCreatingTrail = false;
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
  }
});

// HIDE CONTEXT MENU ON CLICK OUTSIDE
document.addEventListener('click', function (evt) {
  if (!contextMenu.contains(evt.target)) {
    contextMenu.style.display = 'none';
  }
});

// CONTEXT MENU ACTIONS
contextMenu.addEventListener('click', function (evt) {
  const action = evt.target.getAttribute('data-action');
  if (!action || !selectedFeature) return;

  switch (action) {
    case 'Create trail': {
      if (selectedFeature.getGeometry().getType() === 'LineString') {
        isCreatingTrail = true;

        const coords = selectedFeature.getGeometry().getCoordinates();
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
      map.getView().setZoom(map.getView().getZoom() - 1);
      break;

    case 'Deselect':
      selectedFeature.setStyle(defaultStyle);
      selectedFeature = null;
      if (vertexLayer) {
        map.removeLayer(vertexLayer);
        vertexLayer = null;
      }
      isCreatingTrail = false;
      break;
  }
  // if (selectedFeature && selectedFeature !== feature) {
  //   selectedFeature.setStyle(defaultStyle);
  // }
  
  // if (!featureClicked && selectedFeature) {
  //   selectedFeature.setStyle(defaultStyle);
  //   selectedFeature = null;
  // }
  
  // selectedFeature = feature;

  contextMenu.style.display = 'none';
});