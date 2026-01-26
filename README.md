# OKC Tree Planter

A web-based GIS application for assessing tree planting suitability in Oklahoma City. This tool helps users identify optimal locations for tree planting by analyzing zoning regulations, building footprints, and spatial constraints.

## 🌳 Overview

OKC Tree Planter is a site assessment tool developed by the Center for Spatial Analysis (CSA) at the University of Oklahoma. The application enables users to:

- Select different tree species with varying size requirements
- Click on the map to assess planting suitability at specific locations
- Identify zoning and building footprint features
- Visualize tree canopy coverage
- Make informed decisions about tree placement

## ✨ Features

### Core Functionality
- **Tree Suitability Assessment**: Select a tree type and click on the map to analyze planting locations
- **Spatial Analysis**: Automatic buffer generation based on tree diameter with conflict detection
- **Zoning Compliance**: Checks if locations fall within appropriate zoning areas
- **Building Conflict Detection**: Identifies intersections with existing building footprints using server-side geoprocessing

### Interactive Tools
- **Identify Mode**: Toggle identify mode to query zoning and building footprint features with detailed popups
- **Layer Controls**: Toggle visibility of zoning, building footprints, and tree canopy layers
- **Basemap Gallery**: Switch between different basemaps (collapsible widget)
- **Search**: Search for addresses and places in Oklahoma City
- **Zoom-based Rendering**: Building footprints only display when zoomed in to reduce rendering load

### Data Layers
- **OKC Zoning**: Zoning polygons from OKC Zoning Feature Service
- **Building Footprints**: OKC Building Footprints 2020 (visible at scale 1:10,000 or larger)
- **Tree Canopy**: OKC Tree Canopy tile layer (optional, default off)

## 🛠️ Technology Stack

- **Frontend Framework**: Vanilla JavaScript (ES5 with AMD modules)
- **Mapping API**: ArcGIS Maps SDK for JavaScript 4.31
- **Styling**: Custom CSS with OU brand colors
- **Fonts**: Inter (Google Fonts)

## 📋 Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for loading ArcGIS services and API)
- No build tools or package managers required

## 🚀 Getting Started

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ok-civic
   ```

2. **Open the application**
   - Simply open `index.html` in a web browser
   - Or use a local web server:
     ```bash
     # Using Python
     python -m http.server 8000
     
     # Using Node.js (http-server)
     npx http-server
     ```

3. **Access the application**
   - Navigate to `http://localhost:8000` (or your chosen port)
   - The application will load automatically

### Production Deployment

For production deployment, ensure:
- The application is served over HTTPS (required for some ArcGIS services)
- CORS restrictions: Some services may require deployment to specific domains (e.g., `app.okc.gov`)

## 📖 Usage Guide

### Tree Suitability Assessment

1. **Select a Tree Type**
   - Choose from the dropdown: Redbud (20ft), Oak (60ft), or Pine (40ft)
   - Each tree has different diameter requirements

2. **Click on the Map**
   - Click any location on the map to test planting suitability
   - A buffer circle will appear showing the required space
   - The system will check for:
     - Zoning compliance
     - Building footprint conflicts

3. **Review Results**
   - Green buffer = Suitable location (no conflicts)
   - Red buffer = Not suitable (conflicts detected)
   - Detailed reasons are displayed in the results panel

### Identify Features

1. **Activate Identify Mode**
   - Click the "Identify Features" button in the sidebar
   - Button turns green when active
   - Cursor changes to crosshair

2. **Click on Features**
   - Click on zoning polygons or building footprints
   - A popup will display feature attributes:
     - Zoning: Zoning Class, Case Number, Legend
     - Buildings: All available attributes

3. **Exit Identify Mode**
   - Click "Exit Identify" to return to normal mode

### Layer Management

- **Toggle Layers**: Use checkboxes in the "Map Layers" section to show/hide:
  - OKC Zoning
  - Building Footprints
  - Tree Canopy (default off)

### Basemap Selection

- Click the basemap icon in the top-right corner
- Select from available basemaps
- Widget collapses automatically

## 📊 Data Sources

### Feature Services
- **Zoning**: `https://services1.arcgis.com/cTNi34MxOdcfum3A/ArcGIS/rest/services/OKC_Zoning/FeatureServer/2`
- **Building Footprints**: `https://services1.arcgis.com/cTNi34MxOdcfum3A/ArcGIS/rest/services/OKC_BuildingFootprints2020/FeatureServer/1`

### Tile Services
- **Tree Canopy**: `https://tiles.arcgis.com/tiles/cTNi34MxOdcfum3A/arcgis/rest/services/OKC_Tree_Canopy/MapServer`

### Data Attribution
- OKC Open Data
- OKC Building Footprints 2020
- ArcGIS Online Services
- Center for Spatial Analysis, University of Oklahoma

## 📁 Project Structure

```
ok-civic/
├── index.html          # Main HTML file
├── app.js              # Application logic and ArcGIS API integration
├── style.css           # Custom styling and OU brand colors
├── ou.ico              # OU favicon
├── README.md           # This file
├── .gitignore          # Git ignore rules
├── .agent/
│   └── rules/
│       └── ok-civic-rule.md  # Agent rules for development
└── script/             # Python scripts for data processing
    ├── 01_treeCanopy_downloader.py
    ├── 02_merge.py
    ├── 03_list_gdb.py
    ├── 04_prep_data.py
    └── 05_upload.py
```

## 🎨 Design

The application uses the University of Oklahoma brand colors:
- **Primary Color**: Oklahoma Crimson (#841617)
- **Accent Color**: Oklahoma Cream (#FDF9D8)
- **Success Color**: Muted Green (#4a6d4c)

## 🔧 Configuration

### Tree Types
Tree types can be modified in `app.js`:
```javascript
const treeTypes = [
    { name: "Redbud", diameter: 20, description: "Small ornamental tree" },
    { name: "Oak", diameter: 60, description: "Large shade tree" },
    { name: "Pine", diameter: 40, description: "Medium evergreen" }
];
```

### Layer URLs
Layer service URLs are defined in `app.js` and can be updated if services change.

## 🐛 Known Issues

- **Zoning Layer CORS**: The original OKC zoning service (`data.okc.gov`) has CORS restrictions. The application now uses an alternative service that should work from any domain.
- **Building Footprints Visibility**: Building footprints are only visible when zoomed in (scale 1:10,000 or larger) to optimize performance.

## 🤝 Contributing

This project is maintained by the Center for Spatial Analysis at the University of Oklahoma. For questions or contributions, please contact:

- **Email**: csa@ou.edu
- **Website**: [www.ou.edu/ags/csa](https://www.ou.edu/ags/csa)

## 📝 License

Copyright © 2026 Center for Spatial Analysis, University of Oklahoma. All rights reserved.

## 🙏 Acknowledgments

- **Center for Spatial Analysis (CSA)**: Development and maintenance
- **University of Oklahoma**: Institutional support
- **College of Atmospheric and Geographic Sciences**: Academic home
- **Oklahoma City**: Data provision and partnership

## 📚 Additional Resources

- [CSA Website](https://www.ou.edu/ags/csa)
- [Oklahoma GIS Data Warehouse](https://csagis-uok.opendata.arcgis.com/)
- [GIS Day at OU](https://www.ou.edu/ags/csa/csa-projects/events)
- [ArcGIS Maps SDK for JavaScript Documentation](https://developers.arcgis.com/javascript/)

---

**Specializing in applied geospatial research and Enterprise GIS solutions for over 30 years.**
