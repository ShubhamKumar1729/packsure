"""
Centralized entity-label configuration for PackSure legal-metrology NER.

This is the SINGLE source of truth for entity labels inside the NLP service.
`ml/config/labels.json` is the machine-readable mirror used by the Colab training
pipeline; a unit test (tests/test_entities.py) asserts the two stay in sync.

Schema changes must be documented in docs/LEGAL_NOTES.md and
ml/ANNOTATION_GUIDELINES.md — never changed silently.

Entity list note (documented schema decision):
    The task specification's initial entity classes were:
    PRODUCT_NAME, MANUFACTURER, PACKER, IMPORTER, NET_QUANTITY, MRP, MFG_DATE,
    PKD_DATE, EXPIRY_DATE, BEST_BEFORE, BATCH_NUMBER, CUSTOMER_CARE, ADDRESS,
    COUNTRY_OF_ORIGIN, INGREDIENTS.
    IMPORT_DATE was ADDED because Rule 6 of the Legal Metrology (Packaged
    Commodities) Rules, 2011 requires the month & year of manufacture OR
    pre-packing OR import; an "imported MM/YYYY" declaration is a distinct
    surface form that must not be mislabelled as MFG_DATE or PKD_DATE.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class EntitySpec:
    label: str          # BIO entity label, e.g. MRP (B-MRP / I-MRP in the model)
    field_key: str      # snake_case key used in API responses and the Node backend
    description: str    # one-line annotation definition (see ANNOTATION_GUIDELINES)
    examples: tuple[str, ...]


ENTITY_SPECS: tuple[EntitySpec, ...] = (
    EntitySpec("PRODUCT_NAME", "product_name",
               "Common or generic name of the commodity as declared on the label.",
               ("Biscuits", "Toilet Cleaner", "Instant Noodles")),
    EntitySpec("MANUFACTURER", "manufacturer",
               "Name of the manufacturing company (not the address).",
               ("Sunfeast", "Hindustan Unilever Ltd")),
    EntitySpec("PACKER", "packer",
               "Name of the packer when different from the manufacturer.",
               ("Packed by: Fresh Foods Pvt Ltd",)),
    EntitySpec("IMPORTER", "importer",
               "Name of the importer for imported goods.",
               ("Imported by: Global Traders India",)),
    EntitySpec("NET_QUANTITY", "net_quantity",
               "Declared net quantity / weight / volume (value with or without unit).",
               ("500 g", "1 kg", "750 ml", "Net Wt. 200G")),
    EntitySpec("MRP", "mrp",
               "Retail sale price declaration including its currency marker.",
               ("MRP Rs.120/-", "₹ 45", "Max. Retail Price Rs 99")),
    EntitySpec("MFG_DATE", "mfg_date",
               "Month & year of manufacture, in any surface form.",
               ("Mfd 06/2026", "Manufactured: Jun 2026", "MFG 09/25")),
    EntitySpec("PKD_DATE", "pkd_date",
               "Month & year of pre-packing.",
               ("Pkd. 07/2026", "Packed on 12/2025")),
    EntitySpec("IMPORT_DATE", "import_date",
               "Month & year of import declaration.",
               ("Imported 03/2026",)),
    EntitySpec("EXPIRY_DATE", "expiry_date",
               "Use-by / expiry declaration.",
               ("Use by 08/2026", "Exp: 12/2026")),
    EntitySpec("BEST_BEFORE", "best_before",
               "Best-before declaration, including relative forms.",
               ("Best before 6 months from packaging", "Best Before: 09/2026")),
    EntitySpec("BATCH_NUMBER", "batch_number",
               "Batch or lot identification code.",
               ("Batch No. AB1234", "Lot 42B", "B-9912")),
    EntitySpec("CUSTOMER_CARE", "customer_care",
               "Consumer-care contact: phone, email or URL labelled for complaints.",
               ("custcare@brand.in", "1800-123-4567", "www.brand.in/care")),
    EntitySpec("ADDRESS", "address",
               "Postal address block of the manufacturer / packer / importer.",
               ("Plot 12, Andheri East, Mumbai 400093",)),
    EntitySpec("COUNTRY_OF_ORIGIN", "country_of_origin",
               "Country of origin declaration.",
               ("Made in India", "Product of Thailand", "Origin: China")),
    EntitySpec("INGREDIENTS", "ingredients",
               "Ingredients list heading plus the list itself.",
               ("Ingredients: Wheat flour, sugar, edible oil",)),
)

# Uppercase BIO labels, in canonical order (index = numeric class id).
ENTITY_LABELS: tuple[str, ...] = tuple(spec.label for spec in ENTITY_SPECS)
# snake_case field keys exposed by the API, aligned with ENTITY_LABELS order.
FIELD_KEYS: tuple[str, ...] = tuple(spec.field_key for spec in ENTITY_SPECS)
LABEL_TO_FIELD: dict[str, str] = {spec.label: spec.field_key for spec in ENTITY_SPECS}


def spec_for(label: str) -> EntitySpec | None:
    for spec in ENTITY_SPECS:
        if spec.label == label:
            return spec
    return None
