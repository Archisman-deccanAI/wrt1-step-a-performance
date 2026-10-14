import os, gzip, hashlib, requests
from pathlib import Path
from google.oauth2 import service_account
from google.auth.transport.requests import Request
P = "wrt1-performance"; SITE = "wrt1-performance"
DIST = os.environ.get("DIST") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "dist")
c = service_account.Credentials.from_service_account_file(
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"], scopes=["https://www.googleapis.com/auth/cloud-platform"])
def H(ct="application/json"):
    if not c.valid: c.refresh(Request())
    return {"Authorization": "Bearer " + c.token, "Content-Type": ct}
c.refresh(Request())
B = "https://firebasehosting.googleapis.com/v1beta1"
r = requests.post(f"{B}/sites/{SITE}/versions", headers=H(), json={}); r.raise_for_status()
version = r.json()["name"]; print("version:", version.split('/')[-1])
files, blobs = {}, {}
for p in Path(DIST).rglob("*"):
    if p.is_file():
        rel = "/" + str(p.relative_to(DIST)).replace(os.sep, "/")
        gz = gzip.compress(p.read_bytes()); h = hashlib.sha256(gz).hexdigest()
        files[rel] = h; blobs[h] = gz
print("files:", len(files))
r = requests.post(f"{B}/{version}:populateFiles", headers=H(), json={"files": files}); r.raise_for_status()
need = r.json().get("uploadRequiredHashes", []) or []; up = r.json()["uploadUrl"]
print("need upload:", len(need))
for h in need:
    ur = requests.post(f"{up}/{h}", headers=H("application/octet-stream"), data=blobs[h])
    if ur.status_code >= 400: print("upload fail", ur.status_code, ur.text[:200]); raise SystemExit(1)
r = requests.patch(f"{B}/{version}?updateMask=status", headers=H(), json={"status": "FINALIZED"}); r.raise_for_status()
r = requests.post(f"{B}/sites/{SITE}/releases?versionName={version}", headers=H(), json={}); r.raise_for_status()
print("LIVE: https://wrt1-performance.web.app")
