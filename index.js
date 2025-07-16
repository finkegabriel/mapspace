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
let selectedFeature = null;

map.on('singleclick', function (evt) {
  let featureClicked = false;

  map.forEachFeatureAtPixel(evt.pixel, function (feature) {
    // Clicked the line
    if (feature.getId() === 'mesa-line') {
      feature.setStyle(selectedStyle);
      featureClicked = true;
      const contextMenu = document.getElementById('context-menu');

      // Show custom menu on right click
      map.getTargetElement().addEventListener('contextmenu', function (evt) {
        evt.preventDefault();

        // Get map coordinate from mouse event
        const pixel = map.getEventPixel(evt);
        const feature = map.forEachFeatureAtPixel(pixel, function (feature) {
          return feature;
        });

        // Only show context menu if a feature was clicked
        if (feature) {
          // Optionally store the feature if you want to act on it
          selectedFeature = feature;

          // Position the menu
          contextMenu.style.left = evt.clientX + 'px';
          contextMenu.style.top = evt.clientY + 'px';
          contextMenu.style.display = 'block';
        } else {
          // Hide the menu if no feature
          contextMenu.style.display = 'none';
        }
      });

      // Hide menu on map click or elsewhere
      map.on('click', () => {
        contextMenu.style.display = 'none';
      });

      document.addEventListener('click', (evt) => {
        // Hide menu if clicking outside of it
        if (!contextMenu.contains(evt.target)) {
          contextMenu.style.display = 'none';
        }
      });

      // Handle menu item clicks
      contextMenu.addEventListener('click', (evt) => {
        const action = evt.target.getAttribute('data-action');
        if (!action) return;

        switch (action) {
          case 'Create trail':
            map.getView().setZoom(map.getView().getZoom() + 1);
            break;
          case 'Replace trail':
            map.getView().setZoom(map.getView().getZoom() - 1);
            break;
          case 'Deselect':
              selectedFeature.setStyle(defaultStyle);
              featureClicked = false;
            break;
        }

        contextMenu.style.display = 'none';
      });
      if (selectedFeature && selectedFeature !== feature) {
        selectedFeature.setStyle(defaultStyle);
      }

      selectedFeature = feature;
    }
  });

  // Clicked elsewhere on map, reset previous feature
  if (!featureClicked && selectedFeature) {
    selectedFeature.setStyle(defaultStyle);
    selectedFeature = null;
  }
});
