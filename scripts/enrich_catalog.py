"""Usage: python3 scripts/enrich_catalog.py /path/to/dummyjson-products.json
Source: https://dummyjson.com/docs/products. This imports demonstration data, not real inventory.
"""

import json, sys
from pathlib import Path

root = Path(__file__).parent
catalog = json.loads((root / "catalog.json").read_text())
samples = json.loads(Path(sys.argv[1]).read_text())["products"]
mapping = {
    "electronics": ["laptops", "tablets"],
    "fashion": ["mens-shirts", "tops", "womens-dresses"],
    "footwear": ["mens-shoes", "womens-shoes"],
    "beauty": ["beauty", "skin-care", "fragrances"],
    "home": ["kitchen-accessories", "home-decoration"],
    "sports": ["sports-accessories"],
    "accessories": ["womens-bags", "sunglasses", "womens-jewellery"],
    "furniture": ["furniture"],
}
changed = []
for category, source_categories in mapping.items():
    candidates = [p for p in samples if p["category"] in source_categories]
    targets = [
        p
        for p in catalog["products"]
        if p["categoryId"] == category and p["id"].startswith("SEED-")
    ]
    for target, source in zip(targets, candidates):
        target.update(
            name=source["title"],
            description=f"{source['title']}. Demonstration catalog item in our {category} collection. Product photography is supplied by the DummyJSON sample catalog; verify specifications and pricing before sale.",
            images=source["images"][:1],
        )
        changed.append(target["id"])
(root / "catalog.json").write_text(json.dumps(catalog, indent=2))
reportpath = root.parent / "seed-report.json"
if reportpath.exists():
    report = json.loads(reportpath.read_text())
    for pid in changed:
        report["images"].pop(f"products/{pid}-0", None)
    reportpath.write_text(json.dumps(report, indent=2))
print(f"Added matching product photos for {len(changed)} additional products")
