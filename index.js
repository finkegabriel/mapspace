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

// Configure canvas for frequent pixel reads
const map = new Map({
  target: 'app',
  pixelRatio: 1,
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
let selectedVertexIndex = -1; // Track the currently selected vertex
let isBranching = false; // Track if we're in branch creation mode
let branchStartCoord = null; // Store the starting coordinate for the branch

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
      selectedVertexIndex = -1;

      contextMenu.style.display = 'none';
      if (vertexLayer) {
        map.removeLayer(vertexLayer);
        vertexLayer = null;
      }
    }
  }
});

// Function to update all vertices
function updateVertices() {
  if (!vertexLayer || !selectedFeature) return;
  
  const coords = selectedFeature.getGeometry().getCoordinates();
  vertexLayer.getSource().clear();
  
  coords.forEach((coord, index) => {
    if (coord && Array.isArray(coord) && coord.length >= 2) {
      const vertex = new Feature(new Point(coord));
      const isSelected = index === selectedVertexIndex;
      
      vertex.setStyle(new Style({
        image: new CircleStyle({
          radius: isSelected ? 8 : 6,
          fill: new Fill({ color: isSelected ? 'yellow' : 'red' }),
          stroke: new Stroke({ color: isSelected ? 'black' : 'white', width: 2 }),
        }),
      }));
      
      vertexLayer.getSource().addFeature(vertex);
    }
  });
}

// ADD TRAIL POINTS (always create new vertex feature, even if overlap)
map.on('click', function (evt) {
  if (!isCreatingTrail || !selectedFeature) return;

  const featureAtPixel = map.forEachFeatureAtPixel(evt.pixel, f => f);
  
  // Handle first click for a new trail
  if (selectedFeature.get('isFirstPoint')) {
    const geometry = selectedFeature.getGeometry();
    geometry.setCoordinates([evt.coordinate]);
    selectedFeature.unset('isFirstPoint');
    selectedVertexIndex = 0;
    updateVertices();
    return;
  }

  // Handle clicks when a vertex is highlighted for branching
  if (selectedVertexIndex !== -1) {
    const clickedCoord = evt.coordinate;
    const geometry = selectedFeature.getGeometry();
    const coords = geometry.getCoordinates();
    
    // Store the original coordinates before branching if not already stored
    if (!selectedFeature.get('originalCoords')) {
      selectedFeature.set('originalCoords', [...coords]);
    }
    
    // Create a new branch from the selected vertex
    const currentCoords = [...coords]; // Copy current coordinates
    const newBranch = currentCoords.slice(0, selectedVertexIndex + 1); // Keep up to selected vertex
    newBranch.push(clickedCoord); // Add the new point
    
    // Update the coordinates with the new branch
    geometry.setCoordinates(newBranch);
    
    // Update vertex selection to the new point
    selectedVertexIndex = newBranch.length - 1;
    
    // Update vertices display
    updateVertices();
    
    return;
  }

  // Normal trail creation logic
  if (featureAtPixel && featureAtPixel !== selectedFeature) return;

  const geometry = selectedFeature.getGeometry();
  if (geometry.getType() !== 'LineString') return;

  const coords = geometry.getCoordinates();
  
  // If we're branching and this is the first point, make sure we start from the branch point
  if (isBranching && coords.length === 1) {
    coords[0] = branchStartCoord;
  }
  
  // If we have a selected vertex, insert the new point after it
  if (selectedVertexIndex !== -1) {
    // Insert the new point after the selected vertex
    coords.splice(selectedVertexIndex + 1, 0, evt.coordinate);
    // Update the selected vertex to the newly added point
    selectedVertexIndex++;
  } else {
    // If no vertex is selected, add to the end as before
    coords.push(evt.coordinate);
    selectedVertexIndex = coords.length - 1; // Select the newly added vertex
  }
  
  geometry.setCoordinates(coords);

  // Ensure vertex layer exists
  if (!vertexLayer) {
    vertexLayer = new VectorLayer({
      source: new VectorSource()
    });
    map.addLayer(vertexLayer);
  }

  // Update vertices
  updateVertices();

  // Reset branching state after first point is added
  if (isBranching) {
    isBranching = false;
    branchStartCoord = null;
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

// Handle keyboard navigation for vertices
document.addEventListener('keydown', function(evt) {
  if (!selectedFeature || !vertexLayer) return;
  
  const coords = selectedFeature.getGeometry().getCoordinates();
  if (coords.length === 0) return;

  if (evt.ctrlKey) {
    // Update vertex selection based on arrow key
    if (evt.key === 'ArrowLeft') {
      selectedVertexIndex = selectedVertexIndex <= 0 ? coords.length - 1 : selectedVertexIndex - 1;
      highlightVertex(selectedVertexIndex);
    } else if (evt.key === 'ArrowRight') {
      selectedVertexIndex = selectedVertexIndex >= coords.length - 1 ? 0 : selectedVertexIndex + 1;
      highlightVertex(selectedVertexIndex);
    }
  // Only handle Ctrl+Arrow keys for vertex navigation
  }
});

// Function to highlight the selected vertex
function highlightVertex(index) {
  if (!vertexLayer || !selectedFeature) return;
  
  const coords = selectedFeature.getGeometry().getCoordinates();
  if (index < 0 || index >= coords.length) return;

  updateVertices();
  
  // Center the map on the selected vertex
  map.getView().animate({
    center: coords[index],
    duration: 200
  });
}

// CONTEXT MENU: TRAIL MODE (empty trail)
contextMenuTrail.addEventListener('click', function (evt) {
  const action = evt.target.getAttribute('data-action');
  if (action !== 'trail-mode') return;

  isCreatingTrail = true;
  document.body.style.cursor = 'crosshair';

  // Initialize with a first point at click location
  const newFeature = new Feature(new LineString([]));
  newFeature.setId(`trail-${Date.now()}`);
  newFeature.setStyle(selectedStyle);
  newFeature.set('isFirstPoint', true);

  vectorSource.addFeature(newFeature);
  trailFeatures.push(newFeature);
  selectedFeature = newFeature;

  // Create fresh vertex layer
  if (vertexLayer) map.removeLayer(vertexLayer);
  vertexLayer = new VectorLayer({ 
    source: new VectorSource(),
    style: new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: 'red' }),
        stroke: new Stroke({ color: 'white', width: 2 }),
      }),
    })
  });
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

        // Store original coordinates
        originalCoords = [...selectedFeature.getGeometry().getCoordinates()];
        const coords = originalCoords.map(coord => [...coord]);

        // Remove any existing vertex layer
        if (vertexLayer) {
          map.removeLayer(vertexLayer);
        }

        // Create new vertex layer
        vertexLayer = new VectorLayer({
          source: new VectorSource()
        });
        map.addLayer(vertexLayer);

        // Add vertices for existing points
        coords.forEach((coord, index) => {
          if (coord && Array.isArray(coord) && coord.length >= 2) {
            const vertex = new Feature(new Point(coord));
            vertex.setStyle(new Style({
              image: new CircleStyle({
                radius: 6,
                fill: new Fill({ color: 'red' }),
                stroke: new Stroke({ color: 'white', width: 2 }),
              }),
            }));
            vertexLayer.getSource().addFeature(vertex);
          }
        });
        // --- Update whenever features change ---
        // vectorSource.on('removefeature', updateTextarea);
      }
      break;
    }
    case 'Replace trail':
      if (isCreatingTrail) {
        // Create a new feature with the current state of the LineString
        const currentCoords = selectedFeature.getGeometry().getCoordinates();
        const originalCoords = selectedFeature.get('originalCoords');
        
        if (originalCoords) {
          // Create a new feature for the branch
          const branchFeature = new Feature(new LineString(currentCoords));
          branchFeature.setId(`trail-${Date.now()}`);
          branchFeature.setStyle(selectedStyle);
          
          // Restore original coordinates to the parent feature
          selectedFeature.getGeometry().setCoordinates(originalCoords);
          selectedFeature.setStyle(defaultStyle);
          selectedFeature.unset('originalCoords');
          
          // Add the new branch feature
          vectorSource.addFeature(branchFeature);
          selectedFeature = branchFeature;
        }
        
        isCreatingTrail = false;

        if (vertexLayer) {
          map.removeLayer(vertexLayer);
          vertexLayer = null;
        }

        // update textarea with all features
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
