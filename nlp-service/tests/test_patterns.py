"""Pattern extractor + span utilities tests (Phases 5/6).

These operate on OCR-noisy text strings — they do NOT test the trained model
(which does not exist yet) and never fabricate model output.
"""

from app.patterns import dedupe_entities, extract_with_patterns
from app.spans import Token, decode_bio, tokenize_with_offsets


class TestPatternExtraction:
    def test_mrp_variants(self):
        for text in ("MRP Rs.120/-", "M.R.P. 120", "MRP: Rs 120", "Max. Retail Price ₹ 99"):
            entities = extract_with_patterns(text)
            mrp = [e for e in entities if e.label == "MRP"]
            assert mrp, text
            assert mrp[0].text.strip(), text

    def test_net_quantity_variants(self):
        for text in ("NET WT 500G", "Net Qty. 500 g", "Net Qnty 500G", "Net Content: 750 ml"):
            entities = extract_with_patterns(text)
            net = [e for e in entities if e.label == "NET_QUANTITY"]
            assert net, text

    def test_dates(self):
        entities = extract_with_patterns("Mfd: 06/2026 Use by 08/2026")
        labels = {e.label for e in entities}
        assert "MFG_DATE" in labels
        assert "EXPIRY_DATE" in labels

    def test_packed_date(self):
        entities = extract_with_patterns("Pkd. 07/2026")
        assert any(e.label == "PKD_DATE" for e in entities)

    def test_manufacturer_name_and_pin_address(self):
        text = "Manufactured by Acme Foods Pvt Ltd, Plot 12 Andheri East Mumbai 400093"
        entities = extract_with_patterns(text)
        assert any(e.label == "MANUFACTURER" for e in entities)
        address = [e for e in entities if e.label == "ADDRESS"]
        assert address and "400093" in address[0].text

    def test_address_does_not_swallow_single_line_text(self):
        text = "MRP Rs.120/- Net Qty. 500G Mfd: 06/2026 Batch No. AB1234 Manufactured by Acme Foods Pvt Ltd, Plot 12 Mumbai 400093"
        address = [e for e in extract_with_patterns(text) if e.label == "ADDRESS"]
        assert address, "address should be detected"
        raw = address[0].text
        assert "400093" in raw
        assert "MRP" not in raw and "500G" not in raw and "AB1234" not in raw

    def test_nothing_invented_on_unrelated_text(self):
        entities = extract_with_patterns("The quick brown fox jumps over the lazy dog")
        # No anchor present -> at most unrelated standalone hits; MRP/date/qty must be absent.
        assert not any(e.label in {"MRP", "MFG_DATE", "NET_QUANTITY", "PKD_DATE"} for e in entities)

    def test_dedupe_keeps_best_per_label(self):
        entities = extract_with_patterns("MRP Rs.50/- MRP Rs 120")
        deduped = dedupe_entities(entities)
        mrps = [e for e in deduped if e.label == "MRP"]
        assert len(mrps) == 1


class TestSpans:
    def test_tokenize_offsets(self):
        tokens = tokenize_with_offsets("MRP Rs.120/- Net")
        assert [(t.text, t.start, t.end) for t in tokens] == [
            ("MRP", 0, 3),
            ("Rs.120/-", 4, 12),
            ("Net", 13, 16),
        ]

    def test_decode_bio_merges_adjacent(self):
        tokens = [Token("MRP", 0, 3), Token("Rs.120/-", 4, 12), Token("Net", 13, 16)]
        id_to_label = {0: "O", 1: "B-MRP", 2: "I-MRP"}
        labels = [1, 2, 0]
        probs = [[0.1, 0.9, 0.0], [0.2, 0.4, 0.4], [1.0, 0.0, 0.0]]
        # token1 label should be I-MRP (index 2) for the merge test
        labels = [1, 2, 0]
        prob_rows = [[0.1, 0.9, 0.0], [0.1, 0.2, 0.7], [1.0, 0.0, 0.0]]
        entities = decode_bio(tokens, labels, prob_rows, id_to_label)
        assert len(entities) == 1
        assert entities[0].text == "MRP Rs.120/-"
        assert entities[0].label == "MRP"

    def test_decode_bio_stray_i_recovers(self):
        tokens = [Token("500g", 0, 4)]
        entities = decode_bio(tokens, [2], [[0.0, 0.0, 1.0]], {0: "O", 1: "B-NET_QUANTITY", 2: "I-NET_QUANTITY"})
        assert len(entities) == 1 and entities[0].label == "NET_QUANTITY"

    def test_confidence_is_mean(self):
        tokens = [Token("A", 0, 1), Token("B", 2, 3)]
        probs = [[0.0, 1.0], [0.0, 1.0]]
        probs2 = [[0.0, 0.5, 0.5], [0.0, 0.5, 0.5]]
        entities = decode_bio(tokens, [1, 1], probs2, {0: "O", 1: "B-X", 2: "I-X"})
        assert entities[0].confidence == 0.5
