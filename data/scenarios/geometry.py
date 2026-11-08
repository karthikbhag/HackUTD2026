"""Validate simple local GeoJSON polygons (one outer ring, no holes).

This is fixture QA, not geodesic distance, routing, or household exposure logic.
"""

import math


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def on_segment(a, b, p):
    return abs(cross(a,b,p)) < 1e-10 and min(a[0],b[0])-1e-10 <= p[0] <= max(a[0],b[0])+1e-10 and min(a[1],b[1])-1e-10 <= p[1] <= max(a[1],b[1])+1e-10


def intersects(a,b,c,d):
    if any((on_segment(a,b,c), on_segment(a,b,d), on_segment(c,d,a), on_segment(c,d,b))):
        return True
    return (cross(a,b,c)*cross(a,b,d) < 0) and (cross(c,d,a)*cross(c,d,b) < 0)


def contains_point(geometry, point):
    """Boundary-inclusive planar point check for fixture QA."""
    ring = geometry["coordinates"][0]
    inside = False
    x,y = point
    for a,b in zip(ring,ring[1:]):
        if on_segment(a,b,point):
            return True
        if (a[1] > y) != (b[1] > y):
            crossing = a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1])
            if x < crossing:
                inside = not inside
    return inside


def validate_polygon(geometry):
    if geometry.get("type") != "Polygon" or len(geometry.get("coordinates", [])) != 1:
        raise ValueError("Expected one-ring Polygon")
    ring = geometry["coordinates"][0]
    if len(ring) < 4 or ring[0] != ring[-1]:
        raise ValueError("Polygon must close with at least three vertices")
    for p in ring:
        if len(p) != 2 or not all(isinstance(n, (int,float)) and not isinstance(n,bool) and math.isfinite(n) for n in p):
            raise ValueError("Invalid polygon coordinate")
        if not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90):
            raise ValueError("Coordinate outside lon/lat range")
    if len(set(map(tuple,ring[:-1]))) != len(ring)-1:
        raise ValueError("Repeated polygon vertex")
    # Translate before the area sum to avoid cancellation at longitude ~180.
    origin = ring[0]
    area = sum(cross(origin,a,b) for a,b in zip(ring,ring[1:]))
    if abs(area) < 1e-12:
        raise ValueError("Degenerate polygon")
    edges = list(zip(ring,ring[1:]))
    for i,(a,b) in enumerate(edges):
        for j in range(i+1,len(edges)):
            if j == i+1 or (i == 0 and j == len(edges)-1):
                continue
            if intersects(a,b,*edges[j]):
                raise ValueError("Self-intersecting polygon")
