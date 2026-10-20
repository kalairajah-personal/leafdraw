"""leafdraw data pipeline: specimen images / flora text -> measured species specs (JSON) for the renderer.

Stages
  gbif       find + download herbarium specimen images (GBIF occurrence API)
  segment    leaf masks (Leafsnap-style colour segmentation; LeafMachine2 adapter if installed)
  measure    morphometrics per leaf (length, width, aspect, widest point, angles, teeth, lobes, EFD)
  fit        aggregate measurements -> species params (mean, sd) + MLA trait terms (tier A)
  palette    CIELAB colour clusters from field photos
  text       flora description -> traits + sizes (tier B; regex, optional LLM hook)
  validate   round-trip (render -> measure -> compare) and optional Pl@ntNet identification
"""
__version__ = "0.1.0"
