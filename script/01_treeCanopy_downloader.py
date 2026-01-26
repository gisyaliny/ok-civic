import math
import ee
import geemap
import geopandas as gpd
from shapely.geometry import mapping

# ------------ CONFIG ------------
PROJECT_ID = "ee-yalinyang168"
SCALE = 1
MAX_TILE_DIM_PX = 4096
OUT_PREFIX = "./output/meta_canopy_OKC_1m_tile"
CRS = "EPSG:5070"

OK_PLACE_SHP = r".\data\OKC.shp"
PLACE_NAME = "Oklahoma City"
# --------------------------------

ee.Initialize(project=PROJECT_ID)

# 1) Meta canopy (note: only band is cover_code)
canopy_col = ee.ImageCollection("projects/sat-io/open-datasets/facebook/meta-canopy-height")
canopy = canopy_col.mosaic()
print("Bands:", canopy.bandNames().getInfo())  # ['cover_code']

# 2) Load OKC boundary from local shapefile
gdf = gpd.read_file(OK_PLACE_SHP)
okc_geom = gdf.union_all()

# IMPORTANT: simplify geometry to avoid huge coordinate payloads to EE
# tolerance in degrees if geometry is still in EPSG:4326; better: project first
okc_gdf = gpd.GeoDataFrame(geometry=[okc_geom], crs=gdf.crs)

# Make sure it's WGS84 before converting to EE
okc_gdf = okc_gdf.to_crs("EPSG:4326")

# Simplify a bit (in degrees). If too coarse/fine, tweak 0.0001~0.001
okc_simple = okc_gdf.geometry.iloc[0].simplify(tolerance=0.0002, preserve_topology=True)

# Convert to ee.Geometry
roi = ee.Geometry(mapping(okc_simple))

print("Computing tiling scheme ...")

# 3) Bounds in EPSG:5070 meters
bounds_5070 = roi.bounds(maxError=10, proj=ee.Projection(CRS)).getInfo()
coords = bounds_5070["coordinates"][0]
xmin, ymin = coords[0]
xmax, ymax = coords[2]

width_m = xmax - xmin
height_m = ymax - ymin

width_px = width_m / SCALE
height_px = height_m / SCALE

print(f"OKC in {CRS}: width ≈ {width_m:.1f} m ({width_px:.0f} px), "
      f"height ≈ {height_m:.1f} m ({height_px:.0f} px)")

# 4) tiles
nx = math.ceil(width_px / MAX_TILE_DIM_PX)
ny = math.ceil(height_px / MAX_TILE_DIM_PX)
print(f"Tiling into {nx} columns × {ny} rows (total {nx*ny} tiles).")

tile_width_m = width_m / nx
tile_height_m = height_m / ny

roi_5070 = roi.transform(CRS, 10)

# 5) export tiles (local download) - OK for small-ish tiles; for reliability use Drive export later
tile_index = 0
for ix in range(nx):
    for iy in range(ny):
        x0 = xmin + ix * tile_width_m
        x1 = x0 + tile_width_m
        y0 = ymin + iy * tile_height_m
        y1 = y0 + tile_height_m

        rect_5070 = ee.Geometry.Rectangle([x0, y0, x1, y1], CRS, False)
        tile_geom = rect_5070.intersection(roi_5070, 10)

        area = tile_geom.area(maxError=10).getInfo()
        if area == 0:
            continue

        tile_index += 1
        tile_name = f"{OUT_PREFIX}_{ix}_{iy}.tif"
        print(f"Exporting tile {tile_index}: {tile_name}")

        img_tile = canopy.clip(tile_geom)

        geemap.ee_export_image(
            img_tile,
            filename=tile_name,
            scale=SCALE,
            region=tile_geom,
            crs=CRS,
            file_per_band=False,
        )

print("All tiles attempted.")
