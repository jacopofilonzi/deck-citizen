"""Builds labels.json (English names of actions and action maps) for one game build.

Usage: python tools/extract_labels.py <defaultProfile.xml> <global.ini> <labels.json>

defaultProfile.xml is the converted text XML; global.ini is
Data/Localization/english/global.ini from Data.p4k. Only the strings the keybinds
use are kept, so the output stays small.
"""

import json
import sys
import xml.etree.ElementTree as ET


def read_ini(path):
    strings = {}
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            key, sep, value = line.rstrip("\r\n").partition("=")
            if sep:
                # Keys may carry options after a comma, e.g. "ui_x,P=...".
                strings[key.split(",")[0].lower()] = value
    return strings


def lookup(strings, key):
    if not key or not key.startswith("@"):
        return None
    text = strings.get(key[1:].lower())
    return text.strip() if text else None


def main(profile_path, ini_path, out_path):
    strings = read_ini(ini_path)
    root = ET.parse(profile_path).getroot()
    maps = {}
    actions = {}
    for actionmap in root.iter("actionmap"):
        name = actionmap.get("name")
        label = lookup(strings, actionmap.get("UILabel"))
        if label:
            maps[name] = label
        for action in actionmap.iter("action"):
            entry = {}
            label = lookup(strings, action.get("UILabel"))
            description = lookup(strings, action.get("UIDescription"))
            if label:
                entry["label"] = label
            if description and description != label:
                entry["description"] = description
            if entry:
                actions[f"{name}/{action.get('name')}"] = entry
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"maps": maps, "actions": actions}, f, ensure_ascii=False, indent="\t", sort_keys=True)
        f.write("\n")
    print(f"{len(maps)} action maps, {len(actions)} actions -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
