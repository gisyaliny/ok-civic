import arcpy
import os
import glob
import zipfile
import shutil

# Paths
root_dir = r"e:\2025\Oklahoma\ok-civic"
output_dir = os.path.join(root_dir, "output")
data_dir = os.path.join(root_dir, "data")
staging_dir = os.path.join(data_dir, "staging")
gdb_path = os.path.join(data_dir, "JimAnderson121625.gdb")

if not os.path.exists(staging_dir):
    os.makedirs(staging_dir)

# 1. Merge Canopy Tiles
print("Searching for tiles...")
tiles = glob.glob(os.path.join(output_dir, "meta_canopy_OKC_1m_tile_*.tif"))
if tiles:
    print(f"Found {len(tiles)} tiles.")
    mosaic_out = os.path.join(data_dir, "canopy_mosaic.tif")
    if not os.path.exists(mosaic_out):
        print("Merging tiles... (this may find time)")
        # Get properties from first tile
        desc = arcpy.Describe(tiles[0])
        sr = desc.spatialReference
        pixel_type = "8_BIT_UNSIGNED" # Assuming standard image
        bands = desc.bandCount
        
        try:
            # MosaicToNewRaster(input_rasters, output_location, raster_dataset_name_with_ext, 
            #                   {coordinate_system_for_the_raster}, {pixel_type}, {cellsize}, 
            #                   number_of_bands, {mosaic_method}, {mosaic_colormap_mode})
            arcpy.management.MosaicToNewRaster(
                input_rasters=tiles,
                output_location=data_dir,
                raster_dataset_name_with_extension="canopy_mosaic.tif",
                coordinate_system_for_the_raster=sr,
                pixel_type=pixel_type,
                number_of_bands=bands
            )
            print("Mosaic created successfully.")
        except Exception as e:
            print(f"Error merging rasters: {e}")
    else:
        print("Mosaic already exists, skipping.")
else:
    print("No tiles found to merge.")

# 2. Export Feature Classes to Shapefiles and Zip
def export_and_zip(fc_path, name, out_zip_path):
    print(f"Processing {name}...")
    temp_shp_folder = os.path.join(staging_dir, name)
    if not os.path.exists(temp_shp_folder):
        os.makedirs(temp_shp_folder)
    
    out_shp = os.path.join(temp_shp_folder, f"{name}.shp")
    
    try:
        # Export (CopyFeatures)
        if arcpy.Exists(out_shp):
            arcpy.management.Delete(out_shp)
        arcpy.management.CopyFeatures(fc_path, out_shp)
        
        # Zip
        print(f"Zipping {name}...")
        with zipfile.ZipFile(out_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_shp_folder):
                for file in files:
                    zipf.write(os.path.join(root, file), 
                               arcname=file) # Flatten path
        
        print(f"Created {out_zip_path}")
        
    except Exception as e:
        print(f"Error processing {name}: {e}")

# Prepare items
items_to_process = [
    {
        "source": os.path.join(gdb_path, "BuildingFootprints2020"),
        "name": "BuildingFootprints",
        "zip": os.path.join(staging_dir, "BuildingFootprints.zip")
    },
    {
        "source": os.path.join(gdb_path, "StraightZoning"),
        "name": "Zoning",
        "zip": os.path.join(staging_dir, "Zoning.zip")
    },
    {
        "source": os.path.join(data_dir, "muni_2020.shp"),
        "name": "OKC_Boundary",
        "zip": os.path.join(staging_dir, "OKC_Boundary.zip")
    }
]

for item in items_to_process:
    # Custom zip logic for existing shapefile (muni) vs GDB export
    if item["source"].endswith(".shp"):
        # Just zip the existing shapefile components
        print(f"Zipping existing shapefile {item['name']}...")
        shp_base = os.path.splitext(item["source"])[0]
        # List all related files
        source_dir = os.path.dirname(item["source"])
        base_name = os.path.basename(shp_base)
        
        with zipfile.ZipFile(item["zip"], 'w', zipfile.ZIP_DEFLATED) as zipf:
             for f in os.listdir(source_dir):
                 if f.startswith(base_name):
                     zipf.write(os.path.join(source_dir, f), f)
        print(f"Created {item['zip']}")
    else:
        export_and_zip(item["source"], item["name"], item["zip"])

print("Data preparation complete.")
