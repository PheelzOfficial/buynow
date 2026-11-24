import re, json
from pathlib import Path

source = (
    Path(__file__).resolve().parents[2] / "buynow/lib/providers/productprovider.dart"
)
s = source.read_text()
colors = {
    "black": "#000000",
    "white": "#FFFFFF",
    "blueGrey": "#607D8B",
    "grey": "#9E9E9E",
    "deepPurple": "#673AB7",
    "pink": "#E91E63",
    "red": "#F44336",
    "blue": "#2196F3",
    "brown": "#795548",
    "deepOrange": "#FF5722",
    "orange": "#FF9800",
    "purple": "#9C27B0",
    "green": "#4CAF50",
    "amber": "#FFC107",
}
products = []
for b in re.findall(r"ProductModel\((.*?)createdAt: DateTime\((.*?)\),", s, re.S):
    t, date = b

    def val(k):
        return re.search(r"\b" + k + r':\s*"([^"]*)"', t).group(1)

    description = "".join(
        re.findall(
            r'"([^"]*)"', re.search(r"description:(.*?)stock:", t, re.S).group(1)
        )
    )
    products.append(
        dict(
            id=val("id"),
            categoryId=val("categoryId"),
            name=val("name"),
            description=description,
            images=re.findall(r'"(https:[^"]*)"', t),
            stock=int(re.search(r"stock:\s*(\d+)", t).group(1)),
            price=float(re.search(r"price:\s*([\d.]+)", t).group(1)),
            ratings=float(re.search(r"ratings:\s*([\d.]+)", t).group(1)),
            reviews=int(re.search(r"reviews:\s*(\d+)", t).group(1)),
            colors=[colors[c] for c in re.findall(r"Colors\.(\w+)", t)],
            createdAt="-".join(x.strip().zfill(2) for x in date.split(","))
            + "T00:00:00.000Z",
        )
    )
categories = []
for t in re.findall(r"\bCategory\((.*?)createdAt:", s, re.S):
    categories.append(
        {
            k: re.search(k + r':\s*"([^"]*)"', t).group(1)
            for k in ["id", "name", "image"]
        }
    )
extras = {
    "electronics": [
        "Wireless Keyboard",
        "USB-C Charging Hub",
        "Portable Power Bank",
        "Wireless Mouse",
        "Full HD Webcam",
        "Portable SSD",
        "Bluetooth Earbuds",
        "Desktop Monitor",
        "USB Microphone",
        "Laptop Stand",
    ],
    "fashion": [
        "Cotton Oxford Shirt",
        "Linen Summer Shirt",
        "Fleece Zip Hoodie",
        "Classic Chino Trousers",
        "Denim Jacket",
        "Pleated Midi Skirt",
        "Knitted Cardigan",
        "Cotton Polo Shirt",
        "Lightweight Rain Jacket",
        "Cotton Lounge Set",
    ],
    "footwear": [
        "Canvas Low-Top Sneakers",
        "Leather Derby Shoes",
        "Trail Running Shoes",
        "Everyday Slide Sandals",
        "Ankle Boots",
        "Leather Loafers",
        "Walking Trainers",
        "Ballet Flats",
        "Hiking Boots",
        "Court Sneakers",
    ],
    "beauty": [
        "Gentle Facial Cleanser",
        "Hydrating Face Serum",
        "Daily Body Lotion",
        "Shea Butter Hand Cream",
        "Tinted Lip Balm",
        "Makeup Brush Set",
        "Micellar Cleansing Water",
        "Nourishing Hair Conditioner",
        "Body Wash",
        "Travel Toiletry Kit",
    ],
    "home": [
        "Ceramic Dinner Set",
        "Cotton Bath Towel Set",
        "Glass Storage Jars",
        "Stainless Steel Kettle",
        "Cotton Bed Sheets",
        "Woven Laundry Basket",
        "Nonstick Frying Pan",
        "Ceramic Plant Pot",
        "Desk Lamp",
        "Decorative Cushion",
    ],
    "sports": [
        "Exercise Yoga Mat",
        "Resistance Band Set",
        "Adjustable Jump Rope",
        "Training Football",
        "Insulated Sports Bottle",
        "Cycling Helmet",
        "Foam Massage Roller",
        "Training Kettlebell",
        "Tennis Racket",
        "Swimming Goggles",
    ],
    "accessories": [
        "Leather Card Holder",
        "Canvas Tote Bag",
        "Travel Duffel Bag",
        "Leather Belt",
        "Compact Umbrella",
        "Polarized Sunglasses",
        "Laptop Sleeve",
        "Travel Organizer",
        "Wool Scarf",
        "Baseball Cap",
    ],
    "furniture": [
        "Oak Side Table",
        "Dining Chair",
        "Five Shelf Bookcase",
        "Bedside Cabinet",
        "Coffee Table",
        "Upholstered Footstool",
        "Compact Writing Desk",
        "Shoe Storage Bench",
        "Wall Shelf Set",
        "TV Console",
    ],
    "gaming": [
        "Wireless Game Controller",
        "Gaming Mouse",
        "Mechanical Gaming Keyboard",
        "Gaming Headset",
        "Extended Mouse Pad",
        "Controller Charging Dock",
        "Console Carry Case",
        "Gaming Monitor Stand",
        "Controller Thumb Grips",
        "Gaming Chair",
    ],
    "books": [
        "Dotted Hardcover Notebook",
        "Weekly Planner",
        "Watercolor Sketchbook",
        "Ballpoint Pen Set",
        "Colored Pencil Set",
        "Reading Journal",
        "Pocket Notebook Set",
        "Desk Stationery Organizer",
        "Spiral Study Notebook",
        "Bookmark Collection",
    ],
}
for c in categories:
    needed = 10 - sum(p["categoryId"] == c["id"] for p in products)
    for i, name in enumerate(extras[c["id"]][:needed]):
        products.append(
            dict(
                id=f"SEED-{c['id'].upper()}-{i+1:03}",
                categoryId=c["id"],
                name=name,
                description=f"{name} for everyday use. Illustrative catalog image; confirm specifications before offering this demonstration item for sale.",
                images=[c["image"]],
                stock=20 + i,
                price=round((i + 2) * 3500.0, 2),
                ratings=0,
                reviews=0,
                colors=["#000000"],
                createdAt="2026-11-01T00:00:00.000Z",
            )
        )
Path(__file__).with_name("catalog.json").write_text(
    json.dumps(dict(categories=categories, products=products), indent=2)
)
print(f"Extracted {len(categories)} categories and {len(products)} products")
