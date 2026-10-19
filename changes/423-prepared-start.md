### Fixed

- **A slow start never serves older prepared assets (4.2.3)**: when an instance started, it wrote the latest prepared
  set again in the background; a Prepare that ended meanwhile could see the start finish after it, serve the older set
  again and delete the newer one's folder. The older set now steps aside.
