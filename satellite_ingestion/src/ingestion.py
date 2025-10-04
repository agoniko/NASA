#!/usr/bin/env python3
"""
zurich_single_scene_traffic.py

Single-scene traffic-density estimation for Zurich (Copernicus Sentinel)

Outputs:
 - zurich_traffic_single_scene.geojson
 - zurich_traffic_districts.csv
 - zurich_traffic_summary.json
 - optional zurich_debug_samples/ (10 thumbnails)

Author: Generated for Patrix
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import random

import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio.windows import Window
from rasterio.enums import Resampling
from rasterio.features import geometry_window
from rasterio.mask import mask
from rasterstats import zonal_stats
from shapely.geometry import box, mapping
import shapely
import osmnx as ox
from sentinelsat import SentinelAPI, read_geojson, geojson_to_wkt
from sklearn.preprocessing import MinMaxScaler
from skimage import filters, feature
from scipy import ndimage as ndi
import matplotlib.pyplot as plt

# ---- Configuration defaults (changeable via args or config) ----
GRID_SIZE = 50  # meters
ROAD_BUFFER_M = 3
PERCENTILE_THRESH = [33, 67]
CLASS_COUNT_MAP_DEFAULT = {"Low": (1, 1.0), "Medium": (6, 4.0), "High": (20, 9.0)}
PROJECTION = "EPSG:2056"  # Swiss grid (CH1903+ / LV95)
N_DEBUG_SAMPLES = 10
RANDOM_SEED = 42

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("zurich_traffic")

# ----------------- Sentinel downloader / selector -----------------
class SentinelDownloader:
    """
    Wraps sentinelsat search & download. Expects COPERNICUS credentials to be
    available via environment or passed to the constructor.
    """
    def __init__(self, user=None, password=None, api_url="https://scihub.copernicus.eu/dhus"):
        self.user = user or os.environ.get("COPERNICUS_USER")
        self.password = password or os.environ.get("COPERNICUS_PASSWORD")
        if not self.user or not self.password:
            logger.warning("No Copernicus credentials provided. You must provide username/password to download.")
        self.api_url = api_url
        self.api = SentinelAPI(self.user, self.password, self.api_url) if (self.user and self.password) else None

    def search_single_best(self, footprint_wkt, start_date=None, end_date=None, product_type="S2", max_results=50):
        """
        Search for candidate products overlapping the footprint and return the single best candidate
        following the selection logic:
         - Prefer Sentinel-2 L1C (S2) with lowest cloudcoverpercentage over footprint.
         - If cloudcover > 40% (over Zurich), fallback to Sentinel-1 (GRD IW).
        Note: This method queries Copernicus. If no credentials, it will raise.
        """
        if self.api is None:
            raise RuntimeError("Sentinel API not configured (missing credentials).")

        # Search for recent S2 L1C
        logger.info(f"Searching Copernicus products between {start_date} and {end_date}...")

        # 1) Look for S2 products first (Sentinel-2 L1C)
        s2_products = self.api.query(footprint_wkt,
                                     date=(start_date, end_date),
                                     platformname='Sentinel-2',
                                     producttype='S2MSI1C',
                                     cloudcoverpercentage=(0, 100))
        s2_df = self.api.to_dataframe(s2_products)
        if not s2_df.empty:
            # sort by date desc (most recent first) then cloudcover
            s2_df = s2_df.sort_values(by=['beginposition', 'cloudcoverpercentage'], ascending=[False, True])
            best = s2_df.iloc[0]
            logger.info(f"Candidate S2 product found: {best.name} (cloudcover {best.cloudcoverpercentage} %).")
            return {
                "platform": "S2",
                "product_id": best.name,
                "uuid": best.uuid,
                "beginposition": best.beginposition.isoformat(),
                "cloudcoverpercentage": float(best.cloudcoverpercentage),
                "scihub_entry": best
            }

        # 2) If no S2 match, fallback to Sentinel-1 GRD IW
        s1_products = self.api.query(footprint_wkt,
                                     date=(start_date, end_date),
                                     platformname='Sentinel-1',
                                     producttype='GRD',
                                     sensoroperationalmode='IW')
        s1_df = self.api.to_dataframe(s1_products)
        if not s1_df.empty:
            s1_df = s1_df.sort_values(by=['beginposition'], ascending=False)
            best = s1_df.iloc[0]
            logger.info(f"Candidate S1 product found: {best.name}.")
            return {
                "platform": "S1",
                "product_id": best.name,
                "uuid": best.uuid,
                "beginposition": best.beginposition.isoformat(),
                "scihub_entry": best
            }

        raise RuntimeError("No Sentinel-1 or Sentinel-2 products found for the given footprint/date range.")

    def download_product(self, uuid, out_dir):
        if self.api is None:
            raise RuntimeError("Sentinel API not configured (missing credentials).")
        logger.info(f"Downloading product {uuid} to {out_dir} ...")
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        res = self.api.download(uuid, directory_path=str(out_dir))
        logger.info(f"Downloaded to {res['path']}")
        return Path(res['path'])


# ----------------- Utilities / Grid creation -----------------
def get_zurich_boundary_gdf(query="Zürich, Switzerland"):
    """
    Use osmnx geocode_to_gdf to obtain Zurich boundary polygon.
    Returns a GeoDataFrame in EPSG:4326 by default.
    """
    logger.info(f"Geocoding boundary for '{query}'")
    gdf = ox.geocode_to_gdf(query)
    if gdf.empty:
        raise RuntimeError("Unable to geocode Zurich boundary.")
    gdf = gdf.to_crs("EPSG:4326")
    return gdf

def reproject_to_epsg(gdf, epsg=PROJECTION):
    return gdf.to_crs(epsg)

def make_square_grid(gdf_boundary, grid_size_m=GRID_SIZE, crs=PROJECTION):
    """
    Create square grid (grid_size_m in meters) clipped to gdf_boundary (reprojected to specified CRS).
    Returns GeoDataFrame of grid cells with unique cell_id.
    """
    # ensure boundary in requested CRS
    boundary = gdf_boundary.to_crs(crs).unary_union
    minx, miny, maxx, maxy = boundary.bounds
    # snap origin to grid
    x_coords = np.arange(np.floor(minx / grid_size_m) * grid_size_m, np.ceil(maxx / grid_size_m) * grid_size_m, grid_size_m)
    y_coords = np.arange(np.floor(miny / grid_size_m) * grid_size_m, np.ceil(maxy / grid_size_m) * grid_size_m, grid_size_m)
    cells = []
    cid = 0
    for x in x_coords:
        for y in y_coords:
            cell = box(x, y, x + grid_size_m, y + grid_size_m)
            if cell.intersects(boundary):
                clipped = cell.intersection(boundary)
                cells.append({"cell_id": f"cell_{cid}", "geometry": clipped})
                cid += 1
    grid_gdf = gpd.GeoDataFrame(cells, crs=crs)
    logger.info(f"Created grid with {len(grid_gdf)} cells (grid size {grid_size_m} m).")
    return grid_gdf

# ----------------- OSM static features -----------------
def fetch_osm_parking_and_roads(boundary_gdf):
    """
    Uses osmnx to fetch parking polygons and road centerlines within the boundary.
    Returns two GeoDataFrames: parking_gdf (polygons), roads_gdf (lines).
    """
    # Extract polygon geometry (in EPSG:4326) for query
    polygon = boundary_gdf.to_crs("EPSG:4326").geometry.unary_union
    poly_wkt = shapely.wkt.dumps(polygon)
    logger.info("Fetching OSM parking and road features (this may take a moment)...")
    # Parking: amenity=parking OR parking=surface/underground/parking
    tags_parking = {"amenity": "parking"}
    try:
        parking = ox.geometries_from_polygon(polygon, tags_parking)
    except Exception as e:
        logger.warning(f"OSM parking fetch error: {e}")
        parking = gpd.GeoDataFrame(columns=['geometry'], crs="EPSG:4326")
    # Roads: use osmnx graph to extract edges
    try:
        G = ox.graph_from_polygon(polygon, network_type='drive', simplify=True)
        roads = ox.graph_to_gdfs(G, nodes=False, edges=True).reset_index(drop=True)
    except Exception as e:
        logger.warning(f"OSM roads fetch error: {e}")
        roads = gpd.GeoDataFrame(columns=['geometry'], crs="EPSG:4326")
    # Ensure crs and return
    parking = parking.to_crs(PROJECTION) if not parking.empty else parking
    roads = roads.to_crs(PROJECTION) if not roads.empty else roads
    # Convert parking to polygons if points/lines exist (buffer small if needed)
    if not parking.empty:
        parking = parking[parking.geometry.notnull()]
        parking['geometry'] = parking['geometry'].buffer(0)  # attempt to fix invalid polys
        parking = parking[parking.geometry.type.isin(['Polygon', 'MultiPolygon'])]
    return parking, roads

def compute_osm_features_per_cell(grid_gdf, parking_gdf, roads_gdf, road_buffer_m=ROAD_BUFFER_M):
    """
    For each cell, compute:
     - parking_fraction: area(parking ∩ cell) / cell_area
     - road_fraction: area(buffer(roads, road_buffer_m) ∩ cell) / cell_area
     - is_road_cell: road_fraction > 0.02
    Returns grid_gdf with new columns.
    """
    grid = grid_gdf.copy()
    grid['cell_area'] = grid.geometry.area
    # parking fraction
    if parking_gdf is None or parking_gdf.empty:
        grid['parking_fraction'] = 0.0
    else:
        # compute intersection areas via spatial join / overlay
        parking_clip = gpd.overlay(parking_gdf[['geometry']], grid[['cell_id','geometry']], how='intersection')
        if parking_clip.empty:
            grid['parking_fraction'] = 0.0
        else:
            parking_clip['area'] = parking_clip.geometry.area
            park_agg = parking_clip.groupby('cell_id')['area'].sum().rename('parking_area')
            grid = grid.merge(park_agg, on='cell_id', how='left')
            grid['parking_area'] = grid['parking_area'].fillna(0.0)
            grid['parking_fraction'] = grid['parking_area'] / grid['cell_area']
            grid = grid.drop(columns=['parking_area'])
    # road fraction
    if roads_gdf is None or roads_gdf.empty:
        grid['road_fraction'] = 0.0
    else:
        # buffer centerlines
        roads_buffered = roads_gdf.copy()
        # if edges have geometry type MultiLineString/LineString, buffer
        roads_buffered['geometry'] = roads_buffered.geometry.buffer(road_buffer_m)
        road_clip = gpd.overlay(roads_buffered[['geometry']], grid[['cell_id','geometry']], how='intersection')
        if road_clip.empty:
            grid['road_fraction'] = 0.0
        else:
            road_clip['area'] = road_clip.geometry.area
            road_agg = road_clip.groupby('cell_id')['area'].sum().rename('road_area')
            grid = grid.merge(road_agg, on='cell_id', how='left')
            grid['road_area'] = grid['road_area'].fillna(0.0)
            grid['road_fraction'] = grid['road_area'] / grid['cell_area']
            grid = grid.drop(columns=['road_area'])
    # is_road_cell flag
    grid['is_road_cell'] = grid['road_fraction'] > 0.02
    return grid

# ----------------- Raster feature extraction -----------------
def open_s2_bands_as_rasters(product_path, band_names_required=("B02","B03","B04","B08")):
    """
    Given a Sentinel-2 product folder (SAFE) or already extracted geotiffs, attempt to find
    10m bands B02 (blue), B03 (green), B04 (red), and B08 (NIR).
    Returns dictionary band -> raster path (or rasterio dataset). This function is best-effort;
    exact filenames depend on product structure.
    """
    # Simple approach: look for geotiff files in product path with band codes in filename
    p = Path(product_path)
    candidates = list(p.rglob("*.jp2")) + list(p.rglob("*.tif"))
    band_files = {}
    for b in band_names_required:
        for f in candidates:
            if f.name.upper().find(b) >= 0:
                band_files[b] = str(f)
                break
    missing = [b for b in band_names_required if b not in band_files]
    if missing:
        logger.warning(f"Missing S2 bands: {missing}. You may need to prepare/convert SAFE to 10m GeoTIFFs.")
    return band_files

def compute_zonal_stats_for_bands(grid_gdf, band_file_map, agg_funcs=('mean', 'std')):
    """
    Use rasterstats.zonal_stats to compute zonal stats for each band in band_file_map.
    band_file_map: dict {band_name: path_to_raster}
    Returns DataFrame with cell_id and per-band stats as columns: e.g. brightness_mean, b08_mean, etc.
    """
    results = pd.DataFrame({'cell_id': grid_gdf['cell_id']})
    for bname, path in band_file_map.items():
        if not os.path.exists(path):
            logger.warning(f"Band file {path} not found; filling zeros for band {bname}.")
            for agg in agg_funcs:
                results[f"{bname.lower()}_{agg}"] = 0.0
            continue
        zs = zonal_stats(grid_gdf.geometry, path, stats=list(agg_funcs), nodata=None, all_touched=False, geojson_out=False)
        # zonal_stats returns list of dicts aligned with grid rows
        for agg in agg_funcs:
            results[f"{bname.lower()}_{agg}"] = [z.get(agg, 0.0) if z else 0.0 for z in zs]
    return results

def compute_edge_density(grid_gdf, rgb_stack_path=None, r_arr=None, g_arr=None, b_arr=None, transform=None, band_affine=None):
    """
    If RGB arrays provided (r,g,b) with same shape and transform, compute edge density per cell:
    - build grayscale via mean, apply Sobel or Canny, compute fraction of edge pixels in each cell.
    If rgb_stack_path provided instead, attempt to read small windows per cell.
    Returns pandas Series aligned to grid_gdf indices.
    """
    edge_frac = []
    # If arrays given, use them directly with rasterio.features geometry windows
    if r_arr is not None and transform is not None:
        # combine to grayscale
        gray = (r_arr.astype(float) + g_arr.astype(float) + b_arr.astype(float)) / 3.0
        # apply Sobel magnitude
        sx = filters.sobel_h(gray)
        sy = filters.sobel_v(gray)
        mag = np.hypot(sx, sy)
        # threshold edges
        thresh = np.percentile(mag, 75)
        edges = mag > thresh
        # for each cell, compute fraction of edge pixels by mapping cell geom to raster window
        for geom in grid_gdf.geometry:
            try:
                win = geometry_window({'transform': transform, 'height': gray.shape[0], 'width': gray.shape[1]}, [mapping(geom)], pad_x=0, pad_y=0)
                # read slice from edges
                minrow, mincol, maxrow, maxcol = win.tuple  # careful: geometry_window returns Window-like; use .col_off etc? We'll compute using bounds -> index
                # safer: compute bbox to pixel indices
                # rasterio transform: Affine(a, b, c, d, e, f) where c,f = origin x,y
            except Exception:
                # fallback approximate bounding box sampling: compute bbox in coords -> then slice via transform
                pass
            # simplified: compute mask using rasterize per cell would be more robust but expensive. Instead, compute fraction by sampling center tile patch.
            # We'll approximate by taking a small square around the centroid of geom.
            cx, cy = geom.representative_point().coords[0]
            # convert coords to pixel indices
            col = int((cx - transform.c) / transform.a)
            row = int((cy - transform.f) / transform.e)
            h = int(GRID_SIZE / abs(transform.e))  # approx pixels per grid cell
            w = int(GRID_SIZE / transform.a) if transform.a != 0 else 1
            r0 = max(0, row - h//2); r1 = min(edges.shape[0], row + h//2)
            c0 = max(0, col - w//2); c1 = min(edges.shape[1], col + w//2)
            patch = edges[r0:r1, c0:c1]
            if patch.size == 0:
                edge_frac.append(0.0)
            else:
                edge_frac.append(float(patch.sum()) / patch.size)
        return pd.Series(edge_frac)
    else:
        # If stack path provided, we will open raster and read small windows for each cell (safer).
        if rgb_stack_path is None or not os.path.exists(rgb_stack_path):
            logger.warning("No RGB arrays or file provided for edge density; returning zeros.")
            return pd.Series([0.0]*len(grid_gdf))
        with rasterio.open(rgb_stack_path) as src:
            # read full into arrays (if small enough)
            try:
                arr = src.read()  # shape [bands, H, W]
                # compute grayscale
                gray = arr.mean(axis=0)
                sx = filters.sobel_h(gray)
                sy = filters.sobel_v(gray)
                mag = np.hypot(sx, sy)
                thresh = np.percentile(mag, 75)
                edges = mag > thresh
                transform = src.transform
                for geom in grid_gdf.geometry:
                    # use rasterio.features.geometry_window to get window
                    try:
                        win = geometry_window(src, [mapping(geom)], pad_x=0, pad_y=0)
                        row_off, row_count = win.row_off, win.height
                        col_off, col_count = win.col_off, win.width
                        patch = edges[row_off:row_off+row_count, col_off:col_off+col_count]
                        if patch.size == 0:
                            edge_frac.append(0.0)
                        else:
                            edge_frac.append(float(patch.sum()) / patch.size)
                    except Exception:
                        edge_frac.append(0.0)
                return pd.Series(edge_frac)
            except Exception as e:
                logger.warning(f"Edge density computation error: {e}")
                return pd.Series([0.0]*len(grid_gdf))

# ----------------- Sentinel-1 specific processing -----------------
def compute_s1_zonal_stats(grid_gdf, vv_raster_path, vh_raster_path=None):
    """
    Compute s1_vv_mean, s1_vv_std, optionally s1_vh_mean per cell using zonal_stats.
    """
    stats = pd.DataFrame({'cell_id': grid_gdf['cell_id']})
    # VV mean/std
    if vv_raster_path and os.path.exists(vv_raster_path):
        zs_vv = zonal_stats(grid_gdf.geometry, vv_raster_path, stats=['mean','std'], nodata=None)
        stats['s1_vv_mean'] = [z.get('mean', 0.0) if z else 0.0 for z in zs_vv]
        stats['s1_vv_std'] = [z.get('std', 0.0) if z else 0.0 for z in zs_vv]
    else:
        stats['s1_vv_mean'] = 0.0
        stats['s1_vv_std'] = 0.0
    # VH
    if vh_raster_path and os.path.exists(vh_raster_path):
        zs_vh = zonal_stats(grid_gdf.geometry, vh_raster_path, stats=['mean'], nodata=None)
        stats['s1_vh_mean'] = [z.get('mean', 0.0) if z else 0.0 for z in zs_vh]
    else:
        stats['s1_vh_mean'] = 0.0
    return stats

# ----------------- Scoring & classification -----------------
def compute_scores_and_classes(grid_with_features, used_sensor="S2", class_count_map=CLASS_COUNT_MAP_DEFAULT):
    """
    grid_with_features: GeoDataFrame that includes the computed feature columns, e.g.
    For S2: brightness_mean, ndvi_mean, edge_density, parking_fraction, road_fraction, is_road_cell
    For S1: s1_vv_mean, s1_vv_std, s1_vh_mean (opt), parking_fraction, road_fraction, is_road_cell

    Returns: grid_gdf with added columns: score, traffic_level, approx_count, approx_std
    """
    df = grid_with_features.copy()
    features = []
    weights = {}
    if used_sensor == "S1":
        features = ['s1_vv_mean', 's1_vv_std', 'parking_fraction', 'road_fraction']
        weights = {'s1_vv_mean':0.45, 's1_vv_std':0.15, 'parking_fraction':0.25, 'road_fraction':0.15}
    else:
        # S2
        features = ['brightness_mean', 'edge_density', 'parking_fraction', 'road_fraction']
        weights = {'brightness_mean':0.35, 'edge_density':0.25, 'parking_fraction':0.25, 'road_fraction':0.15}

    # Fill missing
    for f in features:
        if f not in df.columns:
            df[f] = 0.0
    df[features] = df[features].fillna(0.0)

    # Normalize each feature via MinMax
    scaler = MinMaxScaler()
    scaled = scaler.fit_transform(df[features].values)
    scaled_df = pd.DataFrame(scaled, columns=[f + "_s" for f in features], index=df.index)
    df = pd.concat([df, scaled_df], axis=1)

    # compute weighted score
    score_arr = np.zeros(len(df))
    for f in features:
        score_arr += df[f + "_s"].values * weights[f]
    df['score'] = score_arr

    # Percentiles for classification
    p33 = np.percentile(df['score'], PERCENTILE_THRESH[0])
    p67 = np.percentile(df['score'], PERCENTILE_THRESH[1])
    def score_to_level(row):
        s = row['score']
        level = None
        if s <= p33:
            level = "Low"
        elif s <= p67:
            level = "Medium"
        else:
            level = "High"
        # override rules
        if (not row.get('is_road_cell', False)) and (row.get('parking_fraction', 0.0) < 0.01):
            level = "Low"
        return level
    df['traffic_level'] = df.apply(score_to_level, axis=1)

    # Parking promotion rule: for cells with parking_fraction > 0.5, if score in top 40% among parking cells -> promote to High
    parking_cells = df[df['parking_fraction'] > 0.5]
    if not parking_cells.empty:
        thr = np.percentile(parking_cells['score'].values, 60.0)  # top 40% -> score > 60th percentile
        idx_promote = parking_cells[parking_cells['score'] > thr].index
        df.loc[idx_promote, 'traffic_level'] = "High"

    # Map classes to approx counts (mean, std)
    def map_count(level):
        mean, std = class_count_map.get(level, (1,1.0))
        return pd.Series({'approx_count': float(mean), 'approx_std': float(std)})
    mapped = df['traffic_level'].apply(map_count)
    df = pd.concat([df, mapped], axis=1)

    return df

# ----------------- Aggregation by administrative district -----------------
def aggregate_by_district(grid_df, zurich_admin_gdf):
    """
    Aggregates approx_count by administrative polygons (districts).
    Returns DataFrame with columns:
      district_id, district_name (if available), total_estimated_vehicles, avg_score, n_cells, pct_low, pct_medium, pct_high
    """
    # ensure same CRS
    grid = grid_df.copy()
    admin = zurich_admin_gdf.to_crs(grid.crs)
    # spatial join cell -> district
    cell_with_admin = gpd.sjoin(grid, admin[['geometry']], predicate='intersects', how='left')
    # If admin names/ids exist, try to use them, else just index
    # For generic: we'll use index label as district_id
    if 'index_right' in cell_with_admin.columns:
        cell_with_admin['district_id'] = cell_with_admin['index_right'].fillna(-1).astype(int)
    else:
        cell_with_admin['district_id'] = -1
    agg = cell_with_admin.groupby('district_id').apply(
        lambda g: pd.Series({
            'total_estimated_vehicles': float(g['approx_count'].sum()),
            'avg_score': float(g['score'].mean()),
            'n_cells': int(len(g)),
            'pct_low': float((g['traffic_level'] == 'Low').sum() / len(g) if len(g)>0 else 0.0),
            'pct_medium': float((g['traffic_level'] == 'Medium').sum() / len(g) if len(g)>0 else 0.0),
            'pct_high': float((g['traffic_level'] == 'High').sum() / len(g) if len(g)>0 else 0.0)
        })
    ).reset_index()
    return agg

# ----------------- Thumbnail samples -----------------
def save_debug_thumbnails(grid_df, raster_path, out_dir="zurich_debug_samples", n_samples=N_DEBUG_SAMPLES):
    """
    Save small PNG thumbnails (RGB composite) centered at N sample cells for QC.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # choose sample cells
    rng = np.random.default_rng(RANDOM_SEED)
    indices = rng.choice(len(grid_df), size=min(n_samples, len(grid_df)), replace=False)
    with rasterio.open(raster_path) as src:
        for idx in indices:
            row = grid_df.iloc[idx]
            geom = row.geometry
            try:
                window = geometry_window(src, [mapping(geom)], pad_x=2, pad_y=2)
                data = src.read(window=window, out_shape=(src.count, window.height, window.width), resampling=Resampling.bilinear)
                # create RGB image -> take first 3 bands if present
                if data.shape[0] >= 3:
                    img = np.transpose(data[:3,:,:], (1,2,0))
                else:
                    # replicate band
                    img = np.transpose(np.tile(data[0:1,:,:], (3,1,1)), (1,2,0))
                # scale to 0-255 for PNG
                img = img.astype(float)
                img -= img.min()
                if img.max() > 0:
                    img = img / img.max()
                img = (img * 255).astype('uint8')
                out_path = out_dir / f"{row['cell_id']}.png"
                plt.imsave(out_path, img)
            except Exception as e:
                logger.debug(f"Thumbnail save failed for cell {row['cell_id']}: {e}")
    logger.info(f"Saved thumbnails to {out_dir}")

# ----------------- Main pipeline -----------------
def run_pipeline(target_date=None, lookback_days=14, out_dir="output", class_count_map=None, cop_user=None, cop_pass=None, force_sensor=None):
    """
    Main execution function.
    target_date: ISO date string (YYYY-MM-DD) to find most recent scene at or before that date.
    lookback_days: how far back to search for a suitable single scene.
    force_sensor: if 'S2' or 'S1', skip selection logic and force that product (useful for debugging).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # 1) Get Zurich boundary
    boundary_gdf = get_zurich_boundary_gdf("Zürich, Switzerland")
    boundary_gdf = boundary_gdf.to_crs("EPSG:4326")
    zurich_boundary_wkt = geojson_to_wkt(json.loads(boundary_gdf.to_json()))
    # 2) Sentinel search
    sd = SentinelDownloader(user=cop_user, password=cop_pass)
    # target date range
    if target_date is None:
        end_date = datetime.utcnow().date()
    else:
        end_date = datetime.fromisoformat(target_date).date()
    start_date = end_date - timedelta(days=lookback_days)
    # If forcing sensor, skip searching for alternative
    selected_product = None
    if force_sensor:
        # Attempt to search for that sensor specifically
        if force_sensor == "S2":
            desired_platform = 'Sentinel-2'
            product_type = 'S2MSI1C'
            found = sd.api.query(zurich_boundary_wkt, date=(start_date.isoformat(), end_date.isoformat()), platformname=desired_platform, producttype=product_type)
            df = sd.api.to_dataframe(found) if found else pd.DataFrame()
            if not df.empty:
                df = df.sort_values(by=['beginposition','cloudcoverpercentage'], ascending=[False, True])
                best = df.iloc[0]
                selected_product = {"platform":"S2", "product_id":best.name, "uuid":best.uuid, "beginposition":best.beginposition.isoformat(), "cloudcoverpercentage":float(best.cloudcoverpercentage)}
        else:
            found = sd.api.query(zurich_boundary_wkt, date=(start_date.isoformat(), end_date.isoformat()), platformname='Sentinel-1', producttype='GRD', sensoroperationalmode='IW')
            df = sd.api.to_dataframe(found) if found else pd.DataFrame()
            if not df.empty:
                df = df.sort_values(by=['beginposition'], ascending=False)
                best = df.iloc[0]
                selected_product = {"platform":"S1", "product_id":best.name, "uuid":best.uuid, "beginposition":best.beginposition.isoformat()}
    else:
        # Normal selection logic prefers S2 and checks cloud cover
        candidate = sd.search_single_best(zurich_boundary_wkt, start_date.isoformat(), end_date.isoformat())
        if candidate['platform'] == "S2":
            # if cloudcover > 40% -> fallback to S1
            if candidate.get('cloudcoverpercentage', 100.0) > 40.0:
                logger.info(f"S2 cloudcover {candidate.get('cloudcoverpercentage')}% > 40% -> searching for S1 fallback.")
                # search S1 last x days
                try:
                    s1_candidate = sd.search_single_best(zurich_boundary_wkt, start_date.isoformat(), end_date.isoformat())
                    if s1_candidate['platform'] == "S1":
                        selected_product = s1_candidate
                except Exception:
                    selected_product = candidate
            else:
                selected_product = candidate
        else:
            selected_product = candidate

    if selected_product is None:
        raise RuntimeError("No suitable Sentinel product selected.")

    logger.info(f"Selected product: {selected_product}")

    # Download product (user must have credentials)
    try:
        product_path = sd.download_product(selected_product['uuid'], out_dir)
    except Exception as e:
        logger.warning(f"Download failed or credentials missing: {e}. The rest of the pipeline will assume local product files are available and attempt to continue.")
        product_path = Path(out_dir)  # assume user will place files there

    # 3) Build grid in EPSG:2056
    boundary_2056 = boundary_gdf.to_crs(PROJECTION)
    grid_gdf = make_square_grid(boundary_2056, grid_size_m=GRID_SIZE, crs=PROJECTION)

    # 4) Fetch OSM parking and roads and compute osm features
    parking_gdf, roads_gdf = fetch_osm_parking_and_roads(boundary_gdf)
    # convert parking/roads to EPSG:2056
    if parking_gdf is not None and not parking_gdf.empty:
        parking_gdf = parking_gdf.to_crs(PROJECTION)
    if roads_gdf is not None and not roads_gdf.empty:
        roads_gdf = roads_gdf.to_crs(PROJECTION)
    grid_with_osm = compute_osm_features_per_cell(grid_gdf, parking_gdf, roads_gdf)

    # 5) Extract raster features depending on sensor
    used_sensor = selected_product.get('platform', 'S2')
    raster_features_df = pd.DataFrame({'cell_id': grid_with_osm['cell_id']})
    if used_sensor == 'S2':
        # find 10m bands
        band_map = open_s2_bands_as_rasters(product_path)
        # brightness = mean(B02,B03,B04) per cell
        # compute zonal stats for B02,B03,B04,B08
        band_stats = compute_zonal_stats_for_bands(grid_with_osm, band_map, agg_funcs=('mean','std'))
        # brightness as mean of B02_mean,B03_mean,B04_mean
        for col in ['b02_mean','b03_mean','b04_mean','b08_mean','b08_std']:
            if col not in band_stats.columns:
                band_stats[col] = 0.0
        band_stats['brightness_mean'] = band_stats[['b02_mean','b03_mean','b04_mean']].mean(axis=1)
        # NDVI = (B08 - B04) / (B08 + B04)
        b8 = band_stats['b08_mean'].replace(0, np.nan)
        b4 = band_stats['b04_mean'].replace(0, np.nan)
        band_stats['ndvi_mean'] = ((b8 - b4) / (b8 + b4)).fillna(0.0)
        # Edge density: try to read an RGB composite file; if not, approximate using band files
        edge_series = compute_edge_density(grid_with_osm,
                                           r_arr=None, g_arr=None, b_arr=None,
                                           rgb_stack_path=None)
        band_stats['edge_density'] = edge_series.values
        raster_features_df = band_stats[['cell_id','brightness_mean','ndvi_mean','edge_density']]
    else:
        # S1: user should have preprocessed VV and VH intensity GeoTIFFs
        # try to locate VV/VH files under product_path
        vv_path = None
        vh_path = None
        for f in Path(product_path).rglob("*.tif"):
            name = f.name.lower()
            if 'vv' in name and ('vh' not in name):
                vv_path = str(f)
            if 'vh' in name:
                vh_path = str(f)
        if not vv_path:
            logger.warning("No VV raster found automatically. Please provide VV raster file in product folder.")
        s1_stats = compute_s1_zonal_stats(grid_with_osm, vv_path, vh_path)
        raster_features_df = s1_stats

    # Merge raster_features and osm features into one GeoDataFrame
    grid_feats = grid_with_osm.merge(raster_features_df, on='cell_id', how='left')
    # fill NaNs
    grid_feats = grid_feats.fillna(0.0)

    # 6) Scoring and classification
    class_map = class_count_map if class_count_map is not None else CLASS_COUNT_MAP_DEFAULT
    scored = compute_scores_and_classes(grid_feats, used_sensor=used_sensor, class_count_map=class_map)

    # 7) Outputs: per-cell GeoJSON
    out_geojson = out_dir / "zurich_traffic_single_scene.geojson"
    # keep requested fields: cell_id, geometry, traffic_level, score, approx_count, approx_std
    out_cols = ['cell_id', 'geometry', 'traffic_level', 'score', 'approx_count', 'approx_std', 'is_road_cell', 'parking_fraction', 'road_fraction']
    scored_out = scored[out_cols].copy()
    scored_out = gpd.GeoDataFrame(scored_out, geometry='geometry', crs=PROJECTION)
    scored_out.to_file(out_geojson, driver='GeoJSON')
    logger.info(f"Wrote per-cell GeoJSON -> {out_geojson}")

    # 8) District aggregation: we will use OSM admin boundary polygons if available (zoning by index)
    # For simplicity, use the OSM boundary as single polygon; but if you have admin/districts, replace.
    # We'll attempt to fetch 'admin_level' polygons if available via osmnx (not guaranteed).
    try:
        # Try to get sub-administrative boundaries inside Zurich (may be not available)
        admin_polys = ox.geometries_from_place("Zürich, Switzerland", tags={'admin_level':'8'})  # attempt
        if admin_polys is None or admin_polys.empty:
            admin_gdf = boundary_2056.to_crs(PROJECTION)
            admin_gdf = gpd.GeoDataFrame({'name':['Zurich']}, geometry=[boundary_2056.unary_union], crs=PROJECTION)
        else:
            admin_gdf = admin_polys.to_crs(PROJECTION)
    except Exception:
        admin_gdf = gpd.GeoDataFrame({'name':['Zurich']}, geometry=[boundary_2056.unary_union], crs=PROJECTION)

    agg = aggregate_by_district(scored_out, admin_gdf)
    csv_out = out_dir / "zurich_traffic_districts.csv"
    agg.to_csv(csv_out, index=False)
    logger.info(f"Wrote district CSV -> {csv_out}")

    # 9) Summary JSON
    estimated_total = float(scored_out['approx_count'].sum())
    summary = {
        "estimated_total_vehicles": estimated_total,
        "n_cells": int(len(scored_out)),
        "method": {
            "sentinel_product_id": selected_product.get('product_id'),
            "platform": selected_product.get('platform'),
            "acquisition_time": selected_product.get('beginposition'),
            "cloudcoverpercentage": selected_product.get('cloudcoverpercentage', None)
        },
        "notes": "Single-scene snapshot. Counts are approximate and should be calibrated with VHR labeled tiles when possible."
    }
    summary_out = out_dir / "zurich_traffic_summary.json"
    with open(summary_out, 'w') as f:
        json.dump(summary, f, indent=2)
    logger.info(f"Wrote summary JSON -> {summary_out}")

    # 10) QC thumbnails (optional) - attempt to find an RGB composite or band for thumbnailing
    # We'll try to locate an RGB (B04,B03,B02) composite as a stacked 3-band tif if present
    rgb_tif = None
    for f in Path(product_path).rglob("*B04*B03*B02*.tif"):
        rgb_tif = str(f); break
    if rgb_tif:
        save_debug_thumbnails(scored_out, rgb_tif, out_dir=out_dir / "zurich_debug_samples")
    else:
        logger.info("No RGB composite found for thumbnails; skipping debug thumbnails.")

    logger.info("Pipeline complete.")
    return {
        "scored_cells_gdf": scored_out,
        "district_aggregates": agg,
        "summary": summary,
        "paths": {
            "geojson": str(out_geojson),
            "district_csv": str(csv_out),
            "summary_json": str(summary_out),
        }
    }

# ----------------- CLI -----------------
def parse_args():
    parser = argparse.ArgumentParser(description="Zurich single-scene traffic-density estimation")
    parser.add_argument("--target-date", type=str, default=None, help="Target date (YYYY-MM-DD) to find a scene at or before.")
    parser.add_argument("--lookback-days", type=int, default=14, help="Days to look back for a scene.")
    parser.add_argument("--out-dir", type=str, default="output", help="Output folder")
    parser.add_argument("--cop-user", type=str, help="Copernicus Open Access Hub username")
    parser.add_argument("--cop-pass", type=str, help="Copernicus Open Access Hub password")
    parser.add_argument("--force-sensor", type=str, choices=['S1','S2'], help="Force product selection (S1 or S2)")
    parser.add_argument("--grid-size", type=int, default=GRID_SIZE, help="Grid size in meters")
    parser.add_argument("--road-buffer", type=float, default=ROAD_BUFFER_M, help="Road buffer in meters")
    parser.add_argument("--debug-samples", type=int, default=N_DEBUG_SAMPLES, help="Number of debug thumbnails to save")
    parser.add_argument("--class-count-map", type=str, default=None,
                        help="JSON string or path to JSON file overriding class->(mean,std) mapping. Format: {\"Low\":[1,1],\"Medium\":[6,4],\"High\":[20,9]}")
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    # apply some overrides
    GRID_SIZE = args.grid_size
    ROAD_BUFFER_M = args.road_buffer
    N_DEBUG_SAMPLES = args.debug_samples
    if args.class_count_map:
        try:
            if Path(args.class_count_map).exists():
                with open(args.class_count_map) as f:
                    class_map = json.load(f)
            else:
                class_map = json.loads(args.class_count_map)
            # convert lists to tuples
            class_map = {k: tuple(v) for k,v in class_map.items()}
        except Exception as e:
            logger.warning(f"Unable to parse class_count_map: {e}. Using defaults.")
            class_map = None
    else:
        class_map = None

    res = run_pipeline(target_date=args.target_date,
                       lookback_days=args.lookback_days,
                       out_dir=args.out_dir,
                       class_count_map=class_map,
                       cop_user=args.cop_user,
                       cop_pass=args.cop_pass,
                       force_sensor=args.force_sensor)

    # Print summary to user
    logger.info("Estimated total vehicles in Zurich (single-scene): %s", res['summary']['estimated_total_vehicles'])
    logger.info("Outputs:")
    for k,v in res['paths'].items():
        logger.info(" - %s", v)

    print(json.dumps(res['summary'], indent=2))
