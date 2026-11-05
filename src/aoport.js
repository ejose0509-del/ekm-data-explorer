// ---------- Exact ports from NVIDIA Auto Ontology (Apache-2.0; see src/vendor/LICENSE-auto-ontology.txt) ----------
// pii_detection/rules.py and semantic/date_format.py, translated line for line. tests/check_ontology_port.py runs the
// original Python and this code on the same inputs and requires identical answers.
var AO = (function () {
  // ---- pii_detection/rules.py ----
  function normalize(value) { if (!value) return ""; return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean).join(" "); }
  var FIELD_PREFIXES = "preferred|personal|primary|secondary|alternate|business|billing|shipping|mailing|customer|employee|contact|patient|member|person|client|user|household|home|work|postal";
  var IDENTIFIER_PREFIXES = "employee|customer|contact|patient|member|person|client|user|account";
  function pattern(words, category, compact, prefixes) {
    if (prefixes === undefined) prefixes = FIELD_PREFIXES;
    var w = prefixes ? "^(?:(?:" + prefixes + ") )*(?:" + words + ")$" : "^(?:" + words + ")$", c = prefixes ? "^(?:" + prefixes + ")*(?:" + compact + ")$" : "^(?:" + compact + ")$";
    return {expression: new RegExp(w), category: category, compact: new RegExp(c)};
  }
  function matches(p, normalized, compact) { return p.expression.test(normalized) || (p.compact !== null && p.compact.test(compact)); }
  var DIRECT = [
    pattern("social security(?: number)?", "government_id", "ssn|socialsecurity(?:number)?"),
    pattern("passport(?: number)?|driver(?:s)? license", "government_id", "passport(?:number)?|drivers?license"),
    pattern("taxpayer id|tax id|national id", "government_id", "taxpayerid|taxid|nationalid"),
    pattern("e mail|email address", "email_address", "emailaddress|email"),
    pattern("phone number|mobile phone|mobile number|cell phone|fax number", "phone_number", "phonenumber|faxnumber|cellphone|mobilephone|telephone|mobile|phone|fax|cell"),
    pattern("date of birth|birth date|birthdate|dob", "date_of_birth", "dateofbirth|birthdate|dob"),
    pattern("credit card|debit card|card number", "payment_card", "creditcard|debitcard|cardnumber"),
    pattern("bank account(?: number)?|iban|swift code", "banking", "bankaccount(?:number)?|iban|swiftcode"),
    pattern("passcode|pin code", "credential", "password|passcode|pincode"),
    pattern("fingerprint|biometric|retina scan|face print", "biometric", "fingerprint|biometric|retinascan|faceprint"),
    pattern("ip address|mac address", "online_identifier", "ipaddress|macaddress")
  ];
  var CONDITIONAL = [
    pattern("first name|last name|full name|middle name|maiden name|preferred name", "person_name", "firstname|lastname|fullname|middlename|maidenname|preferredname"),
    pattern("name", "person_name", "name", null),
    pattern("address|street|postal code|zip code", "postal_address", "address(?:line\\d*)?|street|postalcode|zipcode"),
    pattern("age|gender|sex|marital status", "personal_attribute", "age|gender|sex|maritalstatus", null),
    pattern("salary|income|credit score", "financial", "salary|income|creditscore", null),
    pattern("id|account number", "identifier", "id|accountnumber", IDENTIFIER_PREFIXES)
  ];
  var PERSON_TABLE = /^(?:persons?|people|customers?|clients?|contacts?|users?|employees?|patients?|applicants?|members?|students?|advisors?|representatives?|households?|account holders?)$/;
  var NON_PERSON_TABLE = /^(?:products?|assets?|strateg(?:y|ies)|platforms?|transaction types?|business lines?|configurations?|audits?|metrics?|aggregates?|inventor(?:y|ies)|catalogs?)$/;
  var NON_PII_COLUMN = /^(?:product name|account type|account status|employee count|bank name|firm id|buying group name|city name|customer category name|last password change|created at|updated at)$/;
  var NON_PII_COMPACT = /^(?:productname|accounttype|accountstatus|employeecount|bankname|firmid|buyinggroupname|cityname|customercategoryname|lastpasswordchange|createdat|updatedat)$/;
  // Returns {status: "pii"|"not_pii"|"review", category, confidence, reason, source} or null when the original would ask an LLM.
  function evaluateRules(columnName, tableName) {
    var col = normalize(columnName), compact = col.replace(/ /g, ""), table = normalize(tableName);
    if (!col) return {status: "review", category: null, confidence: 0.0, reason: "Column name is empty.", source: "rules"};
    if (NON_PII_COLUMN.test(col) || NON_PII_COMPACT.test(compact)) return {status: "not_pii", category: null, confidence: 0.96, reason: "Column matches a known non-personal business field.", source: "rules"};
    for (var i = 0; i < DIRECT.length; i++) if (matches(DIRECT[i], col, compact)) return {status: "pii", category: DIRECT[i].category, confidence: 0.99, reason: "Column name matches the " + DIRECT[i].category + " rule.", source: "rules"};
    for (i = 0; i < CONDITIONAL.length; i++) {
      var p = CONDITIONAL[i]; if (!matches(p, col, compact)) continue;
      if (PERSON_TABLE.test(table)) return {status: "pii", category: p.category, confidence: 0.94, reason: "Sensitive field appears in a table representing individuals.", source: "rules"};
      if (NON_PERSON_TABLE.test(table)) return {status: "not_pii", category: null, confidence: 0.9, reason: "Ambiguous field appears in a non-person table.", source: "rules"};
    }
    return null;
  }
  function shouldAutoTag(d, threshold) { return !!d && d.status === "pii" && d.confidence >= (threshold == null ? 0.9 : threshold); }

  // ---- semantic/date_format.py (strptime emulated with CPython's _strptime regexes) ----
  var MAX_VALUES = 200, MAX_VALUE_LEN = 40, YEAR_MIN = 1900, YEAR_MAX = 2099;
  var CANDIDATES = [["%Y-%m-%d %H:%M:%S.%f", "YYYY-MM-DD HH:MM:SS.f"], ["%Y-%m-%dT%H:%M:%S.%f", "YYYY-MM-DDTHH:MM:SS.f"], ["%Y-%m-%d %H:%M:%S", "YYYY-MM-DD HH:MM:SS"], ["%Y-%m-%dT%H:%M:%S", "YYYY-MM-DDTHH:MM:SS"],
    ["%Y-%m-%d %H:%M", "YYYY-MM-DD HH:MM"], ["%Y-%m-%d", "YYYY-MM-DD"], ["%Y/%m/%d", "YYYY/MM/DD"], ["%d/%m/%Y", "DD/MM/YYYY"], ["%m/%d/%Y", "MM/DD/YYYY"], ["%d-%m-%Y", "DD-MM-YYYY"], ["%m-%d-%Y", "MM-DD-YYYY"],
    ["%d.%m.%Y", "DD.MM.YYYY"], ["%d/%m/%y", "DD/MM/YY"], ["%m/%d/%y", "MM/DD/YY"], ["%d-%m-%y", "DD-MM-YY"], ["%m-%d-%y", "MM-DD-YY"], ["%d.%m.%y", "DD.MM.YY"], ["%Y%m%d", "YYYYMMDD"], ["%Y%m", "YYYYMM"],
    ["%y%m%d", "YYMMDD"], ["%H:%M:%S", "HH:MM:SS"], ["%H:%M", "HH:MM"], ["%Y", "YYYY"]];
  var INDISTINGUISHABLE = [["DD/MM/YYYY", "MM/DD/YYYY"], ["DD-MM-YYYY", "MM-DD-YYYY"], ["DD/MM/YY", "MM/DD/YY"], ["DD-MM-YY", "MM-DD-YY"], ["DD.MM.YY", "MM.DD.YY"], ["D/M/YY", "M/D/YY"], ["D-M-YY", "M-D-YY"], ["D.M.YY", "M.D.YY"], ["D/M/YYYY", "M/D/YYYY"], ["D-M-YYYY", "M-D-YYYY"], ["D.M.YYYY", "M.D.YYYY"]];
  var DIRECTIVES = {Y: "(?<Y>\\d\\d\\d\\d)", m: "(?<m>1[0-2]|0[1-9]|[1-9])", d: "(?<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])", y: "(?<y>\\d\\d)", H: "(?<H>2[0-3]|[0-1]\\d|\\d)", M: "(?<M>[0-5]\\d|\\d)", S: "(?<S>6[0-1]|[0-5]\\d|\\d)", f: "(?<f>[0-9]{1,6})"};
  var RE_CACHE = Object.create(null);
  function strptimeRe(fmt) {
    if (RE_CACHE[fmt]) return RE_CACHE[fmt];
    var out = "", esc = function (ch) { return ch.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&"); };
    for (var i = 0; i < fmt.length; i++) { var ch = fmt[i]; if (ch === "%") { out += DIRECTIVES[fmt[++i]]; } else if (/\s/.test(ch)) out += "\\s+"; else out += esc(ch); }
    return (RE_CACHE[fmt] = new RegExp("^(?:" + out + ")$", "i"));
  }
  function strptime(value, fmt) {   // the fields CPython would build a datetime from, or null for ValueError
    var m = strptimeRe(fmt).exec(value); if (!m) return null;
    var g = m.groups, year = 1900, month = 1, day = 1;
    if (g.Y != null) year = +g.Y; else if (g.y != null) { var yy = +g.y; year = yy <= 68 ? 2000 + yy : 1900 + yy; }
    if (g.m != null) month = +g.m; if (g.d != null) day = +g.d;
    var sec = g.S != null ? +g.S : 0; if (sec > 59) return null;   // datetime() rejects leap seconds
    var dim = [31, (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day > dim) return null;
    return {year: year};
  }
  function parsesAll(fmt, values) { var centuryKnown = fmt.indexOf("%Y") >= 0; for (var i = 0; i < values.length; i++) { var p = strptime(values[i], fmt); if (!p) return false; if (centuryKnown && !(p.year >= YEAR_MIN && p.year <= YEAR_MAX)) return false; } return true; }
  function widenFraction(label, values) { var widest = 0, any = false; values.forEach(function (v) { if (v.indexOf(".") >= 0) { any = true; widest = Math.max(widest, v.slice(v.lastIndexOf(".") + 1).length); } }); if (!any) widest = 1; return label.replace(".f", "." + new Array(widest + 1).join("f")); }
  function narrowPadding(label, values) {
    if ([" ", "T", ":"].some(function (ch) { return label.indexOf(ch) >= 0; })) return label;
    var sep = ["/", "-", "."].filter(function (s) { return label.indexOf(s) >= 0; })[0]; if (!sep) return label;
    if (values.some(function (v) { return v.split(sep).some(function (part) { return part.length === 1; }); })) return label.replace(/MM/g, "M").replace(/DD/g, "D");
    return label;
  }
  function inferDateFormat(values) {
    var seen = [], uniq = Object.create(null);
    for (var i = 0; i < values.length; i++) { var v = values[i]; if (v == null) continue; var text = String(v).trim(); if (!text || text.length > MAX_VALUE_LEN || uniq[text]) continue; uniq[text] = 1; seen.push(text); if (seen.length >= MAX_VALUES) break; }
    if (!seen.length) return null;
    var hits = CANDIDATES.filter(function (c) { return parsesAll(c[0], seen); }).map(function (c) { return [c[0], narrowPadding(c[1], seen)]; });
    if (!hits.length) return null;
    var winner = hits[0][1], labels = hits.map(function (h) { return h[1]; });
    for (i = 0; i < INDISTINGUISHABLE.length; i++) { var gr = INDISTINGUISHABLE[i]; if (gr.indexOf(winner) >= 0 && gr.filter(function (l) { return labels.indexOf(l) >= 0; }).length > 1) return null; }
    return hits[0][0].indexOf("%f") >= 0 ? widenFraction(winner, seen) : winner;
  }
  return {normalize: normalize, evaluateRules: evaluateRules, shouldAutoTag: shouldAutoTag, inferDateFormat: inferDateFormat};
})();
