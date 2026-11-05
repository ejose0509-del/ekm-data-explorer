"""Prove EKM's ports of Auto Ontology's PII rules and date-format inference are 1 to 1 with the originals.

Run: python3 tests/check_ontology_port.py   (AUTO_ONTOLOGY_DIR defaults to ~/auto-ontology; needs node)
Loads the original pii_detection/rules.py and semantic/date_format.py, runs them and src/aoport.js on the same
inputs, and fails on any difference.
"""
import importlib.util, itertools, json, os, random, subprocess, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
AOD = os.path.expanduser(os.environ.get("AUTO_ONTOLOGY_DIR", "~/auto-ontology"))
if not os.path.isfile(os.path.join(AOD, "auto_ontology/pii_detection/rules.py")):
    print("SKIP: original Auto Ontology source not found at", AOD); sys.exit(0)

def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(AOD, rel)); mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod; spec.loader.exec_module(mod); return mod
for pkg in ("auto_ontology", "auto_ontology.pii_detection", "auto_ontology.semantic"):
    sys.modules.setdefault(pkg, types.ModuleType(pkg))
models = load("auto_ontology.pii_detection.models", "auto_ontology/pii_detection/models.py")
rules = load("auto_ontology.pii_detection.rules", "auto_ontology/pii_detection/rules.py")
dates = load("auto_ontology.semantic.date_format", "auto_ontology/semantic/date_format.py")

# Column names: every word the rules know, with prefixes, separators and case variants, plus near misses.
words = ["social security", "ssn", "social security number", "passport", "passport number", "driver license", "drivers license", "taxpayer id", "tax id", "national id",
         "e mail", "email", "email address", "email_address_hash", "no_email", "phone", "phone number", "telephone", "mobile", "cell", "fax number", "cellphone",
         "date of birth", "dob", "birthdate", "birth date", "credit card", "card number", "bank account", "bank account number", "iban", "swift code", "password",
         "passcode", "pin code", "fingerprint", "biometric", "retina scan", "ip address", "mac address", "first name", "last name", "full name", "name", "user name",
         "address", "address line1", "addressline2", "street", "zip code", "postal code", "age", "gender", "sex", "marital status", "salary", "income", "credit score",
         "id", "customer id", "account number", "product name", "account type", "city name", "created at", "updated at", "last password change", "home id", "price",
         "quantity", "invoice date", "order id", "stock item name", "", "   ", "Ünïcode name", "NAME", "CustomerEmail", "customer_email", "billing-address",
         "preferred personal email", "work phone", "household income", "patient_dob", "employee_ssn", "member id", "AccountNumber", "Customer_ID", "user_id"]
prefixes = ["", "customer ", "billing ", "home ", "personal ", "user ", "employee "]
cols = sorted({p + w for p, w in itertools.product(prefixes, words)} | {w.replace(" ", "_") for w in words} | {w.replace(" ", "").upper() for w in words})
tables = ["", "customers", "people", "patients", "users", "employees", "account holders", "products", "metrics", "inventory", "orders", "Sales.Customers", "student", "audits"]
pii_cases = [(c, t) for c in cols for t in tables]

def py_pii(c, t):
    d = rules.evaluate_rules(models.ColumnInput(column_name=c, table_name=t or None))
    return None if d is None else [str(d.status.value), d.category, d.confidence, d.reason, d.source, d.should_auto_tag()]

# Date samples: each candidate notation, padded and unpadded, ambiguous and unambiguous, invalid days, mixed, out-of-range years.
rnd = random.Random(7)
def sample(fmt, n=12, day_max=28, year=(1990, 2030)):
    import datetime
    out = []
    for _ in range(n):
        dt = datetime.datetime(rnd.randint(*year), rnd.randint(1, 12), rnd.randint(1, day_max), rnd.randint(0, 23), rnd.randint(0, 59), rnd.randint(0, 59), rnd.randint(0, 999999))
        out.append(dt.strftime(fmt))
    return out
date_cases = []
for fmt, _ in dates._CANDIDATES:
    date_cases += [sample(fmt), sample(fmt, day_max=12), sample(fmt, n=3)]
date_cases += [["13/07/2011", "01/02/2011"], ["07/13/2011"], ["04/04/20", "4/4/20"], ["4/4/20", "5/6/21"], ["2011-07-13", "2011/07/13"], ["950324", "950401"], ["19950324"],
               ["30/02/2020"], ["29/02/2020", "13/01/2021"], ["29/02/2019", "13/01/2021"], ["1850-01-01"], ["2101-01-01"], ["19:39:07.0"], ["2020-01-01 19:39:07.0", "2020-01-01 19:39:07.123"],
               ["2020"], ["1999", "2000"], ["12:30"], ["25:30"], ["12:30:60"], ["not a date"], [None, "", "  2020-01-02  "], ["x" * 50], [], [" 1/02/2020"], ["2020-1-2"],
               ["31.12.99", "01.01.00"], ["12-31-1999", "01-01-2000"], ["202001", "202012"], ["202013"], ["2020-01-02T03:04:05"], ["2020-01-02T03:04:05.123456"]]
py_dates = [dates.infer_date_format(v) for v in date_cases]

js = subprocess.run(["node", "-e", """
const fs = require('fs'); eval(fs.readFileSync(process.argv[1], 'utf8') + ';globalThis.AO = AO;');
const inp = JSON.parse(fs.readFileSync(0, 'utf8'));
const pii = inp.pii.map(([c, t]) => { const d = AO.evaluateRules(c, t || null); return d === null ? null : [d.status, d.category, d.confidence, d.reason, d.source, AO.shouldAutoTag(d)]; });
console.log(JSON.stringify({pii, dates: inp.dates.map((v) => AO.inferDateFormat(v))}));
""", os.path.join(HERE, "..", "src", "aoport.js")], input=json.dumps({"pii": pii_cases, "dates": date_cases}), capture_output=True, text=True, check=True)
out = json.loads(js.stdout)
bad = [(c, t, py_pii(c, t), j) for (c, t), j in zip(pii_cases, out["pii"]) if py_pii(c, t) != j]
badd = [(v, p, j) for v, p, j in zip(date_cases, py_dates, out["dates"]) if p != j]
for b in bad[:10]: print("PII MISMATCH", b)
for b in badd[:10]: print("DATE MISMATCH", b)
print(f"PII rules: {len(pii_cases) - len(bad)} of {len(pii_cases)} cases identical to the original")
print(f"Date formats: {len(date_cases) - len(badd)} of {len(date_cases)} cases identical to the original")
sys.exit(1 if bad or badd else 0)
