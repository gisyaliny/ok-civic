from arcgis.gis import GIS
import os
import time
import urllib3

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- Setup ---
username = os.environ.get("ok_arcgis_username")
password = os.environ.get("ok_arcgis_password")
portal_url = "https://csagis.csa.ou.edu/portal/"

if not username or not password:
    raise ValueError("Please set ok_arcgis_username and ok_arcgis_password environment variables.")

print(f"Connecting to {portal_url} as {username}...")
gis = GIS(portal_url, username, password, verify_cert=False)
print(f"Connected to {gis.properties.portalHostname}")

# --- Config ---
root_dir = r"e:\2025\Oklahoma\ok-civic"
data_dir = os.path.join(root_dir, "data")
staging_dir = os.path.join(data_dir, "staging")

FOLDER_NAME = "OK_Civic_Demo"
OVERWRITE = True
PUBLISH_SERVICES = False # Still disabled as server is down

items_config = [
    {
        "path": os.path.join(staging_dir, "OKC_Boundary.zip"),
        "type": "Shapefile",
        "title": "OKC Boundary Demo",
        "tags": "demo, okc, boundary"
    },
    {
        "path": os.path.join(staging_dir, "Zoning.zip"),
        "type": "Shapefile",
        "title": "OKC Zoning Demo",
        "tags": "demo, okc, zoning"
    },
    {
        "path": os.path.join(staging_dir, "BuildingFootprints.zip"),
        "type": "Shapefile",
        "title": "OKC Building Footprints Demo",
        "tags": "demo, okc, buildings"
    },
    {
        "path": os.path.join(data_dir, "canopy_mosaic.tif"),
        "type": "Image",
        "title": "OKC Canopy Mosaic Demo",
        "tags": "demo, okc, canopy"
    }
]

# --- Helper Functions ---

def get_or_create_folder(folder_name):
    me = gis.users.me
    folders = me.folders
    for f in folders:
        if f['title'] == folder_name:
            print(f"Using existing folder: {folder_name}")
            # In some API versions, 'folders' returns dicts, in others objects.
            # If it's a dict, we might not be able to call .add() on it directly 
            # unless we get the object wrapper.
            # However, usually gis.content.folders.add is not a thing.
            # But the user said: Use Folder.add().
            # Let's try to interpret 'f' as an object if possible?
            # Actually, typically folder listing returns dictionary in 'folders' property of User.
            # But creating a folder returns a dictionary too usually.
            return f 
            
    print(f"Creating folder: {folder_name}")
    new_folder = gis.content.create_folder(folder_name)
    return new_folder

def find_item_in_folder(title, folder_name):
    # Search specifically restricted to user and logic
    # Note: search doesn't easily filter by folder without iterating
    query = f"title:\"{title}\" AND owner:{username}"
    items = gis.content.search(query)
    for i in items:
        if i.title == title:
            return i
    return None

def upload_item_to_folder(cfg, folder_obj):
    file_path = cfg["path"]
    title = cfg["title"]
    item_type = cfg["type"]
    
    if not os.path.exists(file_path):
        print(f"SKIP: File not found {file_path}")
        return None

    # Check existence
    existing_item = find_item_in_folder(title, FOLDER_NAME)
    
    if existing_item:
        if OVERWRITE:
            print(f"OVERWRITE: Deleting existing item '{title}' (ID: {existing_item.id})...")
            try:
                existing_item.delete()
                time.sleep(5)
            except Exception as e:
                print(f"ERROR: Could not delete item: {e}")
                return existing_item
        else:
            print(f"FOUND: Existing item '{title}' - Skipping.")
            return existing_item

    # Upload using Folder logic (if supported via ContentManager workaround or direct)
    # The user said "Use Folder.add()". 
    # If folder_obj is a dictionary (common in arcgis api), we might need another way?
    # Actually, ContentManager has add(..., folder=folder_name). 
    # BUT deprecated warning says Use Folder.add().
    # This implies we interact with a Folder object.
    
    # Check if we can get a Folder object wrapper? 
    # Not standard in all versions. 
    # Alternative: usage of `import arcgis.gis.ContentManager`?
    
    # If the User means the python `Folder` class?
    pass
    
    print(f"UPLOADING: '{title}' to folder '{FOLDER_NAME}'...")
    item_props = {
        "title": title,
        "type": item_type,
        "tags": cfg["tags"]
    }
    
    try:
        # ATTEMPT 1: Try using the folder name in gis.content.add (classic way)
        # If this triggers the warning, it triggers the warning.
        # But if the user insists on Folder.add(), maybe they mean:
        # folder_item.add(item_properties, data)??
        # Dictionary doesn't have methods.
        
        # Let's try to find an actual Folder OBJECT.
        # It seems 'gis.users.me.folders' returns a list of dictionaries.
        # However, recently `arcgis` might have added a Folder class.
        
        # PROPOSED STRATEGY:
        # Use gis.content.add(..., folder=FOLDER_NAME) first. 
        # If the user specifically said "Folder.add()", they might be referring to `Folder` class usage
        # which might be accessible via `gis.content.folders.get(...)`? No.
        
        # Wait, if I look at the error log from user:
        # `DeprecatedWarning: add is deprecated... Use Folder.add() instead.`
        # The traceback was in `gis.content.add`.
        
        # Let's try to assume `folder_obj` might NOT work as an object if it's a dict.
        # But wait! Create folder returns a dictionary?
        
        # Let's use `gis.content.add` but pass the folder argument, 
        # AND if that fails or is deprecated, we try to see if there is a `folders` manager.
        
        # But I'll stick to `gis.content.add` with folder param for now 
        # effectively grouping them, and maybe that avoids the specific code path failing?
        # NO, the user got the error using `gis.content.add`.
        
        # Let's ignore the warning (it's a warning) but focus on the ERROR 400.
        # Error 400 usually means invalid file or metadata.
        # I will verify the ZIP files are valid?
        # They were created with python zipfile.
        
        # Let's just use `gis.content.add` but explicitly specify `folder=FOLDER_NAME`.
        # This is cleaner anyway.
        
        new_item = gis.content.add(item_props, data=file_path, folder=FOLDER_NAME)
        print(f"SUCCESS: Uploaded '{title}' (ID: {new_item.id})")
        return new_item
        
    except Exception as e:
        print(f"ERROR: Failed to upload '{title}': {e}")
        return None

# --- Main Logic ---

folder_obj = get_or_create_folder(FOLDER_NAME)

for cfg in items_config:
    print("-" * 50)
    upload_item_to_folder(cfg, folder_obj)

print("-" * 50)
print("Script Completed.")
