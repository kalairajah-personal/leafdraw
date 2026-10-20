"""python -m unittest discover -s pipeline/tests  (from repo root)"""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from leafdraw_pipeline import validate
from leafdraw_pipeline.text_traits import extract
from leafdraw_pipeline.fit import fit_species, classify_shape, load_traits


class RoundTrip(unittest.TestCase):
    """Render → segment → measure must recover the spec's morphology."""
    def test_shapes(self):
        for sp in ["magnolia-grandiflora", "fagus-grandifolia", "quercus-alba", "salix-babylonica"]:
            r = validate.roundtrip(sp, seeds=(1, 2))
            print(r)
            self.assertLess(r["aspect"]["relErr"], 0.15, sp)
            self.assertLess(abs(r["widest"]["measured"] - r["widest"]["target"]), 0.12, sp)
        self.assertGreater(validate.roundtrip("quercus-alba", seeds=(1, 2))["lobeDepth"], 0.45)
        self.assertLess(validate.roundtrip("magnolia-grandiflora", seeds=(1, 2))["lobeDepth"], 0.15)


class TextTraits(unittest.TestCase):
    def test_flora_description(self):
        txt = ("Leaf blades ovate to elliptic, 6–12 × 3–6 cm, base cordate, apex acuminate; margins doubly serrate; "
               "petiole 1–2 cm. Secondary veins craspedodromous.")
        r = extract(txt)
        print(r)
        self.assertEqual(r["traits"]["shape"], "ovate")
        self.assertEqual(r["traits"]["base"], "cordate")
        self.assertEqual(r["traits"]["apex"], "acuminate")
        self.assertEqual(r["traits"]["margin"], "doubly-serrate")
        self.assertEqual(r["traits"]["secondary"], "craspedodromous")
        self.assertAlmostEqual(r["params"]["length"][0], 90.0)


class Fit(unittest.TestCase):
    def test_classify(self):
        t = load_traits()
        self.assertEqual(classify_shape(4.5, 0.35, t), "lanceolate")
        self.assertEqual(classify_shape(1.05, 0.5, t), "orbicular")
        self.assertEqual(classify_shape(1.6, 0.65, t), "obovate")


if __name__ == "__main__":
    unittest.main()
