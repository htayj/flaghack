# Campground level generation note

Local KMZ burn maps visible during this slice:

- `~/Downloads/2017 To the Moon Master Placement Map.kmz`
- `~/Downloads/2018 To the Moon Master Placement Map.kmz`
- `~/Downloads/Alchemy 2018 Placement Map.kmz`
- `~/Downloads/Alchemy 2019 Placement Map.kmz`
- `~/Downloads/Alchemy 2022 Placement Map.kmz`
- `~/Downloads/Alchemy Burn 2023.kmz`
- `~/Downloads/CITY MAP - ALCHEMY 2024.kmz`

Chosen foundation: a seeded road-graph generator made from jittered rectangular loop roads plus connector spokes. Roads are emitted as corridor/tunnel terrain, while the remaining open playa/field is floor terrain. This is deliberately not BSP: the primary structure is a connected graph of loops, which matches burn/campground placement maps better than rooms split by binary partition.

Alternatives to compare later: polar/radial city grids, Voronoi camp regions with graph roads, agent-based path carving between placed camps, cellular/open-field noise plus road skeletons, or importing simplified road splines from KMZ/KML data.
