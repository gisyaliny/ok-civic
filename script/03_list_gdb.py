import arcpy
import os

gdb_path = r"e:\2025\Oklahoma\ok-civic\data\JimAnderson121625.gdb"

try:
    arcpy.env.workspace = gdb_path
    fcs = arcpy.ListFeatureClasses()
    print(f"Feature Classes in {gdb_path}:")
    for fc in fcs:
        print(f" - {fc}")
except Exception as e:
    print(f"Error accessing GDB: {e}")
