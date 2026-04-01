import os
import re
from collections import defaultdict

root = "/Users/xxxiaoling/agent code/claude source code"
src_root = os.path.join(root, "src")

import_re = re.compile(
    r"^\s*import\s+(type\s+)?(?P<what>[^;]+?)\s+from\s+['\"](?P<spec>[^'\"]+)['\"]",
    re.M,
)
export_re = re.compile(
    r"^\s*export\s+[^;]*?\s+from\s+['\"](?P<spec>[^'\"]+)['\"]",
    re.M,
)

missing_exports = defaultdict(lambda: {"default": False, "named": set()})


def split_named(part: str):
    part = part.strip()
    if not part.startswith("{"):
        return []
    body = part[1: part.rfind("}")]
    out = []
    for seg in body.split(","):
        seg = seg.strip()
        if not seg:
            continue
        if " as " in seg:
            src, _ = [x.strip() for x in seg.split(" as ", 1)]
            out.append(src)
        else:
            out.append(seg)
    return out


def resolve_target(file_path: str, spec: str):
    if spec.startswith("src/"):
        return os.path.join(root, spec)
    return os.path.normpath(os.path.join(os.path.dirname(file_path), spec))


def exists_any(target_no_ext: str):
    candidates = [
        target_no_ext,
        target_no_ext + ".ts",
        target_no_ext + ".tsx",
        target_no_ext + ".js",
        target_no_ext + ".jsx",
    ]
    return any(os.path.exists(c) for c in candidates)


for dp, _, fns in os.walk(src_root):
    for n in fns:
        if not n.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")):
            continue
        p = os.path.join(dp, n)
        s = open(p, "r", encoding="utf-8", errors="ignore").read()

        for m in import_re.finditer(s):
            if m.group(1):
                continue
            spec = m.group("spec")
            if not (spec.startswith("./") or spec.startswith("../") or spec.startswith("src/")):
                continue
            if not spec.endswith(".js"):
                continue
            target = resolve_target(p, spec)
            if exists_any(target):
                continue
            rec = missing_exports[target]
            what = m.group("what").strip()
            if what.startswith("{"):
                for nm in split_named(what):
                    rec["named"].add(nm)
            elif "," in what:
                first, rest = [x.strip() for x in what.split(",", 1)]
                if first and first != "{}":
                    rec["default"] = True
                for nm in split_named(rest):
                    rec["named"].add(nm)
            elif what.startswith("* as "):
                rec["default"] = False
            else:
                rec["default"] = True

        for m in export_re.finditer(s):
            spec = m.group("spec")
            if not (spec.startswith("./") or spec.startswith("../") or spec.startswith("src/")):
                continue
            if not spec.endswith(".js"):
                continue
            target = resolve_target(p, spec)
            if exists_any(target):
                continue
            missing_exports[target]["default"] = True

count = 0
for target, info in sorted(missing_exports.items()):
    os.makedirs(os.path.dirname(target), exist_ok=True)
    lines = []
    if info["default"]:
        lines.append("const __defaultExport = {}")
        lines.append("export default __defaultExport")
    for name in sorted(info["named"]):
        if not re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*$", name):
            continue
        if name == "default":
            continue
        lines.append(f"export const {name} = undefined")
    if not lines:
        lines = ["export {}"]
    with open(target, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    count += 1

print(f"generated stubs: {count}")
