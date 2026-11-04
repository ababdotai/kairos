"""Package a production build only; never include source, credentials or website."""
from pathlib import Path
import json, zipfile, hashlib
root=Path(__file__).resolve().parents[1]
dist=root/'dist'
m=json.loads((dist/'manifest.json').read_text())
assert m['manifest_version']==3
assert 'localhost' not in json.dumps(m)
paths=[p for p in dist.rglob('*') if p.is_file() and not any(x.startswith('.') for x in p.relative_to(dist).parts) and p.suffix in {'.js','.css','.html','.json','.png','.gif','.svg'} and p.name!='generate-icons.html']
assert all(not p.name.endswith('.map') for p in paths)
for p in paths:
 if p.suffix in {'.js','.html'}:
  text=p.read_text()
  assert '@vite/client' not in text and 'localhost:5173' not in text, p
out=root/'release'/('kairos-'+m['version']+'-chrome.zip');out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(paths):z.write(p,p.relative_to(dist))
 for p in (dist/'icons').rglob('LICENSE*'):z.write(p,p.relative_to(dist))
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 assert 'manifest.json' in z.namelist()
 for name in [m['background']['service_worker'],m['action']['default_popup'],*m['icons'].values()]:assert name in z.namelist(),name
checksum=hashlib.sha256(out.read_bytes()).hexdigest()
(out.with_suffix('.sha256')).write_text(f'{checksum}  {out.name}\n')
print(f'{out}\n{out.stat().st_size} bytes\nSHA256: {checksum}')
