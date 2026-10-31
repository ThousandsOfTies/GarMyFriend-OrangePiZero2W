"""Read-only check delegated to generic tools and selected board data."""
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"sources/gar-tools/composition"))
from product import Product
from preflight import check

if __name__=="__main__":
    product=Product(ROOT).validate()
    check(product.profile,product.hardware)
