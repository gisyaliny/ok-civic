require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/layers/GraphicsLayer",
    "esri/geometry/geometryEngine",
    "esri/Graphic",
    "esri/widgets/Search",
    "esri/widgets/Home",
    "esri/widgets/ScaleBar",
    "esri/widgets/BasemapGallery",
    "esri/widgets/Expand",
    "esri/symbols/SimpleFillSymbol",
    "esri/symbols/SimpleLineSymbol"
], (Map, MapView, FeatureLayer, GraphicsLayer, geometryEngine, Graphic, Search, Home, ScaleBar, BasemapGallery, Expand, SimpleFillSymbol, SimpleLineSymbol) => {

    // --- Configuration ---
    const treeTypes = [
        { name: "Redbud", diameter: 20, description: "Small ornamental tree" }, // Diameter in feet
        { name: "Oak", diameter: 60, description: "Large shade tree" },
        { name: "Pine", diameter: 40, description: "Medium evergreen" }
    ];

    // --- Layers ---

    const resultsLayer = new GraphicsLayer({
        title: "Suitability Results"
    });

    // 1. Zoning Layer (OKC Public Data)
    // Note: This service has CORS restrictions and may not work from localhost
    // The layer will gracefully fail if CORS blocks access
    const zoningLayer = new FeatureLayer({
        url: "https://data.okc.gov/arcgis/rest/services/Public/Data_OKC_Gov_Application_Service/MapServer/6",
        title: "OKC Zoning",
        outFields: ["*"],
        visible: true,
        opacity: 0.4,
        renderer: {
            type: "simple",
            symbol: {
                type: "simple-fill",
                color: [255, 255, 0, 0.2], // Yellowish
                outline: { width: 1, color: "orange" }
            }
        }
    });

    // Track if zoning layer loaded successfully
    let zoningLayerLoaded = false;
    
    // Function to update zoning layer UI status
    function updateZoningLayerStatus(loaded) {
        zoningLayerLoaded = loaded;
        const zoningToggle = document.getElementById("zoningToggle");
        const zoningStatus = document.getElementById("zoningStatus");
        const zoningHelpText = document.getElementById("zoningHelpText");
        
        if (zoningToggle && zoningStatus && zoningHelpText) {
            if (!loaded) {
                zoningToggle.checked = false;
                zoningToggle.disabled = true;
                zoningStatus.textContent = "⚠";
                zoningStatus.title = "Unavailable due to CORS restrictions";
                zoningHelpText.style.display = "block";
            } else {
                zoningToggle.disabled = false;
                zoningStatus.textContent = "";
                zoningHelpText.style.display = "none";
            }
        }
    }
    
    zoningLayer.when(() => {
        updateZoningLayerStatus(true);
        console.log("Zoning layer loaded successfully");
    }).catch((error) => {
        console.warn("Zoning layer failed to load (likely CORS restriction):", error);
        updateZoningLayerStatus(false);
        // Hide the layer if it fails to load
        zoningLayer.visible = false;
    });

    // 2. Building Footprints (OKC Specific)
    const buildingsLayer = new FeatureLayer({
        url: "https://services1.arcgis.com/cTNi34MxOdcfum3A/ArcGIS/rest/services/OKC_BuildingFootprints2020/FeatureServer/1",
        title: "OKC Building Footprints",
        outFields: ["*"],
        minScale: 10000, // Only show when zoomed in (scale 1:10,000 or larger)
        visible: true,
        renderer: {
            type: "simple",
            symbol: {
                type: "simple-fill",
                color: [100, 100, 100, 0.8],
                outline: { width: 0.5, color: [80, 80, 80, 0.6] }
            }
        }
    });


    // --- Map & View ---
    const map = new Map({
        basemap: "gray-vector",
        layers: [zoningLayer, buildingsLayer, resultsLayer]
    });

    const view = new MapView({
        container: "viewDiv",
        map: map,
        center: [-97.5164, 35.4676], // Oklahoma City
        zoom: 14
    });

    // --- Widgets ---

    const homeWidget = new Home({
        view: view
    });
    view.ui.add(homeWidget, "top-left");

    const scaleBar = new ScaleBar({
        view: view,
        unit: "dual"
    });
    view.ui.add(scaleBar, {
        position: "bottom-left"
    });

    const searchWidget = new Search({
        view: view,
        placeholder: "Search address or place in OKC"
    });
    view.ui.add(searchWidget, {
        position: "top-right",
        index: 0
    });

    // Basemap Gallery - Collapsible
    const basemapGallery = new BasemapGallery({
        view: view
        // Uses default basemaps from ArcGIS Online
    });

    // Wrap BasemapGallery in Expand widget to make it collapsible
    const basemapGalleryExpand = new Expand({
        view: view,
        content: basemapGallery,
        expandIconClass: "esri-icon-basemap",
        expandTooltip: "Basemaps",
        expanded: false // Collapsed by default
    });

    view.ui.add(basemapGalleryExpand, {
        position: "top-right",
        index: 1
    });

    // --- UI Logic ---
    const treeSelect = document.getElementById("treeSelect");

    // Populate Dropdown
    treeTypes.forEach(tree => {
        const option = document.createElement("option");
        option.value = tree.diameter;
        option.textContent = `${tree.name} (${tree.diameter}ft)`;
        treeSelect.appendChild(option);
    });

    // Layer Toggle Controls
    setupLayerControls();

    // --- Interaction Logic ---
    view.on("click", async (event) => {
        // 1. Check if a tree is selected
        const selectedDiameter = parseFloat(treeSelect.value);
        if (!selectedDiameter) {
            // Improved UX: Notification instead of alert
            showNotification("Please select a tree type to begin.", "warning");
            return;
        }

        // 2. Clear previous results
        resultsLayer.removeAll();
        updateResultUI("pending");

        // 3. Get Point Geometry
        const point = event.mapPoint;

        // 4. Create Buffer
        const buffer = geometryEngine.geodesicBuffer(point, selectedDiameter / 2, "feet");

        // 5. Visual Feedback (Graphic)
        const bufferGraphic = new Graphic({
            geometry: buffer,
            symbol: {
                type: "simple-fill",
                color: [0, 0, 255, 0.2],
                outline: { color: [0, 0, 255, 1], width: 1 }
            }
        });
        resultsLayer.add(bufferGraphic);

        console.log("Analyzing location:", point.latitude, point.longitude);

        // 6. Run Suitability Checks
        try {
            await checkSuitability(point, buffer, bufferGraphic);
        } catch (err) {
            console.error("Analysis Error:", err);
            displayResults(["Error accessing GIS data (Zoning/Buildings)."], bufferGraphic);
        }
    });

    // Suitability Logic
    async function checkSuitability(point, buffer, graphic) {
        const issues = [];

        // Check 1: Zoning (only if layer loaded successfully)
        if (zoningLayerLoaded) {
            try {
                const zoningQuery = zoningLayer.createQuery();
                zoningQuery.geometry = point;
                zoningQuery.spatialRelationship = "intersects";
                const zoningResults = await zoningLayer.queryFeatures(zoningQuery);

                if (zoningResults.features.length === 0) {
                    issues.push("Location is outside known zoning areas.");
                }
            } catch (e) {
                console.warn("Zoning query failed:", e);
                // Don't add this as an issue if the layer isn't available
            }
        } else {
            // Zoning layer not available (CORS restriction)
            console.info("Zoning check skipped - layer not available (CORS restriction)");
        }

        // Check 2: Buildings - Using server-side intersection query (ArcGIS Feature Service)
        // The FeatureLayer.queryFeatures with spatialRelationship uses server-side geoprocessing
        // FeatureLayer automatically handles spatial reference conversion
        try {
            // Query buildings using server-side intersection (geoprocessing on ArcGIS server)
            const buildingQuery = buildingsLayer.createQuery();
            buildingQuery.geometry = buffer;
            buildingQuery.spatialRelationship = "intersects"; // Server-side spatial operation
            buildingQuery.returnGeometry = false; // We only need to know if there are intersections, not the geometries
            
            const buildingResults = await buildingsLayer.queryFeatures(buildingQuery);

            if (buildingResults.features.length > 0) {
                issues.push(`Conflict with existing building footprint (${buildingResults.features.length} building(s) intersect).`);
            }
        } catch (e) {
            console.error("Building intersection check failed:", e);
            // If the layer is not visible or not loaded, skip the check
            if (!buildingsLayer.visible) {
                console.warn("Building layer is not visible, skipping intersection check");
            }
        }

        // Display Results
        displayResults(issues, graphic);
    }

    // Setup Layer Toggle Controls
    function setupLayerControls() {
        const layerControlsContainer = document.createElement("div");
        layerControlsContainer.className = "control-group";
        layerControlsContainer.innerHTML = `
            <label>Map Layers</label>
            <div class="layer-controls">
                <label class="layer-toggle" id="zoningToggleLabel">
                    <input type="checkbox" id="zoningToggle" checked>
                    <span>OKC Zoning</span>
                    <span class="layer-status" id="zoningStatus"></span>
                </label>
                <label class="layer-toggle">
                    <input type="checkbox" id="buildingsToggle" checked>
                    <span>Building Footprints</span>
                </label>
            </div>
            <p class="help-text" id="zoningHelpText" style="display: none; color: #e65100; font-size: 0.75rem; margin-top: 5px;">
                Zoning layer unavailable from localhost due to CORS restrictions. Deploy to app.okc.gov domain to access.
            </p>
        `;

        // Insert after tree select control
        const sidebarContent = document.querySelector(".sidebar-content");
        const treeControlGroup = document.querySelector(".control-group");
        sidebarContent.insertBefore(layerControlsContainer, treeControlGroup.nextSibling);

        // Wire up toggle events
        const zoningToggle = document.getElementById("zoningToggle");
        zoningToggle.addEventListener("change", (e) => {
            if (zoningLayerLoaded) {
                zoningLayer.visible = e.target.checked;
            } else {
                // If layer failed to load, prevent toggling and show message
                e.target.checked = false;
                showNotification("Zoning layer unavailable due to CORS restrictions. Deploy to app.okc.gov domain to access.", "warning");
            }
        });

        document.getElementById("buildingsToggle").addEventListener("change", (e) => {
            buildingsLayer.visible = e.target.checked;
        });

        // Update checkbox based on layer visibility changes (e.g., from zoom level)
        buildingsLayer.watch("visible", (visible) => {
            const checkbox = document.getElementById("buildingsToggle");
            if (checkbox) {
                checkbox.checked = visible;
            }
        });

        // Monitor zoom level to show/hide buildings layer
        view.watch("scale", (scale) => {
            // Buildings layer has minScale of 10000, so it auto-hides when zoomed out
            // But we want to keep the checkbox state in sync
            const checkbox = document.getElementById("buildingsToggle");
            if (checkbox && scale > buildingsLayer.minScale) {
                // Layer is hidden due to scale, but checkbox might still be checked
                // This is fine - the layer will show when zoomed in if checkbox is checked
            }
        });
    }

    function displayResults(issues, graphic) {
        const isSuitable = issues.length === 0;
        updateResultUI(isSuitable ? "suitable" : "unsuitable", issues);

        // Update Graphic Color
        const color = isSuitable ? [74, 109, 76, 0.4] : [132, 22, 23, 0.4]; // Muted Green / Crimson
        const outline = isSuitable ? [74, 109, 76, 1] : [132, 22, 23, 1];

        graphic.symbol = {
            type: "simple-fill",
            color: color,
            outline: { color: outline, width: 2 }
        };

        if (isSuitable) {
            showNotification("Suitable location identified!", "success");
        }
    }

    function updateResultUI(status, issues = []) {
        const card = document.getElementById("resultCard");
        const title = document.getElementById("resultTitle");
        const list = document.getElementById("suitabilityReasons");

        if (status === "pending") {
            card.classList.remove("hidden");
            card.classList.remove("status-suitable", "status-unsuitable");
            title.textContent = "Analyzing...";
            list.innerHTML = "";
            return;
        }

        card.classList.remove("hidden");
        card.classList.remove("status-suitable", "status-unsuitable");
        list.innerHTML = "";

        if (status === "suitable") {
            card.classList.add("status-suitable");
            title.textContent = "Suitable Location";
            const li = document.createElement("li");
            li.textContent = "No conflicts found.";
            list.appendChild(li);
        } else {
            card.classList.add("status-unsuitable");
            title.textContent = "Not Suitable";
            issues.forEach(issue => {
                const li = document.createElement("li");
                li.textContent = issue;
                list.appendChild(li);
            });
        }
    }

    function showNotification(message, type = "info") {
        // Simple custom notification logic
        // Checks if a notification container exists, if not creates one
        let container = document.getElementById("notification-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "notification-container";
            // Styling injected here for simplicity or could be in CSS
            container.style.position = "absolute";
            container.style.top = "20px";
            container.style.left = "50%";
            container.style.transform = "translateX(-50%)";
            container.style.zIndex = "100";
            document.body.appendChild(container);
        }

        const notif = document.createElement("div");
        notif.className = `notification ${type}`;
        notif.textContent = message;

        // Quick inline styles for the notification
        notif.style.padding = "10px 20px";
        notif.style.marginBottom = "10px";
        notif.style.borderRadius = "4px";
        notif.style.color = "white";
        notif.style.fontWeight = "500";
        notif.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
        notif.style.opacity = "0";
        notif.style.transition = "opacity 0.3s ease";

        if (type === "warning") notif.style.backgroundColor = "#e65100"; // Orange
        if (type === "success") notif.style.backgroundColor = "#2e7d32"; // Green
        if (type === "info") notif.style.backgroundColor = "#0288d1"; // Blue

        container.appendChild(notif);

        // Animate in
        requestAnimationFrame(() => {
            notif.style.opacity = "1";
        });

        // Remove after 3 seconds
        setTimeout(() => {
            notif.style.opacity = "0";
            setTimeout(() => {
                notif.remove();
            }, 300);
        }, 3000);
    }

});
