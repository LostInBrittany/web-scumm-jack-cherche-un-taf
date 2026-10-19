### Fixed

- **A Studio Server worker installed from the release archives prepares assets (4.2.3)**: the engine's package carries
  the worker's Python lock (`ops/studio/worker-requirements.lock`), and the worker looks for the packages its build
  hook installed in its own folder (`.python`, or `WORKER_PYTHON_PATH`) rather than beside the engine. STUDIO-SERVER
  gives the hook for a worker from the archives. In 4.2.2 Prepare assets needed a worker deployed from the repository.
