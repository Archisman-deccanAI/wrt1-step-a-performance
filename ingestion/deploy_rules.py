import os, requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request
P = "wrt1-performance"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
c = service_account.Credentials.from_service_account_file(
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"], scopes=["https://www.googleapis.com/auth/cloud-platform"])
c.refresh(Request())
H = {"Authorization": "Bearer " + c.token, "Content-Type": "application/json"}
B = "https://firebaserules.googleapis.com/v1"
rules = open(os.path.join(ROOT, "app", "firestore.rules"), encoding="utf-8").read()
r = requests.post(f"{B}/projects/{P}/rulesets", headers=H,
                  json={"source": {"files": [{"name": "firestore.rules", "content": rules}]}})
r.raise_for_status(); rs = r.json()["name"]; print("ruleset created:", rs.split('/')[-1])
rel_name = f"projects/{P}/releases/cloud.firestore"
rc = requests.post(f"{B}/projects/{P}/releases", headers=H, json={"name": rel_name, "rulesetName": rs})
if rc.status_code >= 400:
    rp = requests.patch(f"{B}/projects/{P}/releases/cloud.firestore", headers=H,
                        json={"release": {"name": rel_name, "rulesetName": rs}})
    print("release updated:", rp.status_code)
    if rp.status_code >= 400: print(rp.text[:400])
else:
    print("release created:", rc.status_code)
v = requests.get(f"{B}/projects/{P}/releases/cloud.firestore", headers=H).json()
print("ACTIVE ruleset now:", v.get("rulesetName","?").split('/')[-1], "| matches:", v.get("rulesetName")==rs)
