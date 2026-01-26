import os
import glob
from osgeo import gdal

# 1. 设置输入文件夹和输出文件
output_dir = "./output"  # 放tile的文件夹
out_file = "meta_canopy_OKC_1m_mosaic.tif"

# 2. 找到所有 tif
pattern = os.path.join(output_dir, "meta_canopy_OK_10m_tile_*.tif")
tif_list = glob.glob(pattern)

if not tif_list:
    raise RuntimeError(f"No tiles found with pattern: {pattern}")

print(f"Found {len(tif_list)} tiles. Merging...")

# 3. 用 gdal.Warp 做 mosaic
#   - format='GTiff'      → GeoTIFF
#   - options 压缩 + 大文件支持
warp_options = gdal.WarpOptions(
    format="GTiff",
    creationOptions=[
        "COMPRESS=LZW",     # 压缩
        "BIGTIFF=YES"       # 结果很大时自动用 BigTIFF
    ]
)

gdal.Warp(
    destNameOrDestDS=out_file,
    srcDSOrSrcDSTab=tif_list,
    options=warp_options
)

print(f"Done! Mosaic saved to: {out_file}")
