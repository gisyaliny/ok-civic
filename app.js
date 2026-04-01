require([
    "esri/Map",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/layers/GraphicsLayer",
    "esri/layers/ImageryLayer",
    "esri/geometry/geometryEngine",
    "esri/Graphic",
    "esri/widgets/Search",
    "esri/widgets/Home",
    "esri/widgets/ScaleBar",
    "esri/widgets/BasemapGallery",
    "esri/widgets/Legend",
    "esri/widgets/Expand"
], (Map, MapView, FeatureLayer, GraphicsLayer, ImageryLayer, geometryEngine, Graphic, Search, Home, ScaleBar, BasemapGallery, Legend, Expand) => {

    // --- Configuration ---
    /** Tree canopy raster: pixel value >= this counts as existing canopy (tune to your ImageServer classification). */
    const TREE_CANOPY_PIXEL_MIN = 1;
    const TREE_CANOPY_IMAGE_URL = "https://csagis.csa.ou.edu/server/rest/services/OKC10km/ImageServer";

    const treeTypes = [
        { name: "Redbud", diameter: 20, description: "Small ornamental tree" }, // Diameter in feet
        { name: "Oak", diameter: 60, description: "Large shade tree" },
        { name: "Pine", diameter: 40, description: "Medium evergreen" }
    ];

    // --- Layers ---

    const resultsLayer = new GraphicsLayer({
        title: "Suitability Results"
    });

    const hoverHighlightLayer = new GraphicsLayer({
        title: "Hover Highlight"
    });

    // 1. Zoning Layer (OKC Zoning Feature Service)
    const zoningLayer = new FeatureLayer({
        url: "https://services1.arcgis.com/cTNi34MxOdcfum3A/ArcGIS/rest/services/OKC_Zoning/FeatureServer/2",
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
        updateDataHealth();
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

    // Tree canopy (CSA ImageServer) — symbology from Enterprise; overlap check via /identify sampling
    const treeCanopyImageryLayer = new ImageryLayer({
        url: TREE_CANOPY_IMAGE_URL,
        title: "Tree canopy (OKC 10 km)",
        visible: false,
        opacity: 0.72
    });
    let treeCanopyImageryLoaded = false;
    let treeCanopyImageryStatus = "pending"; // pending | ok | fail
    treeCanopyImageryLayer.when(() => {
        treeCanopyImageryLoaded = true;
        treeCanopyImageryStatus = "ok";
        updateDataHealth();
    }).catch((err) => {
        console.warn("Tree canopy ImageryLayer failed to load (CORS, auth, or server):", err);
        treeCanopyImageryLoaded = false;
        treeCanopyImageryStatus = "fail";
        treeCanopyImageryLayer.visible = false;
        updateDataHealth();
    });

    // --- Map & View ---
    const map = new Map({
        basemap: "gray-vector",
        layers: [zoningLayer, buildingsLayer, treeCanopyImageryLayer, resultsLayer, hoverHighlightLayer]
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

    const basemapGallery = new BasemapGallery({ view });
    const basemapGalleryExpand = new Expand({
        view,
        content: basemapGallery,
        expandIconClass: "esri-icon-basemap",
        expandTooltip: "Basemaps",
        expanded: false
    });
    view.ui.add(basemapGalleryExpand, { position: "top-right", index: 1 });

    const legend = new Legend({ view });
    const legendExpand = new Expand({
        view,
        content: legend,
        expandIconClass: "esri-icon-legend",
        expandTooltip: "Legend",
        expanded: false
    });
    view.ui.add(legendExpand, { position: "top-right", index: 2 });

    // --- UI Logic ---
    const treeSelect = document.getElementById("treeSelect");
    const closeResultModalBtn = document.getElementById("closeResultModal");
    const mapStatusPill = document.getElementById("mapStatusPill");
    const resultCardEl = document.getElementById("resultCard");
    const resultDockIconEl = document.getElementById("resultDockIcon");
    const resultSpinnerEl = document.getElementById("resultSpinner");
    const resultTimestampEl = document.getElementById("resultTimestamp");
    const copyZoningHintBtn = document.getElementById("copyZoningHint");
    const actionAdviceEl = document.getElementById("actionAdvice");
    const whyToggleEl = document.getElementById("whyToggle");
    const whyDetailsEl = document.getElementById("whyDetails");
    const whyListEl = document.getElementById("whyList");
    const healthZoningEl = document.getElementById("healthZoning");
    const healthBuildingsEl = document.getElementById("healthBuildings");
    const healthCanopyEl = document.getElementById("healthCanopy");

    const onboardingOverlayEl = document.getElementById("onboardingOverlay");
    const onboardingTitleEl = document.getElementById("onboardingTitle");
    const onboardingTextEl = document.getElementById("onboardingText");
    const onboardingStepTagEl = document.getElementById("onboardingStepTag");
    const onboardingDontShowEl = document.getElementById("onboardingDontShow");
    const onboardingNextEl = document.getElementById("onboardingNext");
    const onboardingSkipEl = document.getElementById("onboardingSkip");
    const reopenOnboardingBtn = document.getElementById("reopenOnboardingBtn");

    /** Declared before initOnboarding() — renderStep() reads this; `let` below Identify block caused TDZ on deploy. */
    let identifyModeActive = false;

    let analysisSeq = 0;
    const analysisCache = new Map();
    let onboardingStep = 0;
    let onboardingAutoAdvanceTimer = null;
    const ONBOARDING_KEY = "okc-tree-planter-onboarding-dismissed-v1";
    let onboardingCleanupHighlight = null;
    let lastAnalysisDetails = {
        issues: [],
        buildingConflictCount: 0,
        zoningAvailable: true
    };

    // Store last context features for hover highlighting
    const lastContext = {
        zoningFeature: null,
        buildingFeature: null,
        buildingHasConflict: false,
        buildingConflictFeatures: []
    };

    function minimizeResultModal() {
        resultCardEl?.classList.add("hidden");
        resultDockIconEl?.classList.remove("hidden");
        hoverHighlightLayer.removeAll();
    }

    function restoreResultModal() {
        resultCardEl?.classList.remove("hidden");
        resultDockIconEl?.classList.add("hidden");
        closeResultModalBtn?.focus?.();
    }

    closeResultModalBtn?.addEventListener("click", minimizeResultModal);
    resultDockIconEl?.addEventListener("click", restoreResultModal);

    // ESC closes modal
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!resultCardEl || resultCardEl.classList.contains("hidden")) return;
        minimizeResultModal();
    });

    // Simple focus trap when modal is open
    resultCardEl?.addEventListener("keydown", (e) => {
        if (e.key !== "Tab") return;
        const focusables = resultCardEl.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    });

    copyZoningHintBtn?.addEventListener("click", async () => {
        const text = "Zoning layer unavailable from localhost due to CORS restrictions. Deploy to app.okc.gov domain to access.";
        try {
            await navigator.clipboard.writeText(text);
            showNotification("Copied zoning access note.", "success");
        } catch {
            showNotification("Copy failed. Select and copy manually from Layer controls.", "warning");
        }
    });

    whyToggleEl?.addEventListener("click", () => {
        const expanded = whyToggleEl.getAttribute("aria-expanded") === "true";
        whyToggleEl.setAttribute("aria-expanded", String(!expanded));
        whyDetailsEl?.classList.toggle("hidden", expanded);
    });

    if (healthCanopyEl) {
        healthCanopyEl.textContent = "Loading…";
    }

    // Hover highlight wiring
    const zoningInfoEl = document.getElementById("zoningInfo");
    const nearestBuildingInfoEl = document.getElementById("nearestBuildingInfo");

    function attachHoverHandlers(el, kind) {
        if (!el) return;
        const onEnter = () => highlightContext(kind);
        const onLeave = () => hoverHighlightLayer.removeAll();
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mouseleave", onLeave);
        el.addEventListener("focus", onEnter);
        el.addEventListener("blur", onLeave);
    }

    attachHoverHandlers(zoningInfoEl, "zoning");
    attachHoverHandlers(nearestBuildingInfoEl, "building");

    function highlightContext(kind) {
        hoverHighlightLayer.removeAll();
        const isBuilding = kind === "building";
        const useConflict = isBuilding && lastContext.buildingHasConflict;
        const features = isBuilding
            ? (useConflict ? lastContext.buildingConflictFeatures : [lastContext.buildingFeature])
            : [lastContext.zoningFeature];

        const drawables = (features || []).filter((f) => f?.geometry);
        if (drawables.length === 0) return;

        const stroke = useConflict ? [132, 22, 23, 1] : [2, 136, 209, 1];
        const fill = useConflict ? [132, 22, 23, 0.08] : [2, 136, 209, 0.08];
        for (const feature of drawables) {
            const isPolygon = feature.geometry.type === "polygon";
            const symbol = isPolygon
                ? {
                    type: "simple-fill",
                    color: fill,
                    outline: { color: stroke, width: 3 }
                }
                : {
                    type: "simple-line",
                    color: stroke,
                    width: 3
                };
            hoverHighlightLayer.add(new Graphic({ geometry: feature.geometry, symbol }));
        }
    }

    // Populate Dropdown
    treeTypes.forEach(tree => {
        const option = document.createElement("option");
        option.value = tree.diameter;
        option.textContent = `${tree.name} (${tree.diameter}ft)`;
        treeSelect.appendChild(option);
    });

    // Layer Toggle Controls
    setupLayerControls();
    updateDataHealth();

    initOnboarding();
    reopenOnboardingBtn?.addEventListener("click", () => openOnboarding(true));

    // --- Identify Mode ---
    const identifyBtn = document.getElementById("identifyBtn");
    const identifyHelpText = document.getElementById("identifyHelpText");

    identifyBtn.addEventListener("click", () => {
        identifyModeActive = !identifyModeActive;
        
        if (identifyModeActive) {
            identifyBtn.classList.add("active");
            identifyBtn.querySelector(".button-text").textContent = "Exit Identify";
            identifyHelpText.style.display = "block";
            view.cursor = "crosshair";
            showNotification("Identify mode active. Click on the map to identify features.", "info");
            if (mapStatusPill) {
                mapStatusPill.textContent = "Identify mode: click map to inspect";
                mapStatusPill.classList.remove("hidden");
            }
        } else {
            identifyBtn.classList.remove("active");
            identifyBtn.querySelector(".button-text").textContent = "Identify Features";
            identifyHelpText.style.display = "none";
            view.cursor = "default";
            view.popup.close();
            if (mapStatusPill) {
                mapStatusPill.textContent = "";
                mapStatusPill.classList.add("hidden");
            }
        }
    });

    // --- Interaction Logic ---
    view.on("click", async (event) => {
        const seq = ++analysisSeq;
        const point = event.mapPoint;
        zoomToClickPoint(point);

        // Check if identify mode is active
        if (identifyModeActive) {
            await identifyFeatures(event);
            return;
        }

        // Original tree suitability logic
        // 1. Check if a tree is selected
        const selectedDiameter = parseFloat(treeSelect.value);
        if (!selectedDiameter) {
            // Improved UX: Notification instead of alert
            showNotification("Please select a tree type to begin.", "warning");
            treeSelect.focus();
            treeSelect.classList.add("pulse-attention");
            setTimeout(() => treeSelect.classList.remove("pulse-attention"), 1400);
            return;
        }

        // 2. Clear previous results
        resultsLayer.removeAll();
        updateResultUI("pending");
        updateContextUI({ zoningText: "Analyzing…", nearestBuildingText: "Analyzing…" });
        hoverHighlightLayer.removeAll();
        lastContext.zoningFeature = null;
        lastContext.buildingFeature = null;
        lastContext.buildingHasConflict = false;
        lastContext.buildingConflictFeatures = [];
        setBuildingContextConflictUI(false);

        // 3. Create Buffer
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

        // Open modal + focus close
        resultCardEl?.classList.remove("hidden");
        resultDockIconEl?.classList.add("hidden");
        closeResultModalBtn?.focus?.();

        // 6. Run Suitability + Context Checks
        try {
            await analyzeSite(point, buffer, bufferGraphic, seq);
        } catch (err) {
            console.error("Analysis Error:", err);
            updateContextUI({ zoningText: "Unavailable (error).", nearestBuildingText: "Unavailable (error)." });
            displayResults(["Error accessing GIS data (Zoning/Buildings)."], bufferGraphic);
            setResultMeta({ loading: false, timestamp: new Date(), note: "Error" });
        }
    });

    function zoomToClickPoint(point) {
        if (!point) return;
        const targetZoom = 17;
        if (view.zoom >= targetZoom) return;

        view.goTo(
            { center: point, zoom: targetZoom },
            { duration: 450, easing: "ease-out" }
        ).catch((err) => {
            if (err?.name !== "AbortError") {
                console.warn("Click zoom failed:", err);
            }
        });
    }

    async function analyzeSite(point, buffer, graphic, seq) {
        const cacheKey = makeCacheKey(point, parseFloat(treeSelect.value));
        const cached = analysisCache.get(cacheKey);
        if (cached) {
            if (seq !== analysisSeq) return;
            applyAnalysisResult(cached, graphic);
            return;
        }

        const startedAt = new Date();
        setResultMeta({ loading: true, timestamp: startedAt, note: "Analyzing…" });

        const [suitability, baseContext] = await Promise.all([
            checkSuitability(point, buffer),
            buildContextSummary(point)
        ]);

        const context = mergeContextWithConflicts(baseContext, suitability);
        const result = { suitability, context, finishedAt: new Date() };
        analysisCache.set(cacheKey, result);

        if (seq !== analysisSeq) return;
        applyAnalysisResult(result, graphic);
    }

    function applyAnalysisResult(result, graphic) {
        const { suitability, context, finishedAt } = result;
        updateContextUI(context);

        lastContext.zoningFeature = context.zoningFeature || null;
        lastContext.buildingFeature = context.nearestBuildingFeature || null;
        lastContext.buildingHasConflict = Boolean(suitability?.buildingConflict?.count > 0);
        lastContext.buildingConflictFeatures = suitability?.buildingConflict?.features || [];
        setBuildingContextConflictUI(lastContext.buildingHasConflict);

        lastAnalysisDetails = {
            issues: suitability?.issues || [],
            buildingConflictCount: suitability?.buildingConflict?.count || 0,
            canopyConflict: Boolean(suitability?.canopyConflict?.conflict),
            canopyHits: suitability?.canopyConflict?.hits ?? 0,
            canopySampled: suitability?.canopyConflict?.sampled ?? 0,
            canopyCheckSkipped: !suitability?.canopyConflict || Boolean(suitability.canopyConflict.skipped),
            zoningAvailable: zoningLayerLoaded && zoningLayer.visible
        };

        displayResults(suitability.issues, graphic);
        const anyConflict =
            lastContext.buildingHasConflict ||
            Boolean(suitability?.canopyConflict?.conflict);
        setResultMeta({ loading: false, timestamp: finishedAt, note: anyConflict ? "Conflicts found" : "Complete" });
    }

    function makeCacheKey(point, diameter) {
        const lon = (point.longitude ?? point.x);
        const lat = (point.latitude ?? point.y);
        const d = Number.isFinite(diameter) ? diameter : 0;
        const canopyOn = treeCanopyImageryLoaded && treeCanopyImageryLayer.visible ? "1" : "0";
        return `${d}:${canopyOn}:${Number(lon).toFixed(5)}:${Number(lat).toFixed(5)}`;
    }

    function isCanopyPixelValue(raw) {
        if (raw == null) return false;
        const s = String(raw).trim().toLowerCase();
        if (!s || s === "nan" || s.includes("nodata")) return false;
        const n = Number(s);
        if (!Number.isFinite(n)) return false;
        return n >= TREE_CANOPY_PIXEL_MIN;
    }

    function samplePointsFromPolygon(bufferPolygon, maxPoints = 9) {
        const points = [];
        const sr = bufferPolygon.spatialReference;
        const addPt = (x, y) => {
            if (Number.isFinite(x) && Number.isFinite(y)) {
                points.push({ type: "point", x, y, spatialReference: sr });
            }
        };
        const ext = bufferPolygon.extent;
        if (ext) {
            addPt(ext.center.x, ext.center.y);
            addPt(ext.xmin + ext.width * 0.2, ext.ymin + ext.height * 0.2);
            addPt(ext.xmax - ext.width * 0.2, ext.ymin + ext.height * 0.2);
            addPt(ext.xmin + ext.width * 0.2, ext.ymax - ext.height * 0.2);
            addPt(ext.xmax - ext.width * 0.2, ext.ymax - ext.height * 0.2);
        }
        const ring = bufferPolygon.rings?.[0];
        if (ring && ring.length > 6) {
            const i1 = Math.floor(ring.length / 3);
            const i2 = Math.floor((ring.length * 2) / 3);
            addPt(ring[i1][0], ring[i1][1]);
            addPt(ring[i2][0], ring[i2][1]);
        }
        const seen = new Set();
        return points
            .filter((p) => {
                const k = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .slice(0, maxPoints);
    }

    async function identifyTreeCanopyPixel(point) {
        const baseUrl = treeCanopyImageryLayer.url.replace(/\/?$/, "");
        const sr = point.spatialReference;
        const geom = {
            x: point.x,
            y: point.y,
            spatialReference: sr?.wkid
                ? { wkid: sr.wkid }
                : sr?.latestWkid
                    ? { wkid: sr.latestWkid }
                    : sr?.wkt
                        ? { wkt: sr.wkt }
                        : { wkid: 3857 }
        };
        const body = new URLSearchParams({
            f: "json",
            geometry: JSON.stringify(geom),
            geometryType: "esriGeometryPoint",
            returnGeometry: "false",
            returnCatalogItems: "false",
            returnPixelValues: "true"
        });
        const res = await fetch(`${baseUrl}/identify`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
            credentials: "omit"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || "identify error");
        return json.value ?? json.Value ?? json.properties?.Value;
    }

    async function checkTreeCanopyOverlap(bufferPolygon) {
        const out = {
            conflict: false,
            hits: 0,
            sampled: 0,
            skipped: true,
            error: null
        };
        if (!treeCanopyImageryLoaded || !treeCanopyImageryLayer.visible) {
            return out;
        }
        out.skipped = false;
        const pts = samplePointsFromPolygon(bufferPolygon, 9);
        if (pts.length === 0) return out;
        let hits = 0;
        let sampled = 0;
        try {
            for (const pt of pts) {
                try {
                    const val = await identifyTreeCanopyPixel(pt);
                    sampled += 1;
                    if (isCanopyPixelValue(val)) hits += 1;
                } catch (inner) {
                    console.warn("Canopy identify sample failed:", inner);
                }
            }
            out.sampled = sampled;
            out.hits = hits;
            out.conflict = hits > 0;
        } catch (e) {
            out.error = e;
            console.warn("Tree canopy overlap check failed:", e);
        }
        return out;
    }

    // Suitability Logic (returns issues + conflict context)
    async function checkSuitability(point, buffer) {
        const issues = [];
        let buildingConflict = null;

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
            buildingQuery.returnGeometry = true;
            buildingQuery.outFields = ["*"];
            
            const buildingResults = await buildingsLayer.queryFeatures(buildingQuery);

            if (buildingResults.features.length > 0) {
                const count = buildingResults.features.length;
                issues.push(`Conflict with existing building footprint (${count} building(s) intersect).`);

                // Choose a representative conflicting building for highlighting + description.
                // Prefer the closest conflicting feature (by centroid distance) to keep behavior stable.
                let chosen = null;
                let chosenDistance = Infinity;
                for (const f of buildingResults.features) {
                    const c = f.geometry?.centroid || f.geometry?.extent?.center;
                    if (!c) continue;
                    const d = geometryEngine.distance(point, c, "feet");
                    if (Number.isFinite(d) && d < chosenDistance) {
                        chosenDistance = d;
                        chosen = f;
                    }
                }
                buildingConflict = {
                    count,
                    feature: chosen || buildingResults.features[0] || null,
                    features: buildingResults.features
                };
            }
        } catch (e) {
            console.error("Building intersection check failed:", e);
            // If the layer is not visible or not loaded, skip the check
            if (!buildingsLayer.visible) {
                console.warn("Building layer is not visible, skipping intersection check");
            }
        }

        let canopyConflict = null;
        try {
            canopyConflict = await checkTreeCanopyOverlap(buffer);
            if (canopyConflict.conflict && canopyConflict.sampled > 0) {
                issues.push(
                    `Proposed planting buffer overlaps existing tree canopy (${canopyConflict.hits} of ${canopyConflict.sampled} sample locations show canopy in the raster).`
                );
            }
        } catch (e) {
            console.warn("Canopy suitability check error:", e);
        }

        return { issues, buildingConflict, canopyConflict };
    }

    function mergeContextWithConflicts(baseContext, suitability) {
        const buildingConflict = suitability?.buildingConflict;
        if (buildingConflict?.count > 0) {
            const f = buildingConflict.feature;
            const center = f?.geometry?.centroid || f?.geometry?.extent?.center;
            const clickPoint = baseContext?.__clickPoint;
            const direction = center && clickPoint ? directionLabel(bearingDegrees(center, clickPoint)) : null;
            const dirText = direction ? `Tree is ${direction} of the conflicting building` : "Conflicting building found";
            const text = `${dirText} (buffer overlaps ${buildingConflict.count} building(s)). Hover to preview conflicts.`;

            return {
                ...baseContext,
                nearestBuildingText: text,
                nearestBuildingFeature: f || null
            };
        }
        return baseContext;
    }
    async function buildContextSummary(point) {
        const [zoning, nearestBuilding] = await Promise.all([
            getZoningSummary(point),
            getNearestBuildingSummary(point)
        ]);
        return {
            zoningText: zoning.text,
            zoningFeature: zoning.feature,
            nearestBuildingText: nearestBuilding.text,
            nearestBuildingFeature: nearestBuilding.feature
            ,__clickPoint: point
        };
    }

    async function getZoningSummary(point) {
        if (!zoningLayerLoaded || !zoningLayer.visible) {
            return { text: "Unavailable (layer disabled or blocked).", feature: null };
        }

        try {
            const q = zoningLayer.createQuery();
            q.geometry = point;
            q.spatialRelationship = "intersects";
            q.returnGeometry = true;
            q.outFields = ["P_ZONE", "P_CASE", "LEGEND"];
            const res = await zoningLayer.queryFeatures(q);
            const f = res.features?.[0];
            if (!f) return { text: "No zoning feature found here.", feature: null };

            const a = f.attributes || {};
            const parts = [];
            if (a.P_ZONE) parts.push(`Class: ${a.P_ZONE}`);
            if (a.LEGEND) parts.push(`${a.LEGEND}`);
            if (a.P_CASE) parts.push(`Case: ${a.P_CASE}`);
            return { text: parts.length ? parts.join(" • ") : "Zoning found (no attributes available).", feature: f };
        } catch (e) {
            console.warn("Zoning summary query failed:", e);
            return { text: "Unavailable (query failed).", feature: null };
        }
    }

    async function getNearestBuildingSummary(point) {
        if (!buildingsLayer.visible) return { text: "Unavailable (layer disabled).", feature: null };

        const searchRadiusFeet = 800;
        try {
            const q = buildingsLayer.createQuery();
            q.geometry = point;
            q.distance = searchRadiusFeet;
            q.units = "feet";
            q.spatialRelationship = "intersects";
            q.returnGeometry = true;
            q.outFields = ["*"];

            const res = await buildingsLayer.queryFeatures(q);
            const feats = res.features || [];
            if (feats.length === 0) return { text: `No buildings within ${searchRadiusFeet} ft.`, feature: null };

            let nearest = null;
            for (const f of feats) {
                const geom = f.geometry;
                if (!geom) continue;

                let distanceFeet = null;
                let refPoint = null;

                try {
                    const near = geometryEngine.nearestCoordinate(geom, point);
                    if (near?.coordinate) {
                        refPoint = near.coordinate;
                        distanceFeet = geometryEngine.geodesicLength(
                            {
                                type: "polyline",
                                paths: [[[point.longitude, point.latitude], [refPoint.longitude, refPoint.latitude]]],
                                spatialReference: { wkid: 4326 }
                            },
                            "feet"
                        );
                    }
                } catch {
                    // Fall through to centroid/extent.
                }

                if (distanceFeet === null) {
                    const center = geom.centroid || geom.extent?.center;
                    if (center) {
                        refPoint = center;
                        distanceFeet = geometryEngine.distance(point, center, "feet");
                    }
                }

                if (distanceFeet === null || !Number.isFinite(distanceFeet)) continue;
                if (!nearest || distanceFeet < nearest.distanceFeet) {
                    nearest = { feature: f, distanceFeet, refPoint };
                }
            }

            if (!nearest) return { text: "Buildings found nearby, but distance could not be computed.", feature: null };

            const buildingCenter = nearest.feature.geometry?.centroid || nearest.feature.geometry?.extent?.center || nearest.refPoint;
            const direction = buildingCenter ? directionLabel(bearingDegrees(buildingCenter, point)) : null;
            const d = Math.round(nearest.distanceFeet);

            const dirText = direction ? `Your tree is ${direction} of the nearest building` : "Nearest building found";
            return { text: `${dirText} (~${d} ft away).`, feature: nearest.feature };
        } catch (e) {
            console.warn("Nearest building query failed:", e);
            return { text: "Unavailable (query failed).", feature: null };
        }
    }

    function updateContextUI({ zoningText, nearestBuildingText }) {
        const zoningEl = document.getElementById("zoningInfo");
        const nearestEl = document.getElementById("nearestBuildingInfo");
        if (zoningEl) zoningEl.textContent = zoningText ?? "—";
        if (nearestEl) nearestEl.textContent = nearestBuildingText ?? "—";

        // Show/hide actionable hint for zoning CORS
        const zt = (zoningText || "").toLowerCase();
        const showHint = zt.includes("blocked") || zt.includes("unavailable");
        copyZoningHintBtn?.classList.toggle("hidden", !showHint);
    }

    function updateDataHealth() {
        if (healthZoningEl) {
            healthZoningEl.textContent = zoningLayerLoaded && zoningLayer.visible
                ? "Available"
                : (zoningLayerLoaded ? "Layer off" : "Blocked/CORS");
        }
        if (healthBuildingsEl) {
            if (!buildingsLayer.visible) {
                healthBuildingsEl.textContent = "Layer off";
            } else if (view?.scale > buildingsLayer.minScale) {
                healthBuildingsEl.textContent = "Zoom in to view";
            } else {
                healthBuildingsEl.textContent = "Available";
            }
        }
        if (healthCanopyEl) {
            if (treeCanopyImageryStatus === "pending") {
                healthCanopyEl.textContent = "Loading…";
            } else if (treeCanopyImageryStatus === "fail") {
                healthCanopyEl.textContent = "Unavailable (CORS / auth / server)";
            } else if (treeCanopyImageryLayer.visible) {
                healthCanopyEl.textContent = "On (raster + overlap check)";
            } else {
                healthCanopyEl.textContent = "Off (enable to check canopy overlap)";
            }
        }
    }

    function clearOnboardingAutoAdvance() {
        if (onboardingAutoAdvanceTimer != null) {
            clearTimeout(onboardingAutoAdvanceTimer);
            onboardingAutoAdvanceTimer = null;
        }
    }

    function initOnboarding() {
        if (!onboardingOverlayEl) return;
        const dismissed = localStorage.getItem(ONBOARDING_KEY) === "1";
        if (dismissed) return;
        openOnboarding(false);
    }

    function openOnboarding(forceOpen = false) {
        if (!onboardingOverlayEl) return;
        if (!forceOpen) {
            const dismissed = localStorage.getItem(ONBOARDING_KEY) === "1";
            if (dismissed) return;
        }

        clearOnboardingAutoAdvance();
        onboardingStep = 0;
        const steps = [
            {
                title: "Welcome to OKC Tree Planter",
                text: "This tool helps you test whether a location is suitable for planting a selected tree type.",
                target: "#instructionPanel"
            },
            {
                title: "Step 1: Select a tree",
                text: "Choose a species in the sidebar. The app uses its canopy diameter to build a planting buffer.",
                target: "#treeSelect"
            },
            {
                title: "Step 2: Click map to analyze",
                text: "After clicking, review Context, hover entries to highlight features, and use Action Advice for next moves.",
                target: null
            }
        ];

        const clearHighlight = () => {
            if (typeof onboardingCleanupHighlight === "function") {
                onboardingCleanupHighlight();
                onboardingCleanupHighlight = null;
            }
        };

        const applyHighlight = (selector) => {
            clearHighlight();
            if (!selector) return;
            const el = document.querySelector(selector);
            if (!el) return;
            el.classList.add("onboarding-highlight");
            onboardingCleanupHighlight = () => el.classList.remove("onboarding-highlight");
        };

        function renderStep() {
            const current = steps[onboardingStep];
            onboardingStepTagEl.textContent = `Step ${onboardingStep + 1} of ${steps.length}`;
            onboardingTitleEl.textContent = current.title;
            onboardingTextEl.textContent = current.text;
            onboardingNextEl.textContent = onboardingStep >= steps.length - 1 ? "Finish" : "Next";
            applyHighlight(current.target);
            if (mapStatusPill) {
                if (onboardingStep === steps.length - 1) {
                    mapStatusPill.textContent = "Tip: choose a tree first, then click map to run analysis.";
                    mapStatusPill.classList.remove("hidden");
                } else if (!identifyModeActive) {
                    mapStatusPill.textContent = "";
                    mapStatusPill.classList.add("hidden");
                }
            }

            clearOnboardingAutoAdvance();
            if (onboardingStep < steps.length - 1) {
                onboardingAutoAdvanceTimer = setTimeout(() => {
                    onboardingAutoAdvanceTimer = null;
                    if (!onboardingOverlayEl || onboardingOverlayEl.classList.contains("hidden")) return;
                    onboardingStep += 1;
                    renderStep();
                }, 3000);
            }
        }

        function closeOnboarding() {
            clearOnboardingAutoAdvance();
            if (onboardingDontShowEl?.checked) {
                localStorage.setItem(ONBOARDING_KEY, "1");
            }
            onboardingOverlayEl.classList.add("hidden");
            clearHighlight();
            if (mapStatusPill && !identifyModeActive) {
                mapStatusPill.textContent = "";
                mapStatusPill.classList.add("hidden");
            }
        }

        onboardingOverlayEl.classList.remove("hidden");
        renderStep();

        onboardingNextEl.onclick = () => {
            clearOnboardingAutoAdvance();
            if (onboardingStep >= steps.length - 1) {
                closeOnboarding();
                return;
            }
            onboardingStep += 1;
            renderStep();
        };
        onboardingSkipEl.onclick = closeOnboarding;
    }

    function setResultMeta({ loading, timestamp, note }) {
        if (resultSpinnerEl) resultSpinnerEl.classList.toggle("is-active", Boolean(loading));
        if (resultTimestampEl) {
            const t = timestamp instanceof Date ? timestamp : new Date();
            resultTimestampEl.textContent = `${note ? `${note} • ` : ""}${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        }
    }

    function setBuildingContextConflictUI(isConflict) {
        const el = document.getElementById("nearestBuildingInfo");
        if (!el) return;
        el.classList.toggle("is-conflict", Boolean(isConflict));
    }

    function bearingDegrees(fromPoint, toPoint) {
        const toRad = (deg) => (deg * Math.PI) / 180;
        const toDeg = (rad) => (rad * 180) / Math.PI;

        const lat1 = toRad(fromPoint.latitude ?? fromPoint.y);
        const lon1 = toRad(fromPoint.longitude ?? fromPoint.x);
        const lat2 = toRad(toPoint.latitude ?? toPoint.y);
        const lon2 = toRad(toPoint.longitude ?? toPoint.x);

        const dLon = lon2 - lon1;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const brng = Math.atan2(y, x);
        return (toDeg(brng) + 360) % 360;
    }

    function directionLabel(bearingDeg) {
        const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const idx = Math.round(bearingDeg / 45) % 8;
        return dirs[idx];
    }

    // Identify Features Function
    async function identifyFeatures(event) {
        const point = event.mapPoint;
        const features = [];
        const promises = [];

        // Query Zoning Layer
        if (zoningLayer.visible && zoningLayerLoaded) {
            promises.push(
                zoningLayer.queryFeatures({
                    geometry: point,
                    spatialRelationship: "intersects",
                    returnGeometry: true,
                    outFields: ["*"]
                }).then(result => {
                    if (result.features.length > 0) {
                        result.features.forEach(feature => {
                            features.push({
                                layer: zoningLayer,
                                feature: feature
                            });
                        });
                    }
                }).catch(err => {
                    console.warn("Zoning identify query failed:", err);
                })
            );
        }

        // Query Building Footprints Layer
        if (buildingsLayer.visible) {
            promises.push(
                buildingsLayer.queryFeatures({
                    geometry: point,
                    spatialRelationship: "intersects",
                    returnGeometry: true,
                    outFields: ["*"]
                }).then(result => {
                    if (result.features.length > 0) {
                        result.features.forEach(feature => {
                            features.push({
                                layer: buildingsLayer,
                                feature: feature
                            });
                        });
                    }
                }).catch(err => {
                    console.warn("Building identify query failed:", err);
                })
            );
        }

        // Wait for all queries to complete
        await Promise.all(promises);

        // Show popup with results
        if (features.length > 0) {
            // Create popup content
            const popupContent = features.map(({ layer, feature }) => {
                const attributes = feature.attributes;
                let content = `<div class="popup-layer-title"><strong>${layer.title}</strong></div>`;
                
                // Format attributes based on layer type
                if (layer === zoningLayer) {
                    content += `<div class="popup-attribute"><strong>Zoning Class:</strong> ${attributes.P_ZONE || 'N/A'}</div>`;
                    if (attributes.P_CASE) {
                        content += `<div class="popup-attribute"><strong>Case Number:</strong> ${attributes.P_CASE}</div>`;
                    }
                    if (attributes.LEGEND) {
                        content += `<div class="popup-attribute"><strong>Legend:</strong> ${attributes.LEGEND}</div>`;
                    }
                } else if (layer === buildingsLayer) {
                    // Building footprints might have different fields
                    const fieldNames = Object.keys(attributes).filter(key => 
                        !key.startsWith('Shape_') && 
                        key !== 'OBJECTID' && 
                        key !== 'GlobalID'
                    );
                    fieldNames.forEach(field => {
                        if (attributes[field] !== null && attributes[field] !== undefined) {
                            content += `<div class="popup-attribute"><strong>${field}:</strong> ${attributes[field]}</div>`;
                        }
                    });
                }
                
                return content;
            }).join('<hr>');

            // Show popup at clicked location
            view.popup.open({
                location: point,
                title: `Identified Features (${features.length})`,
                content: popupContent
            });
        } else {
            showNotification("No features found at this location.", "info");
            view.popup.close();
        }
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
                    <span class="layer-status" id="buildingsStatus"></span>
                </label>
                <label class="layer-toggle">
                    <input type="checkbox" id="canopyToggle">
                    <span>Tree canopy (raster)</span>
                </label>
            </div>
            <p class="help-text" id="zoningHelpText" style="display: none; color: #e65100; font-size: 0.75rem; margin-top: 5px;">
                Zoning layer unavailable from localhost due to CORS restrictions. Deploy to app.okc.gov domain to access.
            </p>
            <p class="help-text" id="buildingsScaleHelpText" style="display: none; margin-top: 5px;">
                Building footprints appear when you zoom in (about 1:10,000 or closer).
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
            updateDataHealth();
        });

        document.getElementById("buildingsToggle").addEventListener("change", (e) => {
            buildingsLayer.visible = e.target.checked;
            updateDataHealth();
        });

        document.getElementById("canopyToggle").addEventListener("change", (e) => {
            if (!treeCanopyImageryLoaded) {
                e.target.checked = false;
                showNotification("Tree canopy layer did not load. Check CORS and that the ImageServer allows access (or add sign-in).", "warning");
                updateDataHealth();
                return;
            }
            treeCanopyImageryLayer.visible = e.target.checked;
            updateDataHealth();
        });

        // Update checkbox based on layer visibility changes (e.g., from zoom level)
        buildingsLayer.watch("visible", (visible) => {
            const checkbox = document.getElementById("buildingsToggle");
            if (checkbox) {
                checkbox.checked = visible;
            }
        });

        function updateBuildingsScaleHint() {
            const status = document.getElementById("buildingsStatus");
            const hint = document.getElementById("buildingsScaleHelpText");
            const checkbox = document.getElementById("buildingsToggle");
            if (!status || !hint || !checkbox) return;

            const zoomedOutHidesLayer = view.scale > buildingsLayer.minScale;
            if (checkbox.checked && zoomedOutHidesLayer) {
                status.textContent = "ⓘ";
                status.title = "Hidden at this zoom. Zoom in to view footprints.";
                hint.style.display = "block";
            } else {
                status.textContent = "";
                status.title = "";
                hint.style.display = "none";
            }
        }

        view.watch("scale", updateBuildingsScaleHint);
        buildingsLayer.watch("visible", updateBuildingsScaleHint);
        view.watch("scale", updateDataHealth);
        buildingsLayer.watch("visible", updateDataHealth);
        updateBuildingsScaleHint();
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
            setResultMeta({ loading: true, timestamp: new Date(), note: "Analyzing…" });
            if (actionAdviceEl) {
                actionAdviceEl.textContent =
                    "Checking zoning, buildings, and existing tree canopy (raster samples when the canopy layer is on)…";
            }
            renderWhyDetails([
                "Tree species and diameter selected.",
                "Zoning and building checks running.",
                "Canopy overlap uses ImageServer identify samples inside your planting buffer when the canopy layer is visible."
            ]);
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

        if (actionAdviceEl) {
            actionAdviceEl.textContent = getActionAdvice(status, issues, lastAnalysisDetails);
        }
        renderWhyDetails(buildWhyLines(status, issues, lastAnalysisDetails));
    }

    function getActionAdvice(status, issues, details) {
        if (status === "suitable") {
            return "This location passes current checks. Next step: verify utility clearance and irrigation access before planting.";
        }
        if (details?.buildingConflictCount > 0) {
            return `Try moving the point away from buildings by at least 10-20 ft, or select a smaller canopy tree to reduce overlap risk.`;
        }
        if (details?.canopyConflict) {
            return "Shift the point to an area that looks clear in the tree canopy layer, reduce canopy diameter, or verify raster values—your buffer is sampling existing canopy pixels.";
        }
        if (issues.some((i) => i.toLowerCase().includes("zoning"))) {
            return "Try a nearby parcel with known zoning coverage or verify zoning details using Identify mode.";
        }
        return "Try a nearby location and run another assessment.";
    }

    function buildWhyLines(status, issues, details) {
        const lines = [];
        lines.push(`Tree diameter buffer was used for suitability testing.`);
        if (details?.zoningAvailable) {
            lines.push("Zoning feature check was available and evaluated at the clicked point.");
        } else {
            lines.push("Zoning check was limited (layer unavailable, blocked, or disabled).");
        }
        if (details?.buildingConflictCount > 0) {
            lines.push(`Building overlap detected with ${details.buildingConflictCount} footprint(s).`);
        } else {
            lines.push("No building overlap detected within the selected canopy buffer.");
        }
        if (details?.canopyCheckSkipped) {
            lines.push("Existing tree canopy was not checked (turn on “Tree canopy (raster)” to enable overlap sampling).");
        } else if (details?.canopyConflict) {
            lines.push(
                `Canopy raster samples: ${details.canopyHits} of ${details.canopySampled} locations read as existing canopy (threshold in code: TREE_CANOPY_PIXEL_MIN).`
            );
        } else {
            lines.push("No canopy pixels above the threshold were found at sampled locations inside the buffer.");
        }
        if (status !== "suitable" && issues.length) {
            lines.push(`Decision driven by ${issues.length} issue(s) listed above.`);
        }
        return lines;
    }

    function renderWhyDetails(lines) {
        if (!whyListEl) return;
        whyListEl.innerHTML = "";
        lines.forEach((line) => {
            const li = document.createElement("li");
            li.textContent = line;
            whyListEl.appendChild(li);
        });
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
