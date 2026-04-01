import os
import re

root = "/Users/xxxiaoling/agent code/claude source code"
src_dirs = [os.path.join(root, "src"), os.path.join(root, "vendor")]
files = []
for d in src_dirs:
    for dp, _, fns in os.walk(d):
        for n in fns:
            if n.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")):
                files.append(os.path.join(dp, n))

patterns = [
    re.compile(r"^\s*import(?:\s+type)?(?:[\s\S]*?)from\s+['\"]([^'\"]+)['\"]", re.M),
    re.compile(r"^\s*export(?:[\s\S]*?)from\s+['\"]([^'\"]+)['\"]", re.M),
    re.compile(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)"),
]
specs = set()
for f in files:
    s = open(f, "r", encoding="utf-8", errors="ignore").read()
    for p in patterns:
        for m in p.finditer(s):
            sp = m.group(1)
            if sp.startswith((".", "/", "node:", "bun:", "data:", "http:", "https:")):
                continue
            if not re.match(r"^@?[a-zA-Z0-9][a-zA-Z0-9._-]*(/[a-zA-Z0-9._-]+)*$", sp):
                continue
            specs.add(sp)


def pkg(s):
    if s.startswith("@"):
        arr = s.split("/")
        return "/".join(arr[:2]) if len(arr) >= 2 else s
    return s.split("/")[0]


pkgs = sorted({pkg(s) for s in specs if pkg(s) != "src"})
print(f"pkg count {len(pkgs)}")
for p in pkgs:
    print(p)

with open(os.path.join(root, ".deps-from-src.txt"), "w", encoding="utf-8") as f:
    f.write("\n".join(pkgs))
