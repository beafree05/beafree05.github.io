import gzip
import json
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path


HIGH_PRIORITY = {"news1", "ichi1", "spec1", "gai1"}
MEDIUM_PRIORITY = {"news2", "ichi2", "spec2", "gai2"}


def bucket_for_term(term: str) -> str:
    if not term:
        return "misc"
    codepoint = ord(term[0])
    if 0x3040 <= codepoint <= 0x30FF or codepoint < 0x0100:
        return f"{codepoint:04x}"
    return f"{codepoint >> 8:02x}"


def compact_text_list(values, limit=6):
    result = []
    for value in values:
        if value and value not in result:
            result.append(value)
        if len(result) >= limit:
            break
    return result


def build_entry(entry_elem):
    ent_seq = entry_elem.findtext("ent_seq", default="")

    kanji = []
    readings = []
    priorities = []

    for k_ele in entry_elem.findall("k_ele"):
        text = k_ele.findtext("keb")
        if text:
            kanji.append(text)
        priorities.extend([node.text for node in k_ele.findall("ke_pri") if node.text])

    for r_ele in entry_elem.findall("r_ele"):
        text = r_ele.findtext("reb")
        if text:
            readings.append(text)
        priorities.extend([node.text for node in r_ele.findall("re_pri") if node.text])

    senses = []
    for sense in entry_elem.findall("sense"):
        glosses = [
            gloss.text.strip()
            for gloss in sense.findall("gloss")
            if gloss.text and (gloss.get("{http://www.w3.org/XML/1998/namespace}lang", "eng") == "eng")
        ]
        pos = [node.text.strip() for node in sense.findall("pos") if node.text]
        misc = [node.text.strip() for node in sense.findall("misc") if node.text]
        field = [node.text.strip() for node in sense.findall("field") if node.text]
        if glosses or pos:
            senses.append(
                {
                    "gloss": compact_text_list(glosses, 5),
                    "pos": compact_text_list(pos, 4),
                    "misc": compact_text_list(misc, 4),
                    "field": compact_text_list(field, 4),
                }
            )
        if len(senses) >= 4:
            break

    if HIGH_PRIORITY.intersection(priorities):
        frequency = "high"
    elif MEDIUM_PRIORITY.intersection(priorities):
        frequency = "medium"
    else:
        frequency = "low"

    searchable_terms = compact_text_list(kanji + readings, 12)

    return {
        "id": ent_seq,
        "kanji": compact_text_list(kanji, 6),
        "reading": compact_text_list(readings, 6),
        "sense": senses,
        "priority": compact_text_list(priorities, 6),
        "frequency": frequency,
        "terms": searchable_terms,
    }


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python build_jmdict_json.py <JMdict_e.gz> <output_dir>")

    source = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    shards_dir = output_dir / "shards"
    output_dir.mkdir(parents=True, exist_ok=True)
    shards_dir.mkdir(parents=True, exist_ok=True)

    shards = defaultdict(lambda: defaultdict(list))
    entry_count = 0

    with gzip.open(source, "rb") as gz_file:
        context = ET.iterparse(gz_file, events=("end",))
        for _, elem in context:
            if elem.tag != "entry":
                continue

            entry = build_entry(elem)
            entry_count += 1

            for term in entry["terms"]:
                bucket = bucket_for_term(term)
                if len(shards[bucket][term]) < 8:
                    shards[bucket][term].append(entry)

            elem.clear()

    for bucket, payload in shards.items():
        target = shards_dir / f"{bucket}.json"
        with target.open("w", encoding="utf-8") as fp:
            json.dump(payload, fp, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "source": source.name,
        "entryCount": entry_count,
        "bucketCount": len(shards),
        "buckets": sorted(shards.keys()),
    }

    with (output_dir / "meta.json").open("w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=2)

    print(json.dumps(meta, ensure_ascii=False))


if __name__ == "__main__":
    main()
