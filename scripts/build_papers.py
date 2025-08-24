#!/usr/bin/env python3
from __future__ import annotations
import os, re, csv, json
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
from xml.etree import ElementTree as ET
import requests

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
SRC = os.path.join(DATA_DIR, "sources.csv")
OUT = os.path.join(DATA_DIR, "papers.json")
OVR = os.path.join(DATA_DIR, "overrides.json")
HEADERS = {"User-Agent":"AI4LifeSciences/1.0 (metadata fetcher)"}; REQ_TIMEOUT = 30

def slurp_overrides(path: str)->Dict[str,Any]:
    if os.path.exists(path):
        try: return json.load(open(path,"r",encoding="utf-8"))
        except: pass
    return {"tag_rules": {}, "modality_rules": {}, "task_rules": {}}

def norm_list(s: str|None)->List[str]:
    if not s: return []
    return [x.strip() for x in s.split(",") if x.strip()]

def strip_html(s: str|None)->str:
    import re
    return re.sub(r"<.*?>","", s or "")

def safe_int(s: Any)->Optional[int]:
    try: return int(str(s))
    except: return None

def guess_tags(title: str, ovr: Dict[str,Any])->List[str]:
    title_l = (title or "").lower(); out=[]
    for tag, keys in (ovr.get("tag_rules", {}) or {}).items():
        for k in keys:
            if k.lower() in title_l: out.append(tag); break
    return sorted(set(out))

def guess_multi(text: str, ovr: Dict[str,Any], rules_key: str)->List[str]:
    text_l = (text or "").lower(); out=[]
    for tag, keys in (ovr.get(rules_key, {}) or {}).items():
        for k in keys:
            if k.lower() in text_l: out.append(tag); break
    return sorted(set(out))

def fetch_crossref_from_doi(doi: str):
    url=f"https://api.crossref.org/works/{requests.utils.quote(doi)}"
    r=requests.get(url,headers=HEADERS,timeout=REQ_TIMEOUT)
    if r.status_code!=200: return None
    j=r.json().get("message",{}); authors=[]
    for a in j.get("author",[]) or []:
        name=" ".join([x for x in [a.get("given"),a.get("family")] if x]); 
        if name: authors.append(name)
    year=None
    for k in ["published-print","published-online","created","issued"]:
        if k in j and "date-parts" in j[k]:
            year=j[k]["date-parts"][0][0]; break
    return {"title":(j.get("title") or [''])[0],"authors":authors,"venue":(j.get("container-title") or [''])[0] or j.get("publisher"),
            "year":safe_int(year),"url":j.get("URL") or f"https://doi.org/{doi}","abstract":strip_html(j.get("abstract") or "")}

def fetch_crossref_from_url(url:str):
    m=re.search(r"(10\.\d{4,9}/[-._;()/:A-Z0-9]+)",url,re.I)
    if m: return fetch_crossref_from_doi(m.group(1))
    r=requests.get("https://api.crossref.org/works",params={"query.bibliographic":url,"rows":1},headers=HEADERS,timeout=REQ_TIMEOUT)
    if r.status_code!=200: return None
    items=r.json().get("message",{}).get("items",[])
    if not items: return None
    item=items[0]
    if "DOI" in item: return fetch_crossref_from_doi(item["DOI"])
    return None

def fetch_arxiv(arxiv_id:str):
    api=f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
    r=requests.get(api,headers=HEADERS,timeout=REQ_TIMEOUT)
    if r.status_code!=200: return None
    feed=ET.fromstring(r.text); ns={"a":"http://www.w3.org/2005/Atom"}
    entry=feed.find("a:entry",ns)
    if entry is None: return None
    title=(entry.findtext("a:title",default="",namespaces=ns) or "").strip().replace("\n"," ")
    authors=[a.findtext("a:name",default="",namespaces=ns) for a in entry.findall("a:author",ns)]
    abstract=(entry.findtext("a:summary",default="",namespaces=ns) or "").strip().replace("\n"," ")
    year=entry.findtext("a:published",default="",namespaces=ns)[:4]
    link=""; 
    for l in entry.findall("a:link",ns):
        if l.attrib.get("type")=="text/html": link=l.attrib.get("href","")
    return {"title":title,"authors":authors,"venue":"arXiv","year":safe_int(year),"url":link or f"https://arxiv.org/abs/{arxiv_id}","abstract":abstract}

def fetch_pubmed(pmid:str):
    s=requests.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",params={"db":"pubmed","id":pmid,"retmode":"json"},headers=HEADERS,timeout=REQ_TIMEOUT)
    if s.status_code!=200: return None
    d=s.json().get("result",{}).get(pmid,{})
    title=d.get("title",""); journal=d.get("fulljournalname") or d.get("source"); year=None
    if d.get("pubdate"):
        m=re.search(r"(19|20)\d{2}",d["pubdate"]); 
        if m: year=safe_int(m.group(0))
    a=requests.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",params={"db":"pubmed","id":pmid,"retmode":"xml"},headers=HEADERS,timeout=REQ_TIMEOUT)
    abstract=""
    if a.status_code==200:
        xml=ET.fromstring(a.text); abst=xml.findall(".//AbstractText"); abstract=" ".join(["".join(x.itertext()) for x in abst])
    authors=[]; 
    for au in d.get("authors",[]) or []:
        nm=(au.get("name") or "").strip(); 
        if nm: authors.append(nm)
    url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    return {"title":title,"authors":authors,"venue":journal,"year":year,"url":url,"abstract":abstract}

def detect_and_fetch(url:str):
    host=(urlparse(url).netloc or "").lower()
    if "arxiv.org" in host:
        m=re.search(r"/(abs|pdf)/([0-9]+\.[0-9]+)(v\d+)?",url)
        if m: return fetch_arxiv(m.group(2))
    if "pubmed.ncbi.nlm.nih.gov" in host or ("ncbi.nlm.nih.gov" in host and "/pubmed" in url):
        m=re.search(r"/(\d+)/?",url)
        if m: return fetch_pubmed(m.group(1))
    return fetch_crossref_from_url(url)

def main():
    overrides=slurp_overrides(OVR)
    if not os.path.exists(SRC):
        with open(OUT,"w",encoding="utf-8") as f: json.dump([],f,indent=2,ensure_ascii=False); 
        print("[WARN] sources.csv missing; wrote empty papers.json"); return
    out=[]
    with open(SRC,newline="",encoding="utf-8") as f:
        reader=csv.DictReader(f)
        for i,row in enumerate(reader, start=1):
            url=(row.get("url") or "").strip()
            if not url: 
                print(f"[SKIP] row {i}: empty URL"); continue
            print(f"[FETCH] {url}")
            meta=None
            try: meta=detect_and_fetch(url)
            except Exception as e: print(f"[WARN] fetch failed for {url}: {e}")
            entry={
                "title": (meta or {}).get("title") or url,
                "authors": (meta or {}).get("authors") or [],
                "venue": (meta or {}).get("venue"),
                "year": (meta or {}).get("year") or overrides.get("default_year"),
                "url": (meta or {}).get("url") or url,
                "code": "",
                "abstract": (meta or {}).get("abstract") or "",
                "type": norm_list(row.get("type")),
                "domain": norm_list(row.get("domain")),
                "modality": norm_list(row.get("modality")),
                "system": norm_list(row.get("system")),
                "task": norm_list(row.get("task")),
            }
            blob=f"{entry['title']} \n {entry.get('abstract','')}"
            if not entry["modality"]: entry["modality"]=guess_multi(blob, overrides, "modality_rules")
            if not entry["task"]: entry["task"]=guess_multi(blob, overrides, "task_rules")
            if not entry["domain"]: entry["domain"]=guess_tags(entry["title"], overrides)
            out.append(entry)
    # de-dup
    seen=set(); deduped=[]
    for p in out:
        key=(p["title"].lower().strip(), str(p.get("year") or ""))
        if key in seen: continue
        seen.add(key); deduped.append(p)
    with open(OUT,"w",encoding="utf-8") as f: json.dump(deduped,f,indent=2,ensure_ascii=False)
    print(f"[OK] Wrote {OUT} with {len(deduped)} entries.")

if __name__=="__main__":
    main()
