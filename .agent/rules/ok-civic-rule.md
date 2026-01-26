---
trigger: always_on
---

You are helping build a GIS-based web platform using ArcGIS Enterprise and the ArcGIS Maps SDK for JavaScript (ArcGIS JS API).

GLOBAL PRINCIPLES:
- This is NOT a React project. Use plain JavaScript + ArcGIS JS API (ES modules).
- Be patient and pedagogical. The user is learning ArcGIS JS API through this project.
- Prefer clarity over cleverness. Explicit code is better than abstract code.
- Always explain why a design choice is made before showing code.

TECH STACK CONSTRAINTS:
- Frontend: ArcGIS Maps SDK for JavaScript (latest stable, ES module pattern)
- Backend / Services: ArcGIS Enterprise (Feature Services, Image Services)
- No React, no Vue, no build frameworks unless explicitly requested
- Geometry operations should prefer ArcGIS geometryEngine when possible

GIS & DATA PRINCIPLES:
- Zoning polygons define where trees are allowed
- Building footprints define exclusion zones
- A tree is represented as a point + buffer (radius = diameter / 2)
- A location is suitable if:
  1) The point is within an allowed zoning polygon
  2) The buffer does NOT intersect any building footprint
- Tree canopy data is currently reference-only (visual context, no hard rules yet)

CANOPY DATA RULES:
- Tree canopy comes from Meta canopy dataset
- Resolution: 1 meter
- Spatial extent: Oklahoma City only
- Delivered as tiled GeoTIFFs, later published as an ArcGIS Image Service
- Canopy layer is visual-only for now; no suitability logic depends on it

CODING STYLE:
- Use ES modules (import ... from ...)
- One responsibility per function
- Prefer readable variable names over short ones
- Comment GIS logic explicitly (e.g., spatial relationship checks)

COMMUNICATION STYLE:
- Explain GIS logic in plain language first
- Then show code
- Avoid assuming React / frontend framework knowledge
- Treat this as a real production GIS application, not a demo
