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


// Vector layer and source (start empty — trails are added when created)
const vectorSource = new VectorSource();
const vectorLayer = new VectorLayer({ source: vectorSource });
map.addLayer(vectorLayer);

// Global state
let selectedFeature = null;
let vertexLayer = null;
let isCreatingTrail = false;
let originalCoords = null;
const trailFeatures = [];
let selectedVertexIndex = -1; // index within the currently selected feature
let globalSelectedIndex = -1; // global index across all trail features
let vertexMap = []; // array of { feature, index, coord }
let isBranching = false; // Track if we're adding points to a branch feature
let branchParent = null; // { feature, index } when a branch was created
// If true, the map will smoothly center on the selected vertex. Default false to avoid panning on clicks.
let autoPanOnSelect = false;

const contextMenu = document.getElementById('context-menu');
const contextMenuTrail = document.getElementById('context-menu-trail');

const textarea = document.getElementById('geojson');
const format = new GeoJSON();

function updateTextarea() {
  // Get all features, convert to GeoJSON
  const features = vectorSource.getFeatures();
  const geojson = format.writeFeatures(features, {
    featureProjection: map.getView().getProjection(),
    dataProjection: 'EPSG:4326'
  });

  // Update textarea
  textarea.value = geojson;
}

// CLICK TO SELECT/DESELECT
map.on('singleclick', function (evt) {
  const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, f => f);

  if (clickedFeature && clickedFeature.getGeometry().getType() === 'LineString') {
    // Make sure only this feature is highlighted; set all other features to default
    vectorSource.getFeatures().forEach(f => {
      if (f === clickedFeature) {
        f.setStyle(selectedStyle);
      } else {
        f.setStyle(defaultStyle);
      }
    });

    // Select this feature and make it the single editable trail
    selectedFeature = clickedFeature;
    // Do NOT show vertices on plain click. Vertices will be shown when the user chooses
    // 'Create trail' from the context menu. Keep trailFeatures untouched here.
  } else {
    if (!isCreatingTrail && selectedFeature) {
      // Clear selection and stop editing any trail
      selectedFeature.setStyle(defaultStyle);
      selectedFeature = null;
      selectedVertexIndex = -1;

      // Clear editable trails so vertices disappear
      trailFeatures.length = 0;

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
  // Render vertices for all trail features (so branches and parent are visible)
  if (!vertexLayer) {
    vertexLayer = new VectorLayer({ source: new VectorSource() });
    map.addLayer(vertexLayer);
  }

  const src = vertexLayer.getSource();
  src.clear();

  // Rebuild the vertex map from trailFeatures to maintain a global ordering
  vertexMap = [];
  trailFeatures.forEach(feat => {
    const geometry = feat.getGeometry();
    if (!geometry || geometry.getType() !== 'LineString') return;
    const coords = geometry.getCoordinates();
    coords.forEach((coord, idx) => {
      vertexMap.push({ feature: feat, index: idx, coord });
    });
  });

  // Add a point feature for each vertex in the map
  vertexMap.forEach((entry, gIndex) => {
    if (!entry.coord || !Array.isArray(entry.coord)) return;
    const isSelected = gIndex === globalSelectedIndex;
    const vertex = new Feature(new Point(entry.coord));
    vertex.setStyle(new Style({
      image: new CircleStyle({
        radius: isSelected ? 8 : 6,
        fill: new Fill({ color: isSelected ? 'yellow' : 'red' }),
        stroke: new Stroke({ color: isSelected ? 'black' : 'white', width: 2 }),
      }),
    }));
    // store metadata so we can identify clicks on vertex features if needed
    vertex.set('gIndex', gIndex);
    src.addFeature(vertex);
  });
}

function setGlobalSelected(gIndex) {
  if (gIndex < 0 || gIndex >= vertexMap.length) return;
  globalSelectedIndex = gIndex;
  const entry = vertexMap[gIndex];
  selectedFeature = entry.feature;
  selectedVertexIndex = entry.index;
  updateVertices();

  // center the view on selection
  if (autoPanOnSelect) {
    map.getView().animate({ center: entry.coord, duration: 200 });
  }
}

// Create a new branch feature starting at a given vertex (does NOT remove or change the parent).
function createBranchFromVertex(parentEntry) {
  if (!parentEntry) return;
  const start = parentEntry.coord;
  const branchFeature = new Feature(new LineString([start]));
  branchFeature.setId(`trail-${Date.now()}`);
  branchFeature.setStyle(selectedStyle);

  // Add branch to source and make it the only editable trail
  vectorSource.addFeature(branchFeature);
  trailFeatures.length = 0;
  trailFeatures.push(branchFeature);

  selectedFeature = branchFeature;
  isBranching = true;
  branchParent = { feature: parentEntry.feature, index: parentEntry.index };

  updateVertices();
  // select the branch start vertex
  const idx = vertexMap.findIndex(e => e.feature === branchFeature && e.index === 0);
  if (idx !== -1) setGlobalSelected(idx);
}

// ADD TRAIL POINTS (handles appending, inserting and branching while keeping all trail features editable)
map.on('click', function (evt) {
  // Only handle clicks while in trail creation mode
  if (!isCreatingTrail) return;

  const featureAtPixel = map.forEachFeatureAtPixel(evt.pixel, f => f);
  // Handle first click for a newly created empty trail feature
  const clickedOnVertex = featureAtPixel && featureAtPixel.get('gIndex') !== undefined;

  // If the user clicked directly on a rendered vertex marker, do nothing here.
  // We don't want clicks on vertex graphics to move existing vertices —
  // extension should happen by clicking the map empty area after highlighting a vertex.
  if (clickedOnVertex) return;

  // Handle first click for a newly created empty trail feature
  if (selectedFeature && selectedFeature.get('isFirstPoint')) {
    const geometry = selectedFeature.getGeometry();
    geometry.setCoordinates([evt.coordinate]);
    selectedFeature.unset('isFirstPoint');
    if (!trailFeatures.includes(selectedFeature)) trailFeatures.push(selectedFeature);
    updateVertices();
    setGlobalSelected(vertexMap.length - 1);
    return;
  }

  // If a global vertex is selected and the click is on empty map (not on an existing line or vertex),
  // then branch if the selected vertex is not the last vertex of its LineString (create a new LineString
  // starting at that vertex). If the selected vertex is the last vertex, append to the same LineString.
  if (globalSelectedIndex !== -1) {
    const clickedOnVertex = featureAtPixel && featureAtPixel.get('gIndex') !== undefined;
    const clickedOnLine = featureAtPixel && featureAtPixel.getGeometry && featureAtPixel.getGeometry().getType() === 'LineString';

    if (!clickedOnVertex && !clickedOnLine) {
      const parentEntry = vertexMap[globalSelectedIndex];
      const parentFeature = parentEntry.feature;
      const parentIdx = parentEntry.index;
      const parentGeom = parentFeature.getGeometry();
      const parentCoords = parentGeom.getCoordinates();

      // If selected vertex is not the last vertex, start an in-place branch edit
      // by inserting the clicked point into the parent LineString after selected vertex
      // but first store the original coordinates so the user can 'Replace trail' later
      if (parentIdx < parentCoords.length - 1) {
        // When branching from an earlier vertex, append the branch to the END of the same LineString
        // by duplicating the branch start vertex at the end and then adding the new point. This preserves
        // the original sequence of the parent and avoids moving existing segments.
        if (!parentFeature.get('originalCoords')) {
          parentFeature.set('originalCoords', parentCoords.slice());
        }

        const originalLength = parentCoords.length;
        const newCoords = parentCoords.slice();
        // duplicate the start vertex so the branch is attached at the end
        newCoords.push(parentEntry.coord);
        // add the new clicked coordinate (branch endpoint)
        newCoords.push(evt.coordinate);
        parentGeom.setCoordinates(newCoords);

        // record where the branch starts so Replace trail can split it out later
        parentFeature.set('branchStart', originalLength);

        // Keep editing the same parent feature (branch is part of it until Replace trail)
        selectedFeature = parentFeature;
        trailFeatures.length = 0;
        trailFeatures.push(parentFeature);

        // Update vertex rendering and select the newly inserted branch endpoint
        updateVertices();
        setGlobalSelected(vertexMap.findIndex(e => e.feature === parentFeature && e.index === newCoords.length - 1));

        isBranching = true;
        branchParent = { feature: parentFeature, index: parentIdx };
        return;
      }

      // Otherwise append to the end of the parent LineString
      const newParentCoords = parentCoords.slice();
      newParentCoords.push(evt.coordinate);
      parentGeom.setCoordinates(newParentCoords);

      selectedFeature = parentFeature;
      if (!trailFeatures.includes(parentFeature)) {
        trailFeatures.length = 0;
        trailFeatures.push(parentFeature);
      }

      updateVertices();
      setGlobalSelected(vertexMap.findIndex(e => e.feature === parentFeature && e.index === newParentCoords.length - 1));
      return;
    }
  }

  // Normal trail creation / appending behavior: append or insert into the currently selected feature
  if (!selectedFeature) return;
  const geometry = selectedFeature.getGeometry();
  if (!geometry || geometry.getType() !== 'LineString') return;

  const coords = geometry.getCoordinates();

  // If currently editing a branch, append to its end
  if (isBranching && trailFeatures.includes(selectedFeature)) {
    coords.push(evt.coordinate);
    geometry.setCoordinates(coords);
    updateVertices();
    setGlobalSelected(vertexMap.findIndex(e => e.feature === selectedFeature && e.index === coords.length - 1));
    return;
  }

  // If a global vertex is selected within this feature, insert after that vertex
  if (globalSelectedIndex !== -1) {
    const entry = vertexMap[globalSelectedIndex];
    if (entry && entry.feature === selectedFeature) {
      // Use a copy of the coords array to avoid mutating references
      const newCoords = coords.slice();
      newCoords.splice(entry.index + 1, 0, evt.coordinate);
      geometry.setCoordinates(newCoords);
      updateVertices();
      setGlobalSelected(vertexMap.findIndex(e => e.feature === selectedFeature && e.index === entry.index + 1));
      return;
    }
  }

  // Default: append to the end
  coords.push(evt.coordinate);
  geometry.setCoordinates(coords);
  updateVertices();
  setGlobalSelected(vertexMap.findIndex(e => e.feature === selectedFeature && e.index === coords.length - 1));
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

// Handle keyboard navigation for vertices across all trail features
document.addEventListener('keydown', function(evt) {
  if (!vertexMap || vertexMap.length === 0) return;

  if (!evt.ctrlKey) return; // only navigate with Ctrl+Arrow

  if (evt.key === 'ArrowLeft') {
    globalSelectedIndex = globalSelectedIndex <= 0 ? vertexMap.length - 1 : globalSelectedIndex - 1;
    setGlobalSelected(globalSelectedIndex);
  } else if (evt.key === 'ArrowRight') {
    globalSelectedIndex = globalSelectedIndex >= vertexMap.length - 1 ? 0 : globalSelectedIndex + 1;
    setGlobalSelected(globalSelectedIndex);
  }
});

// Keyboard shortcut: 'b' to split/create branch from the currently selected vertex
document.addEventListener('keydown', function(evt) {
  if (evt.key === 'b' || evt.key === 'B') {
    if (globalSelectedIndex !== -1) {
      const parentEntry = vertexMap[globalSelectedIndex];
      createBranchFromVertex(parentEntry);
      evt.preventDefault();
    }
  }
});

// Function to highlight the selected vertex
function highlightVertex(index) {
  if (!vertexLayer || !selectedFeature) return;
  
  const coords = selectedFeature.getGeometry().getCoordinates();
  if (index < 0 || index >= coords.length) return;

  updateVertices();
  
  // Center the map on the selected vertex
  if (autoPanOnSelect) {
    map.getView().animate({ center: coords[index], duration: 200 });
  }
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
        // Enter trail-editing mode for the selected feature and show its vertices
        isCreatingTrail = true;
        originalCoords = [...selectedFeature.getGeometry().getCoordinates()];

        // Make the selected feature the only editable trail so updateVertices will render only its vertices
        trailFeatures.length = 0;
        trailFeatures.push(selectedFeature);

        // Ensure vertex layer and render vertices via updateVertices
        updateVertices();
        if (vertexMap.length > 0) setGlobalSelected(0); else globalSelectedIndex = -1;
      }
      break;
    }
    case 'Replace trail':
      if (isCreatingTrail) {
        // Create a new feature with the current state of the LineString
        const currentCoords = selectedFeature.getGeometry().getCoordinates();
        const originalCoords = selectedFeature.get('originalCoords');
        
        // Finalize trail editing without splitting: keep the extended segments as part of the same LineString.
        // If originalCoords exists it was stored for a potential split; we'll clear that marker and keep
        // the current coordinates on the same feature. Use explicit 'split-vertex' or keyboard 'B' to split later.
        if (originalCoords) {
          selectedFeature.unset('originalCoords');
          selectedFeature.unset('branchStart');
        }
        
        isCreatingTrail = false;

        if (vertexLayer) {
          map.removeLayer(vertexLayer);
          vertexLayer = null;
        }

        // update textarea with all features
        updateTextarea();
      }

  // Ensure visual state: deselect editing UI but keep the edited feature highlighted
  vectorSource.getFeatures().forEach(f => f.setStyle(defaultStyle));
  if (selectedFeature) selectedFeature.setStyle(selectedStyle);
      document.body.style.cursor = 'auto';
      break;

    case 'split-vertex': {
      // Create a separate branch feature starting at the currently selected global vertex
      if (globalSelectedIndex !== -1) {
        const parentEntry = vertexMap[globalSelectedIndex];
        createBranchFromVertex(parentEntry);
      }
      break;
    }

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
